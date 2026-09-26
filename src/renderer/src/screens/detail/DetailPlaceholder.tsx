import { type JSX } from 'react'
import type { Jogo } from '@shared/types'
import { ForjaMark, GrainOverlay, Stage } from '../../design/primitives'
import { useInputIntents } from '../../input/hooks/use-input-intents'

interface DetailPlaceholderProps {
  jogo: Jogo
  onBack: () => void
}

export default function DetailPlaceholder({ jogo, onBack }: DetailPlaceholderProps): JSX.Element {
  useInputIntents({
    onIntent: (intent) => {
      if (intent === 'back') onBack()
    }
  })

  return (
    <Stage>
      <GrainOverlay />
      <ForjaMark />
      <div className="absolute left-30 top-37.5 flex max-w-350 flex-col gap-6">
        <h1 className="text-game-title-fallback m-0 line-clamp-2 uppercase text-ink-primary">{jogo.titulo}</h1>
        <p className="text-meta m-0 text-ink-secondary">B / Esc para voltar ao Catálogo</p>
      </div>
    </Stage>
  )
}
