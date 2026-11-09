export interface IdleTimer {
  tocar(): void
  parar(): void
}

/**
 * Timer de inatividade armado na criação. `tocar()` reinicia a contagem;
 * `onIdle` dispara uma vez por armação e só um novo `tocar()` rearma.
 * `parar()` cancela para sempre.
 */
export function createIdleTimer(args: { ms: number; onIdle(): void }): IdleTimer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let encerrado = false

  const cancelar = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const agendar = (): void => {
    if (encerrado) return
    cancelar()
    timer = setTimeout(() => {
      timer = null
      args.onIdle()
    }, args.ms)
  }

  agendar()

  return {
    tocar() {
      agendar()
    },
    parar() {
      encerrado = true
      cancelar()
    }
  }
}
