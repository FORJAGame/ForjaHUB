import { describe, expect, it } from 'vitest'
import { avancarKonami, KONAMI } from '../konami'

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
