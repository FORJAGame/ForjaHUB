import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult } from '@shared/types'
import { bootCatalog, CATALOG_SYNC_TIMEOUT_MS } from '../boot'

type Result = CommandResult<{ catalogo: Catalogo }>

function catalogo(sincronizadoEm: string): Catalogo {
  return { jogos: [], sincronizadoEm }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('bootCatalog', () => {
  it('happy path: sync resolve DENTRO do budget -> não usa Cache, onSynced dispara com o resultado fresco', async () => {
    vi.useFakeTimers()

    const fresco = catalogo('2026-09-14T00:00:00.000Z')
    const sync = vi.fn().mockResolvedValue({ ok: true, catalogo: fresco } satisfies Result)
    const readCache = vi.fn()
    const onSynced = vi.fn()

    const result = await bootCatalog('/base', { sync, readCache, onSynced })

    expect(result).toEqual({ ok: true, catalogo: fresco })
    expect(readCache).not.toHaveBeenCalled()
    expect(onSynced).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledWith({ ok: true, catalogo: fresco })
  })

  it('I/O Matrix "Timeout 10s, com Cache": usa o Cache e, quando o sync em background termina, dispara onSynced', async () => {
    vi.useFakeTimers()

    const { promise: syncPromise, resolve: resolveSync } = deferred<Result>()
    const sync = vi.fn(() => syncPromise)
    const cacheAnterior = catalogo('2020-01-01T00:00:00.000Z')
    const readCache = vi.fn().mockResolvedValue(cacheAnterior)
    const onSynced = vi.fn()

    const resultPromise = bootCatalog('/base', { sync, readCache, onSynced })

    // Estoura o budget de 10s sem o sync ter resolvido.
    await vi.advanceTimersByTimeAsync(CATALOG_SYNC_TIMEOUT_MS)

    const result = await resultPromise
    expect(result).toEqual({ ok: true, catalogo: cacheAnterior })
    expect(readCache).toHaveBeenCalledWith('/base')
    expect(onSynced).not.toHaveBeenCalled()

    // Sync segue em background; quando (se) resolver, emite via onSynced —
    // é o listener que produção pluga em `catalog:updated`.
    const fresco = catalogo('2026-09-14T00:00:00.000Z')
    resolveSync({ ok: true, catalogo: fresco })
    await vi.runAllTimersAsync()

    expect(onSynced).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledWith({ ok: true, catalogo: fresco })
  })

  it('I/O Matrix "Timeout 10s, com Cache": sync em background que falha NÃO dispara onSynced', async () => {
    vi.useFakeTimers()

    const { promise: syncPromise, resolve: resolveSync } = deferred<Result>()
    const sync = vi.fn(() => syncPromise)
    const readCache = vi.fn().mockResolvedValue(catalogo('2020-01-01T00:00:00.000Z'))
    const onSynced = vi.fn()

    const resultPromise = bootCatalog('/base', { sync, readCache, onSynced })
    await vi.advanceTimersByTimeAsync(CATALOG_SYNC_TIMEOUT_MS)
    await resultPromise

    resolveSync({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    await vi.runAllTimersAsync()

    expect(onSynced).not.toHaveBeenCalled()
  })

  it('I/O Matrix "Timeout/sem rede, sem Cache": sem Cache, espera o sync original até o fim (sem novo timeout)', async () => {
    vi.useFakeTimers()

    const { promise: syncPromise, resolve: resolveSync } = deferred<Result>()
    const sync = vi.fn(() => syncPromise)
    const readCache = vi.fn().mockResolvedValue(null)
    const onSynced = vi.fn()

    const resultPromise = bootCatalog('/base', { sync, readCache, onSynced })

    await vi.advanceTimersByTimeAsync(CATALOG_SYNC_TIMEOUT_MS)

    // Já estourou o budget e não há Cache: `bootCatalog` não pode ter resolvido ainda.
    let settled = false
    resultPromise.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(60_000) // nenhum timeout adicional deveria existir
    expect(settled).toBe(false)
    expect(sync).toHaveBeenCalledTimes(1) // não reprocessa/duplica a chamada de sync

    // O sync original finalmente falha (ex.: 1º boot sem rede) -> propaga o erro.
    resolveSync({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    const result = await resultPromise
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    expect(onSynced).not.toHaveBeenCalled()
  })

  it('I/O Matrix "Timeout/sem rede, sem Cache": se o sync original acabar dando certo, propaga o sucesso', async () => {
    vi.useFakeTimers()

    const { promise: syncPromise, resolve: resolveSync } = deferred<Result>()
    const sync = vi.fn(() => syncPromise)
    const readCache = vi.fn().mockResolvedValue(null)
    const onSynced = vi.fn()

    const resultPromise = bootCatalog('/base', { sync, readCache, onSynced })
    await vi.advanceTimersByTimeAsync(CATALOG_SYNC_TIMEOUT_MS)

    const fresco = catalogo('2026-09-14T00:00:00.000Z')
    resolveSync({ ok: true, catalogo: fresco })
    const result = await resultPromise

    expect(result).toEqual({ ok: true, catalogo: fresco })
    expect(onSynced).toHaveBeenCalledWith({ ok: true, catalogo: fresco })
  })

  it('sync falha DENTRO do budget + Cache presente -> usa o Cache (Estação configurada ligando offline)', async () => {
    vi.useFakeTimers()

    const cache = catalogo('2026-09-01T00:00:00.000Z')
    const sync = vi.fn().mockResolvedValue({ ok: false, code: 'CATALOGO_INDISPONIVEL' } satisfies Result)
    const readCache = vi.fn().mockResolvedValue(cache)
    const onSynced = vi.fn()

    const result = await bootCatalog('/base', { sync, readCache, onSynced })

    expect(result).toEqual({ ok: true, catalogo: cache })
    expect(onSynced).not.toHaveBeenCalled()
  })

  it('sync falha DENTRO do budget + sem Cache -> devolve a falha original', async () => {
    vi.useFakeTimers()

    const sync = vi.fn().mockResolvedValue({ ok: false, code: 'CREDENCIAL_AUSENTE' } satisfies Result)
    const readCache = vi.fn().mockResolvedValue(null)

    const result = await bootCatalog('/base', { sync, readCache })

    expect(result).toEqual({ ok: false, code: 'CREDENCIAL_AUSENTE' })
  })
})
