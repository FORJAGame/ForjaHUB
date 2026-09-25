import { type JSX, useEffect, useReducer, useState } from 'react'
import { BootScreen, ErrorPlate } from './design/primitives'
import FocusHarness from './FocusHarness'
import { shouldWarnDisconnected } from './input/connection'
import { useCursorIdle } from './input/hooks/use-cursor-idle'
import { useInputIntents } from './input/hooks/use-input-intents'
import SetupScreen from './screens/setup/SetupScreen'
import { initialState, reducer } from './state/reducer'

/**
 * Shell mínimo do Kiosk. Exercita a máquina de estados e o caminho
 * main→renderer via `forjaAPI`; `setup` já é uma tela real, o
 * resto dos modos ainda mostra o harness de foco placeholder.
 */
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

    api
      .hydrate()
      .then((res) => {
        if (!alive) return
        if (res.ok) dispatch({ type: 'set-mode', mode: res.mode })
        else dispatch({ type: 'error-plate', code: res.code })
      })
      .catch(() => {
        if (alive) dispatch({ type: 'error-plate', code: 'HYDRATE_FALHOU' })
      })

    // Ctrl+Shift+O → placeholder de Operador.
    const off = api.onOperatorOpen(() => dispatch({ type: 'set-mode', mode: 'operator' }))

    return () => {
      alive = false
      off()
    }
  }, [])

  if (state.mode === 'boot') {
    return (
      <>
        <BootScreen />
        {state.errorPlate && <ErrorPlate message={state.errorPlate} />}
      </>
    )
  }

  if (state.mode === 'setup') {
    return (
      <>
        <SetupScreen
          onComplete={(mode) => dispatch({ type: 'set-mode', mode })}
          onError={(code) => dispatch({ type: 'error-plate', code })}
        />
        {state.errorPlate && <ErrorPlate message={state.errorPlate} />}
      </>
    )
  }

  return (
    <main
      className="flex h-full select-none flex-col items-center justify-center gap-6 text-ink-primary"
      style={{ cursor: cursorVisible ? 'default' : 'none' }}
    >
      <div className="flex flex-col items-center gap-2">
        <p className="m-0 text-xs tracking-[0.3em] opacity-50">FORJA HUB</p>
        <p className="m-0 text-3xl">
          modo: <strong>{state.mode}</strong>
        </p>
      </div>

      <FocusHarness />

      {shouldWarnDisconnected(everConnected, state.controllerConnected) && (
        <p className="m-0 text-sm opacity-50">
          Controle desconectado — reconecte ou use o teclado.
        </p>
      )}

      {state.errorPlate && <ErrorPlate message={state.errorPlate} />}
    </main>
  )
}
