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

export function createGoogleClient(creds: ServiceAccountCredentials): GoogleClients {
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES
  })
  return { sheets: wrapSheetsClient(google.sheets({ version: 'v4', auth })) }
}
