import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const BUILD_SPREADSHEET_ID = import.meta.env.MAIN_VITE_SPREADSHEET_ID ?? ''
export const BUILD_MEDIA_FOLDER_ID = import.meta.env.MAIN_VITE_MEDIA_FOLDER_ID ?? ''

const AppConfigOverrideSchema = z.object({
  spreadsheetId: z.string().min(1).optional(),
  driveMediaFolderId: z.string().min(1).optional()
})

type AppConfigOverride = z.infer<typeof AppConfigOverrideSchema>

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

export async function resolveSpreadsheetId(baseDir: string): Promise<string> {
  const override = await readAppConfigOverride(baseDir)
  return override?.spreadsheetId ?? BUILD_SPREADSHEET_ID
}

export async function resolveMediaFolderId(baseDir: string): Promise<string> {
  const override = await readAppConfigOverride(baseDir)
  return override?.driveMediaFolderId ?? BUILD_MEDIA_FOLDER_ID
}
