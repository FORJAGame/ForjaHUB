import { useEffect, useRef } from 'react'
import { isEditableTarget } from '../dom-guard'
import { NEUTRAL_DIGITAL, readGamepadIntents, selectActiveGamepad, type DigitalState } from '../gamepad'
import { mapKeyToIntent } from '../keyboard'
import type { Intent } from '../types'

interface UseInputIntentsArgs {
  onIntent?: (intent: Intent) => void
  onConnectedChange?: (connected: boolean) => void
}

/**
 * Camada de input do renderer: funde Controle (loop `rAF`, Web Gamepad API) e
 * teclado num único fluxo de `Intent`. `navigator.getGamepads()` é indexado
 * pelo `index` do próprio Controle, então o primeiro slot não-nulo já é "o de
 * menor index". Cada componente que chama o hook lê independentemente a mesma
 * API do browser.
 *
 * Quirk do Chromium: um Controle já plugado ao ligar a Estação só aparece em
 * `getGamepads()` depois do primeiro botão pressionado, `controllerConnected`
 * fica `false` até lá, não é bug.
 */
export function useInputIntents({ onIntent, onConnectedChange }: UseInputIntentsArgs): void {
  const onIntentRef = useRef(onIntent)
  const onConnectedChangeRef = useRef(onConnectedChange)
  useEffect(() => {
    onIntentRef.current = onIntent
    onConnectedChangeRef.current = onConnectedChange
  })

  useEffect(() => {
    let frame = 0
    let digital: DigitalState = NEUTRAL_DIGITAL
    let connected = false

    const tick = (): void => {
      const active = selectActiveGamepad(navigator.getGamepads())

      const nowConnected = active != null
      if (nowConnected !== connected) {
        connected = nowConnected
        onConnectedChangeRef.current?.(connected)
      }

      if (active) {
        const next = readGamepadIntents(active, digital)
        digital = next.digital
        for (const intent of next.intents) onIntentRef.current?.(intent)
      } else {
        digital = NEUTRAL_DIGITAL
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const onKeyDown = (e: KeyboardEvent): void => {
      // Campo de texto focado (ex. setup-form): deixa a edição nativa em paz.
      if (isEditableTarget(e.target as HTMLElement | null)) return
      const intent = mapKeyToIntent(e)
      if (!intent) return
      e.preventDefault()
      onIntentRef.current?.(intent)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
