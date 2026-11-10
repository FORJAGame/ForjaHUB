import { describe, expect, it } from 'vitest'
import { createGamepadActivityReader, origemDaTecla } from '../activity'
import type { GamepadLike } from '../gamepad'

function makePad(
  overrides: { buttons?: Record<number, boolean>; axes?: number[] } = {}
): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: overrides.buttons?.[i] ?? false }))
  return { buttons, axes: overrides.axes ?? [0, 0] }
}

describe('origemDaTecla — teclas do teclado QWERTY do Konami', () => {
  it('A, B, Shift e Tab não viram intent', () => {
    expect(origemDaTecla('A')).toBe('outro')
    expect(origemDaTecla('B')).toBe('outro')
    expect(origemDaTecla('b')).toBe('outro')
    expect(origemDaTecla('Shift')).toBe('outro')
    expect(origemDaTecla('Tab')).toBe('outro')
  })
})

describe('createGamepadActivityReader — eixos nas extremidades', () => {
  it('cruzar de -1 a +1 num frame é borda; parado não; centro e sair de novo é borda nova', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ axes: [-1, 0] }))).toBe('intent')
    expect(ler(makePad({ axes: [1, 0] }))).toBe('intent')
    expect(ler(makePad({ axes: [1, 0] }))).toBeNull()
    expect(ler(makePad({ axes: [0, 0] }))).toBeNull()
    expect(ler(makePad({ axes: [1, 0] }))).toBe('intent')
  })
})

describe('createGamepadActivityReader — origens mistas no mesmo frame', () => {
  it('eixo intent e botão outro no mesmo frame ⇒ outro', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ buttons: { 9: true }, axes: [0.8, 0] }))).toBe('outro')
  })

  it('botão intent e eixo outro no mesmo frame ⇒ outro', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ buttons: { 0: true }, axes: [0, 0, 0.9, 0] }))).toBe('outro')
  })
})

describe('createGamepadActivityReader — reconexão do Controle', () => {
  it('volta com botão segurado ⇒ null no 1º frame de volta, e só a próxima pressão conta', () => {
    const ler = createGamepadActivityReader()
    const segurandoA = makePad({ buttons: { 0: true } })
    expect(ler(segurandoA)).toBeNull()
    expect(ler(null)).toBeNull()

    expect(ler(segurandoA)).toBeNull()
    expect(ler(segurandoA)).toBeNull()
    expect(ler(makePad({ buttons: { 0: true, 9: true } }))).toBe('outro')
  })

  it('volta com o analógico já inclinado ⇒ null no 1º frame de volta, e só a borda nova conta', () => {
    const ler = createGamepadActivityReader()
    const inclinado = makePad({ axes: [-0.9, 0] })
    expect(ler(inclinado)).toBeNull()
    expect(ler(null)).toBeNull()

    expect(ler(inclinado)).toBeNull()
    expect(ler(inclinado)).toBeNull()
    expect(ler(makePad({ axes: [0.9, 0] }))).toBe('intent')
  })
})

describe('createGamepadActivityReader — pads incompletos e gatilhos', () => {
  it('buttons mais curto que 16 não estoura e o que existe é classificado', () => {
    const ler = createGamepadActivityReader()
    const segurandoB: GamepadLike = { buttons: [{ pressed: false }, { pressed: true }], axes: [] }
    expect(ler(segurandoB)).toBeNull()
    expect(ler(segurandoB)).toBeNull()

    const solto: GamepadLike = { buttons: [{ pressed: false }, { pressed: false }], axes: [] }
    expect(ler(solto)).toBeNull()

    const apertandoA: GamepadLike = { buttons: [{ pressed: true }, { pressed: false }], axes: [] }
    expect(ler(apertandoA)).toBe('intent')
  })

  it('gatilho analógico (pressed) é outro, e segurar não é borda', () => {
    const ler = createGamepadActivityReader()
    ler(makePad())

    expect(ler(makePad({ buttons: { 6: true } }))).toBe('outro')
    expect(ler(makePad({ buttons: { 6: true } }))).toBeNull()
    expect(ler(makePad({ buttons: { 6: true, 7: true } }))).toBe('outro')
  })
})
