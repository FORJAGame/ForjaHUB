import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { PrefsOperador } from '@shared/types'
import { hubLog } from '../log/hub-log'
import { writeJsonAtomic } from './atomic-write'

export const OPERATOR_PREFS_SCHEMA_VERSION = 1

const PrefsOperadorSchema = z.object({
  schemaVersion: z.literal(OPERATOR_PREFS_SCHEMA_VERSION),
  sfxMudo: z.boolean()
})

const PADRAO: PrefsOperador = { sfxMudo: false }

/**
 * Lê `operator-prefs.json`. Arquivo ausente, corrompido ou de versão diferente
 * cai no padrão; preferência do Operador nunca impede o Hub de abrir.
 */
export async function readOperatorPrefs(filePath: string): Promise<PrefsOperador> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      hubLog.erro('store', 'operator-prefs.json ilegível, usando o padrão', err)
    }
    return { ...PADRAO }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    hubLog.erro('store', 'operator-prefs.json corrompido (JSON inválido), usando o padrão', err)
    return { ...PADRAO }
  }

  const result = PrefsOperadorSchema.safeParse(parsed)
  if (!result.success) {
    hubLog.erro('store', 'operator-prefs.json corrompido (shape/versão inválidos), usando o padrão', result.error)
    return { ...PADRAO }
  }
  return { sfxMudo: result.data.sfxMudo }
}

export async function writeOperatorPrefs(filePath: string, prefs: PrefsOperador): Promise<void> {
  await writeJsonAtomic(filePath, {
    schemaVersion: OPERATOR_PREFS_SCHEMA_VERSION,
    sfxMudo: prefs.sfxMudo
  })
}
