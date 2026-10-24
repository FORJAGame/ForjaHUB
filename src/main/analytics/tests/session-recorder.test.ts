import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ConfigEstacao, RegistroAnalytics } from '@shared/types'
import {
  createSessionRecorder,
  type SessionRecorder,
  type SessionRecorderDeps
} from '../session-recorder'
import type { AnalyticsSpool, InicioSessao } from '../types'

const INICIO_ISO = '2026-03-04T10:00:00.000Z'

const CONFIG: ConfigEstacao = {
  estacaoId: 'estacao-1',
  eventoId: 'evento-1',
  jogosSelecionados: ['jogo-a'],
  schemaVersion: 1
}

interface SpoolFake {
  spool: AnalyticsSpool
  aberturas: InicioSessao[]
  toques: string[]
  fechamentos: Array<{ duracaoSeg: number; incompleta?: true }>
  ordem: string[]
}

function spoolFake(impl: {
  abrir?: (inicio: InicioSessao) => Promise<string>
  tocar?: (vistoEmISO: string) => Promise<void>
  fechar?: (fim: { duracaoSeg: number; incompleta?: true }) => Promise<RegistroAnalytics | null>
} = {}): SpoolFake {
  const aberturas: InicioSessao[] = []
  const toques: string[] = []
  const fechamentos: Array<{ duracaoSeg: number; incompleta?: true }> = []
  const ordem: string[] = []
  const spool: AnalyticsSpool = {
    abrirSessao: async (inicio) => {
      ordem.push('abrir')
      aberturas.push(inicio)
      return impl.abrir ? impl.abrir(inicio) : 'sessao-1'
    },
    tocarSessao: async (vistoEmISO) => {
      ordem.push('tocar')
      toques.push(vistoEmISO)
      if (impl.tocar) await impl.tocar(vistoEmISO)
    },
    fecharSessao: async (fim) => {
      ordem.push('fechar')
      fechamentos.push(fim)
      return impl.fechar ? impl.fechar(fim) : null
    },
    pendentes: async () => [],
    confirmar: async () => {}
  }
  return { spool, aberturas, toques, fechamentos, ordem }
}

function montar(
  over: Partial<SessionRecorderDeps> = {},
  spool: SpoolFake = spoolFake()
): {
  recorder: SessionRecorder
  spool: SpoolFake
  aoRegistrar: Mock
} {
  const aoRegistrar = vi.fn()
  const recorder = createSessionRecorder({
    spool: spool.spool,
    lerConfigEstacao: async () => CONFIG,
    aoRegistrar,
    agora: () => new Date('2026-03-04T10:00:00.000Z'),
    relogioMs: () => 0,
    ...over
  })
  return { recorder, spool, aoRegistrar }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createSessionRecorder — ciclo da Sessão', () => {
  it('iniciar → encerrar grava com o carimbo da Config e avisa uma vez', async () => {
    const { recorder, spool, aoRegistrar } = montar()

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    await recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: INICIO_ISO,
      duracaoMs: 65_400,
      codigo: 0
    })

    expect(spool.aberturas).toEqual([
      {
        jogoId: 'jogo-a',
        estacaoId: 'estacao-1',
        eventoId: 'evento-1',
        inicioISO: INICIO_ISO
      }
    ])
    expect(spool.fechamentos).toEqual([{ duracaoSeg: 65 }])
    expect(aoRegistrar).toHaveBeenCalledTimes(1)
    expect(recorder.aberta()).toBe(false)
  })

  it('encerrar antes do abrirSessao resolver ainda fecha a Sessão certa', async () => {
    const aberto = Promise.withResolvers<string>()
    const spool = spoolFake({ abrir: () => aberto.promise })
    const aoRegistrar = vi.fn()
    const recorder = createSessionRecorder({
      spool: spool.spool,
      lerConfigEstacao: async () => CONFIG,
      aoRegistrar
    })

    const iniciando = recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    const encerrando = recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: INICIO_ISO,
      duracaoMs: 1_500,
      codigo: null
    })

    await Promise.resolve()
    expect(spool.ordem).toEqual(['abrir'])
    expect(recorder.aberta()).toBe(false)

    aberto.resolve('sessao-lenta')
    await iniciando
    await encerrando

    expect(spool.ordem).toEqual(['abrir', 'fechar'])
    expect(spool.fechamentos).toEqual([{ duracaoSeg: 2 }])
    expect(aoRegistrar).toHaveBeenCalledTimes(1)
  })

  it('Config nula: nada no spool e encerrar não fecha', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { recorder, spool, aoRegistrar } = montar({ lerConfigEstacao: async () => null })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    await recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: INICIO_ISO,
      duracaoMs: 1_000,
      codigo: 0
    })

    expect(aviso).toHaveBeenCalled()
    expect(spool.aberturas).toEqual([])
    expect(spool.fechamentos).toEqual([])
    expect(aoRegistrar).not.toHaveBeenCalled()
    expect(recorder.aberta()).toBe(false)
  })

  it('carimbo Estação/Evento é o do iniciar, mesmo se a Config mudar depois', async () => {
    let config: ConfigEstacao = CONFIG
    const { recorder, spool } = montar({ lerConfigEstacao: async () => config })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    config = { ...CONFIG, estacaoId: 'estacao-2', eventoId: 'evento-2' }
    await recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: INICIO_ISO,
      duracaoMs: 1_000,
      codigo: 0
    })

    expect(spool.aberturas[0]).toMatchObject({ estacaoId: 'estacao-1', eventoId: 'evento-1' })
  })
})

describe('createSessionRecorder — heartbeat', () => {
  it('toca a Sessão a cada heartbeatMs e para depois do encerrar', async () => {
    const { recorder, spool } = montar({ heartbeatMs: 1_000 })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    vi.advanceTimersByTime(3_000)
    expect(spool.toques).toEqual([
      '2026-03-04T10:00:00.000Z',
      '2026-03-04T10:00:00.000Z',
      '2026-03-04T10:00:00.000Z'
    ])

    await recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: INICIO_ISO,
      duracaoMs: 3_000,
      codigo: 0
    })
    vi.advanceTimersByTime(5_000)
    expect(spool.toques).toHaveLength(3)
  })

  it('usa o intervalo padrão de 60 s', async () => {
    const { recorder, spool } = montar()

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    vi.advanceTimersByTime(59_999)
    expect(spool.toques).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(spool.toques).toHaveLength(1)
  })
})

describe('createSessionRecorder — encerrarNoQuit', () => {
  it('usa o relógio monotônico e marca a Sessão como incompleta', async () => {
    let agoraMs = 1_000
    const { recorder, spool, aoRegistrar } = montar({
      relogioMs: () => agoraMs,
      agora: () => new Date('2030-01-01T00:00:00.000Z')
    })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    agoraMs = 91_600
    await recorder.encerrarNoQuit()

    expect(spool.fechamentos).toEqual([{ duracaoSeg: 91, incompleta: true }])
    expect(aoRegistrar).not.toHaveBeenCalled()
    expect(recorder.aberta()).toBe(false)
  })

  it('sem Sessão aberta não toca no spool', async () => {
    const { recorder, spool } = montar()

    await recorder.encerrarNoQuit()

    expect(spool.ordem).toEqual([])
  })
})

describe('createSessionRecorder — falhas nunca rejeitam', () => {
  it('abrirSessao rejeitando: iniciar resolve e encerrar não fecha', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spool = spoolFake({
      abrir: async () => {
        throw new Error('disco cheio')
      }
    })
    const { recorder, aoRegistrar } = montar({}, spool)

    await expect(recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })).resolves.toBeUndefined()
    await expect(
      recorder.encerrar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO, duracaoMs: 10, codigo: 0 })
    ).resolves.toBeUndefined()

    expect(erro).toHaveBeenCalled()
    expect(spool.fechamentos).toEqual([])
    expect(aoRegistrar).not.toHaveBeenCalled()
  })

  it('fecharSessao rejeitando: encerrar resolve e não avisa registro', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spool = spoolFake({
      fechar: async () => {
        throw new Error('disco cheio')
      }
    })
    const aoRegistrar = vi.fn()
    const recorder = createSessionRecorder({
      spool: spool.spool,
      lerConfigEstacao: async () => CONFIG,
      aoRegistrar
    })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    await expect(
      recorder.encerrar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO, duracaoMs: 10, codigo: 0 })
    ).resolves.toBeUndefined()

    expect(erro).toHaveBeenCalled()
    expect(aoRegistrar).not.toHaveBeenCalled()
    expect(recorder.aberta()).toBe(true)
  })

  it('heartbeat rejeitando não derruba nada', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const spool = spoolFake({
      tocar: async () => {
        throw new Error('disco cheio')
      }
    })
    const { recorder } = montar({ heartbeatMs: 1_000 }, spool)

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_ISO })
    await vi.advanceTimersByTimeAsync(1_000)

    expect(erro).toHaveBeenCalled()
  })
})
