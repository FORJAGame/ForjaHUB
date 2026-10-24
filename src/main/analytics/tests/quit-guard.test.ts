import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuitGuard, type QuitGuardDeps } from '../quit-guard'

function evento(): { preventDefault: ReturnType<typeof vi.fn> } {
  return { preventDefault: vi.fn() }
}

function montar(over: Partial<QuitGuardDeps> = {}): {
  guard: ReturnType<typeof createQuitGuard>
  sair: ReturnType<typeof vi.fn>
  encerrar: ReturnType<typeof vi.fn>
} {
  const sair = vi.fn()
  const encerrar = vi.fn(async () => {})
  const guard = createQuitGuard({ temSessao: () => true, encerrar, sair, ...over })
  return { guard, sair, encerrar }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createQuitGuard', () => {
  it('sem Sessão: não segura o quit', () => {
    const { guard, encerrar } = montar({ temSessao: () => false })
    const e = evento()
    guard(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(encerrar).not.toHaveBeenCalled()
  })

  it('com Sessão: segura, fecha o registro e só então sai; o quit seguinte passa direto', async () => {
    const { guard, encerrar, sair } = montar()
    const e = evento()
    guard(e)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(sair).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()
    expect(encerrar).toHaveBeenCalledTimes(1)
    expect(sair).toHaveBeenCalledTimes(1)

    const segundo = evento()
    guard(segundo)
    expect(segundo.preventDefault).not.toHaveBeenCalled()
    expect(encerrar).toHaveBeenCalledTimes(1)
  })

  it('registro preso: sai depois do teto mesmo assim', async () => {
    const { guard, sair } = montar({ encerrar: () => new Promise<void>(() => {}), timeoutMs: 3_000 })
    guard(evento())

    await vi.advanceTimersByTimeAsync(2_999)
    expect(sair).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(sair).toHaveBeenCalledTimes(1)
  })

  it('registro que lança: sai do mesmo jeito', async () => {
    const { guard, sair } = montar({
      encerrar: () => {
        throw new Error('disco')
      }
    })
    guard(evento())
    await vi.runAllTimersAsync()
    expect(sair).toHaveBeenCalledTimes(1)
  })
})
