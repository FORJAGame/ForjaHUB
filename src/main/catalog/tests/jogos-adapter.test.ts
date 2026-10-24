import { describe, expect, it } from 'vitest'
import type { JogosTable } from '../../supabase/client'
import { CatalogoInvalidoError, fetchCatalogo, linhaParaRawJogo } from '../jogos-adapter'

const LINHA_VALIDA: Record<string, unknown> = {
  id: 'jogo-a',
  titulo: 'Jogo A',
  ano: 2024,
  guilda: 'Guilda A',
  genero: 'Aventura',
  modalidade: 'single-player',
  sinopse: 'Uma sinopse.',
  redes_url: 'https://exemplo.com',
  exe_relativo: 'Jogo.exe'
}

function linha(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...LINHA_VALIDA, ...overrides }
}

function fakeJogos(linhas: unknown[]): JogosTable {
  return { listar: async () => linhas }
}

describe('linhaParaRawJogo', () => {
  it('mapeia colunas snake_case -> campo camelCase do Jogo', () => {
    expect(linhaParaRawJogo(LINHA_VALIDA)).toMatchObject({
      id: 'jogo-a',
      redesUrl: 'https://exemplo.com',
      exeRelativo: 'Jogo.exe'
    })
  })

  it('ignora colunas fora do mapa (ex.: criado_em)', () => {
    const raw = linhaParaRawJogo({ ...LINHA_VALIDA, criado_em: '2024-01-01T00:00:00Z', coluna_extra: 'lixo' })
    expect(raw).not.toHaveProperty('criado_em')
    expect(raw).not.toHaveProperty('coluna_extra')
  })
})

describe('fetchCatalogo', () => {
  it('linhas válidas -> array de Jogo, extras ignoradas', async () => {
    const jogos = await fetchCatalogo(fakeJogos([linha({ criado_em: '2024-01-01T00:00:00Z' })]))
    expect(jogos).toEqual([
      expect.objectContaining({
        id: 'jogo-a',
        titulo: 'Jogo A',
        ano: 2024,
        redesUrl: 'https://exemplo.com',
        exeRelativo: 'Jogo.exe'
      })
    ])
    expect(jogos[0]).not.toHaveProperty('criado_em')
  })

  it('resultado sempre sai ordenado alfabeticamente por id', async () => {
    const jogos = await fetchCatalogo(
      fakeJogos([
        linha({ id: 'jogo-c', titulo: 'Jogo C' }),
        linha({ id: 'jogo-a', titulo: 'Jogo A' }),
        linha({ id: 'jogo-b', titulo: 'Jogo B' })
      ])
    )
    expect(jogos.map((jogo) => jogo.id)).toEqual(['jogo-a', 'jogo-b', 'jogo-c'])
  })

  it('uma linha inválida -> CatalogoInvalidoError, nada é retornado', async () => {
    const linhaInvalida = linha({ id: 'JOGO_A' }) // id fora de kebab-case
    await expect(fetchCatalogo(fakeJogos([LINHA_VALIDA, linhaInvalida]))).rejects.toThrow(CatalogoInvalidoError)
  })

  it('ano com valor não numérico -> CatalogoInvalidoError', async () => {
    await expect(fetchCatalogo(fakeJogos([linha({ ano: 'abc' })]))).rejects.toThrow(CatalogoInvalidoError)
  })

  it('tabela vazia -> Catálogo vazio, não lança', async () => {
    await expect(fetchCatalogo(fakeJogos([]))).resolves.toEqual([])
  })

  it('duas linhas com o mesmo id -> CatalogoInvalidoError', async () => {
    const duplicada = linha({ titulo: 'Jogo A (copia)' })
    await expect(fetchCatalogo(fakeJogos([LINHA_VALIDA, duplicada]))).rejects.toThrow(CatalogoInvalidoError)
  })

  it('falha ao listar a tabela propaga o erro original (não vira CatalogoInvalidoError)', async () => {
    const erro = new Error('ETIMEDOUT')
    const jogos: JogosTable = {
      listar: async () => {
        throw erro
      }
    }
    const rejeicao = await fetchCatalogo(jogos).catch((e: unknown) => e)
    expect(rejeicao).toBe(erro)
    expect(rejeicao).not.toBeInstanceOf(CatalogoInvalidoError)
  })
})
