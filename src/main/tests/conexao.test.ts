import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vigiarConexao } from '../conexao'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('vigiarConexao', () => {
  it('dispara só na transição offline → online, uma vez por volta', async () => {
    let online = false
    const aoVoltar = vi.fn()
    vigiarConexao({ estaOnline: () => online, aoVoltar, intervaloMs: 1_000 })

    await vi.advanceTimersByTimeAsync(3_000)
    expect(aoVoltar).not.toHaveBeenCalled()

    online = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect(aoVoltar).toHaveBeenCalledTimes(1)

    // Continuar online não repete.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(aoVoltar).toHaveBeenCalledTimes(1)

    online = false
    await vi.advanceTimersByTimeAsync(1_000)
    online = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect(aoVoltar).toHaveBeenCalledTimes(2)
  })

  it('já online no início não conta como volta', async () => {
    const aoVoltar = vi.fn()
    vigiarConexao({ estaOnline: () => true, aoVoltar, intervaloMs: 1_000 })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(aoVoltar).not.toHaveBeenCalled()
  })

  it('parar encerra a vigia', async () => {
    let online = false
    const aoVoltar = vi.fn()
    const vigia = vigiarConexao({ estaOnline: () => online, aoVoltar, intervaloMs: 1_000 })

    vigia.parar()
    online = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(aoVoltar).not.toHaveBeenCalled()
  })
})
