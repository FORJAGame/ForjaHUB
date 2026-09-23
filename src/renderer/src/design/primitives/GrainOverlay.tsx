import { useId, type JSX } from 'react'

interface GrainOverlayProps {
  active?: boolean
}

export default function GrainOverlay({ active = true }: GrainOverlayProps): JSX.Element | null {
  const filterId = useId()

  if (!active) return null

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 0.12 }}
    >
      <filter id={filterId}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${filterId})`} />
    </svg>
  )
}
