import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OPERATOR_PREFS_SCHEMA_VERSION,
  readOperatorPrefs,
  writeOperatorPrefs
} from '../operator-prefs'
import { createStore } from '../index'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-operator-prefs-'))
  dirs.push(d)
  return d
}

function prefsPath(dir: string): string {
  return join(dir, 'operator-prefs.json')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('operator-prefs', () => {
  it('arquivo ausente ⇒ { sfxMudo: false }', async () => {
    expect(await readOperatorPrefs(prefsPath(tmpDir()))).toEqual({ sfxMudo: false })
  })

  it('writeOperatorPrefs + readOperatorPrefs devolve o que foi gravado (true e false)', async () => {
    const file = prefsPath(tmpDir())

    await writeOperatorPrefs(file, { sfxMudo: true })
    expect(await readOperatorPrefs(file)).toEqual({ sfxMudo: true })

    await writeOperatorPrefs(file, { sfxMudo: false })
    expect(await readOperatorPrefs(file)).toEqual({ sfxMudo: false })
  })

  it('o arquivo gravado é JSON com schemaVersion 1 e não sobra temporário no diretório', async () => {
    const dir = tmpDir()
    await writeOperatorPrefs(prefsPath(dir), { sfxMudo: true })

    const gravado = JSON.parse(readFileSync(prefsPath(dir), 'utf-8'))
    expect(gravado).toEqual({ schemaVersion: OPERATOR_PREFS_SCHEMA_VERSION, sfxMudo: true })
    expect(OPERATOR_PREFS_SCHEMA_VERSION).toBe(1)
    expect(readdirSync(dir)).toEqual(['operator-prefs.json'])
  })

  it('JSON inválido, shape errado e schemaVersion 2 ⇒ { sfxMudo: false }, sem lançar', async () => {
    const dir = tmpDir()

    writeFileSync(prefsPath(dir), '{ isso não é json')
    await expect(readOperatorPrefs(prefsPath(dir))).resolves.toEqual({ sfxMudo: false })

    writeFileSync(prefsPath(dir), JSON.stringify({ schemaVersion: 1, sfxMudo: 'sim' }))
    await expect(readOperatorPrefs(prefsPath(dir))).resolves.toEqual({ sfxMudo: false })

    writeFileSync(prefsPath(dir), JSON.stringify({ schemaVersion: 2, sfxMudo: true }))
    await expect(readOperatorPrefs(prefsPath(dir))).resolves.toEqual({ sfxMudo: false })
  })

  it('pela porta: createStore({ baseDir }) grava em <baseDir>/operator-prefs.json e não toca em station.json', async () => {
    const dir = tmpDir()
    const stationAntes = '{"estacaoId":"tv-1","schemaVersion":1}'
    writeFileSync(join(dir, 'station.json'), stationAntes)

    const store = createStore({ baseDir: dir })
    await store.gravarPrefsOperador({ sfxMudo: true })

    expect(existsSync(prefsPath(dir))).toBe(true)
    expect(JSON.parse(readFileSync(prefsPath(dir), 'utf-8'))).toEqual({
      schemaVersion: 1,
      sfxMudo: true
    })
    expect(await store.lerPrefsOperador()).toEqual({ sfxMudo: true })
    expect(readFileSync(join(dir, 'station.json'), 'utf-8')).toBe(stationAntes)
  })
})
