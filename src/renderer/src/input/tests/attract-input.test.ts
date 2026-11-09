import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAttractInput, KONAMI_JANELA_MS } from '../attract-input'
import { KONAMI } from '../konami'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createAttractInput — Konami', () => {
  it('sequência completa dispara onKonami sem sair', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    for (const intent of KONAMI) controle.intent(intent)

    expect(onKonami).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(KONAMI_JANELA_MS * 3)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('reinicia a sequência depois de completar', () => {
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit: vi.fn(), onKonami })

    for (const intent of KONAMI) controle.intent(intent)
    for (const intent of KONAMI) controle.intent(intent)

    expect(onKonami).toHaveBeenCalledTimes(2)
  })

  it('passo errado no meio sai na hora', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    controle.intent('down')

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('errar o primeiro passo sai na hora', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('confirm')

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('pausa maior que a janela sai, e uma única vez', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS - 1)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onExit).toHaveBeenCalledTimes(1)

    controle.intent('up')
    controle.atividade('outro')
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 2)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('passo dentro da janela rearma a contagem', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS - 200)
    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS - 200)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('janelaMs customizado manda no tempo', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn(), janelaMs: 100 })

    controle.intent('up')
    vi.advanceTimersByTime(99)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

describe('createAttractInput — atividade', () => {
  it('outro no meio sai na hora', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    controle.atividade('outro')

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('intent não sai nem arma a janela', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.atividade('intent')
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 3)

    expect(onExit).not.toHaveBeenCalled()
  })
})

describe('createAttractInput — encerramento', () => {
  it('depois de sair tudo vira no-op', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    controle.atividade('outro')
    controle.intent('up')
    controle.atividade('outro')
    controle.parar()
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 3)

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onKonami).not.toHaveBeenCalled()
  })

  it('parar cancela a janela sem chamar onExit e desliga de vez', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    controle.parar()
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 3)
    controle.atividade('outro')
    controle.intent('up')

    expect(onExit).not.toHaveBeenCalled()
  })
})
