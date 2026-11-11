import { useEffect, useRef } from 'react'
import { createKonamiDetector } from '../konami'
import { definirFiltroDeIntent } from './use-input-intents'

/**
 * Konami em qualquer tela enquanto `ativo`. Fica antes das telas no fluxo de input:
 * o A que completa o código é consumido e não abre nada. Desligar descarta a
 * tentativa em curso: religar começa do zero.
 */
export function useKonami(args: { ativo: boolean; onKonami(): void }): void {
  const onKonamiRef = useRef(args.onKonami)
  useEffect(() => {
    onKonamiRef.current = args.onKonami
  })

  useEffect(() => {
    if (!args.ativo) return
    return definirFiltroDeIntent(createKonamiDetector(() => onKonamiRef.current()))
  }, [args.ativo])
}
