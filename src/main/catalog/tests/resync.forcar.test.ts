import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult } from '@shared/types'
import type { SyncFn, SyncOk } from '../boot'
import { createCatalogResync, type CatalogResync } from '../resync'
import { hubLog } from '../../log/hub-log'

type Result = CommandResult<{ catalogo: Catalogo }>

const OK: Result = { ok: true, catalogo: { jogos: [], sincronizadoEm: '2026-10-24T12:00:00.000Z' } }
const FALHA: Result = { ok: false, code: 'CATALOGO_INDISPONIVEL' }
const BASE = new Date('2026-01-01T00:00:00.000Z').getTime()

const iso = (ms: number): string => new Date(BASE + ms).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function criar(sync: SyncFn): { resync: CatalogResync; onSynced: (result: SyncOk) => void } {
  const onSynced = vi.fn()
  const resync = createCatalogResync({ sync, onSynced })
  return { resync, onSynced }
}

describe('forcar (sync pedido pelo Operador)', () => {
  it('sem nada pendente roda um sync; no sucesso chama onSynced 1x e devolve o resultado ok', async () => {
    const gate = Promise.withResolvers<Result>()
    const sync = vi.fn(() => gate.promise)
    const { resync, onSynced } = criar(sync)

    const p = resync.forcar()
    expect(sync).toHaveBeenCalledTimes(1)
    gate.resolve(OK)
    await expect(p).resolves.toEqual(OK)
    expect(onSynced).toHaveBeenCalledExactlyOnceWith(OK)
  })

  it('com tentativa agendada: cancela o timer; sucesso não dispara sync extra e proximaTentativaEm é null', async () => {
    const gate = Promise.withResolvers<Result>()
    const sync = vi.fn(() => gate.promise)
    const { resync, onSynced } = criar(sync)

    resync.agendar()
    const p = resync.forcar()
    gate.resolve(OK)
    await expect(p).resolves.toEqual(OK)

    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledTimes(1)
    expect(resync.estado().proximaTentativaEm).toBeNull()
  })

  it('que falha devolve o code, não chama onSynced e agenda nova tentativa; o relógio a dispara', async () => {
    const sync = vi.fn<() => Promise<Result>>().mockResolvedValue(FALHA)
    const { resync, onSynced } = criar(sync)

    const resultado = await resync.forcar()
    expect(resultado).toEqual(FALHA)
    expect(onSynced).not.toHaveBeenCalled()
    // 1ª falha: backoff dobra para 120 s
    expect(resync.estado().proximaTentativaEm).toBe(iso(120_000))

    await vi.advanceTimersByTimeAsync(120_000)
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('duas chamadas com sync em voo: sync 1x, mesma Promise, onSynced 1x', async () => {
    const gate = Promise.withResolvers<Result>()
    const sync = vi.fn(() => gate.promise)
    const { resync, onSynced } = criar(sync)

    const p1 = resync.forcar()
    const p2 = resync.forcar()
    expect(p1).toBe(p2)
    gate.resolve(OK)
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(OK)
    expect(r2).toEqual(OK)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledTimes(1)
  })

  it('com tentativa automática em voo: não inicia 2º sync, devolve o resultado dela, onSynced 1x', async () => {
    const gate = Promise.withResolvers<Result>()
    const sync = vi.fn(() => gate.promise)
    const { resync, onSynced } = criar(sync)

    resync.agendar()
    await vi.advanceTimersByTimeAsync(60_000) // dispara a tentativa automática
    expect(sync).toHaveBeenCalledTimes(1)

    const p = resync.forcar()
    gate.resolve(OK)
    await expect(p).resolves.toEqual(OK)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(onSynced).toHaveBeenCalledTimes(1)
    expect(resync.estado().proximaTentativaEm).toBeNull()
  })

  it('proximaTentativaEm: agendar() ⇒ agora+60 s; 1ª falha automática ⇒ agora+120 s', async () => {
    const sync = vi.fn<() => Promise<Result>>().mockResolvedValue(FALHA)
    const { resync } = criar(sync)

    resync.agendar()
    expect(resync.estado().proximaTentativaEm).toBe(iso(60_000))

    await vi.advanceTimersByTimeAsync(60_000) // falha automática às 60 s
    expect(sync).toHaveBeenCalledTimes(1)
    expect(resync.estado().proximaTentativaEm).toBe(iso(180_000)) // 60 s + 120 s
  })

  it('forçado bem-sucedido depois de 3 falhas zera o backoff: agendar() seguinte espera 60 s de novo', async () => {
    const sync = vi.fn<() => Promise<Result>>()
    sync.mockResolvedValueOnce(FALHA).mockResolvedValueOnce(FALHA).mockResolvedValueOnce(FALHA)
    const { resync } = criar(sync)

    resync.agendar()
    await vi.advanceTimersByTimeAsync(60_000) // falha 1
    await vi.advanceTimersByTimeAsync(120_000) // falha 2
    await vi.advanceTimersByTimeAsync(240_000) // falha 3
    expect(sync).toHaveBeenCalledTimes(3)

    sync.mockResolvedValueOnce(OK)
    await expect(resync.forcar()).resolves.toEqual(OK)

    resync.agendar()
    expect(resync.estado().proximaTentativaEm).toBe(iso(420_000 + 60_000)) // 420 s decorridos + 60 s
  })

  it('sync que rejeita em forcar() vira CATALOGO_INDISPONIVEL e agenda nova tentativa', async () => {
    const sync = vi.fn<() => Promise<Result>>().mockRejectedValue(new Error('boom'))
    const { resync } = criar(sync)

    await expect(resync.forcar()).resolves.toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    expect(resync.estado().proximaTentativaEm).toBe(iso(120_000))
  })

  it('depois de parar(), forcar() devolve ok:false sem chamar sync', async () => {
    const sync = vi.fn<() => Promise<Result>>().mockResolvedValue(OK)
    const { resync, onSynced } = criar(sync)

    resync.parar()
    await expect(resync.forcar()).resolves.toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    expect(sync).not.toHaveBeenCalled()
    expect(onSynced).not.toHaveBeenCalled()
  })

  it('que falha a partir do estado limpo deixa a tentativa pendente: tentarAgora() chama o sync sem esperar o backoff', async () => {
    const sync = vi.fn<() => Promise<Result>>().mockResolvedValue(FALHA)
    const { resync, onSynced } = criar(sync)

    await expect(resync.forcar()).resolves.toEqual(FALHA)
    expect(onSynced).not.toHaveBeenCalled()
    expect(resync.estado().proximaTentativaEm).toBe(iso(120_000)) // pendente, com backoff

    resync.tentarAgora()
    await vi.advanceTimersByTimeAsync(0)
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('loga hubLog.info(catalogo, "sync pedido pelo Operador") 1x; 2º forcar na mesma tentativa não loga de novo', async () => {
    const espia = vi.spyOn(hubLog, 'info').mockImplementation(() => {})
    const gate = Promise.withResolvers<Result>()
    const sync = vi.fn(() => gate.promise)
    const { resync } = criar(sync)

    const p1 = resync.forcar()
    const p2 = resync.forcar()
    gate.resolve(OK)
    await Promise.all([p1, p2])
    expect(espia).toHaveBeenCalledExactlyOnceWith('catalogo', 'sync pedido pelo Operador')
  })
})
