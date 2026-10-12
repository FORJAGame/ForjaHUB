import { describe, expect, it } from 'vitest'
import {
  createGamepadReader,
  NEUTRAL_DIGITAL,
  readGamepadIntents,
  selectActiveGamepad,
  type GamepadLike
} from '../gamepad'

function makePad(overrides: Partial<{ buttons: Record<number, boolean>; axes: number[] }>): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: overrides.buttons?.[i] ?? false }))
  return { buttons, axes: overrides.axes ?? [0, 0] }
}

describe('readGamepadIntents — D-pad', () => {
  it('botão 15 (right) recém-pressionado gera intent uma vez', () => {
    const pad = makePad({ buttons: { 15: true } })
    const first = readGamepadIntents(pad, NEUTRAL_DIGITAL)
    expect(first.intents).toEqual(['right'])

    const second = readGamepadIntents(pad, first.digital)
    expect(second.intents).toEqual([])
  })

  it('soltar o botão não gera intent (só a pressão é edge)', () => {
    const pressed = makePad({ buttons: { 12: true } })
    const { digital } = readGamepadIntents(pressed, NEUTRAL_DIGITAL)
    const released = makePad({})
    expect(readGamepadIntents(released, digital).intents).toEqual([])
  })

  it('mapeia os 4 botões de direção + A/B', () => {
    const table: Array<[number, string]> = [
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
      [0, 'confirm'],
      [1, 'back']
    ]
    for (const [button, intent] of table) {
      const pad = makePad({ buttons: { [button]: true } })
      expect(readGamepadIntents(pad, NEUTRAL_DIGITAL).intents).toEqual([intent])
    }
  })
})

describe('readGamepadIntents — analógico esquerdo', () => {
  it('abaixo da deadzone não gera intent', () => {
    const pad = makePad({ axes: [0.4, 0] })
    expect(readGamepadIntents(pad, NEUTRAL_DIGITAL).intents).toEqual([])
  })

  it('acima da deadzone gera o mesmo intent que o D-pad', () => {
    const pad = makePad({ axes: [0.6, 0] })
    expect(readGamepadIntents(pad, NEUTRAL_DIGITAL).intents).toEqual(['right'])
  })

  it('exatamente na deadzone (0.5) já conta como pressionado (comparação inclusiva)', () => {
    const pad = makePad({ axes: [0.5, 0] })
    expect(readGamepadIntents(pad, NEUTRAL_DIGITAL).intents).toEqual(['right'])
  })

  it('eixo Y negativo é up, positivo é down', () => {
    expect(readGamepadIntents(makePad({ axes: [0, -0.6] }), NEUTRAL_DIGITAL).intents).toEqual([
      'up'
    ])
    expect(readGamepadIntents(makePad({ axes: [0, 0.6] }), NEUTRAL_DIGITAL).intents).toEqual([
      'down'
    ])
  })
})

describe('readGamepadIntents — fusão D-pad + analógico', () => {
  it('soltar o D-pad com o analógico ainda na deadzone não solta a direção (sem novo intent)', () => {
    const both = makePad({ buttons: { 15: true }, axes: [0.6, 0] })
    const { digital } = readGamepadIntents(both, NEUTRAL_DIGITAL)

    const onlyAxis = makePad({ axes: [0.6, 0] })
    expect(readGamepadIntents(onlyAxis, digital).intents).toEqual([])
  })
})

describe('readGamepadIntents — múltiplas transições no mesmo frame', () => {
  it('confirma ordem estável quando duas direções sobem juntas', () => {
    const pad = makePad({ buttons: { 12: true, 15: true } })
    expect(readGamepadIntents(pad, NEUTRAL_DIGITAL).intents).toEqual(['up', 'right'])
  })
})

describe('selectActiveGamepad — único Controle ativo', () => {
  it('nenhum conectado devolve null', () => {
    expect(selectActiveGamepad([null, null])).toBeNull()
  })

  it('um conectado devolve ele', () => {
    expect(selectActiveGamepad([null, 'pad-1', null])).toBe('pad-1')
  })

  it('dois conectados: só o de menor index (primeiro não-nulo) — o segundo Controle não navega em paralelo', () => {
    expect(selectActiveGamepad(['pad-0', 'pad-1'])).toBe('pad-0')
  })
})

describe('createGamepadReader — tela recém-montada', () => {
  it('A ainda apertado no 1º frame (o que abriu a tela) não vira confirm; só a próxima pressão', () => {
    const ler = createGamepadReader()
    const segurandoA = makePad({ buttons: { 0: true } })
    expect(ler(segurandoA)).toEqual([])
    expect(ler(segurandoA)).toEqual([])
    expect(ler(makePad({}))).toEqual([])
    expect(ler(segurandoA)).toEqual(['confirm'])
  })

  it('Controle que reconecta com botão apertado conta como pressão nova', () => {
    const ler = createGamepadReader()
    ler(makePad({}))
    expect(ler(null)).toEqual([])
    expect(ler(makePad({ buttons: { 1: true } }))).toEqual(['back'])
  })
})
