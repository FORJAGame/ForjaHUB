import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  SchemaIncompativelError,
  readConfigEstacao,
  runMigrations,
  writeConfigEstacao
} from '../config-estacao'

const dirs: string[] = []
function tmpFile(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-config-estacao-'))
  dirs.push(d)
  return join(d, 'station.json')
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('readConfigEstacao', () => {
  it('sem arquivo -> null (1º boot)', async () => {
    expect(await readConfigEstacao(tmpFile())).toBeNull()
  })

  it('JSON inválido -> null (1º boot), não lança', async () => {
    const file = tmpFile()
    writeFileSync(file, '{ isso não é json')
    await expect(readConfigEstacao(file)).resolves.toBeNull()
  })

  it('shape inválido -> null (1º boot)', async () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ estacaoId: 'tv', schemaVersion: 1 }))
    await expect(readConfigEstacao(file)).resolves.toBeNull()
  })

  it('lê um ConfigEstacao válido', async () => {
    const file = tmpFile()
    const config = {
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a'],
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
    writeFileSync(file, JSON.stringify(config))
    await expect(readConfigEstacao(file)).resolves.toEqual(config)
  })

  it('schemaVersion maior que a suportada -> lança, sem tocar no arquivo', async () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ schemaVersion: 999 }))
    await expect(readConfigEstacao(file)).rejects.toThrow(SchemaIncompativelError)
  })

  it('aplica a escada de migração injetada até a versão atual', async () => {
    const file = tmpFile()
    writeFileSync(file, JSON.stringify({ estacaoId: 'tv', schemaVersion: 0 }))
    const migrations = {
      0: (data: unknown) => ({
        ...(data as Record<string, unknown>),
        eventoId: 'recnplay-2026',
        jogosSelecionados: ['jogo-a'],
        schemaVersion: 1
      })
    }
    await expect(readConfigEstacao(file, migrations)).resolves.toEqual({
      estacaoId: 'tv',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a'],
      schemaVersion: 1
    })
  })
})

describe('runMigrations', () => {
  it('sem ladder registrada, devolve os dados sem mudar', () => {
    expect(runMigrations({ a: 1 }, 1)).toEqual({ a: 1 })
  })

  it('para na primeira versão sem migração registrada', () => {
    const migrations = { 0: (d: unknown) => ({ ...(d as object), touched: true }) }
    // fromVersion 0 com CURRENT=1: aplica só a migração da versão 0
    expect(runMigrations({ a: 1 }, 0, migrations)).toEqual({ a: 1, touched: true })
  })
})

describe('writeConfigEstacao', () => {
  it('persiste e relê o mesmo valor', async () => {
    const file = tmpFile()
    const config = {
      estacaoId: 'tv-principal',
      eventoId: 'recnplay-2026',
      jogosSelecionados: ['jogo-a', 'jogo-b'],
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
    await writeConfigEstacao(file, config)
    await expect(readConfigEstacao(file)).resolves.toEqual(config)
  })
})
