import { describe, expect, it } from 'vitest'
import { JOGOS_POR_CARD_FORJA, kenBurnsVariante, slideAt } from '../attract-sequence'

/** Totais de Jogos exigidos: sempre há pelo menos 1 Jogo na sequência. */
const TOTAIS = Array.from({ length: 12 }, (_, i) => i + 1)
const ULTIMO_N = 500

describe('slideAt — propriedades da sequência (1 a 12 Jogos, n até 500)', () => {
  it('nunca vêm dois cards FORJA seguidos', () => {
    for (const total of TOTAIS) {
      for (let n = 0; n < ULTIMO_N; n++) {
        if (slideAt(n, total).tipo === 'forja') {
          expect(slideAt(n + 1, total).tipo).toBe('jogo')
        }
      }
    }
  })

  it('entre dois cards FORJA há exatamente 4 slides de Jogo com índice válido', () => {
    for (const total of TOTAIS) {
      let ultimoForja = -1
      for (let n = 0; n <= ULTIMO_N; n++) {
        const slide = slideAt(n, total)
        if (slide.tipo === 'jogo') {
          expect(slide.indice).toBeGreaterThanOrEqual(0)
          expect(slide.indice).toBeLessThan(total)
          continue
        }
        if (ultimoForja >= 0) {
          expect(n - ultimoForja - 1).toBe(JOGOS_POR_CARD_FORJA)
        }
        ultimoForja = n
      }
    }
  })

  it('os Jogos, ignorando os cards FORJA, seguem o Catálogo em ciclo contínuo', () => {
    for (const total of TOTAIS) {
      let anterior: number | null = null
      for (let n = 0; n <= ULTIMO_N; n++) {
        const slide = slideAt(n, total)
        if (slide.tipo !== 'jogo') continue
        if (anterior !== null) expect(slide.indice).toBe((anterior + 1) % total)
        anterior = slide.indice
      }
    }
  })

  it('kenBurnsVariante nunca repete entre slides vizinhos', () => {
    for (let n = 0; n <= ULTIMO_N; n++) {
      expect(kenBurnsVariante(n)).not.toBe(kenBurnsVariante(n + 1))
    }
  })
})
