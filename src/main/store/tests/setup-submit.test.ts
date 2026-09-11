import { describe, expect, it } from 'vitest'
import { validateSetupSubmit } from '../setup-submit'

const ROSTER_IDS = ['jogo-a', 'jogo-b', 'jogo-c']

describe('validateSetupSubmit', () => {
  it('aceita um payload válido e normaliza os IDs', () => {
    const result = validateSetupSubmit(
      {
        estacaoId: '  TV Principal  ',
        eventoId: 'RECNPLAY 2026',
        jogosSelecionados: ['jogo-a', 'jogo-b']
      },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a', 'jogo-b']
    })
  })

  it('rejeita shape inválido', () => {
    expect(validateSetupSubmit({ estacaoId: 'tv' }, ROSTER_IDS)).toEqual({
      ok: false,
      code: 'SETUP_INVALIDO'
    })
    expect(validateSetupSubmit(null, ROSTER_IDS)).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
    expect(validateSetupSubmit('nope', ROSTER_IDS)).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
  })

  it('rejeita jogo vazio na lista (shape)', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-a', ''] },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
  })

  it('rejeita quando os IDs normalizam para vazio', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: '   ', eventoId: 'recnplay', jogosSelecionados: ['jogo-a'] },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
  })

  it('rejeita sem nenhum Jogo selecionado (AD-11)', () => {
    expect(
      validateSetupSubmit({ estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: [] }, ROSTER_IDS)
    ).toEqual({ ok: false, code: 'SETUP_SEM_JOGO' })
  })

  it('rejeita Jogo fora do roster', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-fantasma'] },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_JOGO_DESCONHECIDO' })
  })

  it('dedupe jogos repetidos', () => {
    const result = validateSetupSubmit(
      { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-a', 'jogo-a', 'jogo-b'] },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv',
      eventoId: 'recnplay',
      jogosSelecionados: ['jogo-a', 'jogo-b']
    })
  })

  it('é idempotente em cima de IDs já normalizados', () => {
    const result = validateSetupSubmit(
      { estacaoId: 'tv-principal', eventoId: 'recnplay-2026', jogosSelecionados: ['jogo-a'] },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a']
    })
  })
})
