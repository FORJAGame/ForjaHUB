import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createRecuo, type Recuo } from '../recuo'

afterEach(() => {
  vi.useRealTimers()
})

interface Montagem {
  recuo: Recuo
  destruirJanela: Mock<() => void>
  restaurarJanela: Mock<() => void>
}

function montar(): Montagem {
  const destruirJanela = vi.fn()
  const restaurarJanela = vi.fn()
  return { recuo: createRecuo({ destruirJanela, restaurarJanela }), destruirJanela, restaurarJanela }
}

describe('createRecuo — corridas', () => {
  it('recuar duas vezes seguidas destrói a janela uma vez só', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela } = montar()

    recuo.recuar()
    recuo.recuar()
    vi.advanceTimersByTime(10_000)

    expect(destruirJanela).toHaveBeenCalledTimes(1)
  })

  it('voltar sem recuar restaura uma vez e não deixa timer vivo', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.voltar()

    expect(restaurarJanela).toHaveBeenCalledTimes(1)
    expect(destruirJanela).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('voltar depois da destruição restaura e não destrói de novo', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.recuar()
    vi.advanceTimersByTime(1500)
    recuo.voltar()
    vi.advanceTimersByTime(10_000)

    expect(destruirJanela).toHaveBeenCalledTimes(1)
    expect(restaurarJanela).toHaveBeenCalledTimes(1)
  })

  it('recuar → voltar → recuar (2º Jogo): o 2º recuo ainda destrói e o 1º não vaza', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    // 1º Jogo fecha antes do atraso.
    recuo.recuar()
    vi.advanceTimersByTime(400)
    recuo.voltar()
    expect(vi.getTimerCount()).toBe(0)

    // 2º Jogo: o relógio do 1º recuo não pode antecipar a destruição.
    recuo.recuar()
    vi.advanceTimersByTime(1499)
    expect(destruirJanela).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(destruirJanela).toHaveBeenCalledTimes(1)
    expect(restaurarJanela).toHaveBeenCalledTimes(1)

    recuo.voltar()
    expect(restaurarJanela).toHaveBeenCalledTimes(2)
    expect(destruirJanela).toHaveBeenCalledTimes(1)
  })
})
