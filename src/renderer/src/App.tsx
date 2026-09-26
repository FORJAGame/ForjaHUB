import { type Dispatch, type JSX, useEffect, useReducer, useState } from 'react'
import type { ForjaAPI } from '@shared/forja-api'
import { BootScreen, ErrorPlate } from './design/primitives'
import { shouldWarnDisconnected } from './input/connection'
import { useCursorIdle } from './input/hooks/use-cursor-idle'
import { useInputIntents } from './input/hooks/use-input-intents'
import CatalogScreen from './screens/catalog/CatalogScreen'
import DetailPlaceholder from './screens/detail/DetailPlaceholder'
import SetupScreen from './screens/setup/SetupScreen'
import { type Action, initialState, reducer } from './state/reducer'

function runHydrate(api: ForjaAPI, dispatch: Dispatch<Action>, alive: () => boolean = () => true): Promise<void> {
  return api
    .hydrate()
    .then((res) => {
      if (!alive()) return
      if (res.ok) dispatch({ type: 'hydrated', mode: res.mode, catalogo: res.catalogo })
      else dispatch({ type: 'error-plate', code: res.code })
    })
    .catch(() => {
      if (alive()) dispatch({ type: 'error-plate', code: 'HYDRATE_FALHOU' })
    })
}

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [everConnected, setEverConnected] = useState(false)
  const cursorVisible = useCursorIdle()

  useInputIntents({
    onConnectedChange: (connected) => {
      dispatch({ type: 'controller', connected })
      if (connected) setEverConnected(true)
    }
  })

  useEffect(() => {
    const api = window.forjaAPI
    if (!api) {
      // Preload não injetou a ponte, mostra algo em vez de estourar TypeError.
      dispatch({ type: 'error-plate', code: 'SEM_PONTE' })
      return
    }

    let alive = true
    void runHydrate(api, dispatch, () => alive)

    const offCatalog = api.onCatalogUpdated((catalogo) => dispatch({ type: 'catalog-updated', catalogo }))
    // Ctrl+Shift+O → placeholder de Operador.
    const offOperator = api.onOperatorOpen(() => dispatch({ type: 'set-mode', mode: 'operator' }))

    return () => {
      alive = false
      offCatalog()
      offOperator()
    }
  }, [])

  const errorPlate = state.errorPlate && <ErrorPlate message={state.errorPlate} />

  if (state.mode === 'boot') {
    return (
      <>
        <BootScreen />
        {errorPlate}
      </>
    )
  }

  if (state.mode === 'setup') {
    return (
      <>
        <SetupScreen onComplete={() => runHydrate(window.forjaAPI, dispatch)} />
        {errorPlate}
      </>
    )
  }

  const focusedJogo = state.catalogo?.jogos.find((jogo) => jogo.id === state.focusedGameId)

  let screen: JSX.Element
  if (state.mode === 'catalog' && state.catalogo && focusedJogo) {
    screen = (
      <CatalogScreen
        catalogo={state.catalogo}
        focusedGameId={focusedJogo.id}
        onFocusGame={(id) => dispatch({ type: 'focus-game', id })}
        onConfirm={() => dispatch({ type: 'set-mode', mode: 'detail' })}
      />
    )
  } else if (state.mode === 'detail' && focusedJogo) {
    screen = (
      <DetailPlaceholder jogo={focusedJogo} onBack={() => dispatch({ type: 'set-mode', mode: 'catalog' })} />
    )
  } else {
    // Modos ainda sem tela (Atração, launch, Operador).
    screen = (
      <main className="flex h-full select-none flex-col items-center justify-center gap-2 text-ink-primary">
        <p className="text-label-caps m-0 text-ink-secondary">FORJA HUB</p>
        <p className="text-heading m-0">modo: {state.mode}</p>
      </main>
    )
  }

  return (
    // Monta ao sair do boot/Setup: o catálogo acende a partir do `surface-base` em vez de cortar seco.
    <div
      className="h-full animate-[forja-fade-in_700ms_ease-out]"
      style={{ cursor: cursorVisible ? 'default' : 'none' }}
    >
      {screen}

      {shouldWarnDisconnected(everConnected, state.controllerConnected) && (
        <p className="text-meta meta-legible pointer-events-none fixed inset-x-0 top-4 z-50 m-0 text-center text-ink-secondary">
          Controle desconectado — reconecte ou use o teclado.
        </p>
      )}

      {errorPlate}
    </div>
  )
}
