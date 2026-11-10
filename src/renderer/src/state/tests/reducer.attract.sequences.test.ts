import { describe, expect, it } from 'vitest'
import type { Catalogo, Jogo, KioskState } from '@shared/types'
import { initialState, reducer, type Action } from '../reducer'

function jogo(id: string): Jogo {
  return {
    id,
    titulo: id,
    ano: 2026,
    estudio: 'FORJA',
    genero: 'ação',
    modalidade: 'single-player',
    sinopse: '',
    redesUrl: '',
    exeRelativo: '',
    detalheImagens: []
  }
}

function catalogo(...ids: string[]): Catalogo {
  return { jogos: ids.map(jogo), sincronizadoEm: '2026-11-09T00:00:00.000Z' }
}

function aplicar(inicial: KioskState, ...acoes: Action[]): KioskState {
  return acoes.reduce(reducer, inicial)
}

describe('reducer — sequências adversariais da Atração', () => {
  it('focus-game durante a Atração é seguro e o attract-end foca o Jogo que estava na tela', () => {
    const naAtracao = aplicar(
      {
        ...initialState,
        mode: 'catalog',
        catalogo: catalogo('rebite', 'corvo', 'valsa'),
        focusedGameId: 'rebite'
      },
      { type: 'attract-start' }
    )
    expect(naAtracao.mode).toBe('attract')

    const comFocoTrocado = aplicar(naAtracao, { type: 'focus-game', id: 'valsa' })
    expect(comFocoTrocado.mode).toBe('attract')
    expect(comFocoTrocado.focusedGameId).toBe('valsa')

    const s = aplicar(comFocoTrocado, { type: 'attract-end', focusedGameId: 'valsa' })
    expect(s.mode).toBe('catalog')
    expect(s.focusedGameId).toBe('valsa')
  })

  it('attract-start durante o JOGAR é ignorado; após a falha entra e limpa a placa', () => {
    const emDetalhe: KioskState = {
      ...initialState,
      mode: 'detail',
      catalogo: catalogo('rebite'),
      focusedGameId: 'rebite'
    }
    const lancando = aplicar(emDetalhe, { type: 'launch-start' })
    expect(lancando.mode).toBe('launching')

    const aindaLancando = aplicar(lancando, { type: 'attract-start' })
    expect(aindaLancando).toBe(lancando)

    const falhou = aplicar(aindaLancando, { type: 'launch-failed', code: 'EXE_FALHOU' })
    expect(falhou.mode).toBe('detail')
    expect(falhou.errorPlate).toBe('EXE_FALHOU')

    const naAtracao = aplicar(falhou, { type: 'attract-start' })
    expect(naAtracao.mode).toBe('attract')
    expect(naAtracao.errorPlate).toBeNull()
  })

  it('set-mode operator durante a Atração: o attract-end que chega depois é ignorado', () => {
    const naAtracao: KioskState = {
      ...initialState,
      mode: 'attract',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: 'rebite'
    }
    const emOperacao = aplicar(naAtracao, { type: 'set-mode', mode: 'operator' })
    expect(emOperacao.mode).toBe('operator')

    const s = aplicar(emOperacao, { type: 'attract-end', focusedGameId: 'corvo' })
    expect(s).toBe(emOperacao)
  })

  it('hydrated durante a Atração manda no mode: attract-end depois é no-op', () => {
    const naAtracao: KioskState = {
      ...initialState,
      mode: 'attract',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: 'rebite'
    }
    const reidratado = aplicar(naAtracao, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: 'rebite',
      controlePrompts: 'xbox'
    })
    expect(reidratado.mode).toBe('catalog')

    const s = aplicar(reidratado, { type: 'attract-end', focusedGameId: 'corvo' })
    expect(s).toBe(reidratado)
  })

  it('Catálogo esvazia durante a Atração: a saída cai no Catálogo sem foco e nada lança', () => {
    const naAtracao = aplicar(
      {
        ...initialState,
        mode: 'attract',
        catalogo: catalogo('rebite', 'corvo'),
        focusedGameId: 'rebite'
      },
      { type: 'catalog-updated', catalogo: catalogo() }
    )
    expect(naAtracao.mode).toBe('attract')

    const s = aplicar(naAtracao, { type: 'attract-end', focusedGameId: 'rebite' })
    expect(s.mode).toBe('catalog')
    expect(s.focusedGameId).toBeNull()
    expect(s.catalogo?.jogos).toHaveLength(0)
  })

  it('Catálogo esvaziou antes do attract-start: entrar é no-op (mesma referência)', () => {
    const semJogos = aplicar(
      {
        ...initialState,
        mode: 'catalog',
        catalogo: catalogo('rebite'),
        focusedGameId: 'rebite'
      },
      { type: 'catalog-updated', catalogo: catalogo() }
    )
    const s = aplicar(semJogos, { type: 'attract-start' })
    expect(s).toBe(semJogos)
    expect(s.mode).toBe('catalog')
  })
})
