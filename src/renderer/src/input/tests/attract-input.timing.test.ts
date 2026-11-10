import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAttractInput, KONAMI_JANELA_MS, type AttractInput } from '../attract-input'
import { KONAMI } from '../konami'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Digita o Konami inteiro espaçando cada passo em `passoMs`. */
function digitarKonami(controle: AttractInput, passoMs: number): void {
  for (const intent of KONAMI) {
    controle.intent(intent)
    vi.advanceTimersByTime(passoMs)
  }
}

describe('createAttractInput — sequências temporais', () => {
  it('Konami inteiro com cada passo a janelaMs - 1 dá Toasty e nada dispara nos 10 s seguintes', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    digitarKonami(controle, KONAMI_JANELA_MS - 1)

    expect(onKonami).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)
    expect(onKonami).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('pausa de exatamente a janela sai uma vez, e a janela nunca fura o teto de 1 s', () => {
    expect(KONAMI_JANELA_MS).toBeLessThanOrEqual(1000)

    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('depois de um Konami completo, um ↑ solitário sai pela janela do ciclo novo', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    for (const intent of KONAMI) controle.intent(intent)
    expect(onKonami).toHaveBeenCalledTimes(1)

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS - 1)
    expect(onExit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('dois Konami seguidas, cada passo na borda da janela, dão Toasty 2× sem sair', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    digitarKonami(controle, KONAMI_JANELA_MS - 1)
    digitarKonami(controle, KONAMI_JANELA_MS - 1)

    expect(onKonami).toHaveBeenCalledTimes(2)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('errar o último passo (B B em vez de B A) sai na hora, sem Toasty', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    for (const intent of KONAMI.slice(0, -1)) controle.intent(intent)
    controle.intent('back')

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onKonami).not.toHaveBeenCalled()
  })

  it('atividade intent no meio da sequência não quebra o Konami nem sai', () => {
    const onExit = vi.fn()
    const onKonami = vi.fn()
    const controle = createAttractInput({ onExit, onKonami })

    for (const intent of KONAMI.slice(0, 5)) controle.intent(intent)
    controle.atividade('intent')
    for (const intent of KONAMI.slice(5)) controle.intent(intent)

    expect(onKonami).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()
  })

  it('rajada depois da saída pela janela mantém onExit em 1×', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS)
    expect(onExit).toHaveBeenCalledTimes(1)

    controle.intent('up')
    controle.intent('confirm')
    controle.atividade('outro')
    controle.atividade('intent')
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 5)

    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('parar antes da janela vencer impede a saída para sempre', () => {
    const onExit = vi.fn()
    const controle = createAttractInput({ onExit, onKonami: vi.fn() })

    controle.intent('up')
    vi.advanceTimersByTime(KONAMI_JANELA_MS - 1)
    controle.parar()
    vi.advanceTimersByTime(KONAMI_JANELA_MS * 3)
    controle.atividade('outro')

    expect(onExit).not.toHaveBeenCalled()
  })
})
