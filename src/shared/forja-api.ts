import type { Catalogo, CommandResult, Jogo, Mode } from './types'

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
  /* `catalogo` já vem filtrado por `jogosSelecionados`; é `null` fora do mode `catalog`. */
  hydrate(): Promise<CommandResult<{ mode: Mode; catalogo: Catalogo | null }>>

  /* Assina o evento `operator:open` (Ctrl+Shift+O). Retorna a função de cleanup. */
  onOperatorOpen(cb: () => void): () => void

  /* Roster completo pro `setup-form` escolher os Jogos do Evento; `sincronizadoEm` versiona a `mediaUrl` das Capas. */
  configRoster(): Promise<CommandResult<{ roster: Jogo[]; sincronizadoEm: string }>>
  configSetupSubmit(input: SetupSubmitInput): Promise<CommandResult>

  /* Assina o evento `catalog:updated` (sync em background concluiu), já com a view filtrada do kiosk. Retorna a função de cleanup. */
  onCatalogUpdated(cb: (catalogo: Catalogo) => void): () => void
}
