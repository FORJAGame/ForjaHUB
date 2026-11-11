import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { RegistroAnalytics } from '@shared/types'
import type { AnalyticsSink } from '../../ports'
import { hubLog } from '../../log/hub-log'
import { createAnalyticsFlusher } from '../flusher'
import { AnalyticsNaoConfiguradoError, type AnalyticsFlusher, type AnalyticsSpool } from '../types'

const AGORA_ISO = '2026-01-01T00:00:00.000Z'

function registro(id: string): RegistroAnalytics {
  return {
    id,
    jogoId: 'jogo-a',
    estacaoId: 'estacao-1',
    eventoId: 'evento-1',
    inicioISO: '2025-12-31T23:00:00.000Z',
    duracaoSeg: 60
  }
}

function spoolFake(iniciais: RegistroAnalytics[] = []): {
  spool: Pick<AnalyticsSpool, 'pendentes' | 'confirmar'>
  pendentes: Mock<() => Promise<RegistroAnalytics[]>>
  confirmar: Mock<(ids: string[]) => Promise<void>>
  esvaziar: () => void
} {
  let lista = [...iniciais]
  const pendentes = vi.fn(async () => [...lista])
  const confirmar = vi.fn(async (ids: string[]) => {
    lista = lista.filter((registroAtual) => !ids.includes(registroAtual.id))
  })
  return {
    spool: { pendentes, confirmar },
    pendentes,
    confirmar,
    esvaziar: () => {
      lista = []
    }
  }
}

function sinkFake(impl?: (registros: RegistroAnalytics[]) => Promise<{ idsAceitos: string[] }>): {
  sink: AnalyticsSink
  flush: Mock<(registros: RegistroAnalytics[]) => Promise<{ idsAceitos: string[] }>>
} {
  const flush = vi.fn(
    impl ??
      (async (registros: RegistroAnalytics[]) => ({
        idsAceitos: registros.map((registroAtual) => registroAtual.id)
      }))
  )
  return { sink: { flush }, flush }
}

function montar(
  opts: {
    pendentes?: RegistroAnalytics[]
    sink?: ReturnType<typeof sinkFake>
    obterSink?: () => Promise<AnalyticsSink>
  } = {}
): { flusher: AnalyticsFlusher; spool: ReturnType<typeof spoolFake>; sink: ReturnType<typeof sinkFake> } {
  const spool = spoolFake(opts.pendentes)
  const sink = opts.sink ?? sinkFake()
  const flusher = createAnalyticsFlusher({
    spool: spool.spool,
    obterSink: opts.obterSink ?? (async () => sink.sink),
    agora: () => new Date(AGORA_ISO)
  })
  return { flusher, spool, sink }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createAnalyticsFlusher — estado visível ao Operador', () => {
  it('antes de qualquer flush o estado é todo null', () => {
    const { flusher } = montar()
    expect(flusher.estado()).toEqual({ ultimoFlushOk: null, ultimoFlushEm: null, ultimoCodigo: null })
  })

  it('AnalyticsNaoConfiguradoError ⇒ ANALYTICS_NAO_CONFIGURADO; sink que rejeita ⇒ ANALYTICS_INDISPONIVEL', async () => {
    const semConfig = montar({
      pendentes: [registro('a')],
      obterSink: async () => {
        throw new AnalyticsNaoConfiguradoError()
      }
    })
    await expect(semConfig.flusher.flushAgora()).resolves.toMatchObject({
      ok: false,
      code: 'ANALYTICS_NAO_CONFIGURADO'
    })
    expect(semConfig.flusher.estado().ultimoCodigo).toBe('ANALYTICS_NAO_CONFIGURADO')

    const semRede = sinkFake(async () => {
      throw new Error('ETIMEDOUT')
    })
    const indisponivel = montar({ pendentes: [registro('a')], sink: semRede })
    await expect(indisponivel.flusher.flushAgora()).resolves.toMatchObject({
      ok: false,
      code: 'ANALYTICS_INDISPONIVEL'
    })
    expect(indisponivel.flusher.estado().ultimoCodigo).toBe('ANALYTICS_INDISPONIVEL')
  })

  it('sucesso depois de falha ⇒ ultimoFlushOk true e ultimoCodigo null', async () => {
    const sink = sinkFake()
    sink.flush.mockRejectedValueOnce(new Error('rede'))
    const { flusher } = montar({ pendentes: [registro('a')], sink })

    await expect(flusher.flushAgora()).resolves.toMatchObject({ ok: false })
    await expect(flusher.flushAgora()).resolves.toMatchObject({ ok: true, enviados: 1 })

    const estado = flusher.estado()
    expect(estado.ultimoFlushOk).toBe(true)
    expect(estado.ultimoCodigo).toBeNull()
  })

  it('flush sem pendentes depois de uma falha não apaga o ultimoCodigo', async () => {
    const sink = sinkFake(async () => {
      throw new Error('rede')
    })
    const { flusher, spool } = montar({ pendentes: [registro('a')], sink })

    await expect(flusher.flushAgora()).resolves.toMatchObject({ ok: false, code: 'ANALYTICS_INDISPONIVEL' })

    // Spool vazio (ex.: outro fluxo confirmou): o próximo flush não é resultado, não mexe no estado.
    spool.esvaziar()
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 0, pendentes: 0 })

    const estado = flusher.estado()
    expect(estado.ultimoFlushOk).toBe(false)
    expect(estado.ultimoCodigo).toBe('ANALYTICS_INDISPONIVEL')
  })

  it('uma falha loga ERRO [analytics] com o code na mensagem', async () => {
    const erro = vi.spyOn(hubLog, 'erro').mockImplementation(() => {})
    const sink = sinkFake(async () => {
      throw new Error('ETIMEDOUT')
    })
    const { flusher } = montar({ pendentes: [registro('a')], sink })

    await flusher.flushAgora()

    expect(erro).toHaveBeenCalledWith(
      'analytics',
      expect.stringContaining('ANALYTICS_INDISPONIVEL'),
      expect.anything()
    )
  })
})
