import type { Catalogo, CommandResult } from '@shared/types'
import { readCatalogoCache } from './cache'
import { sync as syncCatalogo } from './sync'

/** Budget de boot do sync (I/O & Edge-Case Matrix da spec-5): acima disso, cai pro Cache. */
export const CATALOG_SYNC_TIMEOUT_MS = 10_000

const CATALOG_TIMEOUT = Symbol('catalog-sync-timeout')

function afterMs<T extends symbol>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(value), ms)
    timer.unref()
  })
}

export type SyncFn = (jogosSelecionados: string[]) => Promise<CommandResult<{ catalogo: Catalogo }>>
export type ReadCacheFn = (baseDir: string) => Promise<Catalogo | null>

export interface BootCatalogDeps {
  /** Injetável em teste; produção usa `sync` de `./sync` (mutex module-scope real). */
  sync?: SyncFn
  /** Injetável em teste; produção usa `readCatalogoCache` de `./cache`. */
  readCache?: ReadCacheFn
  onSynced?: (result: Extract<CommandResult<{ catalogo: Catalogo }>, { ok: true }>) => void
  /** Injetável em teste (evita esperar os 10s reais); produção usa `CATALOG_SYNC_TIMEOUT_MS`. */
  timeoutMs?: number
}

/**
 * Corrida entre o `sync()` e um timeout de 10s. Estoura o timeout com Cache disponível: usa o Cache e
 * deixa o sync terminar em background. `onSynced` dispara quando (se) resolver, cobrindo tanto esse
 * caso quanto o happy path (sync dentro do budget). Sem Cache: espera o sync até o fim, sem timeout, é o 1º boot sem
 * rede, quem sente é a tela de Setup via `ERROR_COPY`.
 */
export async function bootCatalog(
  baseDir: string,
  deps: BootCatalogDeps = {}
): Promise<CommandResult<{ catalogo: Catalogo }>> {
  const doSync = deps.sync ?? syncCatalogo
  const doReadCache = deps.readCache ?? readCatalogoCache
  const timeoutMs = deps.timeoutMs ?? CATALOG_SYNC_TIMEOUT_MS

  const syncPromise = doSync([])

  syncPromise.then((result) => {
    if (result.ok) deps.onSynced?.(result)
  })

  const raced = await Promise.race([syncPromise, afterMs(timeoutMs, CATALOG_TIMEOUT)])
  if (raced !== CATALOG_TIMEOUT) return raced

  const cached = await doReadCache(baseDir)
  if (cached) return { ok: true, catalogo: cached }

  return syncPromise
}
