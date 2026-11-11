import { describe, expect, it, vi } from 'vitest'
import type { Intent } from '../types'
import { avancarKonami, createKonamiDetector, KONAMI } from '../konami'

describe('KONAMI', () => {
  it('sequência clássica na linguagem de Intent', () => {
    expect(KONAMI).toEqual([
      'up',
      'up',
      'down',
      'down',
      'left',
      'right',
      'left',
      'right',
      'back',
      'confirm'
    ])
  })
})

describe('avancarKonami', () => {
  it('cada passo certo avança até o fim', () => {
    let pos = 0
    for (const intent of KONAMI) {
      expect(avancarKonami(pos, intent)).toBe(pos + 1)
      pos += 1
    }
    expect(pos).toBe(KONAMI.length)
  })

  it('passo errado devolve null', () => {
    expect(avancarKonami(0, 'down')).toBeNull()
    expect(avancarKonami(1, 'down')).toBeNull()
    expect(avancarKonami(0, 'confirm')).toBeNull()
  })

  it('não aceita atalho: posição não avança sem casar', () => {
    expect(avancarKonami(2, 'up')).toBeNull()
    expect(avancarKonami(2, 'down')).toBe(3)
  })
})

describe('createKonamiDetector', () => {
  function detectar(intents: readonly Intent[]): number {
    const onKonami = vi.fn()
    const detector = createKonamiDetector(onKonami)
    for (const intent of intents) detector(intent)
    return onKonami.mock.calls.length
  }

  it('dispara no código completo mesmo depois de navegar', () => {
    expect(detectar(['left', 'right', 'confirm', 'back', ...KONAMI])).toBe(1)
  })

  it('um ↑ a mais no começo não estraga a sequência', () => {
    expect(detectar(['up', ...KONAMI])).toBe(1)
  })

  it('erro no meio exige recomeçar, e o recomeço vale', () => {
    expect(detectar([...KONAMI.slice(0, 6), 'up'])).toBe(0)
    expect(detectar([...KONAMI.slice(0, 6), 'up', ...KONAMI])).toBe(1)
  })

  it('cada disparo consome a sequência: o próximo exige o código inteiro de novo', () => {
    expect(detectar([...KONAMI, ...KONAMI.slice(1)])).toBe(1)
    expect(detectar([...KONAMI, ...KONAMI])).toBe(2)
  })

  it('só o intent que completa o código é consumido; os passos anteriores seguem para as telas', () => {
    const detector = createKonamiDetector(() => {})
    const consumidos = KONAMI.map((intent) => detector(intent))
    expect(consumidos).toEqual([...Array<boolean>(KONAMI.length - 1).fill(false), true])
  })
})
