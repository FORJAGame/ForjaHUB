import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { RegistroAnalytics } from '@shared/types'
import type { AnalyticsSink } from '../../ports'
import { CredencialAusenteError } from '../../catalog/google-client'
import { AnalyticsNaoConfiguradoError } from '../types'
import {
  criarSinkPadrao,
  createSheetsAnalyticsSink,
  formatarInicioLocal,
  registroParaLinha,
  type AnalyticsSheetsClient
} from '../sheets-sink'

type SheetsGet = AnalyticsSheetsClient['spreadsheets']['values']['get']
type SheetsAppend = AnalyticsSheetsClient['spreadsheets']['values']['append']
type AppendParams = Parameters<SheetsAppend>[0]

interface PlanilhaFake {
  sheets: AnalyticsSheetsClient
  linhas: string[][]
  get: Mock<SheetsGet>
  append: Mock<SheetsAppend>
}

function aplicarAppend(linhas: string[][], params: AppendParams): void {
  for (const linha of params.requestBody.values) linhas.push(linha.map(String))
}

// Planilha em memória: `get` devolve as linhas atuais, `append` empurra no fim.
function criarPlanilhaFake(inicial: string[][] = []): PlanilhaFake {
  const linhas = inicial.map((linha) => [...linha])
  const get = vi.fn<SheetsGet>(async () => ({
    data: { values: linhas.map((linha) => [...linha]) }
  }))
  const append = vi.fn<SheetsAppend>(async (params) => {
    aplicarAppend(linhas, params)
  })
  const sheets: AnalyticsSheetsClient = { spreadsheets: { values: { get, append } } }
  return { sheets, linhas, get, append }
}

function registro(over: Partial<RegistroAnalytics> = {}): RegistroAnalytics {
  return {
    id: 'r1',
    jogoId: 'jogo-1',
    estacaoId: 'est-1',
    eventoId: 'ev-1',
    inicioISO: '2026-11-11T17:32:05.000Z',
    duracaoSeg: 90,
    ...over
  }
}

const TZ = 'America/Recife'

function criarSink(planilha: PlanilhaFake): AnalyticsSink {
  return createSheetsAnalyticsSink({
    sheets: planilha.sheets,
    spreadsheetId: 'planilha-teste',
    timeZone: TZ
  })
}

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-sheets-sink-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('createSheetsAnalyticsSink (dedup por id, sem rede)', () => {
  it('lote novo -> 1 append com as linhas na ordem e colunas exatas; devolve todos os ids', async () => {
    const planilha = criarPlanilhaFake()
    const sink = criarSink(planilha)
    const r1 = registro({ id: 'r1' })
    const r2 = registro({
      id: 'r2',
      inicioISO: '2026-11-11T18:00:00.000Z',
      duracaoSeg: 12,
      incompleta: true
    })

    const res = await sink.flush([r1, r2])

    expect(planilha.get).toHaveBeenCalledWith({
      spreadsheetId: 'planilha-teste',
      range: 'Analytics!A:A'
    })
    expect(planilha.append).toHaveBeenCalledTimes(1)
    expect(planilha.append).toHaveBeenCalledWith({
      spreadsheetId: 'planilha-teste',
      range: 'Analytics!A:H',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [
          [
            'r1',
            'ev-1',
            'est-1',
            'jogo-1',
            '2026-11-11T17:32:05.000Z',
            '2026-11-11 14:32:05',
            90,
            'não'
          ],
          [
            'r2',
            'ev-1',
            'est-1',
            'jogo-1',
            '2026-11-11T18:00:00.000Z',
            '2026-11-11 15:00:00',
            12,
            'sim'
          ]
        ]
      }
    })
    expect(res).toEqual({ idsAceitos: ['r1', 'r2'] })
    expect(planilha.linhas).toHaveLength(2)
  })

  it('mesmo lote 2x -> o 2º flush relê e não chama append; 1 linha por id', async () => {
    const planilha = criarPlanilhaFake()
    const sink = criarSink(planilha)
    const lote = [registro({ id: 'r1' }), registro({ id: 'r2' })]

    await sink.flush(lote)
    const res = await sink.flush(lote)

    expect(planilha.get).toHaveBeenCalledTimes(2)
    expect(planilha.append).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ idsAceitos: ['r1', 'r2'] })
    expect(planilha.linhas.map((linha) => linha[0])).toEqual(['r1', 'r2'])
  })

  it('lote misto -> append só com os ids que ainda não estão na planilha', async () => {
    const planilha = criarPlanilhaFake([['r1', 'ev-1', 'est-1', 'jogo-1']])
    const sink = criarSink(planilha)

    const res = await sink.flush([registro({ id: 'r1' }), registro({ id: 'r2' })])

    expect(planilha.append).toHaveBeenCalledTimes(1)
    const valores = planilha.append.mock.calls[0][0].requestBody.values
    expect(valores).toHaveLength(1)
    expect(valores[0][0]).toBe('r2')
    expect(res).toEqual({ idsAceitos: ['r1', 'r2'] })
    expect(planilha.linhas).toHaveLength(2)
  })

  it('id repetido dentro do lote -> 1 linha (fica o primeiro) e idsAceitos sem repetição', async () => {
    const planilha = criarPlanilhaFake()
    const sink = criarSink(planilha)

    const res = await sink.flush([
      registro({ id: 'r1', jogoId: 'primeiro' }),
      registro({ id: 'r1', jogoId: 'segundo' })
    ])

    const valores = planilha.append.mock.calls[0][0].requestBody.values
    expect(valores).toHaveLength(1)
    expect(valores[0][3]).toBe('primeiro')
    expect(res).toEqual({ idsAceitos: ['r1'] })
    expect(planilha.linhas).toHaveLength(1)
  })

  it('get rejeita -> flush rejeita sem chamar append', async () => {
    const planilha = criarPlanilhaFake()
    planilha.get.mockRejectedValueOnce(new Error('falha ao ler'))
    const sink = criarSink(planilha)

    await expect(sink.flush([registro()])).rejects.toThrow('falha ao ler')
    expect(planilha.append).not.toHaveBeenCalled()
  })

  it('append rejeita -> flush rejeita', async () => {
    const planilha = criarPlanilhaFake()
    planilha.append.mockRejectedValueOnce(new Error('falha ao gravar'))
    const sink = criarSink(planilha)

    await expect(sink.flush([registro()])).rejects.toThrow('falha ao gravar')
  })

  it('retomada: append aplica e depois rejeita; o flush seguinte não duplica', async () => {
    const planilha = criarPlanilhaFake()
    planilha.append.mockImplementationOnce(async (params: AppendParams) => {
      aplicarAppend(planilha.linhas, params)
      throw new Error('conexão caiu depois de gravar')
    })
    const sink = criarSink(planilha)

    await expect(sink.flush([registro()])).rejects.toThrow('conexão caiu depois de gravar')
    const res = await sink.flush([registro()])

    expect(planilha.append).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ idsAceitos: ['r1'] })
    expect(planilha.linhas).toHaveLength(1)
  })

  it('lote vazio -> nenhuma chamada à API', async () => {
    const planilha = criarPlanilhaFake()
    const sink = criarSink(planilha)

    await expect(sink.flush([])).resolves.toEqual({ idsAceitos: [] })
    expect(planilha.get).not.toHaveBeenCalled()
    expect(planilha.append).not.toHaveBeenCalled()
  })

  it('sem cabeçalho: o id que caiu na linha 1 ainda bloqueia o reenvio; o rótulo `id` nunca conta como id', async () => {
    // O fake respeita a faixa pedida, como a API real: `A2:A` pularia a linha 1.
    const linhas: string[][] = [['r1']]
    const get = vi.fn<SheetsGet>(async ({ range }) => ({
      data: { values: (range.endsWith('A2:A') ? linhas.slice(1) : linhas).map((l) => [...l]) }
    }))
    const append = vi.fn<SheetsAppend>(async (params) => aplicarAppend(linhas, params))
    const sink = createSheetsAnalyticsSink({
      sheets: { spreadsheets: { values: { get, append } } },
      spreadsheetId: 'planilha-teste',
      timeZone: TZ
    })

    await expect(sink.flush([registro({ id: 'r1' })])).resolves.toEqual({ idsAceitos: ['r1'] })
    expect(append).not.toHaveBeenCalled()

    linhas.unshift(['id'])
    await sink.flush([registro({ id: 'r2' })])
    expect(linhas.map((l) => l[0])).toEqual(['id', 'r1', 'r2'])
  })
})

describe('formatação das colunas', () => {
  it('formatarInicioLocal converte UTC para o fuso da Estação', () => {
    expect(formatarInicioLocal('2026-11-11T17:32:05.000Z', 'America/Recife')).toBe(
      '2026-11-11 14:32:05'
    )
  })

  it('registroParaLinha põe as colunas A..H na ordem e marca incompleta', () => {
    expect(registroParaLinha(registro(), 'UTC')).toEqual([
      'r1',
      'ev-1',
      'est-1',
      'jogo-1',
      '2026-11-11T17:32:05.000Z',
      '2026-11-11 17:32:05',
      90,
      'não'
    ])
    expect(registroParaLinha(registro({ incompleta: true }), 'UTC')[7]).toBe('sim')
  })
})

describe('criarSinkPadrao', () => {
  it('sem config/app-config.json -> AnalyticsNaoConfiguradoError', async () => {
    const dir = tmpDir()
    await expect(criarSinkPadrao(dir)).rejects.toThrow(AnalyticsNaoConfiguradoError)
  })

  it('id configurado e sem credentials.json -> CredencialAusenteError', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(
      join(dir, 'config', 'app-config.json'),
      JSON.stringify({ analyticsSpreadsheetId: 'planilha-de-teste' })
    )

    await expect(criarSinkPadrao(dir)).rejects.toThrow(CredencialAusenteError)
  })
})
