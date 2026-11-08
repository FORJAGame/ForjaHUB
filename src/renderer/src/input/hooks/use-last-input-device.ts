import { useEffect, useState } from 'react'
import { isGamepadActive, selectActiveGamepad } from '../gamepad'
import type { InputDevice } from '../prompts'

/**
 * Último dispositivo usado: qualquer tecla → teclado, mover ou clicar o mouse → mouse,
 * botão ou eixo do Controle → controle. Começa em `controle`: a Estação é pensada pro Controle.
 *
 * `mousemove` sem deslocamento é sintético (o Chromium o dispara quando o layout passa sob o
 * cursor parado, ex.: a fileira deslizando) e não conta como uso do mouse.
 */
export function useLastInputDevice(): InputDevice {
  const [device, setDevice] = useState<InputDevice>('controle')

  useEffect(() => {
    let current: InputDevice = 'controle'
    const usar = (next: InputDevice): void => {
      if (next === current) return
      current = next
      setDevice(next)
    }

    let frame = 0
    const tick = (): void => {
      const pad = selectActiveGamepad(navigator.getGamepads())
      if (pad && isGamepadActive(pad)) usar('controle')
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const onKeyDown = (): void => usar('teclado')
    const onMouseMove = (e: MouseEvent): void => {
      if (e.movementX !== 0 || e.movementY !== 0) usar('mouse')
    }
    const onMouseDown = (): void => usar('mouse')
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  return device
}
