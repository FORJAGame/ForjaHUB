import { type Dispatch, type JSX, useEffect, useReducer, useRef, useState } from 'react'
import type { ForjaAPI } from '@shared/forja-api'
import type { OperatorStatus } from '@shared/types'
import { BootScreen, ErrorPlate } from './design/primitives'
import Toasty from './easter-eggs/Toasty'
import { shouldWarnDisconnected } from './input/connection'
import { useCursorIdle } from './input/hooks/use-cursor-idle'
import { useIdleTimer } from './input/hooks/use-idle-timer'
import { useInputIntents } from './input/hooks/use-input-intents'
import { useKonami } from './input/hooks/use-konami'
import { useLastInputDevice } from './input/hooks/use-last-input-device'
import { promptSet } from './input/prompts'
import AttractScreen from './screens/attract/AttractScreen'
import CatalogScreen from './screens/catalog/CatalogScreen'
import DetailScreen from './screens/detail/DetailScreen'
import OperatorScreen from './screens/operator/OperatorScreen'
import SetupScreen from './screens/setup/SetupScreen'
import { setSfxMudo } from './sfx'
import { errorCopy, isLaunchError } from './state/error-copy'
import { type Action, initialState, reducer } from './state/reducer'

/** A placa de falha do JOGAR some sozinha depois disso. */
const PLACA_MS = 5000

/** Sem input no Catálogo ou na Detalhe, a Estação vira vitrine. */
const ATRACAO_OCIOSO_MS = 60_000

function runHydrate(api: ForjaAPI, dispatch: Dispatch<Action>, alive: () => boolean = () => true): Promise<void> {
  return api
    .hydrate()
    .then((res) => {
      if (!alive()) return
      if (res.ok) {
        setSfxMudo(res.sfxMudo)
        dispatch({
          type: 'hydrated',
          mode: res.mode,
          catalogo: res.catalogo,
          focusedGameId: res.focusedGameId,
          controlePrompts: res.controlePrompts
        })
      } else dispatch({ type: 'error-plate', code: res.code })
    })
    .catch(() => {
      if (alive()) dispatch({ type: 'error-plate', code: 'HYDRATE_FALHOU' })
    })
}

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [everConnected, setEverConnected] = useState(false)
  const cursorVisible = useCursorIdle()
  const prompts = promptSet(useLastInputDevice(), state.controlePrompts)
  const jogandoRef = useRef(false)
  const [toasty, setToasty] = useState(0)
  const [setupInicial, setSetupInicial] = useState<NonNullable<OperatorStatus['config']> | null>(null)
  const dispararToasty = (): void => setToasty((disparo) => disparo + 1)

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
    // Ctrl+Shift+O → Tela de Status, só do Operador.
    const offOperator = api.onOperatorOpen(() => dispatch({ type: 'set-mode', mode: 'operator' }))

    return () => {
      alive = false
      offCatalog()
      offOperator()
    }
  }, [])

  // A placa de falha do JOGAR some sozinha: a Detalhe volta a ficar limpa.
  useEffect(() => {
    if (!isLaunchError(state.errorPlate)) return
    const timer = setTimeout(() => dispatch({ type: 'error-plate', code: null }), PLACA_MS)
    return () => clearTimeout(timer)
  }, [state.errorPlate])

  useIdleTimer({
    ativo: state.mode === 'catalog' || state.mode === 'detail',
    chave: state.mode,
    ms: ATRACAO_OCIOSO_MS,
    onIdle: () => dispatch({ type: 'attract-start' })
  })

  // Konami em qualquer tela; o Atração trata o próprio (lá o input também decide a saída).
  // Lançando o Jogo, nada: o Jogo já está abrindo e a janela vai recolher. A Tela de Status é do Operador.
  useKonami({
    ativo: state.mode !== 'attract' && state.mode !== 'launching' && state.mode !== 'operator',
    onKonami: dispararToasty
  })

  const errorPlate = state.errorPlate && <ErrorPlate message={errorCopy(state.errorPlate)} />

  // O Toasty fica sempre na mesma posição da árvore: trocar de tela não o remonta (nem repete o som).
  const comToasty = (conteudo: JSX.Element): JSX.Element => (
    <>
      {conteudo}
      <Toasty disparo={toasty} />
    </>
  )

  if (state.mode === 'boot') {
    return comToasty(
      <>
        <BootScreen />
        {errorPlate}
      </>
    )
  }

  if (state.mode === 'setup') {
    return comToasty(
      <>
        <SetupScreen
          inicial={setupInicial ?? undefined}
          onComplete={() => {
            setSetupInicial(null)
            return runHydrate(window.forjaAPI, dispatch)
          }}
        />
        {errorPlate}
      </>
    )
  }

  // Tela do Operador: cursor sempre visível, sem aviso de Controle e fora do wrapper do palco.
  if (state.mode === 'operator') {
    return comToasty(
      <>
        <OperatorScreen
          onSair={() => void runHydrate(window.forjaAPI, dispatch)}
          onReabrirSetup={(config) => {
            setSetupInicial(config)
            dispatch({ type: 'set-mode', mode: 'setup' })
          }}
          onSfxMudo={setSfxMudo}
        />
        {errorPlate}
      </>
    )
  }

  const focusedJogo = state.catalogo?.jogos.find((jogo) => jogo.id === state.focusedGameId)

  function jogar(): void {
    if (jogandoRef.current || !focusedJogo) return
    jogandoRef.current = true
    dispatch({ type: 'launch-start' })
    window.forjaAPI
      .gameLaunch(focusedJogo.id)
      .then((res) => {
        // `ok` = o Jogo abriu: o main recolhe a janela e a recria na volta, re-hidratando.
        if (!res.ok) dispatch({ type: 'launch-failed', code: res.code })
      })
      .catch(() => dispatch({ type: 'launch-failed', code: 'LAUNCH_FALHOU' }))
      .finally(() => {
        jogandoRef.current = false
      })
  }

  let screen: JSX.Element
  if (state.mode === 'catalog' && state.catalogo && focusedJogo) {
    screen = (
      <CatalogScreen
        catalogo={state.catalogo}
        focusedGameId={focusedJogo.id}
        prompts={prompts}
        onFocusGame={(id) => dispatch({ type: 'focus-game', id })}
        onConfirm={() => dispatch({ type: 'set-mode', mode: 'detail' })}
      />
    )
  } else if ((state.mode === 'detail' || state.mode === 'launching') && focusedJogo && state.catalogo) {
    screen = (
      <DetailScreen
        jogo={focusedJogo}
        versao={state.catalogo.sincronizadoEm}
        ocupado={state.mode === 'launching'}
        prompts={prompts}
        onBack={() => dispatch({ type: 'set-mode', mode: 'catalog' })}
        onPlay={jogar}
      />
    )
  } else if (state.mode === 'attract' && state.catalogo) {
    screen = (
      <AttractScreen
        catalogo={state.catalogo}
        onExit={(id) => dispatch({ type: 'attract-end', focusedGameId: id })}
        onKonami={dispararToasty}
      />
    )
  } else {
    // Mode sem dado suficiente para a tela própria (ex.: `catalog` sem Catálogo).
    screen = (
      <main className="flex h-full select-none flex-col items-center justify-center gap-2 text-ink-primary">
        <p className="text-label-caps m-0 text-ink-secondary">FORJA HUB</p>
        <p className="text-heading m-0">modo: {state.mode}</p>
      </main>
    )
  }

  return comToasty(
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
