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

  it('durante o lançamento é no-op (o overlay não é trocável)', () => {
    const state = { ...base, mode: 'launching' as Mode, catalogo: catalogo('a'), focusedGameId: 'a' }
    expect(reducer(state, { type: 'set-mode', mode: 'operator' })).toBe(state)
  })

  it('sair da Detalhe limpa a placa de erro', () => {
    const state = { ...base, mode: 'detail' as Mode, errorPlate: 'JOGO_NAO_INSTALADO' }
    const next = reducer(state, { type: 'set-mode', mode: 'catalog' })
    expect(next.mode).toBe('catalog')
    expect(next.errorPlate).toBeNull()
  })

  it('sair de outro mode preserva a placa', () => {
    const next = reducer(base, { type: 'set-mode', mode: 'operator' })
    expect(next.errorPlate).toBe('ALGO')
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
    const next = reducer(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('a', 'b'),
      focusedGameId: null
    })
    expect(next.mode).toBe('catalog')
    expect(next.catalogo?.jogos.map((j) => j.id)).toEqual(['a', 'b'])
    expect(next.focusedGameId).toBe('a')
  })

  it('o focusedGameId do hydrate vence e foca o Jogo jogado', () => {
    const next = reducer(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('a', 'b'),
      focusedGameId: 'b'
    })
    expect(next.focusedGameId).toBe('b')
  })

  it('focusedGameId fora do Catálogo cai no 1º Jogo', () => {
    const next = reducer(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('a', 'b'),
      focusedGameId: 'fantasma'
    })
    expect(next.focusedGameId).toBe('a')
  })

  it('re-hydrate mantém o foco se o Jogo ainda existe', () => {
    const state = { ...base, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }
    const next = reducer(state, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('a', 'b', 'c'),
      focusedGameId: null
    })
    expect(next.focusedGameId).toBe('b')
  })

  it('setup sem Catálogo zera o foco', () => {
    const state = { ...base, catalogo: catalogo('a'), focusedGameId: 'a' }
    const next = reducer(state, { type: 'hydrated', mode: 'setup', catalogo: null, focusedGameId: null })
    expect(next).toEqual({ ...base, mode: 'setup', catalogo: null, focusedGameId: null })
  })

  it('mode fora do union deixa o estado inalterado (mesma referência)', () => {
    const next = reducer(base, {
      type: 'hydrated',
      mode: 'bogus' as Mode,
      catalogo: catalogo('a'),
      focusedGameId: null
    })
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

describe('reducer — launch-start', () => {
  const naDetalhe = { ...base, mode: 'detail' as Mode, catalogo: catalogo('a', 'b'), focusedGameId: 'b' }

  it('na Detalhe com Jogo em foco entra em launching e limpa a placa', () => {
    const next = reducer(naDetalhe, { type: 'launch-start' })
    expect(next.mode).toBe('launching')
    expect(next.errorPlate).toBeNull()
    expect(next.focusedGameId).toBe('b')
  })

  it('fora da Detalhe é no-op (mesma referência)', () => {
    expect(reducer(base, { type: 'launch-start' })).toBe(base)
  })

  it('na Detalhe sem foco é no-op (mesma referência)', () => {
    const state = { ...naDetalhe, focusedGameId: null }
    expect(reducer(state, { type: 'launch-start' })).toBe(state)
  })
})

describe('reducer — launch-failed', () => {
  const lancando = { ...base, mode: 'launching' as Mode, catalogo: catalogo('a'), focusedGameId: 'a' }

  it('volta à Detalhe com a placa do código', () => {
    const next = reducer(lancando, { type: 'launch-failed', code: 'JOGO_NAO_INSTALADO' })
    expect(next.mode).toBe('detail')
    expect(next.errorPlate).toBe('JOGO_NAO_INSTALADO')
    expect(next.focusedGameId).toBe('a')
  })

  it('fora do lançamento é no-op (mesma referência)', () => {
    expect(reducer(base, { type: 'launch-failed', code: 'FALHA_AO_ABRIR' })).toBe(base)
  })
})

describe('reducer — ciclo da Detalhe', () => {
  it('detail → launch-start → launch-failed → set-mode catalog limpa a placa', () => {
    const inicio = { ...base, mode: 'detail' as Mode, catalogo: catalogo('a'), focusedGameId: 'a' }
    const lancando = reducer(inicio, { type: 'launch-start' })
    const falhou = reducer(lancando, { type: 'launch-failed', code: 'FALHA_AO_ABRIR' })
    expect(falhou.errorPlate).toBe('FALHA_AO_ABRIR')

    const noCatalogo = reducer(falhou, { type: 'set-mode', mode: 'catalog' })
    expect(noCatalogo.mode).toBe('catalog')
    expect(noCatalogo.errorPlate).toBeNull()
    expect(noCatalogo.focusedGameId).toBe('a')
  })

  it('catalog-updated durante o lançamento mantém o mode', () => {
    const lancando = { ...base, mode: 'launching' as Mode, catalogo: catalogo('a'), focusedGameId: 'a' }
    const next = reducer(lancando, { type: 'catalog-updated', catalogo: catalogo('b') })
    expect(next.mode).toBe('launching')
    expect(next.focusedGameId).toBe('b')
  })
})

describe('reducer — ação desconhecida', () => {
  it('retorna o estado inalterado (mesma referência)', () => {
    const next = reducer(base, { type: 'nao-existe' } as unknown as Action)
    expect(next).toBe(base)
  })
})
