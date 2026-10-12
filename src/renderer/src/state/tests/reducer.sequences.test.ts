import { describe, expect, it } from 'vitest'
import type { Catalogo, Jogo, KioskState } from '@shared/types'
import { initialState, reducer, type Action } from '../reducer'

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

function aplicar(inicial: KioskState, ...acoes: Action[]): KioskState {
  return acoes.reduce(reducer, inicial)
}

describe('reducer — sequências do ciclo JOGAR', () => {
  it('boot → hydrated (foco no jogado) → detail → launch-start → launch-failed → back', () => {
    const cat = catalogo('rebite', 'corvo', 'pancada')

    const hidratado = aplicar(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: cat,
      focusedGameId: 'corvo'
    })
    expect(hidratado).toMatchObject({ mode: 'catalog', focusedGameId: 'corvo' })

    const emDetalhe = aplicar(hidratado, { type: 'set-mode', mode: 'detail' })
    expect(emDetalhe).toMatchObject({ mode: 'detail', focusedGameId: 'corvo', errorPlate: null })

    const lancando = aplicar(emDetalhe, { type: 'launch-start' })
    expect(lancando.mode).toBe('launching')

    const falhou = aplicar(lancando, { type: 'launch-failed', code: 'EXE_NAO_ENCONTRADO' })
    expect(falhou).toMatchObject({
      mode: 'detail',
      errorPlate: 'EXE_NAO_ENCONTRADO',
      focusedGameId: 'corvo'
    })

    // O Visitante volta ao Catálogo: a placa sai e o foco permanece no mesmo Jogo.
    const voltou = aplicar(falhou, { type: 'set-mode', mode: 'catalog' })
    expect(voltou).toMatchObject({ mode: 'catalog', errorPlate: null, focusedGameId: 'corvo' })
    expect(voltou.catalogo).toBe(cat)
  })

  it('nova tentativa depois da falha limpa a placa ao entrar em launching', () => {
    const falhou = aplicar(
      { ...initialState, mode: 'detail', catalogo: catalogo('rebite'), focusedGameId: 'rebite' },
      { type: 'launch-start' },
      { type: 'launch-failed', code: 'FALHA_AO_ABRIR' }
    )
    expect(falhou.errorPlate).toBe('FALHA_AO_ABRIR')

    const retentando = aplicar(falhou, { type: 'launch-start' })

    expect(retentando).toMatchObject({ mode: 'launching', errorPlate: null })
  })

  it('catalog-updated durante launching mantém o mode; Jogo que sumiu só reconcilia o foco', () => {
    const lancando = aplicar(
      { ...initialState, mode: 'detail', catalogo: catalogo('rebite', 'corvo'), focusedGameId: 'corvo' },
      { type: 'launch-start' }
    )

    const sincronizado = aplicar(lancando, { type: 'catalog-updated', catalogo: catalogo('rebite') })

    expect(sincronizado.mode).toBe('launching')
    expect(sincronizado.focusedGameId).toBe('rebite')
    expect(sincronizado.catalogo?.jogos.map((j) => j.id)).toEqual(['rebite'])
  })

  it('catalog-updated durante launching com o Jogo ainda presente não mexe em nada além do Catálogo', () => {
    const lancando = aplicar(
      { ...initialState, mode: 'detail', catalogo: catalogo('rebite', 'corvo'), focusedGameId: 'corvo' },
      { type: 'launch-start' }
    )
    const novo = catalogo('corvo', 'rebite', 'pancada')

    const sincronizado = aplicar(lancando, { type: 'catalog-updated', catalogo: novo })

    expect(sincronizado).toMatchObject({ mode: 'launching', focusedGameId: 'corvo', catalogo: novo })
  })

  it('launch-failed depois de catalog-updated que esvaziou o Catálogo volta à Detalhe com a placa', () => {
    const lancando = aplicar(
      { ...initialState, mode: 'detail', catalogo: catalogo('rebite'), focusedGameId: 'rebite' },
      { type: 'launch-start' }
    )

    const s = aplicar(
      lancando,
      { type: 'catalog-updated', catalogo: catalogo() },
      { type: 'launch-failed', code: 'JOGO_DESCONHECIDO' }
    )

    expect(s.mode).toBe('detail')
    expect(s.errorPlate).toBe('JOGO_DESCONHECIDO')
    expect(s.focusedGameId).toBeNull()
  })

  it('set-mode operator durante launching é ignorado (mesma referência) e a falha ainda chega', () => {
    const lancando = aplicar(
      { ...initialState, mode: 'detail', catalogo: catalogo('rebite'), focusedGameId: 'rebite' },
      { type: 'launch-start' }
    )

    expect(reducer(lancando, { type: 'set-mode', mode: 'operator' })).toBe(lancando)
    expect(reducer(lancando, { type: 'set-mode', mode: 'catalog' })).toBe(lancando)

    const falhou = aplicar(
      lancando,
      { type: 'set-mode', mode: 'operator' },
      { type: 'launch-failed', code: 'FALHA_AO_ABRIR' }
    )
    expect(falhou).toMatchObject({ mode: 'detail', errorPlate: 'FALHA_AO_ABRIR' })
  })

  it.each(['boot', 'setup', 'catalog', 'detail', 'operator'] as const)(
    'launch-failed fora de launching (%s) é no-op: não cria placa nem muda o mode',
    (mode) => {
      const s: KioskState = {
        ...initialState,
        mode,
        catalogo: catalogo('rebite'),
        focusedGameId: 'rebite'
      }
      expect(reducer(s, { type: 'launch-failed', code: 'FALHA_AO_ABRIR' })).toBe(s)
    }
  )

  it.each(['boot', 'setup', 'catalog', 'operator', 'launching'] as const)(
    'launch-start fora da Detalhe (%s) é no-op',
    (mode) => {
      const s: KioskState = { ...initialState, mode, catalogo: catalogo('rebite'), focusedGameId: 'rebite' }
      expect(reducer(s, { type: 'launch-start' })).toBe(s)
    }
  )

  it('hydrated com focusedGameId inexistente cai no 1º Jogo, não em null nem no id fantasma', () => {
    const s = aplicar(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: 'fantasma'
    })

    expect(s.focusedGameId).toBe('rebite')
  })

  it('hydrated com focusedGameId null não perde o foco que o estado já tinha', () => {
    const antes: KioskState = {
      ...initialState,
      mode: 'catalog',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: 'corvo'
    }

    const s = aplicar(antes, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo('rebite', 'corvo'),
      focusedGameId: null
    })

    expect(s.focusedGameId).toBe('corvo')
  })

  it('hydrated com Catálogo vazio zera o foco mesmo com id pedido', () => {
    const s = aplicar(initialState, {
      type: 'hydrated',
      mode: 'catalog',
      catalogo: catalogo(),
      focusedGameId: 'rebite'
    })

    expect(s.focusedGameId).toBeNull()
  })
})
