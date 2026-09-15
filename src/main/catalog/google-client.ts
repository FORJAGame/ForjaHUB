import { readFile } from 'node:fs/promises'
import { google } from 'googleapis'
import type { SheetsValuesClient } from './sheets-adapter'

// Credencial da Service Account. (provisionada fora do app, nunca no bundle/git).
export class CredencialAusenteError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'CredencialAusenteError'
  }
}

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
}

// Escopo Sheets+Drive juntos num cliente só
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
]

export async function loadServiceAccountCredentials(
  credentialsPath: string
): Promise<ServiceAccountCredentials> {
  let raw: string
  try {
    raw = await readFile(credentialsPath, 'utf-8')
  } catch {
    throw new CredencialAusenteError(`credentials.json ausente em ${credentialsPath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new CredencialAusenteError('credentials.json não é um JSON válido')
  }

  const obj = parsed as Partial<ServiceAccountCredentials> | null
  if (!obj || typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') {
    throw new CredencialAusenteError('credentials.json não tem client_email/private_key')
  }
  return { client_email: obj.client_email, private_key: obj.private_key }
}

export interface GoogleClients {
  sheets: SheetsValuesClient
  drive: DriveMediaClient
}

// Superfície mínima do `sheets_v4.Sheets` real que `wrapSheetsClient`
// precisa receber, não o SDK inteiro.
export interface RawSheetsClient {
  spreadsheets: {
    values: {
      get(params: { spreadsheetId: string; range: string }): Promise<{ data: { values?: unknown } }>
    }
  }
}

export function wrapSheetsClient(raw: RawSheetsClient): SheetsValuesClient {
  return {
    spreadsheets: {
      values: {
        get: async (params) => {
          const res = await raw.spreadsheets.values.get(params)
          return { data: { values: (res.data.values as string[][] | undefined | null) ?? null } }
        }
      }
    }
  }
}

export interface DriveEntry {
  id: string
  name: string
}

export interface DriveMediaClient {
  listFolder(folderId: string): Promise<DriveEntry[]>
  downloadFile(fileId: string): Promise<Buffer>
}

// Superfície mínima do `drive_v3.Drive` real que `wrapDriveClient` precisa
// receber, não o SDK inteiro.
export interface RawDriveClient {
  files: {
    list(params: {
      q: string
      fields: string
      pageSize?: number
      pageToken?: string
    }): Promise<{
      data: { files?: Array<{ id?: string | null; name?: string | null }>; nextPageToken?: string | null }
    }>
    get(
      params: { fileId: string; alt: 'media' },
      options: { responseType: 'arraybuffer' }
    ): Promise<{ data: unknown }>
  }
}

function escapeDriveQueryValue(valor: string): string {
  return valor.replace(/'/g, "\\'")
}

export function wrapDriveClient(raw: RawDriveClient): DriveMediaClient {
  return {
    listFolder: async (folderId) => {
      const entries: DriveEntry[] = []
      let pageToken: string | undefined

      do {
        const res = await raw.files.list({
          q: `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name)',
          pageSize: 1000,
          ...(pageToken ? { pageToken } : {})
        })
        const files = res.data.files ?? []
        for (const file of files) {
          if (typeof file.id === 'string' && typeof file.name === 'string') {
            entries.push({ id: file.id, name: file.name })
          }
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)

      return entries
    },
    downloadFile: async (fileId) => {
      const res = await raw.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
      return Buffer.from(res.data as ArrayBuffer)
    }
  }
}

export function createGoogleClient(creds: ServiceAccountCredentials): GoogleClients {
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES
  })
  return {
    sheets: wrapSheetsClient(google.sheets({ version: 'v4', auth })),
    drive: wrapDriveClient(google.drive({ version: 'v3', auth }))
  }
}
