import type { ConfigEstacao } from '@shared/types'
import type { SessaoEncerrada } from '../launcher/game-session'
import type { AnalyticsSpool } from './types'

export interface SessionRecorder {
  iniciar(s: { jogoId: string; inicioISO: string }): Promise<void>
  encerrar(s: SessaoEncerrada): Promise<void>
  encerrarNoQuit(): Promise<void>
  aberta(): boolean
}

export interface SessionRecorderDeps {
  spool: AnalyticsSpool
  lerConfigEstacao: () => Promise<ConfigEstacao | null>
  aoRegistrar?: () => void
  heartbeatMs?: number
  agora?: () => Date
  relogioMs?: () => number
  timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval }
}

export function createSessionRecorder(deps: SessionRecorderDeps): SessionRecorder {
  const agora = deps.agora ?? (() => new Date())
  const relogioMs = deps.relogioMs ?? (() => performance.now())
  const heartbeatMs = deps.heartbeatMs ?? 60_000
  const setIntervalFn = deps.timers?.setInterval ?? setInterval
  const clearIntervalFn = deps.timers?.clearInterval ?? clearInterval

  let inicioMs: number | null = null
  let aberta = false
  let heartbeat: NodeJS.Timeout | null = null
  let iniciarEmVoo: Promise<void> | null = null

  function pararHeartbeat(): void {
    if (heartbeat === null) return
    clearIntervalFn(heartbeat)
    heartbeat = null
  }

  function tocar(): void {
    try {
      void deps.spool.tocarSessao(agora().toISOString()).catch((err) => {
        console.error('[analytics] heartbeat da Sessão falhou:', err)
      })
    } catch (err) {
      console.error('[analytics] heartbeat da Sessão falhou:', err)
    }
  }

  function ligarHeartbeat(): void {
    pararHeartbeat()
    const timer = setIntervalFn(tocar, heartbeatMs)
    // Não segura o processo aberto só por causa do heartbeat.
    timer.unref?.()
    heartbeat = timer
  }

  async function executarInicio(s: { jogoId: string; inicioISO: string }): Promise<void> {
    try {
      // Carimbo lido agora: a Config pode mudar durante a Sessão.
      const config = await deps.lerConfigEstacao()
      if (!config) {
        console.warn('[analytics] Estação não configurada; Sessão não registrada')
        return
      }
      await deps.spool.abrirSessao({
        jogoId: s.jogoId,
        estacaoId: config.estacaoId,
        eventoId: config.eventoId,
        inicioISO: s.inicioISO
      })
      aberta = true
      ligarHeartbeat()
    } catch (err) {
      console.error('[analytics] falha abrindo a Sessão:', err)
    }
  }

  function iniciar(s: { jogoId: string; inicioISO: string }): Promise<void> {
    // O relógio monotônico não pode esperar o disco.
    inicioMs = relogioMs()
    const promessa = executarInicio(s)
    iniciarEmVoo = promessa
    return promessa
  }

  async function encerrar(s: SessaoEncerrada): Promise<void> {
    // `exited` pode chegar antes de `abrirSessao` terminar.
    if (iniciarEmVoo) await iniciarEmVoo
    pararHeartbeat()
    if (!aberta) return
    try {
      await deps.spool.fecharSessao({ duracaoSeg: Math.round(s.duracaoMs / 1000) })
      aberta = false
      deps.aoRegistrar?.()
    } catch (err) {
      console.error('[analytics] falha fechando a Sessão:', err)
    }
  }

  async function encerrarNoQuit(): Promise<void> {
    if (iniciarEmVoo) await iniciarEmVoo
    if (!aberta) return
    pararHeartbeat()
    const fimMs = relogioMs()
    const duracaoSeg = Math.round((fimMs - (inicioMs ?? fimMs)) / 1000)
    try {
      // Duração real pelo relógio monotônico; `incompleta` marca que o Jogo não fechou sozinho.
      await deps.spool.fecharSessao({ duracaoSeg, incompleta: true })
      aberta = false
    } catch (err) {
      console.error('[analytics] falha fechando a Sessão no quit:', err)
    }
  }

  return {
    iniciar,
    encerrar,
    encerrarNoQuit,
    aberta: () => aberta
  }
}
