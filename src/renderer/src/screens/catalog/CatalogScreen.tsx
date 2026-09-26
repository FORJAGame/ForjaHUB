import { type JSX, type ReactNode, useState } from 'react'
import type { Catalogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { FallbackImage, ForjaMark, GrainOverlay, Stage } from '../../design/primitives'
import { moveFocus } from '../../input/focus'
import { useInputIntents } from '../../input/hooks/use-input-intents'
import { playFocusClick } from '../../sfx'
import GameCard from './GameCard'
import { CARD_WIDTH_PX, FOCUS_BLEED_PX, ROW_VISIBLE, rowOffset } from './row-layout'

interface CatalogScreenProps {
  /** Nunca vazio neste mode. */
  catalogo: Catalogo
  focusedGameId: string
  onFocusGame: (id: string) => void
  onConfirm: () => void
}

function MetaChip({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="text-badge rounded-chip bg-surface-base/50 backdrop-blur-sm px-2 py-1.5 text-ink-primary">
      {children}
    </span>
  )
}

/** Sem scrim global (DESIGN): legibilidade por vinheta de canto, fade curto na base e sombra local. */
export default function CatalogScreen({
  catalogo,
  focusedGameId,
  onFocusGame,
  onConfirm
}: CatalogScreenProps): JSX.Element {
  const jogos = catalogo.jogos
  const focusedIndex = Math.max(
    0,
    jogos.findIndex((jogo) => jogo.id === focusedGameId)
  )
  const focused = jogos[focusedIndex]
  const versao = catalogo.sincronizadoEm
  const logoSrc = mediaUrl(focused.id, 'logo', versao)

  const [sparkSeed, setSparkSeed] = useState(0)

  const focusGame = (id: string): void => {
    if (id === focused.id) return
    onFocusGame(id)
    playFocusClick()
    setSparkSeed((seed) => seed + 1)
  }

  useInputIntents({
    onIntent: (intent) => {
      if (intent === 'confirm') {
        onConfirm()
        return
      }
      if (intent !== 'left' && intent !== 'right') return
      focusGame(jogos[moveFocus(focusedIndex, jogos.length, intent)].id)
    }
  })

  const offset = rowOffset(focusedIndex, jogos.length)

  return (
    <Stage>
      {/* Uma Arte-herói empilhada por Jogo: o crossfade é só opacidade, sem swap de `src`. */}
      {jogos.map((jogo) => (
        <div
          key={jogo.id}
          aria-hidden="true"
          className={`absolute inset-0 transition-opacity duration-500 ease-out ${
            jogo.id === focused.id ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <FallbackImage
            src={mediaUrl(jogo.id, 'hero', versao)}
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-surface-base">
                <img src="/forja-mark.svg" alt="" className="w-225 opacity-[0.06]" />
              </div>
            }
          />
        </div>
      ))}

      <div aria-hidden="true" className="hero-vignette pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="hero-base-fade pointer-events-none absolute inset-x-0 bottom-0 h-59.5" />
      <GrainOverlay />

      <div className="absolute left-30 top-18 z-10 flex max-w-215 flex-col">
        <FallbackImage
          key={logoSrc}
          src={logoSrc}
          alt={focused.titulo}
          className="logo-legible max-h-90 max-w-205 self-start object-contain object-left"
          fallback={
            <h1 className="text-game-title-fallback meta-legible m-0 line-clamp-2 uppercase text-ink-primary">
              {focused.titulo}
            </h1>
          }
        />
      </div>

      <ForjaMark />

      <div className="absolute inset-x-0 bottom-0 z-20 pb-11 pl-30">
        {/* Chips alinhados às bordas do card em foco nas pontas da janela visível; o `mb` livra o card escalado. */}
        <div
          className="mb-19 flex items-end justify-between gap-6"
          style={{
            marginLeft: -FOCUS_BLEED_PX,
            width: `calc(${ROW_VISIBLE} * (${CARD_WIDTH_PX}px + var(--spacing-card-gap)) - var(--spacing-card-gap) + ${2 * FOCUS_BLEED_PX}px)`
          }}
        >
          <div className="text-badge flex overflow-hidden rounded-chip text-ink-primary backdrop-blur-sm">
            <span className="bg-action/75 px-2 py-1.5 text-ink-on-action">{focused.ano}</span>
            <span className="bg-surface-base/50 px-2 py-1.5">{focused.guilda}</span>
          </div>
          <MetaChip>{focused.genero}</MetaChip>
        </div>
        <div
          className="flex items-end gap-card-gap transition-transform duration-300 ease-out"
          style={{ transform: `translateX(calc(${-offset} * (${CARD_WIDTH_PX}px + var(--spacing-card-gap))))` }}
        >
          {jogos.map((jogo, index) => (
            <GameCard
              key={jogo.id}
              jogo={jogo}
              versao={versao}
              focused={jogo.id === focused.id}
              sparkSeed={sparkSeed}
              // Só a janela totalmente visível foca por hover: focar um card parcial desliza a
              // fileira e passaria outro card sob o ponteiro parado (cascata).
              onHover={index >= offset && index < offset + ROW_VISIBLE ? () => focusGame(jogo.id) : undefined}
              onConfirm={() => {
                onFocusGame(jogo.id)
                onConfirm()
              }}
            />
          ))}
        </div>
      </div>
    </Stage>
  )
}
