import type { Jogo } from '@shared/types'

const DETALHE_RE = /^detalhe-\d+$/

export function detailMediaTipo(jogo: Jogo): `detalhe-${number}` | null {
  const achado = jogo.detalheImagens.find((nome) => DETALHE_RE.test(nome))
  return achado === undefined ? null : (achado as `detalhe-${number}`)
}

export function temQr(jogo: Jogo): boolean {
  return jogo.redesUrl.trim() !== ''
}
