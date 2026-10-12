import type { CommandResult, Jogo } from '@shared/types'
import type { ExitInfo, GameLauncher } from '../ports'
import type { ResolveExeResult } from './resolve-exe'

export type SessaoEncerrada = {
  jogoId: string
  inicioISO: string
  duracaoMs: number
  codigo: number | null
}

export interface GameSession {
  lancar(jogoId: string): Promise<CommandResult>
  emExecucao(): boolean
  ultimoJogoId(): string | null
}

export interface GameSessionDeps {
  launcher: GameLauncher
  acharJogo(jogoId: string): Promise<Jogo | null>
  resolverExe(jogo: Jogo): Promise<ResolveExeResult>
  aoIniciar(jogoId: string): void
  aoEncerrar(): void
  registrarSessao?: (s: SessaoEncerrada) => Promise<void>
  agora?: () => Date
}

type SessaoAtiva = { jogoId: string; inicioISO: string }

export function createGameSession(deps: GameSessionDeps): GameSession {
  const agora = deps.agora ?? (() => new Date())
  let sessao: SessaoAtiva | null = null
  let ultimo: string | null = null
  let lancando = false

  async function lancar(jogoId: string): Promise<CommandResult> {
    if (sessao || lancando) return { ok: false, code: 'JOGO_EM_EXECUCAO' }
    lancando = true
    try {
      const jogo = await deps.acharJogo(jogoId)
      if (!jogo) return { ok: false, code: 'JOGO_DESCONHECIDO' }

      const resolvido = await deps.resolverExe(jogo)
      if (!resolvido.ok) {
        console.warn(`[main] não deu para abrir ${jogoId}: ${resolvido.code}`)
        return { ok: false, code: resolvido.code }
      }

      if ((await deps.launcher.launch(resolvido.exeAbs)) === 'error') return { ok: false, code: 'FALHA_AO_ABRIR' }

      sessao = { jogoId, inicioISO: agora().toISOString() }
      ultimo = jogoId
      deps.aoIniciar(jogoId)
      return { ok: true }
    } catch (err) {
      console.error(`[main] falha ao abrir ${jogoId}:`, err)
      return { ok: false, code: 'FALHA_AO_ABRIR' }
    } finally {
      lancando = false
    }
  }

  async function finalizar(s: SessaoAtiva, info: ExitInfo): Promise<void> {
    const duracaoMs = info.durationMs
    try {
      try {
        await deps.registrarSessao?.({
          jogoId: s.jogoId,
          inicioISO: s.inicioISO,
          duracaoMs,
          codigo: info.code
        })
      } catch (err) {
        console.error('[main] falha registrando a Sessão encerrada:', err)
      }
    } finally {
      deps.aoEncerrar()
    }
  }

  deps.launcher.onExited((info) => {
    const s = sessao
    if (!s) return
    sessao = null
    return finalizar(s, info)
  })

  return {
    lancar,
    emExecucao: () => sessao !== null,
    ultimoJogoId: () => ultimo
  }
}
