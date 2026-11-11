import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Catalogo, CommandResult, SyncResumo } from '@shared/types'
import { hubLog } from '../log/hub-log'
import type { CatalogSource } from '../ports'
import { resolveSupabaseConfig } from '../config/app-config'
import { createSupabaseClients, type SupabaseClients } from '../supabase/client'
import { commitStagingCatalog, newStagingDir } from './cache'
import { CatalogoInvalidoError, fetchCatalogo } from './jogos-adapter'
import { MidiaIndisponivelError, downloadMediaParaJogos } from './midia-adapter'
import type { JogoMetadata } from './schema'

export interface SyncDeps {
  /** Injetável em teste; produção usa `app.getPath('userData')`. */
  baseDir?: string
  /** Injetável em teste (pula `resolveSupabaseConfig` e o `supabase-js` real). */
  clients?: Pick<SupabaseClients, 'jogos' | 'midia'>
}

// Uma 2ª chamada durante uma já em voo recebe a MESMA Promise em vez de disparar um novo sync.
let inFlight: Promise<CommandResult<{ catalogo: Catalogo }>> | null = null
let ultimo: SyncResumo | null = null

/** Desfecho da última tentativa de sync terminada nesta execução; `null` antes da primeira. */
export function ultimoSync(): SyncResumo | null {
  return ultimo
}

/**
 * Orquestra a sincronização completa: config do Supabase -> tabela `jogos`
 * (Zod) -> bucket de mídia (por Jogo) -> monta staging (json+media) -> swap
 * único e atômico do Cache.
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
  // Só a chamada que criou a Promise grava o resumo; quem pegou carona não loga nem reescreve.
  p.then(
    (result) => {
      ultimo = {
        ok: result.ok,
        code: result.ok ? null : result.code,
        em: new Date().toISOString()
      }
    },
    () => {
      ultimo = { ok: false, code: 'CATALOGO_INDISPONIVEL', em: new Date().toISOString() }
    }
  ).catch(() => {})
  return p
}

async function doSync(
  _jogosSelecionados: string[],
  deps: SyncDeps
): Promise<CommandResult<{ catalogo: Catalogo }>> {
  const baseDir = deps.baseDir ?? app.getPath('userData')

  let clients = deps.clients
  if (!clients) {
    const config = await resolveSupabaseConfig(baseDir)
    if (!config) {
      hubLog.erro('catalogo', 'sync falhou: CATALOGO_NAO_CONFIGURADO (URL/anon key do Supabase ausentes)')
      return { ok: false, code: 'CATALOGO_NAO_CONFIGURADO' }
    }
    clients = createSupabaseClients(config)
  }

  let jogosMetadata: JogoMetadata[]
  try {
    jogosMetadata = await fetchCatalogo(clients.jogos)
  } catch (err) {
    if (err instanceof CatalogoInvalidoError) {
      hubLog.erro('catalogo', 'sync falhou: CATALOGO_INVALIDO (Jogo inválido na tabela `jogos`)', err)
      return { ok: false, code: 'CATALOGO_INVALIDO' }
    }
    hubLog.erro('catalogo', 'sync falhou: CATALOGO_INDISPONIVEL (rede/API)', err)
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  const staging = newStagingDir(baseDir)

  let jogos: Catalogo['jogos']
  try {
    jogos = await downloadMediaParaJogos(clients.midia, jogosMetadata, join(staging, 'media'))
  } catch (err) {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    if (err instanceof MidiaIndisponivelError) {
      hubLog.erro('catalogo', 'sync falhou: MIDIA_INDISPONIVEL (mídia ausente/não-baixável)', err)
    } else {
      hubLog.erro('catalogo', 'sync falhou: MIDIA_INDISPONIVEL (download de mídia)', err)
    }
    return { ok: false, code: 'MIDIA_INDISPONIVEL' }
  }

  const catalogo: Catalogo = { jogos, sincronizadoEm: new Date().toISOString() }

  try {
    await mkdir(staging, { recursive: true })
    await writeFile(join(staging, 'catalog.json'), JSON.stringify(catalogo, null, 2), 'utf-8')
    await commitStagingCatalog(baseDir, staging)
  } catch (err) {
    hubLog.erro('catalogo', 'sync falhou: CATALOGO_INDISPONIVEL (swap do Cache)', err)
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  hubLog.info('catalogo', `sync ok: ${jogos.length} jogo(s)`)
  return { ok: true, catalogo }
}

export const catalogSource: CatalogSource = { sync }
