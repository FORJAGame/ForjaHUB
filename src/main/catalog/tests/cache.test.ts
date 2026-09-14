import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Catalogo } from '@shared/types'
import { catalogPath, readCatalogoCache, writeCatalogoCache } from '../cache'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-catalog-cache-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const CATALOGO: Catalogo = {
  jogos: [
    {
      id: 'jogo-a',
      titulo: 'Jogo A',
      ano: 2024,
      guilda: 'Guilda A',
      genero: 'Aventura',
      modalidade: 'single-player',
      sinopse: 'Sinopse.',
      redesUrl: '',
      exeRelativo: 'Jogo.exe'
    }
  ],
  sincronizadoEm: '2026-09-14T00:00:00.000Z'
}

describe('readCatalogoCache', () => {
  it('sem catalog.json -> null (sem Cache)', async () => {
    expect(await readCatalogoCache(tmpDir())).toBeNull()
  })

  it('JSON inválido -> null, não lança', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'catalog'), { recursive: true })
    writeFileSync(catalogPath(dir), '{ nem json')
    await expect(readCatalogoCache(dir)).resolves.toBeNull()
  })

  it('shape inválido -> null', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'catalog'), { recursive: true })
    writeFileSync(catalogPath(dir), JSON.stringify({ jogos: 'não é array' }))
    await expect(readCatalogoCache(dir)).resolves.toBeNull()
  })

  it('lê um Catálogo válido', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'catalog'), { recursive: true })
    writeFileSync(catalogPath(dir), JSON.stringify(CATALOGO))
    await expect(readCatalogoCache(dir)).resolves.toEqual(CATALOGO)
  })
})

describe('writeCatalogoCache', () => {
  it('grava via swap atômico e relê o mesmo valor', async () => {
    const dir = tmpDir()
    await writeCatalogoCache(dir, CATALOGO)
    await expect(readCatalogoCache(dir)).resolves.toEqual(CATALOGO)
  })
})
