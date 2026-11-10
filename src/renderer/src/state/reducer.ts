import {
  CONTROLE_PROMPTS_PADRAO,
  MODES,
  type Catalogo,
  type ControlePrompts,
  type KioskState,
  type Mode
} from '@shared/types'

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
  focusedGameId: null,
  controlePrompts: CONTROLE_PROMPTS_PADRAO
}

export type Action =
  | { type: 'set-mode'; mode: Mode }
  | { type: 'error-plate'; code: string | null }
  | { type: 'controller'; connected: boolean }
  | {
      type: 'hydrated'
      mode: Mode
      catalogo: Catalogo | null
      focusedGameId: string | null
      controlePrompts: ControlePrompts
    }
  | { type: 'catalog-updated'; catalogo: Catalogo }
  | { type: 'focus-game'; id: string }
  | { type: 'launch-start' }
  | { type: 'launch-failed'; code: string }
  | { type: 'attract-start' }
  | { type: 'attract-end'; focusedGameId: string | null }

/** Sempre exatamente um Jogo em foco: mantém o atual se ainda existir, senão o 1º. */
function reconcileFocus(current: string | null, catalogo: Catalogo | null): string | null {
  const jogos = catalogo?.jogos ?? []
  if (jogos.length === 0) return null
  return jogos.some((jogo) => jogo.id === current) ? current : jogos[0].id
}

export function reducer(state: KioskState, action: Action): KioskState {
  switch (action.type) {
    case 'set-mode': {
      if (!MODES.includes(action.mode) || action.mode === state.mode) return state
      if (state.mode === 'launching') return state
      const errorPlate = state.mode === 'detail' ? null : state.errorPlate
      return { ...state, mode: action.mode, errorPlate }
    }
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
        focusedGameId: reconcileFocus(action.focusedGameId ?? state.focusedGameId, action.catalogo),
        controlePrompts: action.controlePrompts
      }
    case 'catalog-updated': {
      const focusedGameId = reconcileFocus(state.focusedGameId, action.catalogo)
      // A Detalhe mostra o Jogo em foco: se ele sumiu, volta ao Catálogo em vez de trocar o Jogo em silêncio.
      // No lançamento o Jogo já foi pedido ao main: o mode fica, só o foco se reconcilia.
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
    case 'launch-start':
      // Só a Detalhe com Jogo em foco pede o lançamento; a placa anterior sai de cena.
      if (state.mode !== 'detail' || state.focusedGameId === null) return state
      return { ...state, mode: 'launching', errorPlate: null }
    case 'launch-failed':
      // A falha do invoke devolve a Detalhe com a placa do código.
      if (state.mode !== 'launching') return state
      return { ...state, mode: 'detail', errorPlate: action.code }
    case 'attract-start':
      // Atração só a partir da vitrine; nunca com o JOGAR em curso nem sem Jogo.
      if (state.mode !== 'catalog' && state.mode !== 'detail') return state
      if (!state.catalogo || state.catalogo.jogos.length === 0) return state
      return { ...state, mode: 'attract', errorPlate: null }
    case 'attract-end': {
      // A saída da vitrine sempre cai no Catálogo, com o foco que o Jogo indicou.
      if (state.mode !== 'attract') return state
      const jogos = state.catalogo?.jogos ?? []
      const focoValido = action.focusedGameId !== null && jogos.some((jogo) => jogo.id === action.focusedGameId)
      return {
        ...state,
        mode: 'catalog',
        focusedGameId: focoValido ? action.focusedGameId : reconcileFocus(state.focusedGameId, state.catalogo)
      }
    }
    default:
      action satisfies never
      return state
  }
}
