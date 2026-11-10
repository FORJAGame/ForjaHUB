import { easterEggUrl } from '../../design/assets'

export const MAZELINHA_URL = easterEggUrl('mazelinha.png')

export const MAZELINHA_CRUZA_MS = 6000
/** Slides para a Mazelinha voltar a ser possível depois da última travessia. */
export const MAZELINHA_MIN_SLIDES = 8
export const MAZELINHA_CHANCE = 0.1

export function deveCruzarMazelinha(sorteio: number, slidesDesdeUltima: number): boolean {
  return slidesDesdeUltima >= MAZELINHA_MIN_SLIDES && sorteio < MAZELINHA_CHANCE
}
