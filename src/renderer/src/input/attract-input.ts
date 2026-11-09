import { avancarKonami, KONAMI } from './konami'
import type { Intent, OrigemInput } from './types'

/** Tempo máximo entre dois passos do Konami antes de sair. */
export const KONAMI_JANELA_MS = 800

export interface AttractInput {
  intent(i: Intent): void
  atividade(origem: OrigemInput): void
  parar(): void
}

/**
 * Controlador de saída do Modo Atração. Sai uma única vez — por input que não é
 * `Intent`, por passo errado do Konami ou por pausa maior que a janela — e
 * depois vira no-op. `parar()` desliga sem chamar `onExit`.
 */
export function createAttractInput(args: {
  onExit(): void
  onKonami(): void
  janelaMs?: number
}): AttractInput {
  const janelaMs = args.janelaMs ?? KONAMI_JANELA_MS
  let pos = 0
  let encerrado = false
  let janela: ReturnType<typeof setTimeout> | null = null

  const cancelarJanela = (): void => {
    if (janela === null) return
    clearTimeout(janela)
    janela = null
  }

  const sair = (): void => {
    if (encerrado) return
    encerrado = true
    cancelarJanela()
    args.onExit()
  }

  const armarJanela = (): void => {
    cancelarJanela()
    janela = setTimeout(() => {
      janela = null
      sair()
    }, janelaMs)
  }

  return {
    intent(i) {
      if (encerrado) return

      const proximo = avancarKonami(pos, i)
      if (proximo === null) {
        sair()
        return
      }

      if (proximo === KONAMI.length) {
        cancelarJanela()
        pos = 0
        args.onKonami()
        return
      }

      pos = proximo
      armarJanela()
    },

    atividade(origem) {
      if (encerrado) return
      if (origem === 'outro') sair()
    },

    parar() {
      encerrado = true
      cancelarJanela()
    }
  }
}
