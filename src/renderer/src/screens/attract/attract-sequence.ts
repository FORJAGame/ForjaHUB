/** O que ocupa a tela num passo do Modo Atração. */
export type Slide = { tipo: 'jogo'; indice: number } | { tipo: 'forja' }

/** Um card FORJA a cada 4 Jogos exibidos. */
export const JOGOS_POR_CARD_FORJA = 4
export const SLIDE_JOGO_MS = 7000
export const SLIDE_FORJA_MS = 5000
export const CROSSFADE_MS = 1200

const SLIDES_POR_CICLO = JOGOS_POR_CARD_FORJA + 1

/**
 * Posição `n` da sequência: 4 Jogos na ordem do Catálogo e então o card FORJA.
 * A ordem continua entre ciclos (o card não reinicia a lista).
 */
export function slideAt(n: number, totalJogos: number): Slide {
  if (totalJogos === 0) return { tipo: 'forja' }
  const posicao = n % SLIDES_POR_CICLO
  if (posicao === JOGOS_POR_CARD_FORJA) return { tipo: 'forja' }
  const indice = (Math.floor(n / SLIDES_POR_CICLO) * JOGOS_POR_CARD_FORJA + posicao) % totalJogos
  return { tipo: 'jogo', indice }
}

export function duracaoSlide(slide: Slide): number {
  return slide.tipo === 'jogo' ? SLIDE_JOGO_MS : SLIDE_FORJA_MS
}

/** Variante do Ken Burns cicla 1..4 para nenhum Jogo herdar sempre o mesmo pan. */
export function kenBurnsVariante(n: number): 1 | 2 | 3 | 4 {
  return ((n % 4) + 1) as 1 | 2 | 3 | 4
}
