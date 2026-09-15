import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Catalogo, CommandResult } from '@shared/types'
import type { CatalogSource } from '../ports'
import { resolveMediaFolderId, resolveSpreadsheetId } from '../config/app-config'
import { commitStagingCatalog, newStagingDir } from './cache'
import { MidiaIndisponivelError, downloadMediaParaJogos } from './drive-adapter'
import { CredencialAusenteError, createGoogleClient, loadServiceAccountCredentials } from './google-client'
import type { DriveMediaClient } from './google-client'
import { CatalogoInvalidoError, fetchCatalogo, type SheetsValuesClient } from './sheets-adapter'

export interface SyncDeps {
  /** Injetável em teste; produção usa `app.getPath('userData')`. */
  baseDir?: string
  /** Injetável em teste; produção deriva de `baseDir`. */
  credentialsPath?: string
  /** Injetável em teste (pula `resolveSpreadsheetId`/`app-config.json`). */
  spreadsheetId?: string
  /** Injetável em teste (pula credencial + `googleapis` real). */
  sheetsClient?: SheetsValuesClient
  /** Injetável em teste (pula `resolveMediaFolderId`/`app-config.json`). */
  mediaFolderId?: string
  /** Injetável em teste (pula credencial + `googleapis` real). */
  driveClient?: DriveMediaClient
}

// Uma 2ª chamada durante uma já em voo recebe a MESMA Promise em vez de disparar um novo sync.
let inFlight: Promise<CommandResult<{ catalogo: Catalogo }>> | null = null

/**
 * Orquestra a sincronização completa: credencial -> spreadsheetId
 * + driveMediaFolderId -> Planilha (Zod) -> Drive (mídia por Jogo) -> monta
 * staging (json+media) -> swap único e atômico do Cache.
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

  // Injeção assimétrica (só um dos dois) cairia no `else` abaixo e bateria na
  // credencial + `googleapis` real pro lado não-injetado — risco de um teste
  // futuro acidentalmente sair pra rede. `sheetsClient`/`driveClient` vêm do
  // mesmo `GoogleClients` (um cliente só pros dois): ou os dois são injetados
  // juntos, ou nenhum.
  if (Boolean(deps.sheetsClient) !== Boolean(deps.driveClient)) {
    throw new Error(
      '[catalog] sync: sheetsClient e driveClient precisam ser injetados juntos (ou nenhum dos dois)'
    )
  }

  let sheets: SheetsValuesClient
  let drive: DriveMediaClient
  try {
    if (deps.sheetsClient && deps.driveClient) {
      sheets = deps.sheetsClient
      drive = deps.driveClient
    } else {
      const creds = await loadServiceAccountCredentials(credentialsPath)
      const clients = createGoogleClient(creds)
      sheets = clients.sheets
      drive = clients.drive
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

  const mediaFolderId = deps.mediaFolderId ?? (await resolveMediaFolderId(baseDir))
  if (!mediaFolderId) {
    console.error('[catalog] sync abortado, driveMediaFolderId não configurado')
    return { ok: false, code: 'CATALOGO_NAO_CONFIGURADO' }
  }

  let jogosMetadata: Awaited<ReturnType<typeof fetchCatalogo>>
  try {
    jogosMetadata = await fetchCatalogo(sheets, spreadsheetId)
  } catch (err) {
    if (err instanceof CatalogoInvalidoError) {
      console.error('[catalog] sync descartado, linha inválida na Planilha (Cache anterior preservado):', err.message)
      return { ok: false, code: 'CATALOGO_INVALIDO' }
    }
    console.error('[catalog] sync falhou (rede/API, Cache anterior preservado se houver):', err)
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  const staging = newStagingDir(baseDir)

  let jogos: Catalogo['jogos']
  try {
    jogos = await downloadMediaParaJogos(drive, mediaFolderId, jogosMetadata, join(staging, 'media'))
  } catch (err) {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    if (err instanceof MidiaIndisponivelError) {
      console.error('[catalog] sync descartado, mídia ausente/não-baixável (Cache anterior preservado):', err.message)
    } else {
      console.error('[catalog] sync falhou baixando mídia (Cache anterior preservado se houver):', err)
    }
    return { ok: false, code: 'MIDIA_INDISPONIVEL' }
  }

  const catalogo: Catalogo = { jogos, sincronizadoEm: new Date().toISOString() }

  try {
    await mkdir(staging, { recursive: true })
    await writeFile(join(staging, 'catalog.json'), JSON.stringify(catalogo, null, 2), 'utf-8')
    await commitStagingCatalog(baseDir, staging)
  } catch (err) {
    console.error('[catalog] sync obteve o Catálogo mas falhou no swap do Cache:', err)
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  console.log(`[catalog] sync completo: ${jogos.length} jogo(s)`)
  return { ok: true, catalogo }
}

export const catalogSource: CatalogSource = { sync }
