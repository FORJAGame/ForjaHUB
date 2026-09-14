import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const BUILD_SPREADSHEET_ID = import.meta.env.MAIN_VITE_SPREADSHEET_ID ?? ''

const AppConfigOverrideSchema = z.object({
  spreadsheetId: z.string().min(1).optional()
})

export function appConfigPath(baseDir: string): string {
  return join(baseDir, 'config', 'app-config.json')
}

export async function resolveSpreadsheetId(baseDir: string): Promise<string> {
  let raw: string
  try {
    raw = await readFile(appConfigPath(baseDir), 'utf-8')
  } catch {
    return BUILD_SPREADSHEET_ID
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return BUILD_SPREADSHEET_ID
  }

  const result = AppConfigOverrideSchema.safeParse(parsed)
  if (!result.success || !result.data.spreadsheetId) return BUILD_SPREADSHEET_ID
  return result.data.spreadsheetId
}
