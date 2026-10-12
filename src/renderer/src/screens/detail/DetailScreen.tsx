import { type JSX, type ReactNode } from 'react'
import type { Jogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { FORJA_MARK_URL } from '../../design/assets'
import { FallbackImage, ForjaMark, GrainOverlay, Stage } from '../../design/primitives'
import { useInputIntents } from '../../input/hooks/use-input-intents'
import { ModalidadeIcon } from '../catalog/GameCard'
import { detailMediaTipo, temQr } from './detail-media'
import LaunchOverlay from './LaunchOverlay'

export interface DetailScreenProps {
  jogo: Jogo
  /** `catalogo.sincronizadoEm`: fura o cache de imagem depois de um sync. */
  versao: string
  /** Põe o `LaunchOverlay` na frente e ignora intents e cliques. */
  ocupado: boolean
  onBack: () => void
  onPlay: () => void
}

function Celula({ rotulo, children }: { rotulo: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex-1 border-l border-border-hairline py-3.5 pl-4 pr-1 first:border-l-0 first:pl-1">
      <div className="text-label-caps text-ink-secondary">{rotulo}</div>
      <div className="text-body mt-1.5 text-ink-primary">{children}</div>
    </div>
  )
}

function SeloQr({ jogo, versao }: { jogo: Jogo; versao: string }): JSX.Element {
  return (
    <div className="group absolute right-3.5 top-3.5 z-10 flex flex-col items-center gap-1.5">
      <FallbackImage
        src={mediaUrl(jogo.id, 'qr', versao)}
        alt="QR das redes sociais"
        decoding="async"
        className="block h-19 w-19 rounded-xs bg-qr-paper p-[5%] object-contain"
        fallback={null}
      />
      {/* Sem o `<img>` do QR a legenda some junto — o selo inteiro sai de cena. */}
      <span className="text-label-caps hidden rounded-xs bg-surface-base/72 px-2 py-0.5 text-ink-secondary group-has-[img]:inline-block">
        redes sociais
      </span>
    </div>
  )
}

export default function DetailScreen({ jogo, versao, ocupado, onBack, onPlay }: DetailScreenProps): JSX.Element {
  const logoSrc = mediaUrl(jogo.id, 'logo', versao)
  const mediaTipo = detailMediaTipo(jogo)

  useInputIntents({
    onIntent: (intent) => {
      if (ocupado) return
      if (intent === 'confirm') onPlay()
      else if (intent === 'back') onBack()
    }
  })

  return (
    <Stage>
      {/* Arte-herói desfocada: atmosfera, não conteúdo. */}
      <div className="absolute inset-0 overflow-hidden">
        <FallbackImage
          src={mediaUrl(jogo.id, 'hero', versao)}
          alt=""
          decoding="async"
          className="hero-detalhe h-full w-full object-cover"
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-surface-base">
              <img src={FORJA_MARK_URL} alt="" className="w-225 opacity-[0.06]" />
            </div>
          }
        />
      </div>
      <div aria-hidden="true" className="hero-vignette pointer-events-none absolute inset-0" />
      <GrainOverlay />

      <div className="absolute left-[115px] top-[52px] z-10 flex max-w-215 flex-col">
        <FallbackImage
          key={logoSrc}
          src={logoSrc}
          alt={jogo.titulo}
          className="logo-legible max-h-80 max-w-215 self-start object-contain object-left"
          fallback={
            <h1 className="text-game-title-fallback meta-legible m-0 line-clamp-2 uppercase text-ink-primary">
              {jogo.titulo}
            </h1>
          }
        />
      </div>

      <ForjaMark />

      <div className="absolute bottom-[54px] left-[77px] z-40 flex w-[902px] flex-col gap-6 rounded-lg border border-border-hairline bg-surface-raised/92 p-panel-pad">
        <div className="flex items-start gap-7">
          <div className="aspect-square w-40 shrink-0 overflow-hidden rounded-sm border border-border-hairline">
            <FallbackImage
              src={mediaUrl(jogo.id, 'capa', versao)}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
              fallback={<div className="h-full w-full bg-surface-raised" />}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-heading m-0 line-clamp-2 text-ink-primary">{jogo.titulo}</h1>
            <p className="text-meta mt-2 mb-0 text-ink-secondary">
              {jogo.ano} • {jogo.guilda}
            </p>
            <span className="text-pill mt-3.5 self-start rounded-chip border border-border-hairline px-3 py-1 text-ink-secondary">
              {jogo.genero}
            </span>
          </div>
        </div>

        <div className="flex border-y border-border-hairline">
          <Celula rotulo="MODALIDADE">
            <div className="flex items-center gap-3">
              <ModalidadeIcon modalidade={jogo.modalidade} />
              {jogo.modalidade === 'multiplayer' ? 'Multiplayer' : 'Single-player'}
            </div>
          </Celula>
          <Celula rotulo="ANO">{jogo.ano}</Celula>
          <Celula rotulo="GUILDA">{jogo.guilda}</Celula>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!ocupado) onPlay()
          }}
          className="play-button text-display-label flex w-full items-center justify-center gap-3 uppercase"
        >
          <svg viewBox="0 0 10 12" aria-hidden="true" fill="currentColor" className="block h-auto w-[13px]">
            <path d="M0 0 L10 6 L0 12 Z" />
          </svg>
          JOGAR
        </button>

        <div className="flex flex-col gap-2">
          <div className="text-section-label text-ink-secondary">SINOPSE</div>
          <p className="text-body synopsis-fade m-0 line-clamp-6 max-w-[46ch] text-ink-primary">{jogo.sinopse}</p>
        </div>

        <div className="text-meta border-t border-border-hairline pt-4 text-ink-secondary">
          Créditos: {jogo.guilda}
        </div>
      </div>

      {mediaTipo !== null && (
        <div className="absolute bottom-[96px] right-[72px] z-30 aspect-video w-[788px] overflow-hidden rounded-md border border-border-hairline">
          <FallbackImage
            src={mediaUrl(jogo.id, mediaTipo, versao)}
            alt=""
            decoding="async"
            className="h-full w-full object-cover"
            fallback={<div className="h-full w-full bg-surface-raised" />}
          />
          {temQr(jogo) && <SeloQr jogo={jogo} versao={versao} />}
        </div>
      )}

      {ocupado && <LaunchOverlay jogo={jogo} versao={versao} />}
    </Stage>
  )
}
