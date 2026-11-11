import type { RegistroAnalytics } from '@shared/types'
import { hubLog } from '../log/hub-log'
import type { AnalyticsSink } from '../ports'
import {
  AnalyticsNaoConfiguradoError,
  type AnalyticsFlusher,
  type AnalyticsSpool,
  type FlushResult
} from './types'

const ERRO_INDISPONIVEL = 'ANALYTICS_INDISPONIVEL'
const ERRO_NAO_CONFIGURADO = 'ANALYTICS_NAO_CONFIGURADO'

export interface AnalyticsFlusherDeps {
  spool: Pick<AnalyticsSpool, 'pendentes' | 'confirmar'>
  obterSink: () => Promise<AnalyticsSink>
  debounceMs?: number
  retryMs?: number
  retryMaxMs?: number
  loteMax?: number
  agora?: () => Date
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
}

export function createAnalyticsFlusher(deps: AnalyticsFlusherDeps): AnalyticsFlusher {
  const debounceMs = deps.debounceMs ?? 5_000
  const retryMs = deps.retryMs ?? 300_000
  const retryMaxMs = deps.retryMaxMs ?? 600_000
  const loteMax = deps.loteMax ?? 500
  const agora = deps.agora ?? (() => new Date())
  const setTimeoutFn = deps.timers?.setTimeout ?? setTimeout
  const clearTimeoutFn = deps.timers?.clearTimeout ?? clearTimeout

  let timer: NodeJS.Timeout | null = null
  let emVoo: Promise<FlushResult> | null = null
  let sinkEmCache: Promise<AnalyticsSink> | null = null
  let parado = false
  let falhasSeguidas = 0
  let ultimoFlushOk: boolean | null = null
  let ultimoFlushEm: string | null = null
  let ultimoCodigo: string | null = null

  function cancelarTimer(): void {
    if (timer === null) return
    clearTimeoutFn(timer)
    timer = null
  }

  function agendarEm(ms: number): void {
    if (parado) return
    cancelarTimer()
    const t = setTimeoutFn(() => {
      timer = null
      void flushAgora()
    }, ms)
    // Um flush pendente não deve manter o app vivo.
    t.unref?.()
    timer = t
  }

  // Memoiza só no sucesso: sem configuração do Supabase, a próxima tentativa resolve de novo.
  function obterSink(): Promise<AnalyticsSink> {
    if (sinkEmCache) return sinkEmCache
    const tentativa = (async () => deps.obterSink())()
    sinkEmCache = tentativa
    tentativa.catch(() => {
      if (sinkEmCache === tentativa) sinkEmCache = null
    })
    return tentativa
  }

  function registrarFalha(code: string, err: unknown): FlushResult {
    falhasSeguidas += 1
    ultimoFlushOk = false
    ultimoFlushEm = agora().toISOString()
    ultimoCodigo = code
    hubLog.erro('analytics', `envio falhou: ${code}`, err)
    const espera = Math.min(retryMs * 2 ** (falhasSeguidas - 1), retryMaxMs)
    agendarEm(espera)
    return { ok: false, code }
  }

  function registrarSucesso(
    pendentes: RegistroAnalytics[],
    enviados: number
  ): Promise<FlushResult> {
    falhasSeguidas = 0
    ultimoFlushOk = true
    ultimoFlushEm = agora().toISOString()
    ultimoCodigo = null
    return relerRestantes(pendentes.length - enviados).then((restantes) => {
      if (enviados > 0) {
        hubLog.info('analytics', `${enviados} sessão(ões) enviada(s), ${restantes} pendente(s)`)
      }
      if (restantes > 0) agendarEm(0)
      return { ok: true, enviados, pendentes: restantes }
    })
  }

  async function relerRestantes(fallback: number): Promise<number> {
    try {
      return (await deps.spool.pendentes()).length
    } catch (err) {
      hubLog.erro('analytics', 'falha relendo pendentes', err)
      return Math.max(0, fallback)
    }
  }

  async function enviar(): Promise<FlushResult> {
    let pendentes: RegistroAnalytics[]
    try {
      pendentes = await deps.spool.pendentes()
    } catch (err) {
      return registrarFalha(ERRO_INDISPONIVEL, err)
    }
    // Nada a enviar não é resultado de flush: não mexe no estado.
    if (pendentes.length === 0) return { ok: true, enviados: 0, pendentes: 0 }

    let sink: AnalyticsSink
    try {
      sink = await obterSink()
    } catch (err) {
      const code = err instanceof AnalyticsNaoConfiguradoError ? ERRO_NAO_CONFIGURADO : ERRO_INDISPONIVEL
      return registrarFalha(code, err)
    }

    const lote = pendentes.slice(0, loteMax)
    const idsDoLote = new Set(lote.map((registro) => registro.id))
    let idsAceitos: string[]
    try {
      const resposta = await sink.flush(lote)
      idsAceitos = [...new Set(resposta.idsAceitos)].filter((id) => idsDoLote.has(id))
    } catch (err) {
      return registrarFalha(ERRO_INDISPONIVEL, err)
    }

    // Sem nenhum aceito o lote não anda; insistir em 0 ms seria laço quente.
    if (idsAceitos.length === 0) {
      return registrarFalha(ERRO_INDISPONIVEL, new Error('destino não aceitou nenhum registro'))
    }

    try {
      await deps.spool.confirmar(idsAceitos)
    } catch (err) {
      // O próximo envio repete o lote; o destino deduplica por id.
      return registrarFalha(ERRO_INDISPONIVEL, err)
    }

    return registrarSucesso(pendentes, idsAceitos.length)
  }

  function flushAgora(): Promise<FlushResult> {
    cancelarTimer()
    if (emVoo) return emVoo
    const promessa = enviar().catch((err): FlushResult => {
      hubLog.erro('analytics', 'flush falhou inesperadamente', err)
      return { ok: false, code: ERRO_INDISPONIVEL }
    })
    emVoo = promessa
    const limpar = (): void => {
      if (emVoo === promessa) emVoo = null
    }
    promessa.then(limpar, limpar)
    return promessa
  }

  return {
    flushAgora,
    agendar: () => agendarEm(debounceMs),
    estado: () => ({ ultimoFlushOk, ultimoFlushEm, ultimoCodigo }),
    parar: () => {
      parado = true
      cancelarTimer()
    }
  }
}
