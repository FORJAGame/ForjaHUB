import { useEffect, useRef } from 'react'
import { createAttractInput, type AttractInput } from '../attract-input'
import { useInputActivity } from './use-input-activity'
import { useInputIntents } from './use-input-intents'

/**
 * Liga o controlador de saída do Atração ao fluxo global de input. Os
 * callbacks ficam em refs para o controlador não ser recriado a cada render.
 */
export function useAttractInput(args: { onExit(): void; onKonami(): void }): void {
  const onExitRef = useRef(args.onExit)
  const onKonamiRef = useRef(args.onKonami)
  useEffect(() => {
    onExitRef.current = args.onExit
    onKonamiRef.current = args.onKonami
  })

  const controladorRef = useRef<AttractInput | null>(null)
  useEffect(() => {
    const controlador = createAttractInput({
      onExit: () => onExitRef.current(),
      onKonami: () => onKonamiRef.current()
    })
    controladorRef.current = controlador
    return () => {
      controlador.parar()
      controladorRef.current = null
    }
  }, [])

  useInputIntents({ onIntent: (intent) => controladorRef.current?.intent(intent) })
  useInputActivity((origem) => controladorRef.current?.atividade(origem))
}
