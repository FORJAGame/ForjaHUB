import { DEADZONE, type GamepadLike } from './gamepad'
import { mapKeyToIntent } from './keyboard'
import type { OrigemInput } from './types'

/** Botões cujo `pressed` vira `Intent` no mapa do Controle. */
const BOTOES_INTENT = new Set([0, 1, 12, 13, 14, 15])

/** Eixos do analógico esquerdo, únicos que viram `Intent`. */
const EIXOS_INTENT = new Set([0, 1])

interface EstadoBotoesEixos {
  botoes: boolean[]
  eixos: { neg: boolean; pos: boolean }[]
}

/** `'intent'` quando a tecla é uma das mapeadas; qualquer outra tecla é `'outro'`. */
export function origemDaTecla(key: string): OrigemInput {
  return mapKeyToIntent({ key, repeat: false }) === null ? 'outro' : 'intent'
}

/**
 * Leitor de bordas do Controle com estado, um por loop. Conta toda pressão
 * (`pressed`) e todo sentido de eixo fora da deadzone, inclusive os que não
 * viram `Intent`. Prioriza `'outro'` quando as duas origens chegam no frame.
 */
export function createGamepadActivityReader(): (pad: GamepadLike | null) => OrigemInput | null {
  let estado: EstadoBotoesEixos | null = null

  return (pad) => {
    if (!pad) {
      estado = null
      return null
    }

    const primeiro = estado === null
    let teveIntent = false
    let teveOutro = false

    const botoes = pad.buttons.map((botao, indice) => {
      const apertado = botao.pressed
      const antes = estado?.botoes[indice] ?? false
      if (!primeiro && apertado && !antes) {
        if (BOTOES_INTENT.has(indice)) teveIntent = true
        else teveOutro = true
      }
      return apertado
    })

    const eixos = pad.axes.map((valor, indice) => {
      const neg = valor <= -DEADZONE
      const pos = valor >= DEADZONE
      const antes = estado?.eixos[indice] ?? { neg: false, pos: false }
      if (!primeiro && (neg || pos)) {
        const borda = (neg && !antes.neg) || (pos && !antes.pos)
        if (borda) {
          if (EIXOS_INTENT.has(indice)) teveIntent = true
          else teveOutro = true
        }
      }
      return { neg, pos }
    })

    estado = { botoes, eixos }

    if (primeiro) return null
    if (teveOutro) return 'outro'
    if (teveIntent) return 'intent'
    return null
  }
}
