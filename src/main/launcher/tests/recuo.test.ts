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

function montar(atrasoMs?: number): Montagem {
  const destruirJanela = vi.fn()
  const restaurarJanela = vi.fn()
  const recuo = createRecuo({ destruirJanela, restaurarJanela, atrasoMs })
  return { recuo, destruirJanela, restaurarJanela }
}

describe('createRecuo', () => {
  it('recuar destrói a janela só depois de 1500ms', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.recuar()
    vi.advanceTimersByTime(1499)
    expect(destruirJanela).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(destruirJanela).toHaveBeenCalledTimes(1)
    expect(restaurarJanela).not.toHaveBeenCalled()
  })

  it('atrasoMs customizado é respeitado', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela } = montar(200)

    recuo.recuar()
    vi.advanceTimersByTime(199)
    expect(destruirJanela).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(destruirJanela).toHaveBeenCalledTimes(1)
  })

  it('Jogo que fecha antes do atraso: não destrói e restaura uma única vez', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.recuar()
    vi.advanceTimersByTime(500)
    recuo.voltar()

    expect(restaurarJanela).toHaveBeenCalledTimes(1)
    expect(destruirJanela).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)
    expect(destruirJanela).not.toHaveBeenCalled()
    expect(restaurarJanela).toHaveBeenCalledTimes(1)
  })

  it('voltar sem recuo pendente ainda restaura', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.voltar()
    vi.advanceTimersByTime(5000)

    expect(restaurarJanela).toHaveBeenCalledTimes(1)
    expect(destruirJanela).not.toHaveBeenCalled()
  })

  it('voltar depois do recuo consumado só restaura', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela, restaurarJanela } = montar()

    recuo.recuar()
    vi.advanceTimersByTime(1500)
    recuo.voltar()

    expect(destruirJanela).toHaveBeenCalledTimes(1)
    expect(restaurarJanela).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    expect(restaurarJanela).toHaveBeenCalledTimes(1)
  })

  it('recuar de novo substitui o agendamento anterior', () => {
    vi.useFakeTimers()
    const { recuo, destruirJanela } = montar()

    recuo.recuar()
    vi.advanceTimersByTime(1000)
    recuo.recuar()
    vi.advanceTimersByTime(1000)
    expect(destruirJanela).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(destruirJanela).toHaveBeenCalledTimes(1)
  })
})
