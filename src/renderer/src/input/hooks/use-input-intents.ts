import { useEffect, useRef } from 'react'
import { isEditableTarget } from '../dom-guard'
import { createGamepadReader, selectActiveGamepad } from '../gamepad'
import { mapKeyToIntent } from '../keyboard'
import type { Intent } from '../types'

interface UseInputIntentsArgs {
  onIntent?: (intent: Intent) => void
  onConnectedChange?: (connected: boolean) => void
}

/** Decide antes das telas; `true` consome o intent (nenhuma tela o recebe). */
export type FiltroDeIntent = (intent: Intent) => boolean

const assinantes = new Set<{ current: UseInputIntentsArgs }>()
let desligar: (() => void) | null = null
let conectado = false
let filtro: FiltroDeIntent | null = null

function emitir(intent: Intent): void {
  if (filtro?.(intent)) return
  // Cópia: um assinante pode desmontar outro no meio da entrega.
  for (const assinante of [...assinantes]) assinante.current.onIntent?.(intent)
}

function ligar(): () => void {
  let frame = 0
  const lerControle = createGamepadReader()

  const tick = (): void => {
    const active = selectActiveGamepad(navigator.getGamepads())

    const agora = active != null
    if (agora !== conectado) {
      conectado = agora
      for (const assinante of [...assinantes]) assinante.current.onConnectedChange?.(agora)
    }

    for (const intent of lerControle(active)) emitir(intent)

    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  const onKeyDown = (e: KeyboardEvent): void => {
    // Campo de texto focado (ex. setup-form): deixa a edição nativa em paz.
    if (isEditableTarget(e.target as HTMLElement | null)) return
    const intent = mapKeyToIntent(e)
    if (!intent) return
    e.preventDefault()
    emitir(intent)
  }
  window.addEventListener('keydown', onKeyDown)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', onKeyDown)
    conectado = false
  }
}

/**
 * Instala o filtro que vê cada intent antes das telas (hoje, o Konami). Um por vez;
 * devolve a função que o remove.
 */
export function definirFiltroDeIntent(novo: FiltroDeIntent): () => void {
  filtro = novo
  return () => {
    if (filtro === novo) filtro = null
  }
}

/**
 * Camada de input do renderer: funde Controle (loop `rAF`, Web Gamepad API) e
 * teclado num único fluxo de `Intent`. Um só laço e um só leitor para o app inteiro,
 * ligado enquanto houver assinante: cada intent é lido uma vez, passa pelo filtro e
 * chega a todas as telas. Uma tela que monta com o botão ainda apertado não recebe
 * nada, porque o leitor só emite na borda (solto → apertado).
 *
 * Quirk do Chromium: um Controle já plugado ao ligar a Estação só aparece em
 * `getGamepads()` depois do primeiro botão pressionado, `controllerConnected`
 * fica `false` até lá, não é bug.
 */
export function useInputIntents(args: UseInputIntentsArgs): void {
  const argsRef = useRef(args)
  useEffect(() => {
    argsRef.current = args
  })

  useEffect(() => {
    const assinante = argsRef
    assinantes.add(assinante)
    if (desligar === null) desligar = ligar()
    else if (conectado) assinante.current.onConnectedChange?.(true)

    return () => {
      assinantes.delete(assinante)
      if (assinantes.size === 0) {
        desligar?.()
        desligar = null
      }
    }
  }, [])
}
