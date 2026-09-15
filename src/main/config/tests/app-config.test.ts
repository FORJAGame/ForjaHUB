import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appConfigPath,
  BUILD_MEDIA_FOLDER_ID,
  BUILD_SPREADSHEET_ID,
  resolveMediaFolderId,
  resolveSpreadsheetId
} from '../app-config'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-app-config-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('resolveSpreadsheetId', () => {
  it('sem app-config.json -> BUILD_SPREADSHEET_ID (placeholder de build)', async () => {
    await expect(resolveSpreadsheetId(tmpDir())).resolves.toBe(BUILD_SPREADSHEET_ID)
  })

  it('override real em app-config.json -> devolve o spreadsheetId do arquivo', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), JSON.stringify({ spreadsheetId: 'sheet-real-123' }))
    await expect(resolveSpreadsheetId(dir)).resolves.toBe('sheet-real-123')
  })

  it('JSON inválido -> BUILD_SPREADSHEET_ID, não lança', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), '{ nem json')
    await expect(resolveSpreadsheetId(dir)).resolves.toBe(BUILD_SPREADSHEET_ID)
  })

  it('shape inválido (spreadsheetId vazio) -> BUILD_SPREADSHEET_ID', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), JSON.stringify({ spreadsheetId: '' }))
    await expect(resolveSpreadsheetId(dir)).resolves.toBe(BUILD_SPREADSHEET_ID)
  })

  it('app-config.json sem a chave spreadsheetId -> BUILD_SPREADSHEET_ID', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), JSON.stringify({ outraCoisa: true }))
    await expect(resolveSpreadsheetId(dir)).resolves.toBe(BUILD_SPREADSHEET_ID)
  })
})

describe('resolveMediaFolderId (espelha resolveSpreadsheetId)', () => {
  it('sem app-config.json -> BUILD_MEDIA_FOLDER_ID (placeholder de build)', async () => {
    await expect(resolveMediaFolderId(tmpDir())).resolves.toBe(BUILD_MEDIA_FOLDER_ID)
  })

  it('override real em app-config.json -> devolve o driveMediaFolderId do arquivo', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), JSON.stringify({ driveMediaFolderId: 'drive-media-real-123' }))
    await expect(resolveMediaFolderId(dir)).resolves.toBe('drive-media-real-123')
  })

  it('os dois overrides convivem no mesmo app-config.json', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(
      appConfigPath(dir),
      JSON.stringify({ spreadsheetId: 'sheet-real-123', driveMediaFolderId: 'drive-media-real-123' })
    )
    await expect(resolveSpreadsheetId(dir)).resolves.toBe('sheet-real-123')
    await expect(resolveMediaFolderId(dir)).resolves.toBe('drive-media-real-123')
  })

  it('shape inválido (driveMediaFolderId vazio) -> BUILD_MEDIA_FOLDER_ID', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'config'), { recursive: true })
    writeFileSync(appConfigPath(dir), JSON.stringify({ driveMediaFolderId: '' }))
    await expect(resolveMediaFolderId(dir)).resolves.toBe(BUILD_MEDIA_FOLDER_ID)
  })
})
