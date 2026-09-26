import { describe, expect, it } from 'vitest'
import type { Catalogo, Jogo, KioskState, Mode } from '@shared/types'
import { initialState, reducer, type Action } from '../reducer'

const base: KioskState = {
  mode: 'catalog',
  errorPlate: 'ALGO',
  controllerConnected: true,
  catalogo: null,
  focusedGameId: null
}

function jogo(id: string): Jogo {
  return {
    id,
    titulo: id,
    ano: 2025,
    guilda: 'Guilda',
    genero: 'Ação',
    modalidade: 'single-player',
    sinopse: '',
    redesUrl: '',
    exeRelativo: '',
    detalheImagens: []
  }
}

function catalogo(...ids: string[]): Catalogo {
  return { jogos: ids.map(jogo), sincronizadoEm: '2026-09-25T00:00:00.000Z' }
}

describe('initialState', () => {
  it('começa em boot, sem placa de erro, sem controle e sem Catálogo', () => {
    expect(initialState).toEqual({
      mode: 'boot',
      errorPlate: null,
      controllerConnected: false,
      catalogo: null,
      focusedGameId: null
    })
  })
})

describe('reducer — set-mode', () => {
  it('troca o mode preservando o resto do estado', () => {
    const next = reducer(base, { type: 'set-mode', mode: 'operator' })
    expect(next).toEqual({ ...base, mode: 'operator' })
    expect(next).not.toBe(base)
  })

  it('mode igual ao atual é no-op (mesma referência)', () => {
    const next = reducer(base, { type: 'set-mode', mode: 'catalog' })
    expect(next).toBe(base)
  })

  it('mode fora do union deixa o estado inalterado (mesma referência)', () => {
    const next = reducer(base, { type: 'set-mode', mode: 'bogus' as Mode })
    expect(next).toBe(base)
  })
})

describe('reducer — error-plate / controller não mexem no mode', () => {
  it('error-plate seta o código sem trocar o mode', () => {
    const next = reducer(base, { type: 'error-plate', code: 'EXE_FALHOU' })
    expect(next).toEqual({ ...base, errorPlate: 'EXE_FALHOU' })
    expect(next).not.toBe(base)
  })

  it('error-plate com null limpa a placa sem trocar o mode', () => {
    const next = reducer(base, { type: 'error-plate', code: null })
    expect(next).toEqual({ ...base, errorPlate: null })
  })

  it('error-plate com o mesmo código é no-op (mesma referência)', () => {
    const next = reducer(base, { type: 'error-plate', code: 'ALGO' })
    expect(next).toBe(base)
  })

  it('controller alterna a flag sem trocar o mode', () => {
    const next = reducer(base, { type: 'controller', connected: false })
    expect(next).toEqual({ ...base, controllerConnected: false })
    expect(next).not.toBe(base)
  })

  it('controller com o mesmo valor é no-op (mesma referência)', () => {
    const next = reducer(base, { type: 'controller', connected: true })
    expect(next).toBe(base)
  })
})

describe('reducer — hydrated', () => {
  it('entra no mode com o Catálogo e foca o 1º Jogo', () => {
    const next = reducer(initialState, { type: 'hydrated', mode: 'catalog', catalogo: catalogo('a', 'b') })
    expect(next.mode).toBe('catalog')
    expect(next.catalogo?.jogos.map((j) => j.id)).toEqual(['a', 'b'])
    expect(next.focusedGameId).toBe('a')
  })

  it('re-hydrate mantém o foco se o Jogo ainda existe', () => {
    const state = { ...base, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }
    const next = reducer(state, { type: 'hydrated', mode: 'catalog', catalogo: catalogo('a', 'b', 'c') })
    expect(next.focusedGameId).toBe('b')
  })

  it('setup sem Catálogo zera o foco', () => {
    const state = { ...base, catalogo: catalogo('a'), focusedGameId: 'a' }
    const next = reducer(state, { type: 'hydrated', mode: 'setup', catalogo: null })
    expect(next).toEqual({ ...base, mode: 'setup', catalogo: null, focusedGameId: null })
  })

  it('mode fora do union deixa o estado inalterado (mesma referência)', () => {
    const next = reducer(base, { type: 'hydrated', mode: 'bogus' as Mode, catalogo: catalogo('a') })
    expect(next).toBe(base)
  })
})

describe('reducer — catalog-updated', () => {
  it('troca o snapshot e mantém o foco se o id ainda existe, sem mexer no mode', () => {
    const state = { ...base, mode: 'detail' as Mode, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }
    const novo = catalogo('b', 'c')
    const next = reducer(state, { type: 'catalog-updated', catalogo: novo })
    expect(next.catalogo).toBe(novo)
    expect(next.focusedGameId).toBe('b')
    expect(next.mode).toBe('detail')
  })

  it('Jogo em foco sumiu ⇒ foco vai para o 1º', () => {
    const state = { ...base, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }
    const next = reducer(state, { type: 'catalog-updated', catalogo: catalogo('c', 'd') })
    expect(next.focusedGameId).toBe('c')
  })

  it('sem foco anterior ⇒ foca o 1º', () => {
    const next = reducer(base, { type: 'catalog-updated', catalogo: catalogo('x') })
    expect(next.focusedGameId).toBe('x')
  })

  it('na Detalhe, o Jogo exibido sumiu ⇒ volta ao Catálogo com foco no 1º', () => {
    const state = { ...base, mode: 'detail' as Mode, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }
    const next = reducer(state, { type: 'catalog-updated', catalogo: catalogo('a', 'c') })
    expect(next.mode).toBe('catalog')
    expect(next.focusedGameId).toBe('a')
  })
})

describe('reducer — focus-game', () => {
  const state = { ...base, catalogo: catalogo('a', 'b', 'c'), focusedGameId: 'a' }

  it('foca um Jogo existente', () => {
    expect(reducer(state, { type: 'focus-game', id: 'c' }).focusedGameId).toBe('c')
  })

  it('id fora do Catálogo é no-op (mesma referência) — nunca fica sem foco', () => {
    expect(reducer(state, { type: 'focus-game', id: 'fantasma' })).toBe(state)
  })

  it('sem Catálogo é no-op (mesma referência)', () => {
    expect(reducer(base, { type: 'focus-game', id: 'a' })).toBe(base)
  })

  it('foco igual ao atual é no-op (mesma referência)', () => {
    expect(reducer(state, { type: 'focus-game', id: 'a' })).toBe(state)
  })
})

describe('reducer — ação desconhecida', () => {
  it('retorna o estado inalterado (mesma referência)', () => {
    const next = reducer(base, { type: 'nao-existe' } as unknown as Action)
    expect(next).toBe(base)
  })
})
