import { type JSX, type ReactNode, useEffect, useState } from 'react'

const STAGE_W = 1920
const STAGE_H = 1080

function fitScale(): number {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
}

interface StageProps {
  children: ReactNode
}

/** Todo px dentro do palco é px do mock 1920×1080; a sobra da janela fica em `surface-base`. */
export default function Stage({ children }: StageProps): JSX.Element {
  const [scale, setScale] = useState(fitScale)

  useEffect(() => {
    const onResize = (): void => setScale(fitScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-surface-base">
      <div
        className="absolute left-1/2 top-1/2 h-270 w-[1920px] overflow-hidden"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
