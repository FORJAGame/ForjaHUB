import { describe, expect, it } from 'vitest'
import {
  CROSSFADE_MS,
  SLIDE_FORJA_MS,
  SLIDE_JOGO_MS,
  duracaoSlide,
  kenBurnsVariante,
  slideAt,
  type Slide
} from '../attract-sequence'

/** Assinatura legível de um slide: `J<indice>` ou `F`. */
function assinatura(slide: Slide): string {
  return slide.tipo === 'forja' ? 'F' : `J${slide.indice}`
}

function sequencia(totalJogos: number, passos: number): string[] {
  return Array.from({ length: passos }, (_, n) => assinatura(slideAt(n, totalJogos)))
}

describe('slideAt', () => {
  it('com 5 Jogos intercala o card FORJA mantendo a ordem do Catálogo', () => {
    expect(sequencia(5, 15)).toEqual([
      'J0',
      'J1',
      'J2',
      'J3',
      'F',
      'J4',
      'J0',
      'J1',
      'J2',
      'F',
      'J3',
      'J4',
      'J0',
      'J1',
      'F'
    ])
  })

  it('com 4 Jogos o card vem depois de cada passagem completa', () => {
    expect(sequencia(4, 10)).toEqual(['J0', 'J1', 'J2', 'J3', 'F', 'J0', 'J1', 'J2', 'J3', 'F'])
  })

  it('com 1 Jogo repete o mesmo Jogo e o card a cada 4', () => {
    expect(sequencia(1, 6)).toEqual(['J0', 'J0', 'J0', 'J0', 'F', 'J0'])
  })

  it('sem Jogos é só card FORJA', () => {
    for (let n = 0; n < 12; n++) expect(slideAt(n, 0)).toEqual({ tipo: 'forja' })
  })

  it('o card FORJA vem sempre depois de 4 Jogos', () => {
    for (const total of [1, 2, 3, 4, 5, 7, 9]) {
      for (let n = 0; n < 40; n += 5) {
        expect(slideAt(n + 4, total)).toEqual({ tipo: 'forja' })
        for (let dentro = 0; dentro < 4; dentro++) {
          expect(slideAt(n + dentro, total).tipo).toBe('jogo')
        }
      }
    }
  })

  it('a ordem dos Jogos é contínua entre um ciclo e o seguinte', () => {
    const total = 7
    const indices: number[] = []
    for (let n = 0; n < 40; n++) {
      const slide = slideAt(n, total)
      if (slide.tipo === 'jogo') indices.push(slide.indice)
    }
    // Cada Jogo exibido é o seguinte do anterior no Catálogo (com wrap).
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe((indices[i - 1] + 1) % total)
    }
  })

  it('nunca devolve índice fora do Catálogo', () => {
    for (const total of [1, 2, 3, 5, 8]) {
      for (let n = 0; n < 200; n++) {
        const slide = slideAt(n, total)
        if (slide.tipo === 'jogo') expect(slide.indice).toBeGreaterThanOrEqual(0)
        if (slide.tipo === 'jogo') expect(slide.indice).toBeLessThan(total)
      }
    }
  })
})

describe('duracaoSlide', () => {
  it('Jogo fica ~7s e o card FORJA ~5s', () => {
    expect(duracaoSlide({ tipo: 'jogo', indice: 2 })).toBe(SLIDE_JOGO_MS)
    expect(duracaoSlide({ tipo: 'forja' })).toBe(SLIDE_FORJA_MS)
    expect(SLIDE_JOGO_MS).toBe(7000)
    expect(SLIDE_FORJA_MS).toBe(5000)
    expect(CROSSFADE_MS).toBe(1200)
  })
})

describe('kenBurnsVariante', () => {
  it('cicla 1..4 sem buraco', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(kenBurnsVariante)).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2])
  })
})
