import { type JSX, useRef, useState } from 'react'
import type { Jogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { RISE_IN, shake } from '../../design/motion'
import { FallbackImage, Sparks } from '../../design/primitives'
import { playFocusClick } from '../../sfx'

interface CoverTileProps {
  jogo: Jogo
  versao: string
  selected: boolean
  onToggle: () => void
  enterDelayMs: number
}

export default function CoverTile({ jogo, versao, selected, onToggle, enterDelayMs }: CoverTileProps): JSX.Element {
  const artRef = useRef<HTMLDivElement>(null)
  const [sparkSeed, setSparkSeed] = useState(0)

  function handleClick(): void {
    playFocusClick()
    if (!selected) {
      shake(artRef.current)
      setSparkSeed(Math.floor(performance.now()) + 1)
    }
    onToggle()
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={handleClick}
      className={`group w-44 shrink-0 cursor-pointer rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-ink-secondary ${RISE_IN}`}
      style={{ animationDelay: `${enterDelayMs}ms` }}
    >
      <div
        className={`transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          selected ? '-translate-y-1' : 'scale-[0.95] group-hover:scale-[0.98]'
        }`}
      >
        <div ref={artRef} className="relative aspect-square">
          <div
            className={`absolute inset-0 overflow-hidden rounded-sm bg-surface-raised ${
              selected ? 'focus-ring' : 'border border-border-hairline'
            }`}
          >
            <FallbackImage
              src={mediaUrl(jogo.id, 'capa', versao)}
              alt=""
              decoding="async"
              className={`h-full w-full object-cover transition-[opacity,filter] duration-300 ease-out ${
                selected ? '' : 'opacity-65 saturate-[.55] group-hover:opacity-90 group-hover:saturate-100'
              }`}
              fallback={
                <div className="flex h-full w-full items-center justify-center p-4 text-center">
                  <span className="text-heading text-ink-secondary">{jogo.titulo}</span>
                </div>
              }
            />
          </div>

          {selected && (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-xs bg-action shadow-[0_0_10px_rgba(210,19,18,0.55)] animate-[forja-fade-in_180ms_ease-out]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-ink-on-action stroke-[2.4]">
                <path d="M3 8.5 L6.5 12 L13 4.5" strokeLinecap="square" />
              </svg>
            </span>
          )}

          {sparkSeed > 0 && <Sparks key={sparkSeed} seed={sparkSeed} />}
        </div>

        <p
          className={`text-meta m-0 mt-3 truncate transition-colors duration-200 ${
            selected ? 'text-ink-primary' : 'text-ink-secondary group-hover:text-ink-primary'
          }`}
        >
          {jogo.titulo}
        </p>
      </div>
    </button>
  )
}
