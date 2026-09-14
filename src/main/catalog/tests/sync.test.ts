import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SheetsValuesClient } from '../sheets-adapter'
import { catalogPath } from '../cache'
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

function fakeClient(get: SheetsValuesClient['spreadsheets']['values']['get']): SheetsValuesClient {
  return { spreadsheets: { values: { get } } }
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
    const result = await sync([], { baseDir, sheetsClient: fakeClient(get) })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
    expect(get).not.toHaveBeenCalled()
  })

  it('happy path: sync completa, catalog.json gravado atomicamente', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA] } })
    const result = await sync([], { baseDir, spreadsheetId: 'sheet-1', sheetsClient: fakeClient(get) })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalogo.jogos).toHaveLength(1)
    expect(result.catalogo.jogos[0]).toMatchObject({ id: 'jogo-a', titulo: 'Jogo A' })
    expect(typeof result.catalogo.sincronizadoEm).toBe('string')

    const persisted = JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))
    expect(persisted).toEqual(result.catalogo)
  })

  it('linha inválida -> CATALOGO_INVALIDO, Cache anterior preservado intocado', async () => {
    const baseDir = tmpDir()
    mkdirSync(join(baseDir, 'catalog'), { recursive: true })
    const cacheAnterior = { jogos: [], sincronizadoEm: '2020-01-01T00:00:00.000Z' }
    writeFileSync(catalogPath(baseDir), JSON.stringify(cacheAnterior))

    const get = vi.fn().mockResolvedValue({ data: { values: [HEADER, LINHA_VALIDA, LINHA_INVALIDA] } })
    const result = await sync([], { baseDir, spreadsheetId: 'sheet-1', sheetsClient: fakeClient(get) })

    expect(result).toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
  })

  it('falha de rede/API -> CATALOGO_INDISPONIVEL', async () => {
    const baseDir = tmpDir()
    const get = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    const result = await sync([], { baseDir, spreadsheetId: 'sheet-1', sheetsClient: fakeClient(get) })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  })

  it('credencial real é lida do disco quando nenhum sheetsClient é injetado', async () => {
    const baseDir = tmpDir()
    writeCredentials(baseDir)
    // Sem sheetsClient injetado e sem rede real disponível nos testes: a
    // credencial válida passa da 1ª barreira, mas o cliente `googleapis` real
    // tentaria uma chamada de rede de verdade. `spreadsheetId` vazio garante
    // que abortamos ANTES disso, provando que a credencial foi lida do disco
    // (senão o resultado seria CREDENCIAL_AUSENTE, não CATALOGO_NAO_CONFIGURADO).
    const result = await sync([], { baseDir })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
  })

  it('mutex single-flight: chamada concorrente reusa a mesma Promise e só bate na Planilha uma vez', async () => {
    const baseDir = tmpDir()
    let resolveGet!: (v: { data: { values: string[][] } }) => void
    const get = vi.fn(
      () =>
        new Promise<{ data: { values: string[][] } }>((resolve) => {
          resolveGet = resolve
        })
    )
    const deps = { baseDir, spreadsheetId: 'sheet-1', sheetsClient: fakeClient(get) }

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
    const r3 = await sync([], { ...deps, sheetsClient: fakeClient(get2) })
    expect(r3.ok).toBe(true)
    expect(get2).toHaveBeenCalledTimes(1)
  })
})
