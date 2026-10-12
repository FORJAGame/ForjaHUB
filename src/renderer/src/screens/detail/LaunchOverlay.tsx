import { type JSX } from 'react'
import type { Jogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { FallbackImage } from '../../design/primitives'

interface LaunchOverlayProps {
  jogo: Jogo
  versao: string
}

/** Ponte de lançamento: cobre a Detalhe enquanto o main recolhe a janela. Sem barra de progresso. */
export default function LaunchOverlay({ jogo, versao }: LaunchOverlayProps): JSX.Element {
  return (
    <div className="absolute inset-0 z-[70] flex animate-[forja-fade-in_300ms_ease-out] flex-col items-center justify-center gap-6 bg-overlay-launch">
      <FallbackImage
        src={mediaUrl(jogo.id, 'logo', versao)}
        alt={jogo.titulo}
        decoding="async"
        className="max-h-60 w-auto max-w-215 object-contain"
        fallback={
          <h1 className="text-game-title-fallback m-0 line-clamp-2 uppercase text-ink-primary">{jogo.titulo}</h1>
        }
      />
      <p className="text-body m-0 text-ink-primary">Abrindo {jogo.titulo}…</p>
    </div>
  )
}
