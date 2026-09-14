import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Catalogo } from '@shared/types'
import { writeJsonAtomic } from '../store/atomic-write'
import { CatalogoSchema } from './schema'

// `catalog.json` em `userData/catalog/`
export function catalogPath(baseDir: string): string {
  return join(baseDir, 'catalog', 'catalog.json')
}

// Ausente/corrompido == `null`, nunca lança.
export async function readCatalogoCache(baseDir: string): Promise<Catalogo | null> {
  let raw: string
  try {
    raw = await readFile(catalogPath(baseDir), 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error('[catalog] catalog.json corrompido (JSON inválido), tratando como sem Cache:', err)
    return null
  }

  const result = CatalogoSchema.safeParse(parsed)
  if (!result.success) {
    console.error(
      '[catalog] catalog.json corrompido (shape inválido), tratando como sem Cache:',
      result.error.message
    )
    return null
  }
  return result.data
}

export async function writeCatalogoCache(baseDir: string, catalogo: Catalogo): Promise<void> {
  await writeJsonAtomic(catalogPath(baseDir), catalogo)
}
