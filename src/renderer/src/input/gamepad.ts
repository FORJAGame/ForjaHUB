import type { Intent } from './types'

const DEADZONE = 0.5

/** Forma mínima que o `Gamepad` real do DOM satisfaz */
export interface GamepadLike {
  buttons: readonly { pressed: boolean }[]
  axes: readonly number[]
}

export interface DigitalState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  confirm: boolean
  back: boolean
}

export const NEUTRAL_DIGITAL: DigitalState = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  back: false
}

const INTENT_ORDER: Intent[] = ['up', 'down', 'left', 'right', 'confirm', 'back']

export function readGamepadIntents(
  pad: GamepadLike,
  prevDigital: DigitalState
): { intents: Intent[]; digital: DigitalState } {
  const axisX = pad.axes[0] ?? 0
  const axisY = pad.axes[1] ?? 0
  const pressed = (i: number): boolean => pad.buttons[i]?.pressed ?? false

  const digital: DigitalState = {
    up: pressed(12) || axisY <= -DEADZONE,
    down: pressed(13) || axisY >= DEADZONE,
    left: pressed(14) || axisX <= -DEADZONE,
    right: pressed(15) || axisX >= DEADZONE,
    confirm: pressed(0),
    back: pressed(1)
  }

  const intents = INTENT_ORDER.filter((intent) => digital[intent] && !prevDigital[intent])

  return { intents, digital }
}

export function createGamepadReader(): (pad: GamepadLike | null) => Intent[] {
  let digital: DigitalState | null = null
  return (pad) => {
    if (!pad) {
      digital = NEUTRAL_DIGITAL
      return []
    }
    const next = readGamepadIntents(pad, digital ?? NEUTRAL_DIGITAL)
    const intents = digital === null ? [] : next.intents
    digital = next.digital
    return intents
  }
}

/** Único Controle ativo */
export function selectActiveGamepad<T>(pads: readonly (T | null)[]): T | null {
  for (const pad of pads) {
    if (pad !== null) return pad
  }
  return null
}
