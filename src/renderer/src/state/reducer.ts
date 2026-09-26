import { MODES, type Catalogo, type KioskState, type Mode } from '@shared/types'

/**
 * Máquina de estados.
 * Telas são estados, não rotas. `errorPlate` e `controllerConnected` coexistem com qualquer `mode`,
 * nunca são um estado do union.
 */

export const initialState: KioskState = {
  mode: 'boot',
  errorPlate: null,
  controllerConnected: false,
  catalogo: null,
  focusedGameId: null
}

export type Action =
  | { type: 'set-mode'; mode: Mode }
  | { type: 'error-plate'; code: string | null }
  | { type: 'controller'; connected: boolean }
  | { type: 'hydrated'; mode: Mode; catalogo: Catalogo | null }
  | { type: 'catalog-updated'; catalogo: Catalogo }
  | { type: 'focus-game'; id: string }

/** Sempre exatamente um Jogo em foco: mantém o atual se ainda existir, senão o 1º. */
function reconcileFocus(current: string | null, catalogo: Catalogo | null): string | null {
  const jogos = catalogo?.jogos ?? []
  if (jogos.length === 0) return null
  return jogos.some((jogo) => jogo.id === current) ? current : jogos[0].id
}

export function reducer(state: KioskState, action: Action): KioskState {
  switch (action.type) {
    case 'set-mode':
      if (!MODES.includes(action.mode) || action.mode === state.mode) return state
      return { ...state, mode: action.mode }
    case 'error-plate':
      if (action.code === state.errorPlate) return state
      return { ...state, errorPlate: action.code }
    case 'controller':
      if (action.connected === state.controllerConnected) return state
      return { ...state, controllerConnected: action.connected }
    case 'hydrated':
      if (!MODES.includes(action.mode)) return state
      return {
        ...state,
        mode: action.mode,
        catalogo: action.catalogo,
        focusedGameId: reconcileFocus(state.focusedGameId, action.catalogo)
      }
    case 'catalog-updated': {
      const focusedGameId = reconcileFocus(state.focusedGameId, action.catalogo)
      // A Detalhe mostra o Jogo em foco: se ele sumiu, volta ao Catálogo em vez de trocar o Jogo em silêncio.
      const perdeuDetalhe = state.mode === 'detail' && focusedGameId !== state.focusedGameId
      return {
        ...state,
        mode: perdeuDetalhe ? 'catalog' : state.mode,
        catalogo: action.catalogo,
        focusedGameId
      }
    }
    case 'focus-game':
      if (action.id === state.focusedGameId) return state
      if (!state.catalogo?.jogos.some((jogo) => jogo.id === action.id)) return state
      return { ...state, focusedGameId: action.id }
    default:
      action satisfies never
      return state
  }
}
