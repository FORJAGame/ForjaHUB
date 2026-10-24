import { join } from 'node:path'
import type { RegistroAnalytics } from '@shared/types'
import type { AnalyticsSink } from '../ports'
import { createGoogleClient, loadServiceAccountCredentials } from '../catalog/google-client'
import { resolveAnalyticsSpreadsheetId } from '../config/app-config'
import { AnalyticsNaoConfiguradoError } from './types'

// Superfície mínima do cliente Sheets que este adaptador precisa, não é o `sheets_v4.Sheets`.
export interface AnalyticsSheetsClient {
  spreadsheets: {
    values: {
      get(params: { spreadsheetId: string; range: string }): Promise<{
        data: { values?: string[][] | null }
      }>
      append(params: {
        spreadsheetId: string
        range: string
        valueInputOption: 'RAW'
        insertDataOption: 'INSERT_ROWS'
        requestBody: { values: (string | number)[][] }
      }): Promise<unknown>
    }
  }
}

export const ABA_ANALYTICS = 'Analytics'

// Coluna A inteira: se o cabeçalho faltar, o 1º append cai na linha 1 e ainda
// precisa entrar no Set de ids. O rótulo `id` do cabeçalho nunca é um UUID.
const RANGE_IDS = `${ABA_ANALYTICS}!A:A`
const ROTULO_ID = 'id'
const RANGE_APPEND = `${ABA_ANALYTICS}!A:H`

/**
 * Converte o ISO UTC para o fuso da Estação no formato que a Planilha espera.
 * `timeZone` indefinido usa o fuso do sistema.
 */
export function formatarInicioLocal(inicioISO: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(inicioISO))
}

export function registroParaLinha(r: RegistroAnalytics, timeZone?: string): (string | number)[] {
  return [
    r.id,
    r.eventoId,
    r.estacaoId,
    r.jogoId,
    r.inicioISO,
    formatarInicioLocal(r.inicioISO, timeZone),
    r.duracaoSeg,
    r.incompleta ? 'sim' : 'não'
  ]
}

export function createSheetsAnalyticsSink(deps: {
  sheets: AnalyticsSheetsClient
  spreadsheetId: string
  timeZone?: string
}): AnalyticsSink {
  const { sheets, spreadsheetId, timeZone } = deps

  return {
    async flush(registros) {
      if (registros.length === 0) return { idsAceitos: [] }

      // Relê a cada flush, sem cache: um append aplicado no servidor mas com
      // erro de rede deixaria qualquer cache desatualizado.
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE_IDS })
      const existentes = new Set<string>()
      for (const linha of res.data.values ?? []) {
        const id = linha?.[0]?.trim()
        if (id && id !== ROTULO_ID) existentes.add(id)
      }

      const novos: RegistroAnalytics[] = []
      const noLote = new Set<string>()
      for (const registro of registros) {
        if (existentes.has(registro.id) || noLote.has(registro.id)) continue
        noLote.add(registro.id)
        novos.push(registro)
      }

      if (novos.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: RANGE_APPEND,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: novos.map((r) => registroParaLinha(r, timeZone)) }
        })
      }

      // Devolve o que foi pedido, não só o anexado: quem confirma no spool
      // precisa dos ids que já estavam na Planilha também.
      return { idsAceitos: [...new Set(registros.map((r) => r.id))] }
    }
  }
}

export async function criarSinkPadrao(baseDir: string): Promise<AnalyticsSink> {
  const spreadsheetId = await resolveAnalyticsSpreadsheetId(baseDir)
  if (!spreadsheetId) throw new AnalyticsNaoConfiguradoError()

  const creds = await loadServiceAccountCredentials(join(baseDir, 'config', 'credentials.json'))
  const clients = createGoogleClient(creds)
  return createSheetsAnalyticsSink({ sheets: clients.analyticsSheets, spreadsheetId })
}
