export interface Recuo {
  recuar(): void
  voltar(): void
}

/** Tempo para o Jogo provar que abriu antes de a janela do Hub sumir. */
const ATRASO_PADRAO_MS = 1500

export function createRecuo(deps: {
  destruirJanela(): void
  restaurarJanela(): void
  atrasoMs?: number
}): Recuo {
  const atrasoMs = deps.atrasoMs ?? ATRASO_PADRAO_MS
  let pendente: ReturnType<typeof setTimeout> | undefined

  return {
    recuar() {
      // Um novo recuo substitui o agendamento anterior: nunca há dois timers vivos.
      clearTimeout(pendente)
      pendente = setTimeout(() => {
        pendente = undefined
        deps.destruirJanela()
      }, atrasoMs)
    },
    voltar() {
      if (pendente) {
        clearTimeout(pendente)
        pendente = undefined
      }
      deps.restaurarJanela()
    }
  }
}
