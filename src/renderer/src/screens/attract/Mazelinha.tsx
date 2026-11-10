import { type JSX } from 'react'
import { FallbackImage } from '../../design/primitives'
import { MAZELINHA_CRUZA_MS, MAZELINHA_URL } from './easter-eggs'

interface MazelinhaProps {
  sentido: 'direita' | 'esquerda'
}

/** Atravessa a base da tela; a arte olha para a direita, então indo à esquerda é espelhada. */
export default function Mazelinha({ sentido }: MazelinhaProps): JSX.Element {
  const indoParaEsquerda = sentido === 'esquerda'
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-10 z-40 ${indoParaEsquerda ? 'right-0' : 'left-0'}`}
      style={{ animation: `forja-mazelinha-${sentido} ${MAZELINHA_CRUZA_MS}ms linear both` }}
    >
      <FallbackImage
        src={MAZELINHA_URL}
        alt=""
        className={`h-70 w-auto ${indoParaEsquerda ? '-scale-x-100' : ''}`}
        fallback={null}
      />
    </div>
  )
}
