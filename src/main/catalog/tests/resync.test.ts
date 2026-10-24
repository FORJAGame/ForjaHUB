import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult } from '@shared/types'
import { createCatalogResync } from '../resync'

type Result = CommandResult<{ catalogo: Catalogo }>

const OK: Result = { ok: true, catalogo: { jogos: [], sincronizadoEm: '2026-10-24T12:00:00.000Z' } }
const FALHA: Result = { ok: false, code: 'CATALOGO_INDISPONIVEL' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createCatalogResync', () => {
  it('sem rede: tenta em 1, 2, 4, 8 min e para de crescer em 10 min; quando volta, aplica o Catálogo e para', async () => {
    const sync = vi.fn<(ids: string[]) => Promise<Result>>().mockResolvedValue(FALHA)
    const onSynced = vi.fn()
    const resync = createCatalogResync({ sync, onSynced })

    resync.agendar()
    const esperas = [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]
    for (const [i, espera] of esperas.entries()) {
      await vi.advanceTimersByTimeAsync(espera - 1)
      expect(sync).toHaveBeenCalledTimes(i)
      await vi.advanceTimersByTimeAsync(1)
      expect(sync).toHaveBeenCalledTimes(i + 1)
    }

    sync.mockResolvedValue(OK)
    await vi.advanceTimersByTimeAsync(600_000)
    expect(onSynced).toHaveBeenCalledExactlyOnceWith(OK)

    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(sync).toHaveBeenCalledTimes(esperas.length + 1)
  })

  it('agendar de novo com tentativa pendente não encurta nem duplica o timer', async () => {
    const sync = vi.fn<(ids: string[]) => Promise<Result>>().mockResolvedValue(FALHA)
    const resync = createCatalogResync({ sync, onSynced: vi.fn() })

    resync.agendar()
    await vi.advanceTimersByTimeAsync(30_000)
    resync.agendar()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('tentarAgora com tentativa pendente sincroniza já, sem esperar o backoff', async () => {
    const sync = vi.fn<(ids: string[]) => Promise<Result>>().mockResolvedValue(OK)
    const onSynced = vi.fn()
    const resync = createCatalogResync({ sync, onSynced })

    resync.agendar()
    resync.tentarAgora()
    await vi.advanceTimersByTimeAsync(0)

    expect(sync).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledExactlyOnceWith(OK)
    // O timer do backoff foi cancelado: nada roda de novo depois.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('tentarAgora sem falha pendente não sincroniza (Catálogo já está em dia)', async () => {
    const sync = vi.fn<(ids: string[]) => Promise<Result>>().mockResolvedValue(OK)
    const resync = createCatalogResync({ sync, onSynced: vi.fn() })

    resync.tentarAgora()
    await vi.advanceTimersByTimeAsync(0)
    expect(sync).not.toHaveBeenCalled()
  })

  it('tentarAgora com sync em voo não dispara um segundo', async () => {
    const { promise, resolve: resolver } = Promise.withResolvers<Result>()
    const sync = vi.fn<(ids: string[]) => Promise<Result>>(() => promise)
    const onSynced = vi.fn()
    const resync = createCatalogResync({ sync, onSynced })

    resync.agendar()
    resync.tentarAgora()
    resync.tentarAgora()
    expect(sync).toHaveBeenCalledTimes(1)

    resolver(OK)
    await vi.advanceTimersByTimeAsync(0)
    expect(onSynced).toHaveBeenCalledTimes(1)
  })

  it('sync que lança conta como falha e reagenda', async () => {
    const sync = vi
      .fn<(ids: string[]) => Promise<Result>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(OK)
    const onSynced = vi.fn()
    const resync = createCatalogResync({ sync, onSynced })

    resync.agendar()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onSynced).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(onSynced).toHaveBeenCalledExactlyOnceWith(OK)
  })

  it('parar cancela a tentativa agendada e ignora chamadas seguintes', async () => {
    const sync = vi.fn<(ids: string[]) => Promise<Result>>().mockResolvedValue(FALHA)
    const resync = createCatalogResync({ sync, onSynced: vi.fn() })

    resync.agendar()
    resync.parar()
    resync.agendar()
    resync.tentarAgora()
    await vi.advanceTimersByTimeAsync(60 * 60_000)
    expect(sync).not.toHaveBeenCalled()
  })
})
