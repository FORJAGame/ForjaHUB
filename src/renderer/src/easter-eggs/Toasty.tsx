import { type JSX, useEffect } from 'react'
import { easterEggUrl } from '../design/assets'
import { FallbackImage } from '../design/primitives'

const TOASTY_IMG_URL = easterEggUrl('toasty.png')
const TOASTY_SOM_URL = easterEggUrl('toasty.mp3')
/** Sobe, segura e desce; casado com o keyframe `forja-toasty`. */
const TOASTY_MS = 1600

interface ToastyProps {
  /** Contador de disparos; `0` = nunca disparou. */
  disparo: number
}

/**
 * Imagem que sobe do canto inferior-direito com o som, por cima de qualquer tela.
 * Fica fora do palco 1920×1080: a altura em `vh` mantém a proporção do mock.
 * Falha de mídia nunca derruba a tela.
 */
export default function Toasty({ disparo }: ToastyProps): JSX.Element | null {
  useEffect(() => {
    if (disparo === 0) return
    let audio: HTMLAudioElement | null = null
    try {
      audio = new Audio(TOASTY_SOM_URL)
      audio.play().catch((err) => console.warn('[toasty] som indisponível:', err))
    } catch (err) {
      console.warn('[toasty] som indisponível:', err)
    }
    return () => audio?.pause()
  }, [disparo])

  if (disparo === 0) return null

  return (
    <div
      key={disparo}
      aria-hidden="true"
      className="pointer-events-none fixed bottom-0 right-0 z-[80]"
      style={{ animation: `forja-toasty ${TOASTY_MS}ms cubic-bezier(0.2,0.8,0.2,1) both` }}
    >
      <FallbackImage src={TOASTY_IMG_URL} alt="" className="h-[33.333vh] w-auto" fallback={null} />
    </div>
  )
}
