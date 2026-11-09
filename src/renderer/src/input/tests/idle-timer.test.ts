import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdleTimer } from '../idle-timer'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createIdleTimer', () => {
  it('dispara depois do tempo, não antes', () => {
    const onIdle = vi.fn()
    createIdleTimer({ ms: 1000, onIdle })

    vi.advanceTimersByTime(999)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('dispara uma vez por armação', () => {
    const onIdle = vi.fn()
    createIdleTimer({ ms: 1000, onIdle })

    vi.advanceTimersByTime(10_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('tocar adia a contagem', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer({ ms: 1000, onIdle })

    vi.advanceTimersByTime(600)
    timer.tocar()
    vi.advanceTimersByTime(600)
    expect(onIdle).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('depois de disparar, só um tocar rearma', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer({ ms: 1000, onIdle })

    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)

    timer.tocar()
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(2)
  })

  it('parar cancela e não volta nem com tocar', () => {
    const onIdle = vi.fn()
    const timer = createIdleTimer({ ms: 1000, onIdle })

    vi.advanceTimersByTime(500)
    timer.parar()
    vi.advanceTimersByTime(10_000)
    expect(onIdle).not.toHaveBeenCalled()

    timer.tocar()
    vi.advanceTimersByTime(10_000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
