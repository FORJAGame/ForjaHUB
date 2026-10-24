export interface QuitGuardDeps {
  /** Jogo rodando ou registro de Sessão ainda sendo gravado. */
  temSessao(): boolean
  encerrar(): Promise<void>
  sair(): void
  /** Teto para o disco: sair do Hub nunca pode ficar preso no registro. */
  timeoutMs?: number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
}

export function createQuitGuard(deps: QuitGuardDeps): (event: { preventDefault(): void }) => void {
  const timeoutMs = deps.timeoutMs ?? 3_000
  const setTimeoutFn = deps.timers?.setTimeout ?? setTimeout
  const clearTimeoutFn = deps.timers?.clearTimeout ?? clearTimeout
  let encerrando = false

  return (event) => {
    if (encerrando || !deps.temSessao()) return
    event.preventDefault()
    encerrando = true

    const { promise: teto, resolve: estourou } = Promise.withResolvers<void>()
    const timer = setTimeoutFn(() => {
      console.error('[analytics] registro da Sessão não terminou a tempo; saindo assim mesmo')
      estourou()
    }, timeoutMs)
    const registro = Promise.resolve()
      .then(() => deps.encerrar())
      .catch((err) => console.error('[analytics] falha fechando a Sessão no quit:', err))

    void Promise.race([registro, teto]).finally(() => {
      clearTimeoutFn(timer)
      deps.sair()
    })
  }
}
