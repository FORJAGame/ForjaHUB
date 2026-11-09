import { describe, expect, it } from 'vitest'
import { createGamepadActivityReader, origemDaTecla } from '../activity'
import type { GamepadLike } from '../gamepad'

function makePad(
  overrides: { buttons?: Record<number, boolean>; axes?: number[] } = {}
): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: overrides.buttons?.[i] ?? false }))
  return { buttons, axes: overrides.axes ?? [0, 0] }
}

describe('origemDaTecla', () => {
  it('setas, Enter e Escape viram intent', () => {
    expect(origemDaTecla('ArrowUp')).toBe('intent')
    expect(origemDaTecla('ArrowDown')).toBe('intent')
    expect(origemDaTecla('ArrowLeft')).toBe('intent')
    expect(origemDaTecla('ArrowRight')).toBe('intent')
    expect(origemDaTecla('Enter')).toBe('intent')
    expect(origemDaTecla('Escape')).toBe('intent')
  })

  it('qualquer outra tecla é outro', () => {
    expect(origemDaTecla('a')).toBe('outro')
    expect(origemDaTecla('F1')).toBe('outro')
    expect(origemDaTecla(' ')).toBe('outro')
  })
})

describe('createGamepadActivityReader — primeiro frame', () => {
  it('botão já segurado no 1º frame não conta; só a próxima pressão', () => {
    const ler = createGamepadActivityReader()
    const a = makePad({ buttons: { 0: true } })
    expect(ler(a)).toBeNull()
    expect(ler(a)).toBeNull()
    expect(ler(makePad())).toBeNull()
    expect(ler(a)).toBe('intent')
  })

  it('o 1º frame depois de pad null também só registra', () => {
    const ler = createGamepadActivityReader()
    expect(ler(makePad({ buttons: { 7: true } }))).toBeNull()
    expect(ler(null)).toBeNull()
    expect(ler(makePad({ buttons: { 7: true } }))).toBeNull()
    expect(ler(makePad())).toBeNull()
    expect(ler(makePad({ buttons: { 7: true } }))).toBe('outro')
  })
})

describe('createGamepadActivityReader — botões', () => {
  it('D-pad e A/B viram intent só na transição', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ buttons: { 12: true } }))).toBe('intent')
    expect(ler(makePad({ buttons: { 12: true } }))).toBeNull()

    expect(ler(makePad({ buttons: { 1: true } }))).toBe('intent')
    expect(ler(makePad({ buttons: { 1: true } }))).toBeNull()
  })

  it('gatilho, ombro e Start viram outro', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ buttons: { 7: true } }))).toBe('outro')
    expect(ler(makePad({ buttons: { 7: true } }))).toBeNull()
    expect(ler(makePad({ buttons: { 4: true } }))).toBe('outro')
    expect(ler(makePad({ buttons: { 9: true } }))).toBe('outro')
  })

  it('outro vence quando intent e outro chegam no mesmo frame', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())
    expect(ler(makePad({ buttons: { 0: true, 9: true } }))).toBe('outro')
  })
})

describe('createGamepadActivityReader — eixos', () => {
  it('analógico esquerdo vira intent em cada sentido', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ axes: [0.8, 0] }))).toBe('intent')
    expect(ler(makePad({ axes: [0.8, 0] }))).toBeNull()
    expect(ler(makePad({ axes: [0, -0.8] }))).toBe('intent')
  })

  it('analógico direito vira outro', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ axes: [0, 0, 0.9, 0] }))).toBe('outro')
    expect(ler(makePad({ axes: [0, 0, 0.9, 0] }))).toBeNull()
  })

  it('inverter o sentido do eixo conta como nova borda', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ axes: [-0.8, 0] }))).toBe('intent')
    expect(ler(makePad({ axes: [0.8, 0] }))).toBe('intent')
  })
})
