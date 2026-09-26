import { describe, expect, it } from 'vitest'
import { ROW_VISIBLE, rowOffset } from '../row-layout'

describe('rowOffset', () => {
  it('até 5 cards a fileira nunca desliza', () => {
    for (let i = 0; i < 5; i++) expect(rowOffset(i, 5, 5)).toBe(0)
    expect(rowOffset(2, 3, 5)).toBe(0)
  })

  it('a partir de 6, desliza o mínimo para o foco caber no último slot visível', () => {
    expect(rowOffset(4, 6, 5)).toBe(0)
    expect(rowOffset(5, 6, 5)).toBe(1)
    expect(rowOffset(5, 8, 5)).toBe(1)
    expect(rowOffset(7, 8, 5)).toBe(3)
  })

  it('o card em foco fica sempre dentro da janela visível', () => {
    for (let count = 1; count <= 12; count++) {
      for (let index = 0; index < count; index++) {
        const offset = rowOffset(index, count, 5)
        expect(index).toBeGreaterThanOrEqual(offset)
        expect(index).toBeLessThan(offset + 5)
        expect(offset).toBeLessThanOrEqual(Math.max(0, count - 5))
      }
    }
  })

  it('wrap do último para o 1º volta a fileira ao início', () => {
    expect(rowOffset(7, 8, 5)).toBe(3)
    expect(rowOffset(0, 8, 5)).toBe(0)
  })

  it('o default acompanha ROW_VISIBLE', () => {
    expect(rowOffset(ROW_VISIBLE - 1, ROW_VISIBLE + 1)).toBe(0)
    expect(rowOffset(ROW_VISIBLE, ROW_VISIBLE + 1)).toBe(1)
  })

  it('respeita um `visible` diferente', () => {
    expect(rowOffset(3, 6, 3)).toBe(1)
    expect(rowOffset(5, 6, 3)).toBe(3)
  })
})
