import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo } from '@shared/types'
import {
  catalogPath,
  cleanupOrphanedCacheDirs,
  commitStagingCatalog,
  currentDir,
  mediaDir,
  newStagingDir,
  readCatalogoCache
} from '../cache'

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
      exeRelativo: 'Jogo.exe',
      detalheImagens: ['detalhe-1']
    }
  ],
  sincronizadoEm: '2026-09-14T00:00:00.000Z'
}

function montarStaging(baseDir: string, catalogo: Catalogo): string {
  const staging = newStagingDir(baseDir)
  mkdirSync(staging, { recursive: true })
  writeFileSync(join(staging, 'catalog.json'), JSON.stringify(catalogo))
  mkdirSync(join(staging, 'media', 'jogo-a'), { recursive: true })
  writeFileSync(join(staging, 'media', 'jogo-a', 'capa.png'), 'fake-png-bytes')
  return staging
}

describe('paths sob current/', () => {
  it('catalogPath/mediaDir ficam sob catalog/current/', () => {
    const dir = tmpDir()
    expect(catalogPath(dir)).toBe(join(currentDir(dir), 'catalog.json'))
    expect(mediaDir(dir)).toBe(join(currentDir(dir), 'media'))
  })
})

describe('readCatalogoCache', () => {
  it('sem catalog.json -> null (sem Cache)', async () => {
    expect(await readCatalogoCache(tmpDir())).toBeNull()
  })

  it('JSON inválido -> null, não lança', async () => {
    const dir = tmpDir()
    mkdirSync(currentDir(dir), { recursive: true })
    writeFileSync(catalogPath(dir), '{ nem json')
    await expect(readCatalogoCache(dir)).resolves.toBeNull()
  })

  it('shape inválido -> null', async () => {
    const dir = tmpDir()
    mkdirSync(currentDir(dir), { recursive: true })
    writeFileSync(catalogPath(dir), JSON.stringify({ jogos: 'não é array' }))
    await expect(readCatalogoCache(dir)).resolves.toBeNull()
  })

  it('jogo sem detalheImagens (mídia incompleta) -> shape inválido, null', async () => {
    const dir = tmpDir()
    mkdirSync(currentDir(dir), { recursive: true })
    const semMidia = { jogos: [{ ...CATALOGO.jogos[0], detalheImagens: [] }], sincronizadoEm: CATALOGO.sincronizadoEm }
    writeFileSync(catalogPath(dir), JSON.stringify(semMidia))
    await expect(readCatalogoCache(dir)).resolves.toBeNull()
  })

  it('lê um Catálogo válido', async () => {
    const dir = tmpDir()
    mkdirSync(currentDir(dir), { recursive: true })
    writeFileSync(catalogPath(dir), JSON.stringify(CATALOGO))
    await expect(readCatalogoCache(dir)).resolves.toEqual(CATALOGO)
  })
})

describe('commitStagingCatalog (swap atômico do diretório inteiro)', () => {
  it('1º sync (sem current/ anterior): staging vira current/', async () => {
    const dir = tmpDir()
    const staging = montarStaging(dir, CATALOGO)
    await commitStagingCatalog(dir, staging)

    await expect(readCatalogoCache(dir)).resolves.toEqual(CATALOGO)
    expect(readFileSync(join(mediaDir(dir), 'jogo-a', 'capa.png'), 'utf-8')).toBe('fake-png-bytes')
  })

  it('sync subsequente: current/ anterior é substituído por completo (json+mídia)', async () => {
    const dir = tmpDir()
    const staging1 = montarStaging(dir, CATALOGO)
    await commitStagingCatalog(dir, staging1)

    const catalogo2: Catalogo = { ...CATALOGO, sincronizadoEm: '2026-09-15T00:00:00.000Z' }
    const staging2 = newStagingDir(dir)
    mkdirSync(staging2, { recursive: true })
    writeFileSync(join(staging2, 'catalog.json'), JSON.stringify(catalogo2))
    mkdirSync(join(staging2, 'media', 'jogo-a'), { recursive: true })
    writeFileSync(join(staging2, 'media', 'jogo-a', 'capa.png'), 'novo-png-bytes')

    await commitStagingCatalog(dir, staging2)

    await expect(readCatalogoCache(dir)).resolves.toEqual(catalogo2)
    expect(readFileSync(join(mediaDir(dir), 'jogo-a', 'capa.png'), 'utf-8')).toBe('novo-png-bytes')
  })
})

describe('cleanupOrphanedCacheDirs', () => {
  it('sujeira normal: remove current.previous-*, mantém current/ intacto', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    mkdirSync(join(catalogDir, 'current'), { recursive: true })
    writeFileSync(join(catalogDir, 'current', 'marker'), 'ok')
    mkdirSync(join(catalogDir, 'current.previous-123-1-aaaa'), { recursive: true })

    await cleanupOrphanedCacheDirs(dir)

    const remaining = readdirSync(catalogDir).sort()
    expect(remaining).toEqual(['current'])
    expect(readFileSync(join(catalogDir, 'current', 'marker'), 'utf-8')).toBe('ok')
  })

  it('crash no meio do build do staging: remove staging-* órfão', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    mkdirSync(join(catalogDir, 'staging-123-1-aaaa'), { recursive: true })

    await cleanupOrphanedCacheDirs(dir)

    expect(readdirSync(catalogDir)).toEqual([])
  })

  it('restauração pós-falha também falhou: remove current.previous-* mesmo sem current/', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    mkdirSync(join(catalogDir, 'current.previous-123-1-aaaa'), { recursive: true })

    await cleanupOrphanedCacheDirs(dir)

    expect(readdirSync(catalogDir)).toEqual([])
  })

  it('1º boot: catalog/ ausente -> resolve sem lançar, no-op', async () => {
    const dir = tmpDir()
    await expect(cleanupOrphanedCacheDirs(dir)).resolves.toBeUndefined()
  })

  it('readdir falha com erro real (não ENOENT): loga e resolve sem lançar', async () => {
    const dir = tmpDir()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const readdirMock = vi.fn(async () => {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      })

      await expect(
        cleanupOrphanedCacheDirs(dir, { readdir: readdirMock as unknown as typeof import('node:fs/promises').readdir })
      ).resolves.toBeUndefined()

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('catalog'), expect.any(Error))
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('Acceptance Criterion: current/, current.previous-* e staging-* juntos -> só current/ sobrevive', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    mkdirSync(join(catalogDir, 'current'), { recursive: true })
    writeFileSync(join(catalogDir, 'current', 'marker'), 'ok')
    mkdirSync(join(catalogDir, 'current.previous-123-1-aaaa'), { recursive: true })
    mkdirSync(join(catalogDir, 'staging-456-2-bbbb'), { recursive: true })

    await cleanupOrphanedCacheDirs(dir)

    expect(readdirSync(catalogDir)).toEqual(['current'])
    expect(readFileSync(join(catalogDir, 'current', 'marker'), 'utf-8')).toBe('ok')
  })

  it('órfão populado (catalog.json + media/<id>/*.png) é removido recursivamente por completo', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    montarStaging(dir, CATALOGO) // staging-* populado sob catalog/, nunca commitado -> fica órfão

    await cleanupOrphanedCacheDirs(dir)

    expect(readdirSync(catalogDir)).toEqual([])
  })

  it('entrada presa: falha ao remover uma entrada loga e segue removendo as demais', async () => {
    const dir = tmpDir()
    const catalogDir = join(dir, 'catalog')
    mkdirSync(join(catalogDir, 'staging-presa'), { recursive: true })
    mkdirSync(join(catalogDir, 'staging-livre'), { recursive: true })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const rm = vi.fn(async (path: string, opts: unknown) => {
        if (path.includes('staging-presa')) throw new Error('EBUSY: resource busy or locked')
        const { rm: realRm } = await import('node:fs/promises')
        return realRm(path, opts as Parameters<typeof realRm>[1])
      })

      await cleanupOrphanedCacheDirs(dir, { rm: rm as unknown as typeof import('node:fs/promises').rm })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('staging-presa'),
        expect.any(Error)
      )
      const remaining = readdirSync(catalogDir).sort()
      expect(remaining).toEqual(['staging-presa'])
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
