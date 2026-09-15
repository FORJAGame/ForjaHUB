import { describe, expect, it } from 'vitest'
import { CatalogoInvalidoError, fetchCatalogo, rowsToRawJogos, type SheetsValuesClient } from '../sheets-adapter'

const HEADER = ['id', 'titulo', 'ano', 'guilda', 'genero', 'modalidade', 'sinopse', 'redes_url', 'exe_relativo']

const LINHA_VALIDA = [
  'jogo-a',
  'Jogo A',
  '2024',
  'Guilda A',
  'Aventura',
  'single-player',
  'Uma sinopse.',
  'https://exemplo.com',
  'Jogo.exe'
]

function linha(overrides: Partial<Record<(typeof HEADER)[number], string>>): string[] {
  const base = Object.fromEntries(HEADER.map((h, i) => [h, LINHA_VALIDA[i]]))
  return HEADER.map((h) => overrides[h] ?? base[h])
}

function fakeSheetsClient(values: string[][]): SheetsValuesClient {
  return {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values } })
      }
    }
  }
}

describe('rowsToRawJogos', () => {
  it('mapeia header snake_case -> campo camelCase do Jogo', () => {
    const [raw] = rowsToRawJogos([HEADER, LINHA_VALIDA])
    expect(raw).toMatchObject({ id: 'jogo-a', redesUrl: 'https://exemplo.com', exeRelativo: 'Jogo.exe' })
  })

  it('ignora colunas fora do HEADER_MAP', () => {
    const [raw] = rowsToRawJogos([[...HEADER, 'coluna_extra'], [...LINHA_VALIDA, 'lixo']])
    expect(raw).not.toHaveProperty('coluna_extra')
  })

  it('pula linhas totalmente vazias', () => {
    const rows = rowsToRawJogos([HEADER, LINHA_VALIDA, [], ['', '', '', '', '', '', '', '', '']])
    expect(rows).toHaveLength(1)
  })

  it('planilha só com header -> nenhum Jogo, sem lançar', () => {
    expect(rowsToRawJogos([HEADER])).toEqual([])
  })

  it('planilha vazia -> nenhum Jogo', () => {
    expect(rowsToRawJogos([])).toEqual([])
  })
})

describe('fetchCatalogo', () => {
  it('linhas válidas -> array de Jogo', async () => {
    const sheets = fakeSheetsClient([HEADER, LINHA_VALIDA])
    const jogos = await fetchCatalogo(sheets, 'sheet-1')
    expect(jogos).toEqual([expect.objectContaining({ id: 'jogo-a', titulo: 'Jogo A', ano: 2024 })])
  })

  it('sem coluna de ordem: resultado sempre sai ordenado alfabeticamente por id', async () => {
    const sheets = fakeSheetsClient([
      HEADER,
      linha({ id: 'jogo-c', titulo: 'Jogo C' }),
      linha({ id: 'jogo-a', titulo: 'Jogo A' }),
      linha({ id: 'jogo-b', titulo: 'Jogo B' })
    ])
    const jogos = await fetchCatalogo(sheets, 'sheet-1')
    expect(jogos.map((jogo) => jogo.id)).toEqual(['jogo-a', 'jogo-b', 'jogo-c'])
  })

  it('uma linha inválida -> CatalogoInvalidoError, nada é retornado', async () => {
    const linhaInvalida = linha({ id: 'JOGO_A' }) // id fora de kebab-case
    const sheets = fakeSheetsClient([HEADER, LINHA_VALIDA, linhaInvalida])
    await expect(fetchCatalogo(sheets, 'sheet-1')).rejects.toThrow(CatalogoInvalidoError)
  })

  it('Planilha sem values -> Catálogo vazio, não lança', async () => {
    const sheets: SheetsValuesClient = {
      spreadsheets: { values: { get: async () => ({ data: {} }) } }
    }
    await expect(fetchCatalogo(sheets, 'sheet-1')).resolves.toEqual([])
  })

  it('duas linhas com o mesmo id (copiar/colar errado na Planilha) -> CatalogoInvalidoError', async () => {
    const linhaDuplicada = linha({ titulo: 'Jogo A (copia)' }) // mesmo id, resto diferente
    const sheets = fakeSheetsClient([HEADER, LINHA_VALIDA, linhaDuplicada])
    await expect(fetchCatalogo(sheets, 'sheet-1')).rejects.toThrow(CatalogoInvalidoError)
  })
})
