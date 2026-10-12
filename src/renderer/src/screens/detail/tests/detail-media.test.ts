import { describe, expect, it } from 'vitest'
import type { Jogo } from '@shared/types'
import { detailMediaTipo, temQr } from '../detail-media'

function jogo(over: Partial<Jogo> = {}): Jogo {
  return {
    id: 'pancada',
    titulo: 'Pancada',
    ano: 2025,
    guilda: 'FORJA',
    genero: 'Luta',
    modalidade: 'multiplayer',
    sinopse: 'Uma sinopse.',
    redesUrl: '',
    exeRelativo: '',
    detalheImagens: [],
    ...over
  }
}

describe('detailMediaTipo', () => {
  it('devolve o 1º nome `detalhe-<n>`, ignorando os que não casam', () => {
    expect(detailMediaTipo(jogo({ detalheImagens: ['capa', 'detalhe-2', 'detalhe-7'] }))).toBe('detalhe-2')
  })

  it('sem nenhum nome válido, é null', () => {
    expect(detailMediaTipo(jogo())).toBeNull()
    expect(detailMediaTipo(jogo({ detalheImagens: ['capa', 'detalhe-x', 'detalhe-'] }))).toBeNull()
  })

  it('o nome tem que casar inteiro: 0 e vários dígitos valem, sufixo não', () => {
    expect(detailMediaTipo(jogo({ detalheImagens: ['detalhe-0'] }))).toBe('detalhe-0')
    expect(detailMediaTipo(jogo({ detalheImagens: ['detalhe-12'] }))).toBe('detalhe-12')
    expect(detailMediaTipo(jogo({ detalheImagens: ['detalhe-1.png', 'detalhe-1a', 'xdetalhe-1'] }))).toBeNull()
  })
})

describe('temQr', () => {
  it('só com URL de redes não vazia (espaço em branco não conta)', () => {
    expect(temQr(jogo({ redesUrl: 'https://forja.dev' }))).toBe(true)
    expect(temQr(jogo({ redesUrl: '' }))).toBe(false)
    expect(temQr(jogo({ redesUrl: '  \n\t' }))).toBe(false)
  })
})
