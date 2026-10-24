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
  /** Disco pode falhar/ser lento: o lançamento nunca espera nem depende disto. */
  abrirSessao?: (s: { jogoId: string; inicioISO: string }) => Promise<void>
  registrarSessao?: (s: SessaoEncerrada) => Promise<void>
  agora?: () => Date
}

type SessaoAtiva = { jogoId: string; inicioISO: string }

export function createGameSession(deps: GameSessionDeps): GameSession {
  const agora = deps.agora ?? (() => new Date())
  let sessao: SessaoAtiva | null = null
  let ultimo: string | null = null
  let lancando = false

  // Sem `await`: o Jogo já abriu; um erro de disco só aparece no log.
  function avisarAbertura(jogoId: string, inicioISO: string): void {
    if (!deps.abrirSessao) return
    try {
      void deps.abrirSessao({ jogoId, inicioISO }).catch((err) => {
        console.error('[main] falha registrando o início da Sessão:', err)
      })
    } catch (err) {
      console.error('[main] falha registrando o início da Sessão:', err)
    }
  }

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

      const inicioISO = agora().toISOString()
      sessao = { jogoId, inicioISO }
      ultimo = jogoId
      avisarAbertura(jogoId, inicioISO)
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
