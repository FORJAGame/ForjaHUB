import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeJsonAtomic } from '../atomic-write'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-store-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('writeJsonAtomic', () => {
  it('grava JSON legível no destino', async () => {
    const dir = tmpDir()
    const file = join(dir, 'station.json')
    await writeJsonAtomic(file, { estacaoId: 'tv-principal' })
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ estacaoId: 'tv-principal' })
  })

  it('não deixa arquivo temp para trás após sucesso', async () => {
    const dir = tmpDir()
    await writeJsonAtomic(join(dir, 'station.json'), { a: 1 })
    expect(readdirSync(dir)).toEqual(['station.json'])
  })

  it('cria o diretório se não existir', async () => {
    const dir = tmpDir()
    const file = join(dir, 'nested', 'station.json')
    await writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ a: 1 })
  })

  it('preserva o arquivo original e não deixa temp se o rename falhar', async () => {
    const dir = tmpDir()
    const file = join(dir, 'station.json')
    writeFileSync(file, JSON.stringify({ estacaoId: 'original' }))

    const failingRename = vi.fn().mockRejectedValue(new Error('disco cheio'))

    await expect(
      writeJsonAtomic(file, { estacaoId: 'novo' }, { rename: failingRename })
    ).rejects.toThrow('disco cheio')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ estacaoId: 'original' })
    expect(readdirSync(dir)).toEqual(['station.json'])
  })
})
