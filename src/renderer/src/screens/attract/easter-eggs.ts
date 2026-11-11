import { easterEggUrl } from '../../design/assets'

/** Tira de quadros da corrida, lado a lado, olhando para a direita. */
export const MAZELINHA_URL = easterEggUrl('mazelinha.svg')
export const MAZELINHA_FRAMES = 4
/** ~10 fps. */
export const MAZELINHA_FRAME_MS = 100

export const MAZELINHA_CRUZA_MS = 1500
/** Slides para a Mazelinha voltar a ser possível depois da última travessia. */
export const MAZELINHA_MIN_SLIDES = 8
export const MAZELINHA_CHANCE = 0.1

export function deveCruzarMazelinha(sorteio: number, slidesDesdeUltima: number): boolean {
  return slidesDesdeUltima >= MAZELINHA_MIN_SLIDES && sorteio < MAZELINHA_CHANCE
}
