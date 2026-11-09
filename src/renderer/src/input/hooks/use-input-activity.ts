import { useEffect, useRef } from 'react'
import { createGamepadActivityReader, origemDaTecla } from '../activity'
import { selectActiveGamepad } from '../gamepad'
import type { OrigemInput } from '../types'

/**
 * Sinal de "qualquer input", inclusive o que não vira `Intent`: bordas do
 * Controle, teclas, mouse e roda. Um loop `rAF` por componente que chama.
 */
export function useInputActivity(onActivity: (origem: OrigemInput) => void): void {
  const onActivityRef = useRef(onActivity)
  useEffect(() => {
    onActivityRef.current = onActivity
  })

  useEffect(() => {
    let frame = 0
    const lerAtividade = createGamepadActivityReader()

    const tick = (): void => {
      const origem = lerAtividade(selectActiveGamepad(navigator.getGamepads()))
      if (origem) onActivityRef.current(origem)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return
      onActivityRef.current(origemDaTecla(e.key))
    }
    window.addEventListener('keydown', onKeyDown)

    const onMouseMove = (e: MouseEvent): void => {
      if (e.movementX === 0 && e.movementY === 0) return
      onActivityRef.current('outro')
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    const onMouseDown = (): void => onActivityRef.current('outro')
    window.addEventListener('mousedown', onMouseDown, { passive: true })

    const onWheel = (): void => onActivityRef.current('outro')
    window.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])
}
