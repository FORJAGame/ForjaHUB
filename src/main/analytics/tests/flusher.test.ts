import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { RegistroAnalytics } from '@shared/types'
import { CredencialAusenteError } from '../../catalog/google-client'
import type { AnalyticsSink } from '../../ports'
import {
  createAnalyticsFlusher,
  type AnalyticsFlusherDeps
} from '../flusher'
import {
  AnalyticsNaoConfiguradoError,
  type AnalyticsFlusher,
  type AnalyticsSpool
} from '../types'

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

interface SpoolFake {
  spool: Pick<AnalyticsSpool, 'pendentes' | 'confirmar'>
  confirmacoes: string[][]
  pendentes: Mock
  confirmar: Mock
  lista: () => RegistroAnalytics[]
  adicionar: (...registros: RegistroAnalytics[]) => void
}

function spoolFake(iniciais: RegistroAnalytics[] = []): SpoolFake {
  let lista = [...iniciais]
  const confirmacoes: string[][] = []
  const pendentes = vi.fn(async () => [...lista])
  const confirmar = vi.fn(async (ids: string[]) => {
    confirmacoes.push(ids)
    lista = lista.filter((registroAtual) => !ids.includes(registroAtual.id))
  })
  return {
    spool: { pendentes, confirmar },
    confirmacoes,
    pendentes,
    confirmar,
    lista: () => lista,
    adicionar: (...registros) => {
      lista.push(...registros)
    }
  }
}

interface SinkFake {
  sink: AnalyticsSink
  flush: Mock
}

function sinkFake(
  impl: (registros: RegistroAnalytics[]) => Promise<{ idsAceitos: string[] }> = async (
    registros
  ) => ({ idsAceitos: registros.map((registroAtual) => registroAtual.id) })
): SinkFake {
  const flush = vi.fn(impl)
  return { sink: { flush }, flush }
}

interface Montagem {
  flusher: AnalyticsFlusher
  spool: SpoolFake
  sink: SinkFake
  obterSink: Mock
}

function montar(
  opts: {
    pendentes?: RegistroAnalytics[]
    spool?: SpoolFake
    sink?: AnalyticsSink
    over?: Partial<AnalyticsFlusherDeps>
  } = {}
): Montagem {
  const spool = opts.spool ?? spoolFake(opts.pendentes)
  const sink = sinkFake()
  const obterSink = vi.fn(async () => opts.sink ?? sink.sink)
  const flusher = createAnalyticsFlusher({
    spool: spool.spool,
    obterSink,
    agora: () => new Date(AGORA_ISO),
    ...opts.over
  })
  return { flusher, spool, sink, obterSink }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createAnalyticsFlusher — envio', () => {
  it('envia o lote, confirma os aceitos e atualiza o estado', async () => {
    const { flusher, spool, sink } = montar({ pendentes: [registro('a'), registro('b')] })

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 2, pendentes: 0 })

    expect(sink.flush).toHaveBeenCalledTimes(1)
    expect(sink.flush).toHaveBeenCalledWith([registro('a'), registro('b')])
    expect(spool.confirmacoes).toEqual([['a', 'b']])
    expect(flusher.estado()).toEqual({ ultimoFlushOk: true, ultimoFlushEm: AGORA_ISO })
  })

  it('é single-flight: duas chamadas em voo compartilham o mesmo envio', async () => {
    const resposta = Promise.withResolvers<{ idsAceitos: string[] }>()
    const custom = sinkFake(() => resposta.promise)
    const { flusher } = montar({ pendentes: [registro('a')], sink: custom.sink })

    const primeira = flusher.flushAgora()
    const segunda = flusher.flushAgora()
    expect(segunda).toBe(primeira)

    resposta.resolve({ idsAceitos: ['a'] })
    await expect(primeira).resolves.toEqual({ ok: true, enviados: 1, pendentes: 0 })
    expect(custom.flush).toHaveBeenCalledTimes(1)
  })

  it('lote máximo de 500: com 501 pendentes o resto é reagendado em 0 ms', async () => {
    const pendentes = Array.from({ length: 501 }, (_, indice) => registro(`r${indice}`))
    const { flusher, sink, spool } = montar({ pendentes })

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 500, pendentes: 1 })
    expect(sink.flush).toHaveBeenCalledTimes(1)
    expect(sink.flush.mock.calls[0][0]).toHaveLength(500)

    await vi.advanceTimersByTimeAsync(0)

    expect(sink.flush).toHaveBeenCalledTimes(2)
    expect(sink.flush.mock.calls[1][0]).toEqual([registro('r500')])
    expect(spool.lista()).toEqual([])
  })

  it('sem pendentes não toca no sink nem no estado', async () => {
    const { flusher, sink, obterSink } = montar()

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 0, pendentes: 0 })

    expect(obterSink).not.toHaveBeenCalled()
    expect(sink.flush).not.toHaveBeenCalled()
    expect(flusher.estado()).toEqual({ ultimoFlushOk: null, ultimoFlushEm: null })
  })
})

describe('createAnalyticsFlusher — falhas e backoff', () => {
  it('falhas seguidas reagendam 5, 10 e 10 minutos', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const custom = sinkFake(async () => {
      throw new Error('rede')
    })
    const { flusher } = montar({ pendentes: [registro('a')], sink: custom.sink })

    await expect(flusher.flushAgora()).resolves.toEqual({
      ok: false,
      code: 'ANALYTICS_INDISPONIVEL'
    })
    expect(custom.flush).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(299_999)
    expect(custom.flush).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(custom.flush).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(599_999)
    expect(custom.flush).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(custom.flush).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(599_999)
    expect(custom.flush).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(custom.flush).toHaveBeenCalledTimes(4)
    expect(erro).toHaveBeenCalled()
  })

  it('um sucesso depois de falhas zera o backoff', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let falhar = true
    const custom = sinkFake(async (registros) => {
      if (falhar) throw new Error('rede')
      return { idsAceitos: registros.map((registroAtual) => registroAtual.id) }
    })
    const { flusher, spool } = montar({ pendentes: [registro('a')], sink: custom.sink })

    await flusher.flushAgora()
    falhar = false
    await vi.advanceTimersByTimeAsync(300_000)
    expect(custom.flush).toHaveBeenCalledTimes(2)
    expect(flusher.estado().ultimoFlushOk).toBe(true)

    falhar = true
    spool.adicionar(registro('b'))
    await flusher.flushAgora()
    expect(custom.flush).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(299_999)
    expect(custom.flush).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(custom.flush).toHaveBeenCalledTimes(4)
  })

  it.each([
    new AnalyticsNaoConfiguradoError(),
    new CredencialAusenteError('sem credencial'),
    new Error('falha inesperada')
  ])('mapeia o erro de obterSink para o código certo (%s)', async (causa) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { flusher } = montar({
      pendentes: [registro('a')],
      over: {
        obterSink: async () => {
          throw causa
        }
      }
    })

    const esperado =
      causa instanceof AnalyticsNaoConfiguradoError
        ? 'ANALYTICS_NAO_CONFIGURADO'
        : causa instanceof CredencialAusenteError
          ? 'CREDENCIAL_AUSENTE'
          : 'ANALYTICS_INDISPONIVEL'

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: false, code: esperado })
  })

  it('obterSink que falha não é memoizado', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const custom = sinkFake()
    const obterSink = vi
      .fn<() => Promise<AnalyticsSink>>()
      .mockRejectedValueOnce(new CredencialAusenteError('sem credencial'))
      .mockResolvedValue(custom.sink)
    const { flusher } = montar({ pendentes: [registro('a')], over: { obterSink } })

    await expect(flusher.flushAgora()).resolves.toEqual({
      ok: false,
      code: 'CREDENCIAL_AUSENTE'
    })
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 1, pendentes: 0 })

    expect(obterSink).toHaveBeenCalledTimes(2)
    expect(custom.flush).toHaveBeenCalledTimes(1)
  })

  it('sink sem nenhum id aceito é falha e não confirma nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const custom = sinkFake(async () => ({ idsAceitos: [] }))
    const { flusher, spool } = montar({ pendentes: [registro('a')], sink: custom.sink })

    await expect(flusher.flushAgora()).resolves.toEqual({
      ok: false,
      code: 'ANALYTICS_INDISPONIVEL'
    })

    expect(spool.confirmar).not.toHaveBeenCalled()
    expect(flusher.estado().ultimoFlushOk).toBe(false)
  })

  it('ids aceitos fora do lote são ignorados', async () => {
    const custom = sinkFake(async () => ({ idsAceitos: ['b', 'fora', 'b'] }))
    const { flusher, spool } = montar({
      pendentes: [registro('a'), registro('b')],
      sink: custom.sink
    })

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 1, pendentes: 1 })

    expect(spool.confirmacoes).toEqual([['b']])
    expect(spool.lista()).toEqual([registro('a')])
  })

  it('falha do confirmar é ANALYTICS_INDISPONIVEL e não perde os pendentes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const spool = spoolFake([registro('a')])
    spool.confirmar.mockRejectedValueOnce(new Error('disco cheio'))
    const { flusher } = montar({ spool })

    await expect(flusher.flushAgora()).resolves.toEqual({
      ok: false,
      code: 'ANALYTICS_INDISPONIVEL'
    })
    expect(spool.lista()).toEqual([registro('a')])
  })
})

describe('createAnalyticsFlusher — agendamento', () => {
  it('agendar três vezes seguidas produz um flush só depois do debounce', async () => {
    const { flusher, sink } = montar({ pendentes: [registro('a')] })

    flusher.agendar()
    flusher.agendar()
    flusher.agendar()

    await vi.advanceTimersByTimeAsync(4_999)
    expect(sink.flush).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(sink.flush).toHaveBeenCalledTimes(1)
  })

  it('parar cancela o retry pendente e torna agendar um no-op; flush manual segue', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const custom = sinkFake(async () => {
      throw new Error('rede')
    })
    const { flusher } = montar({ pendentes: [registro('a')], sink: custom.sink })

    await flusher.flushAgora()
    expect(custom.flush).toHaveBeenCalledTimes(1)

    flusher.parar()
    flusher.agendar()
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(custom.flush).toHaveBeenCalledTimes(1)
    expect(erro).toHaveBeenCalled()

    await flusher.flushAgora()
    expect(custom.flush).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(custom.flush).toHaveBeenCalledTimes(2)
  })
})
