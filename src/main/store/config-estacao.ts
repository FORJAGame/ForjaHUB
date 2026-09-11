import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { ConfigEstacao } from '@shared/types'
import { writeJsonAtomic } from './atomic-write'

export const CURRENT_SCHEMA_VERSION = 1

/** Versão maior que a suportada recusa iniciar e nunca corrompe o arquivo. */
export class SchemaIncompativelError extends Error {
  constructor(
    public readonly schemaVersion: number,
    public readonly suportado: number
  ) {
    super(`station.json na versão ${schemaVersion}, suportado até ${suportado}`)
    this.name = 'SchemaIncompativelError'
  }
}

const ConfigEstacaoSchema = z.object({
  estacaoId: z.string().min(1),
  eventoId: z.string().min(1),
  jogosSelecionados: z.array(z.string().min(1)).min(1),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION)
})

const VersionShape = z.object({ schemaVersion: z.number().int() })

export type Migration = (data: unknown) => unknown

export function runMigrations(
  data: unknown,
  fromVersion: number,
  migrations: Record<number, Migration> = {}
): unknown {
  let current = data
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v]
    if (!migrate) break
    current = migrate(current)
  }
  return current
}

/**
 * Lê `station.json`. Ausente ou corrompido == `null`, tratado como 1º
 * boot. `schemaVersion` maior que a suportada retorna `SchemaIncompativelError`.
 */
export async function readConfigEstacao(
  filePath: string,
  migrations: Record<number, Migration> = {}
): Promise<ConfigEstacao | null> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error('[store] station.json corrompido (JSON inválido), tratando como 1º boot:', err)
    return null
  }

  const versionResult = VersionShape.safeParse(parsed)
  const schemaVersion = versionResult.success ? versionResult.data.schemaVersion : 0
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaIncompativelError(schemaVersion, CURRENT_SCHEMA_VERSION)
  }

  const migrated = runMigrations(parsed, schemaVersion, migrations)
  const result = ConfigEstacaoSchema.safeParse(migrated)
  if (!result.success) {
    console.error(
      '[store] station.json corrompido (shape inválido), tratando como 1º boot:',
      result.error.message
    )
    return null
  }
  return result.data
}

export async function writeConfigEstacao(filePath: string, config: ConfigEstacao): Promise<void> {
  await writeJsonAtomic(filePath, config)
}
