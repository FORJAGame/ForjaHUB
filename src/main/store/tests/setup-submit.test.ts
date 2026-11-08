import { describe, expect, it } from 'vitest'
import { validateSetupSubmit } from '../setup-submit'

const ROSTER_IDS = ['jogo-a', 'jogo-b', 'jogo-c']

describe('validateSetupSubmit', () => {
  it('aceita um payload válido e normaliza os IDs', () => {
    const result = validateSetupSubmit(
      {
        estacaoId: '  TV Principal  ',
        eventoId: 'RECNPLAY 2026',
        jogosSelecionados: ['jogo-a', 'jogo-b'],
        controlePrompts: 'playstation'
      },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a', 'jogo-b'],
      controlePrompts: 'playstation'
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

  it('rejeita família de prompts ausente ou desconhecida', () => {
    const base = { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-a'] }
    expect(validateSetupSubmit(base, ROSTER_IDS)).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
    expect(validateSetupSubmit({ ...base, controlePrompts: 'switch' }, ROSTER_IDS)).toEqual({
      ok: false,
      code: 'SETUP_INVALIDO'
    })
  })

  it('rejeita jogo vazio na lista (shape)', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-a', ''], controlePrompts: 'xbox' },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
  })

  it('rejeita quando os IDs normalizam para vazio', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: '   ', eventoId: 'recnplay', jogosSelecionados: ['jogo-a'], controlePrompts: 'xbox' },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_INVALIDO' })
  })

  it('rejeita sem nenhum Jogo selecionado (AD-11)', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: [], controlePrompts: 'xbox' },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_SEM_JOGO' })
  })

  it('rejeita Jogo fora do roster', () => {
    expect(
      validateSetupSubmit(
        { estacaoId: 'tv', eventoId: 'recnplay', jogosSelecionados: ['jogo-fantasma'], controlePrompts: 'xbox' },
        ROSTER_IDS
      )
    ).toEqual({ ok: false, code: 'SETUP_JOGO_DESCONHECIDO' })
  })

  it('dedupe jogos repetidos', () => {
    const result = validateSetupSubmit(
      {
        estacaoId: 'tv',
        eventoId: 'recnplay',
        jogosSelecionados: ['jogo-a', 'jogo-a', 'jogo-b'],
        controlePrompts: 'xbox'
      },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv',
      eventoId: 'recnplay',
      jogosSelecionados: ['jogo-a', 'jogo-b'],
      controlePrompts: 'xbox'
    })
  })

  it('é idempotente em cima de IDs já normalizados', () => {
    const result = validateSetupSubmit(
      {
        estacaoId: 'tv-principal',
        eventoId: 'recnplay-2026',
        jogosSelecionados: ['jogo-a'],
        controlePrompts: 'xbox'
      },
      ROSTER_IDS
    )
    expect(result).toEqual({
      ok: true,
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a'],
      controlePrompts: 'xbox'
    })
  })
})
