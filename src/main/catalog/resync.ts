import type { Catalogo, CommandResult } from '@shared/types'
import type { SyncFn, SyncOk } from './boot'

export interface CatalogResync {
  /** Sync falhou: tenta de novo com backoff até dar certo. */
  agendar(): void
  /** Conexão voltou: com tentativa pendente, tenta já; sem pendência, no-op. */
  tentarAgora(): void
  parar(): void
}

export interface CatalogResyncDeps {
  sync: SyncFn
  onSynced: (result: SyncOk) => void
  retryMs?: number
  retryMaxMs?: number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
}

/**
 * Sync que falhou (Estação sem rede no boot, Supabase fora) não espera o
 * próximo boot: tenta de novo em 1 min, dobrando até 10 min. O Cache anterior
 * segue na tela enquanto isso; o sync é tudo-ou-nada e nunca o corrompe.
 */
export function createCatalogResync(deps: CatalogResyncDeps): CatalogResync {
  const retryMs = deps.retryMs ?? 60_000
  const retryMaxMs = deps.retryMaxMs ?? 600_000
  const setTimeoutFn = deps.timers?.setTimeout ?? setTimeout
  const clearTimeoutFn = deps.timers?.clearTimeout ?? clearTimeout

  let timer: NodeJS.Timeout | null = null
  let pendente = false
  let emVoo = false
  let parado = false
  let falhasSeguidas = 0

  function cancelarTimer(): void {
    if (timer === null) return
    clearTimeoutFn(timer)
    timer = null
  }

  function agendarProxima(): void {
    if (parado) return
    cancelarTimer()
    const espera = Math.min(retryMs * 2 ** falhasSeguidas, retryMaxMs)
    const t = setTimeoutFn(() => {
      timer = null
      void tentar()
    }, espera)
    // Uma nova tentativa pendente não deve manter o app vivo.
    t.unref?.()
    timer = t
  }

  async function tentar(): Promise<void> {
    if (parado || emVoo) return
    emVoo = true
    let result: CommandResult<{ catalogo: Catalogo }>
    try {
      result = await deps.sync([])
    } catch (err) {
      result = { ok: false, code: 'CATALOGO_INDISPONIVEL' }
      console.error('[catalog] nova tentativa de sync falhou inesperadamente:', err)
    } finally {
      emVoo = false
    }

    if (result.ok) {
      pendente = false
      falhasSeguidas = 0
      console.log('[catalog] sync em segundo plano concluído')
      deps.onSynced(result)
      return
    }
    falhasSeguidas += 1
    console.error('[catalog] nova tentativa de sync falhou:', result.code)
    agendarProxima()
  }

  return {
    agendar() {
      if (parado || pendente) return
      pendente = true
      agendarProxima()
    },
    tentarAgora() {
      if (parado || !pendente || emVoo) return
      cancelarTimer()
      void tentar()
    },
    parar() {
      parado = true
      cancelarTimer()
    }
  }
}
