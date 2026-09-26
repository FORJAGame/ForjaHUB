import { type CSSProperties, type JSX } from 'react'

interface SparksProps {
  /** Muda a cada troca de foco; quem renderiza usa como `key` para replayar a animação. */
  seed: number
}

/** Pseudo-aleatório determinístico em [0, 1): render puro, faíscas diferentes por troca. */
function hash01(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export default function Sparks({ seed }: SparksProps): JSX.Element {
  const count = 2 + Math.floor(hash01(seed, 0) * 2)
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0">
      {Array.from({ length: count }, (_, i) => {
        const left = 18 + hash01(seed, i + 1) * 64
        const dx = (hash01(seed, i + 11) - 0.5) * 90
        const dy = -(46 + hash01(seed, i + 21) * 70)
        const rot = (Math.atan2(dx, -dy) * 180) / Math.PI
        const style = {
          left: `${left}%`,
          animationDelay: `${Math.round(hash01(seed, i + 31) * 80)}ms`,
          '--spark-dx': `${dx.toFixed(1)}px`,
          '--spark-dy': `${dy.toFixed(1)}px`,
          '--spark-rot': `${rot.toFixed(1)}deg`
        } as CSSProperties
        return (
          <span
            key={i}
            style={style}
            className="absolute top-0 h-3.5 w-0.75 rounded-xs bg-action-border opacity-0 animate-[forja-spark_560ms_ease-out_forwards]"
          />
        )
      })}
    </div>
  )
}
