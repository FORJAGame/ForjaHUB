import { join } from 'node:path'
import { app } from 'electron'
import type { Catalogo, CommandResult } from '@shared/types'
import type { CatalogSource } from '../ports'
import { resolveSpreadsheetId } from '../config/app-config'
import { CredencialAusenteError, createGoogleClient, loadServiceAccountCredentials } from './google-client'
import { CatalogoInvalidoError, fetchCatalogo, type SheetsValuesClient } from './sheets-adapter'
import { writeCatalogoCache } from './cache'

export interface SyncDeps {
  /** Injetável em teste; produção usa `app.getPath('userData')`. */
  baseDir?: string
  /** Injetável em teste; produção deriva de `baseDir`. */
  credentialsPath?: string
  /** Injetável em teste (pula `resolveSpreadsheetId`/`app-config.json`). */
  spreadsheetId?: string
  /** Injetável em teste (pula credencial + `googleapis` real). */
  sheetsClient?: SheetsValuesClient
}

// Uma 2ª chamada durante uma já em voo recebe a MESMA Promise em vez de disparar um novo sync.
let inFlight: Promise<CommandResult<{ catalogo: Catalogo }>> | null = null

/**
 * Orquestra a Pista A (metadados): credencial -> spreadsheetId -> Planilha ->
 * Zod -> swap do `catalog.json`.
 */

export function sync(
  jogosSelecionados: string[],
  deps: SyncDeps = {}
): Promise<CommandResult<{ catalogo: Catalogo }>> {
  if (inFlight) return inFlight

  const p = doSync(jogosSelecionados, deps)
  inFlight = p
  p.finally(() => {
    if (inFlight === p) inFlight = null
  }).catch(() => {})
  return p
}

async function doSync(
  _jogosSelecionados: string[],
  deps: SyncDeps
): Promise<CommandResult<{ catalogo: Catalogo }>> {
  const baseDir = deps.baseDir ?? app.getPath('userData')
  const credentialsPath = deps.credentialsPath ?? join(baseDir, 'config', 'credentials.json')

  let sheets: SheetsValuesClient
  try {
    if (deps.sheetsClient) {
      sheets = deps.sheetsClient
    } else {
      const creds = await loadServiceAccountCredentials(credentialsPath)
      sheets = createGoogleClient(creds).sheets
    }
  } catch (err) {
    if (err instanceof CredencialAusenteError) {
      console.error('[catalog] sync abortado, credencial ausente:', err.message)
      return { ok: false, code: 'CREDENCIAL_AUSENTE' }
    }
    console.error('[catalog] sync abortado, falha lendo credencial:', err)
    return { ok: false, code: 'CREDENCIAL_AUSENTE' }
  }

  const spreadsheetId = deps.spreadsheetId ?? (await resolveSpreadsheetId(baseDir))
  if (!spreadsheetId) {
    console.error('[catalog] sync abortado, spreadsheetId não configurado')
    return { ok: false, code: 'CATALOGO_NAO_CONFIGURADO' }
  }

  let jogos: Catalogo['jogos']
  try {
    jogos = await fetchCatalogo(sheets, spreadsheetId)
  } catch (err) {
    if (err instanceof CatalogoInvalidoError) {
      console.error('[catalog] sync descartado, linha inválida na Planilha (Cache anterior preservado):', err.message)
      return { ok: false, code: 'CATALOGO_INVALIDO' }
    }
    console.error('[catalog] sync falhou (rede/API, Cache anterior preservado se houver):', err)
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  const catalogo: Catalogo = { jogos, sincronizadoEm: new Date().toISOString() }

  try {
    await writeCatalogoCache(baseDir, catalogo)
  } catch (err) {
    console.error('[catalog] sync obteve o Catálogo mas falhou gravando o Cache:', err)
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  console.log(`[catalog] sync completo: ${jogos.length} jogo(s)`)
  return { ok: true, catalogo }
}

export const catalogSource: CatalogSource = { sync }
