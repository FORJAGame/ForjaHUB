import { type JSX } from 'react'
import type { Jogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { FallbackImage } from '../../design/primitives'
import { CARD_WIDTH_PX, FOCUSED_SCALE } from './row-layout'
import Sparks from './Sparks'

interface GameCardProps {
  jogo: Jogo
  versao: string
  focused: boolean
  sparkSeed: number
  onHover?: () => void
  onConfirm: () => void
}

/** `modalidade-icon`: forma distinta + micro-rótulo, nunca só cor. */
function ModalidadeIcon({ modalidade }: { modalidade: Jogo['modalidade'] }): JSX.Element {
  const multi = modalidade === 'multiplayer'
  return (
    <div className="text-label-caps meta-legible absolute bottom-3 left-3 flex items-center gap-1.5 text-ink-secondary">
      {multi ? (
        <svg viewBox="0 0 24 16" aria-hidden="true" className="block h-3.75 w-auto fill-ink-secondary">
          <circle cx="7" cy="4.6" r="2.7" />
          <path d="M1.5 16 C1.5 10.6 3.8 8.8 7 8.8 C10.2 8.8 12.5 10.6 12.5 16 Z" />
          <circle cx="16" cy="5.6" r="2.7" />
          <path d="M10.5 16 C10.5 11 12.8 9.8 16 9.8 C19.2 9.8 21.5 11 21.5 16 Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="block h-3.75 w-auto fill-ink-secondary">
          <circle cx="8" cy="4.6" r="3" />
          <path d="M2 16 C2 10 4.7 8 8 8 C11.3 8 14 10 14 16 Z" />
        </svg>
      )}
      {multi ? '2P+' : '1P'}
    </div>
  )
}

export default function GameCard({
  jogo,
  versao,
  focused,
  sparkSeed,
  onHover,
  onConfirm
}: GameCardProps): JSX.Element {
  const capaSrc = mediaUrl(jogo.id, 'capa', versao)

  return (
    <div
      className={`relative aspect-square shrink-0 ${focused ? 'z-10' : ''}`}
      style={{ width: CARD_WIDTH_PX }}
      onMouseEnter={onHover}
      onClick={onConfirm}
    >
      <div
        className={`absolute inset-0 origin-bottom transition-[transform,opacity] duration-260ms ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          focused ? 'opacity-100' : 'opacity-[0.82]'
        }`}
        style={{ transform: focused ? `scale(${FOCUSED_SCALE}) translateY(-9px)` : 'scale(0.92)' }}
      >
        <div
          className={`absolute inset-0 overflow-hidden rounded-sm bg-surface-raised ${
            focused ? 'focus-ring' : 'border border-border-hairline'
          }`}
        >
          <FallbackImage src={capaSrc} fallback={null} alt="" decoding="async" className="h-full w-full object-cover" />
          <ModalidadeIcon modalidade={jogo.modalidade} />
        </div>
        {focused && sparkSeed > 0 && <Sparks key={sparkSeed} seed={sparkSeed} />}
      </div>
    </div>
  )
}
