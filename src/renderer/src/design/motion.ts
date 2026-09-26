/** Curva de movimento da FORJA: arranque rápido, assentamento longo (a mesma dos cards do catálogo). */
export const EASE_FORJA = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/** Entrada de bloco (`forja-rise-in`); escalone com `animationDelay` no `style`. */
export const RISE_IN = 'animate-[forja-rise-in_640ms_cubic-bezier(0.2,0.8,0.2,1)_both]'

const SHAKE: Keyframe[] = [
  { transform: 'none' },
  { transform: 'translateX(-4px) rotate(-1.2deg)' },
  { transform: 'translateX(4px) rotate(1deg)' },
  { transform: 'translateX(-3px) rotate(-0.6deg)' },
  { transform: 'translateX(2px) rotate(0.3deg)' },
  { transform: 'none' }
]

/**
 * Tremida curta de martelada. Via Web Animations para replayar a cada clique sem
 * remontar o elemento (remontar recarregaria a imagem dentro dele).
 */
export function shake(el: HTMLElement | null): void {
  el?.animate(SHAKE, { duration: 380, easing: 'ease-out' })
}
