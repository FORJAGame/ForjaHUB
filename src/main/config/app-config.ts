import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const BUILD_SUPABASE_URL = import.meta.env.MAIN_VITE_SUPABASE_URL ?? ''
export const BUILD_SUPABASE_ANON_KEY = import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY ?? ''

const AppConfigOverrideSchema = z.object({
  supabaseUrl: z.string().min(1).optional(),
  supabaseAnonKey: z.string().min(1).optional()
})

type AppConfigOverride = z.infer<typeof AppConfigOverrideSchema>

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export function appConfigPath(baseDir: string): string {
  return join(baseDir, 'config', 'app-config.json')
}

async function readAppConfigOverride(baseDir: string): Promise<AppConfigOverride | null> {
  let raw: string
  try {
    raw = await readFile(appConfigPath(baseDir), 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const result = AppConfigOverrideSchema.safeParse(parsed)
  return result.success ? result.data : null
}

/**
 * Cada campo do `app-config.json` sobrepõe o do build isoladamente.
 * `null` = URL ou chave ausente: catálogo não sincroniza e o analytics segue só no disco.
 */
export async function resolveSupabaseConfig(baseDir: string): Promise<SupabaseConfig | null> {
  const override = await readAppConfigOverride(baseDir)
  const url = override?.supabaseUrl ?? BUILD_SUPABASE_URL
  const anonKey = override?.supabaseAnonKey ?? BUILD_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}
