import type { Intent } from './types'

/** Código Konami na linguagem de `Intent`. */
export const KONAMI: readonly Intent[] = [
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
]

/**
 * Avança a posição quando o `intent` casa com o próximo passo; `null` quebra a
 * sequência. Quem chama trata `pos === KONAMI.length` como completo.
 */
export function avancarKonami(pos: number, intent: Intent): number | null {
  return KONAMI[pos] === intent ? pos + 1 : null
}
