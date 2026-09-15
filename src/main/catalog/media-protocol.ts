import { readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { KEBAB_CASE_RE } from './schema'

const TIPO_RE = /^(?:capa|hero|logo|detalhe-\d+)$/

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export interface ResolvedMediaAsset {
  path: string
  contentType: string
}

export interface ForjaMediaRequest {
  id: string
  tipo: string
}

export function parseForjaMediaUrl(rawUrl: string): ForjaMediaRequest | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.hostname !== 'media') return null

  const segmentos = url.pathname.split('/').filter(Boolean)
  if (segmentos.length !== 2) return null

  const [id, tipo] = segmentos
  return { id, tipo }
}

export async function resolveMediaAsset(
  mediaBaseDir: string,
  id: string,
  tipo: string
): Promise<ResolvedMediaAsset | null> {
  if (!KEBAB_CASE_RE.test(id) || !TIPO_RE.test(tipo)) return null

  const jogoDir = join(mediaBaseDir, id)
  // defesa extra
  if (resolve(jogoDir) !== resolve(mediaBaseDir, id)) return null

  let entries: string[]
  try {
    entries = await readdir(jogoDir)
  } catch {
    return null
  }

  for (const entry of entries) {
    const ext = extname(entry)
    if (basename(entry, ext) !== tipo) continue
    const contentType = IMAGE_CONTENT_TYPES[ext.toLowerCase()]
    if (!contentType) continue
    return { path: join(jogoDir, entry), contentType }
  }

  return null
}
