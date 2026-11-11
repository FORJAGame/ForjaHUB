import type { Catalogo, CommandResult } from '@shared/types'
import { hubLog } from '../log/hub-log'
import type { SyncFn, SyncOk } from './boot'

type Result = CommandResult<{ catalogo: Catalogo }>

export interface CatalogResync {
  /** Sync falhou: tenta de novo com backoff até dar certo. */
  agendar(): void
  /** Conexão voltou: com tentativa pendente, tenta já; sem pendência, no-op. */
  tentarAgora(): void
  /** Sync pedido pelo Operador: roda já, com ou sem tentativa pendente. */
  forcar(): Promise<Result>
  /** Horário ISO da próxima tentativa automática; `null` sem timer armado. */
  estado(): { proximaTentativaEm: string | null }
  parar(): void
}

export interface CatalogResyncDeps {
  sync: SyncFn
  onSynced: (result: SyncOk) => void
  retryMs?: number
  retryMaxMs?: number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  agora?: () => Date
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
  const agora = deps.agora ?? (() => new Date())

  let timer: NodeJS.Timeout | null = null
  let pendente = false
  let emVoo: Promise<Result> | null = null
  let parado = false
  let falhasSeguidas = 0
  let proximaEm: string | null = null

  function cancelarTimer(): void {
    if (timer === null) return
    clearTimeoutFn(timer)
    timer = null
    proximaEm = null
  }

  function agendarProxima(): void {
    if (parado) return
    cancelarTimer()
    const espera = Math.min(retryMs * 2 ** falhasSeguidas, retryMaxMs)
    proximaEm = new Date(agora().getTime() + espera).toISOString()
    const t = setTimeoutFn(() => {
      timer = null
      proximaEm = null
      void tentar()
    }, espera)
    // Uma nova tentativa pendente não deve manter o app vivo.
    t.unref?.()
    timer = t
  }

  function tentar(origem: 'auto' | 'operador' = 'auto'): Promise<Result> {
    if (parado) return Promise.resolve({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    if (emVoo) return emVoo
    const p = executar(origem)
    emVoo = p
    void p.finally(() => {
      if (emVoo === p) emVoo = null
    }).catch(() => {})
    return p
  }

  async function executar(origem: 'auto' | 'operador'): Promise<Result> {
    // sync.ts já loga o desfecho do sync; aqui só sobra distinguir o estouro inesperado.
    const descricao = origem === 'operador' ? 'sync pedido pelo Operador' : 'nova tentativa de sync'
    let result: Result
    try {
      result = await deps.sync([])
    } catch (err) {
      result = { ok: false, code: 'CATALOGO_INDISPONIVEL' }
      hubLog.erro('catalogo', `${descricao} falhou inesperadamente`, err)
    }

    if (result.ok) {
      pendente = false
      falhasSeguidas = 0
      cancelarTimer()
      deps.onSynced(result)
      return result
    }

    pendente = true
    falhasSeguidas += 1
    agendarProxima()
    return result
  }

  return {
    agendar() {
      if (parado || pendente) return
      pendente = true
      agendarProxima()
    },
    tentarAgora() {
      if (parado || !pendente) return
      cancelarTimer()
      void tentar()
    },
    forcar() {
      if (parado) return Promise.resolve({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
      if (emVoo) return emVoo
      cancelarTimer()
      hubLog.info('catalogo', 'sync pedido pelo Operador')
      return tentar('operador')
    },
    estado() {
      return { proximaTentativaEm: proximaEm }
    },
    parar() {
      parado = true
      cancelarTimer()
    }
  }
}
