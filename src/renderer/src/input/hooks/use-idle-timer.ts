import { useEffect, useRef } from 'react'
import { createIdleTimer, type IdleTimer } from '../idle-timer'
import { useInputActivity } from './use-input-activity'

/**
 * Timer de inatividade ligado a qualquer input. `ativo` decide se existe
 * timer; trocar `chave` (o modo) recomeça a contagem do zero.
 */
export function useIdleTimer(args: {
  ativo: boolean
  chave: string
  ms: number
  onIdle(): void
}): void {
  const timerRef = useRef<IdleTimer | null>(null)
  const onIdleRef = useRef(args.onIdle)
  useEffect(() => {
    onIdleRef.current = args.onIdle
  })

  useEffect(() => {
    if (!args.ativo) return
    const timer = createIdleTimer({ ms: args.ms, onIdle: () => onIdleRef.current() })
    timerRef.current = timer
    return () => {
      timer.parar()
      timerRef.current = null
    }
  }, [args.ativo, args.chave, args.ms])

  useInputActivity(() => timerRef.current?.tocar())
}
