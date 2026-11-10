import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleTimer } from '../idle-timer'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createIdleTimer — bordas', () => {
  it('tocar em ms - 1 repetidamente nunca dispara; sem tocar, dispara 1× e não repete', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer({ ms: 1000, onIdle })

    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(999)
      timer.tocar()
    }
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('ciclo de vida: rearma após disparar, parar após disparar é seguro e não rearma', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer({ ms: 100, onIdle })

    vi.advanceTimersByTime(100)
    expect(onIdle).toHaveBeenCalledTimes(1)

    timer.tocar()
    vi.advanceTimersByTime(100)
    expect(onIdle).toHaveBeenCalledTimes(2)

    timer.parar()
    vi.advanceTimersByTime(10_000)
    timer.tocar()
    vi.advanceTimersByTime(10_000)
    expect(onIdle).toHaveBeenCalledTimes(2)
  })
})
