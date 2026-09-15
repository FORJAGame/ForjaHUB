import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DriveMediaClient } from '../google-client'
import type { SheetsValuesClient } from '../sheets-adapter'
import { catalogPath, mediaDir } from '../cache'
import { sync } from '../sync'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-catalog-sync-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function writeCredentials(baseDir: string): void {
  mkdirSync(join(baseDir, 'config'), { recursive: true })
  writeFileSync(
    join(baseDir, 'config', 'credentials.json'),
    JSON.stringify({ client_email: 'sa@example.com', private_key: 'chave' })
  )
}

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

const LINHA_INVALIDA = [
  'jogo-b',
  'Jogo B',
  '2024',
  'Guilda B',
  'Aventura',
  'coop', // fora do enum de modalidade
  'Sinopse.',
  '',
  'Jogo.exe'
]

function fakeSheetsClient(get: SheetsValuesClient['spreadsheets']['values']['get']): SheetsValuesClient {
  return { spreadsheets: { values: { get } } }
}

const MEDIA_FOLDER_ID = 'media-root'

/** Pasta Drive completa: capa/hero/logo + detalhe-1 pro `jogo-a`. */
const PASTA_JOGO_A: Array<{ id: string; name: string }> = [
  { id: 'f-capa', name: 'capa.png' },
  { id: 'f-hero', name: 'hero.jpg' },
  { id: 'f-logo', name: 'logo.png' },
  { id: 'f-detalhe-1', name: 'detalhe-1.png' }
]

function fakeDriveClient(
  folders: Record<string, Array<{ id: string; name: string }>>,
  overrides: Partial<DriveMediaClient> = {}
): DriveMediaClient {
  return {
    listFolder: overrides.listFolder ?? (async (folderId) => folders[folderId] ?? []),
    downloadFile: overrides.downloadFile ?? (async () => Buffer.from('fake-bytes'))
  }
}

function driveCompleta(): DriveMediaClient {
  return fakeDriveClient({
    [MEDIA_FOLDER_ID]: [{ id: 'sub-jogo-a', name: 'jogo-a' }],
    'sub-jogo-a': PASTA_JOGO_A
  })
}

describe('sync (orquestrador)', () => {
  it('credencial ausente -> CREDENCIAL_AUSENTE, sem chamar a Planilha', async () => {
    const baseDir = tmpDir()
    const result = await sync([], { baseDir })
    expect(result).toEqual({ ok: false, code: 'CREDENCIAL_AUSENTE' })
  })

  it('spreadsheetId não configurado -> CATALOGO_NAO_CONFIGURADO', async () => {
    const baseDir = tmpDir()
    const get = vi.fn()
    const result = await sync([], { baseDir, sheetsClient: fakeSheetsClient(get), driveClient: driveCompleta() })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
    expect(get).not.toHaveBeenCalled()
  })

  it('driveMediaFolderId não configurado -> CATALOGO_NAO_CONFIGURADO, mesmo com spreadsheetId ok', async () => {
    const baseDir = tmpDir()
    const get = vi.fn()
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      sheetsClient: fakeSheetsClient(get),
      driveClient: driveCompleta()
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
    expect(get).not.toHaveBeenCalled()
  })

  it('happy path: sync completa, catalog.json + media/ gravados atomicamente sob current/', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: driveCompleta()
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalogo.jogos).toHaveLength(1)
    expect(result.catalogo.jogos[0]).toMatchObject({
      id: 'jogo-a',
      titulo: 'Jogo A',
      detalheImagens: ['detalhe-1']
    })
    expect(typeof result.catalogo.sincronizadoEm).toBe('string')

    const persisted = JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))
    expect(persisted).toEqual(result.catalogo)
    expect(readFileSync(join(mediaDir(baseDir), 'jogo-a', 'capa.png'))).toBeInstanceOf(Buffer)
    expect(readFileSync(join(mediaDir(baseDir), 'jogo-a', 'detalhe-1.png'))).toBeInstanceOf(Buffer)
  })

  it('linha inválida -> CATALOGO_INVALIDO, Cache anterior preservado intocado (mídia nem é tentada)', async () => {
    const baseDir = tmpDir()
    mkdirSync(join(baseDir, 'catalog', 'current'), { recursive: true })
    const cacheAnterior = { jogos: [], sincronizadoEm: '2020-01-01T00:00:00.000Z' }
    writeFileSync(catalogPath(baseDir), JSON.stringify(cacheAnterior))

    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA, LINHA_INVALIDA] } })
    const listFolder = vi.fn()
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: fakeDriveClient({}, { listFolder })
    })

    expect(result).toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
    expect(listFolder).not.toHaveBeenCalled()
  })

  it('falha de rede/API na Planilha -> CATALOGO_INDISPONIVEL', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: driveCompleta()
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  })

  it('asset obrigatório ausente (sem logo.*) -> MIDIA_INDISPONIVEL, Cache anterior preservado', async () => {
    const baseDir = tmpDir()
    mkdirSync(join(baseDir, 'catalog', 'current'), { recursive: true })
    const cacheAnterior = { jogos: [], sincronizadoEm: '2020-01-01T00:00:00.000Z' }
    writeFileSync(catalogPath(baseDir), JSON.stringify(cacheAnterior))

    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const drive = fakeDriveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-jogo-a', name: 'jogo-a' }],
      'sub-jogo-a': PASTA_JOGO_A.filter((f) => !f.name.startsWith('logo'))
    })
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: drive
    })

    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
  })

  it('pasta de mídia ausente pro Jogo -> MIDIA_INDISPONIVEL', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const drive = fakeDriveClient({ [MEDIA_FOLDER_ID]: [] })
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: drive
    })
    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
  })

  it('download de um asset falha (rede) -> MIDIA_INDISPONIVEL', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const drive = fakeDriveClient(
      { [MEDIA_FOLDER_ID]: [{ id: 'sub-jogo-a', name: 'jogo-a' }], 'sub-jogo-a': PASTA_JOGO_A },
      { downloadFile: async () => Promise.reject(new Error('ETIMEDOUT')) }
    )
    const result = await sync([], {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: drive
    })
    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
  })

  it('credencial real é lida do disco quando nenhum client é injetado', async () => {
    const baseDir = tmpDir()
    writeCredentials(baseDir)
    // Sem sheetsClient/driveClient injetados e sem rede real disponível nos testes: a
    // credencial válida passa da 1ª barreira, mas o cliente `googleapis` real
    // tentaria uma chamada de rede de verdade. `spreadsheetId` vazio garante
    // que abortamos ANTES disso, provando que a credencial foi lida do disco
    // (senão o resultado seria CREDENCIAL_AUSENTE, não CATALOGO_NAO_CONFIGURADO).
    const result = await sync([], { baseDir })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
  })

  it.each([
    { sheetsClient: fakeSheetsClient(vi.fn()), driveClient: undefined },
    { sheetsClient: undefined, driveClient: driveCompleta() }
  ])(
    'injeção assimétrica (só sheetsClient OU só driveClient) -> lança erro, nunca cai pro client real',
    async (deps) => {
      const baseDir = tmpDir()
      await expect(
        sync([], { baseDir, spreadsheetId: 'sheet-1', mediaFolderId: MEDIA_FOLDER_ID, ...deps })
      ).rejects.toThrow(/sheetsClient e driveClient precisam ser injetados juntos/)
    }
  )

  it('mutex single-flight: chamada concorrente reusa a mesma Promise e só bate na Planilha uma vez', async () => {
    const baseDir = tmpDir()
    let resolveGet!: (v: { data: { values: string[][] } }) => void
    const get = vi.fn(
      () =>
        new Promise<{ data: { values: string[][] } }>((resolve) => {
          resolveGet = resolve
        })
    )
    const deps = {
      baseDir,
      spreadsheetId: 'sheet-1',
      mediaFolderId: MEDIA_FOLDER_ID,
      sheetsClient: fakeSheetsClient(get),
      driveClient: driveCompleta()
    }

    const p1 = sync([], deps)
    const p2 = sync([], deps)
    expect(p1).toBe(p2)

    resolveGet({ data: { values: [HEADER, LINHA_VALIDA] } })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(r2)
    expect(r1.ok).toBe(true)
    expect(get).toHaveBeenCalledTimes(1)

    // Depois de resolvido, o mutex libera: uma 3ª chamada dispara um novo fetch.
    const get2 = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const r3 = await sync([], { ...deps, sheetsClient: fakeSheetsClient(get2), driveClient: driveCompleta() })
    expect(r3.ok).toBe(true)
    expect(get2).toHaveBeenCalledTimes(1)
  })
})
