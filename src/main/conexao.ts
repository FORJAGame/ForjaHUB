export interface VigiaConexao {
  parar(): void
}

export interface VigiaConexaoDeps {
  /** Produção: `net.isOnline()` do Electron. `false` é confiável; `true` só diz que há interface de rede. */
  estaOnline: () => boolean
  aoVoltar: () => void
  intervaloMs?: number
  timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval }
}

/**
 * Chama `aoVoltar` a cada transição offline → online, sem esperar o backoff de
 * quem reenvia. Rede que "volta" sem internet de verdade só gera uma tentativa
 * que falha e cai no backoff normal.
 */
export function vigiarConexao(deps: VigiaConexaoDeps): VigiaConexao {
  const setIntervalFn = deps.timers?.setInterval ?? setInterval
  const clearIntervalFn = deps.timers?.clearInterval ?? clearInterval

  let online = deps.estaOnline()
  const timer = setIntervalFn(() => {
    const agora = deps.estaOnline()
    const voltou = agora && !online
    online = agora
    if (!voltou) return
    console.log('[main] conexão de rede voltou')
    deps.aoVoltar()
  }, deps.intervaloMs ?? 10_000)
  // A vigia não deve manter o app vivo.
  timer.unref?.()

  return { parar: () => clearIntervalFn(timer) }
}
