import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CredencialAusenteError,
  loadServiceAccountCredentials,
  wrapDriveClient,
  wrapSheetsClient,
  type RawDriveClient,
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

describe('wrapDriveClient (mapeamento de resposta, sem SDK/rede real)', () => {
  it('listFolder monta a query por parents/trashed e devolve id/name', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [{ id: 'f1', name: 'jogo-a' }] } })
    const raw: RawDriveClient = { files: { list, get: vi.fn() } }

    const drive = wrapDriveClient(raw)
    const entries = await drive.listFolder('pasta-raiz')

    expect(list).toHaveBeenCalledWith({
      q: "'pasta-raiz' in parents and trashed = false",
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000
    })
    expect(entries).toEqual([{ id: 'f1', name: 'jogo-a' }])
  })

  it('escapa aspas simples no folderId antes de montar a query `q`', async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } })
    const raw: RawDriveClient = { files: { list, get: vi.fn() } }

    await wrapDriveClient(raw).listFolder("pasta' OR '1'='1")

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ q: "'pasta\\' OR \\'1\\'=\\'1' in parents and trashed = false" })
    )
  })

  it('segue nextPageToken até esgotar (pasta com mais de uma página)', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: { files: [{ id: 'f1', name: 'pagina-1' }], nextPageToken: 'token-2' } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'f2', name: 'pagina-2' }], nextPageToken: null } })
    const raw: RawDriveClient = { files: { list, get: vi.fn() } }

    const entries = await wrapDriveClient(raw).listFolder('pasta-raiz')

    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenNthCalledWith(1, expect.not.objectContaining({ pageToken: expect.anything() }))
    expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'token-2' }))
    expect(entries).toEqual([
      { id: 'f1', name: 'pagina-1' },
      { id: 'f2', name: 'pagina-2' }
    ])
  })

  it('listFolder filtra entradas sem id/name (resposta malformada)', async () => {
    const list = vi.fn().mockResolvedValue({
      data: { files: [{ id: 'f1', name: 'ok' }, { id: null, name: 'sem-id' }, { id: 'f2' }] }
    })
    const raw: RawDriveClient = { files: { list, get: vi.fn() } }

    const entries = await wrapDriveClient(raw).listFolder('pasta-raiz')
    expect(entries).toEqual([{ id: 'f1', name: 'ok' }])
  })

  it('listFolder sem files na resposta -> array vazio', async () => {
    const raw: RawDriveClient = { files: { list: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn() } }
    await expect(wrapDriveClient(raw).listFolder('pasta-raiz')).resolves.toEqual([])
  })

  it('downloadFile pede alt=media/responseType=arraybuffer e devolve Buffer', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    const get = vi.fn().mockResolvedValue({ data: bytes })
    const raw: RawDriveClient = { files: { list: vi.fn(), get } }

    const buffer = await wrapDriveClient(raw).downloadFile('file-1')

    expect(get).toHaveBeenCalledWith({ fileId: 'file-1', alt: 'media' }, { responseType: 'arraybuffer' })
    expect(buffer).toBeInstanceOf(Buffer)
    expect([...buffer]).toEqual([1, 2, 3])
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
