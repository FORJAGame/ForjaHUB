/** Largura do card quadrado na fileira: 7 cards + gaps cabem inteiros em 1920. */
export const CARD_WIDTH_PX = 220

export const ROW_VISIBLE = 7

export const FOCUSED_SCALE = 1.22

export const FOCUS_BLEED_PX = (CARD_WIDTH_PX * (FOCUSED_SCALE - 1)) / 2

export function rowOffset(index: number, count: number, visible = ROW_VISIBLE): number {
  const max = Math.max(0, count - visible)
  return Math.min(Math.max(0, index - (visible - 1)), max)
}
