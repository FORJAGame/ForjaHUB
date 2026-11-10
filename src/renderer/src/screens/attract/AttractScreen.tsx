import { type JSX, useEffect, useRef, useState } from 'react'
import type { Catalogo, Jogo } from '@shared/types'
import { mediaUrl } from '@shared/media'
import { FORJA_MARK_URL } from '../../design/assets'
import { RISE_IN } from '../../design/motion'
import { FallbackImage, ForjaMark, GrainOverlay, Sparks, Stage } from '../../design/primitives'
import { useAttractInput } from '../../input/hooks/use-attract-input'
import {
  CROSSFADE_MS,
  SLIDE_JOGO_MS,
  duracaoSlide,
  kenBurnsVariante,
  slideAt,
  type Slide
} from './attract-sequence'
import { MAZELINHA_CRUZA_MS, deveCruzarMazelinha } from './easter-eggs'
import Mazelinha from './Mazelinha'

export interface AttractScreenProps {
  /** Pode ter 0 Jogos: a sequência vira só cards FORJA. */
  catalogo: Catalogo
  /** Id do Jogo na tela ao sair; `null` no card FORJA. */
  onExit(focusedGameId: string | null): void
  /** Código Konami completo; quem mostra o Toasty é o App, por cima de qualquer tela. */
  onKonami(): void
}

/** Faísca saltando do wordmark do card FORJA. */
const FORJA_SPARK_MS = 900

function ForjaCard(): JSX.Element {
  const [sparkSeed, setSparkSeed] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setSparkSeed((seed) => seed + 1), FORJA_SPARK_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="absolute inset-0 bg-surface-base">
      <div aria-hidden="true" className="forge-glow pointer-events-none absolute inset-0" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <img
          src={FORJA_MARK_URL}
          alt="FORJA"
          draggable={false}
          className="w-180 animate-[forja-forge-in_1400ms_cubic-bezier(0.2,0.8,0.2,1)_both]"
        />
        {/* `h-0`: as faíscas partem da base do wordmark e sobem por cima dele. */}
        <div aria-hidden="true" className="relative h-0 w-180">
          <Sparks key={sparkSeed} seed={sparkSeed} />
        </div>
      </div>
    </div>
  )
}

interface JogoSlideProps {
  jogo: Jogo
  versao: string
  /** Número do slide: escolhe a variante do Ken Burns. */
  numero: number
}

function JogoSlide({ jogo, versao, numero }: JogoSlideProps): JSX.Element {
  const logoSrc = mediaUrl(jogo.id, 'logo', versao)
  return (
    <div className="absolute inset-0 overflow-hidden">
      <FallbackImage
        src={mediaUrl(jogo.id, 'hero', versao)}
        alt=""
        decoding="async"
        className="h-full w-full object-cover"
        style={{
          animation: `forja-kenburns-${kenBurnsVariante(numero)} ${SLIDE_JOGO_MS + CROSSFADE_MS}ms linear both`
        }}
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-base">
            <img src={FORJA_MARK_URL} alt="" className="w-225 opacity-[0.06]" />
          </div>
        }
      />
      <div aria-hidden="true" className="hero-vignette pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="hero-base-fade pointer-events-none absolute inset-x-0 bottom-0 h-59.5" />
      <div className="absolute bottom-24 left-30 z-10">
        <FallbackImage
          key={logoSrc}
          src={logoSrc}
          alt={jogo.titulo}
          className={`logo-legible max-h-90 max-w-205 object-contain object-left ${RISE_IN}`}
          style={{ animationDelay: '400ms' }}
          fallback={
            <h1 className="text-game-title-fallback meta-legible m-0 line-clamp-2 uppercase text-ink-primary">
              {jogo.titulo}
            </h1>
          }
        />
      </div>
    </div>
  )
}

/**
 * Chamada para jogar: discreta, no mesmo chip translúcido dos metadados do Catálogo,
 * para não brigar com a arte. Só a brasa ao lado pulsa.
 */
function ChamadaParaJogar(): JSX.Element {
  return (
    <p className="text-body pointer-events-none absolute bottom-11 right-screen-margin z-30 m-0 flex items-center gap-3 rounded-chip bg-surface-base/55 px-4 py-2 text-ink-primary backdrop-blur-sm">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full bg-action animate-[forja-ember-pulse_2400ms_ease-in-out_infinite]"
      />
      Aperte qualquer botão para jogar
    </p>
  )
}

export default function AttractScreen({ catalogo, onExit, onKonami }: AttractScreenProps): JSX.Element {
  const total = catalogo.jogos.length
  const [n, setN] = useState(0)
  const [mazelinha, setMazelinha] = useState<{ id: number; sentido: 'direita' | 'esquerda' } | null>(null)
  const desdeMazelinha = useRef(0)

  const atual = slideAt(n, total)
  const idNaTela = atual.tipo === 'jogo' ? (catalogo.jogos[atual.indice]?.id ?? null) : null

  useAttractInput({ onExit: () => onExit(idNaTela), onKonami })

  // Um timer por slide; na troca a Mazelinha decide se cruza. Trocar de Catálogo
  // recomeça a contagem do slide atual.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const proximo = n + 1
      setN(proximo)
      if (deveCruzarMazelinha(Math.random(), desdeMazelinha.current)) {
        desdeMazelinha.current = 0
        setMazelinha({ id: proximo, sentido: Math.random() < 0.5 ? 'direita' : 'esquerda' })
      } else {
        desdeMazelinha.current += 1
      }
    }, duracaoSlide(slideAt(n, total)))
    return () => window.clearTimeout(id)
  }, [n, total])

  useEffect(() => {
    if (mazelinha === null) return
    const id = window.setTimeout(() => setMazelinha(null), MAZELINHA_CRUZA_MS)
    return () => window.clearTimeout(id)
  }, [mazelinha])

  const camadas: Array<{ numero: number; slide: Slide }> = []
  if (n > 0) camadas.push({ numero: n - 1, slide: slideAt(n - 1, total) })
  camadas.push({ numero: n, slide: atual })

  return (
    <Stage>
      {camadas.map(({ numero, slide }) => (
        <div
          key={numero}
          // `isolate`: o `z-10` do logo fica preso ao slide; sem isso o logo do slide de baixo vaza por cima do novo.
          className="absolute inset-0 isolate"
          style={numero === n ? { animation: `forja-fade-in ${CROSSFADE_MS}ms ease-out both` } : undefined}
        >
          {slide.tipo === 'forja' ? (
            <ForjaCard />
          ) : (
            <JogoSlide jogo={catalogo.jogos[slide.indice]} versao={catalogo.sincronizadoEm} numero={numero} />
          )}
        </div>
      ))}

      <GrainOverlay />
      <ForjaMark />
      {mazelinha !== null && <Mazelinha key={mazelinha.id} sentido={mazelinha.sentido} />}
      <ChamadaParaJogar />
    </Stage>
  )
}
