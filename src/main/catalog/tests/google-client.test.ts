import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CredencialAusenteError,
  loadServiceAccountCredentials,
  wrapSheetsClient,
  type RawSheetsClient
} from '../google-client'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-google-client-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('wrapSheetsClient (mapeamento de resposta, sem SDK/rede real)', () => {
  it('repassa spreadsheetId/range pro client bruto e devolve os values como vieram', async () => {
    const get = vi.fn().mockResolvedValue({ data: { values: [['a', 'b']] } })
    const raw: RawSheetsClient = { spreadsheets: { values: { get } } }

    const sheets = wrapSheetsClient(raw)
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: 'sheet-1', range: 'A1:Z1000' })

    expect(get).toHaveBeenCalledWith({ spreadsheetId: 'sheet-1', range: 'A1:Z1000' })
    expect(res).toEqual({ data: { values: [['a', 'b']] } })
  })

  it('res.data.values ausente (undefined) -> mapeia pra null, não undefined', async () => {
    const raw: RawSheetsClient = { spreadsheets: { values: { get: vi.fn().mockResolvedValue({ data: {} }) } } }
    const sheets = wrapSheetsClient(raw)
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: 'sheet-1', range: 'A1:Z1000' })
    expect(res).toEqual({ data: { values: null } })
  })

  it('res.data.values null -> continua null', async () => {
    const raw: RawSheetsClient = {
      spreadsheets: { values: { get: vi.fn().mockResolvedValue({ data: { values: null } }) } }
    }
    const sheets = wrapSheetsClient(raw)
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: 'sheet-1', range: 'A1:Z1000' })
    expect(res).toEqual({ data: { values: null } })
  })

  it('planilha vazia (só header, sem linhas) -> array vazio passa direto', async () => {
    const raw: RawSheetsClient = {
      spreadsheets: { values: { get: vi.fn().mockResolvedValue({ data: { values: [] } }) } }
    }
    const sheets = wrapSheetsClient(raw)
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: 'sheet-1', range: 'A1:Z1000' })
    expect(res).toEqual({ data: { values: [] } })
  })
})

describe('loadServiceAccountCredentials', () => {
  it('arquivo ausente -> CredencialAusenteError', async () => {
    const dir = tmpDir()
    await expect(loadServiceAccountCredentials(join(dir, 'credentials.json'))).rejects.toThrow(
      CredencialAusenteError
    )
  })

  it('JSON inválido -> CredencialAusenteError', async () => {
    const dir = tmpDir()
    const file = join(dir, 'credentials.json')
    writeFileSync(file, '{ nem json')
    await expect(loadServiceAccountCredentials(file)).rejects.toThrow(CredencialAusenteError)
  })

  it('faltando client_email/private_key -> CredencialAusenteError', async () => {
    const dir = tmpDir()
    const file = join(dir, 'credentials.json')
    writeFileSync(file, JSON.stringify({ client_email: 'sa@example.com' }))
    await expect(loadServiceAccountCredentials(file)).rejects.toThrow(CredencialAusenteError)
  })

  it('credencial válida -> devolve client_email/private_key lidos do disco', async () => {
    const dir = tmpDir()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'credentials.json')
    writeFileSync(file, JSON.stringify({ client_email: 'sa@example.com', private_key: 'chave-secreta' }))
    await expect(loadServiceAccountCredentials(file)).resolves.toEqual({
      client_email: 'sa@example.com',
      private_key: 'chave-secreta'
    })
  })
})
