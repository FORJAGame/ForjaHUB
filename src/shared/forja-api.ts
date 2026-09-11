import type { CommandResult, Jogo, Mode } from './types'

export interface SetupSubmitInput {
  estacaoId: string
  eventoId: string
  jogosSelecionados: string[]
}

/**
 * Superfície da ponte tipada única.
 * Ainda expõe só o mínimo do shell Kiosk + Setup da Estação.
 */
export interface ForjaAPI {
  hydrate(): Promise<CommandResult<{ mode: Mode }>>

  /* Assina o evento `operator:open` (Ctrl+Shift+O). Retorna a função de cleanup. */
  onOperatorOpen(cb: () => void): () => void

  /* Roster completo pro `setup-form` escolher os Jogos do Evento. */
  configRoster(): Promise<CommandResult<{ roster: Jogo[] }>>
  configSetupSubmit(input: SetupSubmitInput): Promise<CommandResult>
}
