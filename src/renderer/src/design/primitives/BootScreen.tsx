import { type JSX } from 'react'
import { FORJA_MARK_URL } from '../assets'
import GrainOverlay from './GrainOverlay'

interface BootScreenProps {
  statusText?: string
}

export default function BootScreen({
  statusText = 'Sincronizando o catálogo…'
}: BootScreenProps): JSX.Element {
  return (
    <div className="relative flex h-full w-full select-none flex-col items-center justify-center gap-8 bg-surface-base">
      <GrainOverlay />
      <img src={FORJA_MARK_URL} alt="FORJA" className="w-80" />
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full bg-action blur-[2px] animate-[forja-ember-pulse_2.6s_ease-in-out_infinite]"
      />
      <p className="text-body m-0 text-ink-secondary">{statusText}</p>
    </div>
  )
}
