import { type CSSProperties, type JSX } from 'react'
import { FallbackImage } from '../../design/primitives'
import {
  MAZELINHA_CRUZA_MS,
  MAZELINHA_FRAME_MS,
  MAZELINHA_FRAMES,
  MAZELINHA_URL
} from './easter-eggs'

interface MazelinhaProps {
  sentido: 'direita' | 'esquerda'
}

/**
 * Atravessa a base da tela correndo. A arte é uma tira de quadros lado a lado
 * (olhando para a direita): uma janela do tamanho de um quadro mostra a tira, que
 * anda um quadro por vez. Indo à esquerda, a janela é espelhada.
 */
export default function Mazelinha({ sentido }: MazelinhaProps): JSX.Element {
  const indoParaEsquerda = sentido === 'esquerda'
  const tira = {
    width: `${MAZELINHA_FRAMES * 100}%`,
    '--sprite-fim': `${(-100 * (MAZELINHA_FRAMES - 1)) / MAZELINHA_FRAMES}%`,
    animation: `forja-sprite ${MAZELINHA_FRAMES * MAZELINHA_FRAME_MS}ms steps(${MAZELINHA_FRAMES}, jump-none) infinite`
  } as CSSProperties

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-10 z-40 ${indoParaEsquerda ? 'right-0' : 'left-0'}`}
      style={{ animation: `forja-mazelinha-${sentido} ${MAZELINHA_CRUZA_MS}ms linear both` }}
    >
      <div className={`h-70 w-70 overflow-hidden ${indoParaEsquerda ? '-scale-x-100' : ''}`}>
        <div className="h-full" style={tira}>
          <FallbackImage
            src={MAZELINHA_URL}
            alt=""
            className="block h-full w-full [image-rendering:pixelated]"
            fallback={null}
          />
        </div>
      </div>
    </div>
  )
}
