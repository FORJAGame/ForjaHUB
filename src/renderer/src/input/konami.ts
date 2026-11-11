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

/**
 * Recebe cada `Intent`; dispara o callback quando as últimas 10 formam o código e
 * devolve `true` só para o intent que completou (quem chama o consome).
 */
export type KonamiDetector = (intent: Intent) => boolean

/**
 * Detector do Konami fora do Atração: a navegação segue normal nos 9 primeiros
 * passos e o detector só observa as últimas 10 intents. Errar não zera a tentativa
 * seguinte (↑ ↑ ↑ ↓ … ainda vale) e não há prazo entre os passos.
 */
export function createKonamiDetector(onKonami: () => void): KonamiDetector {
  const recentes: Intent[] = []
  return (intent) => {
    recentes.push(intent)
    if (recentes.length > KONAMI.length) recentes.shift()
    if (recentes.length < KONAMI.length || !recentes.every((passo, i) => passo === KONAMI[i])) return false
    recentes.length = 0
    onKonami()
    return true
  }
}
