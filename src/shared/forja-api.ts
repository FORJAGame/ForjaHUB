import type { Catalogo, CommandResult, ControlePrompts, Jogo, Mode } from './types'

export interface SetupSubmitInput {
  estacaoId: string
  eventoId: string
  jogosSelecionados: string[]
  controlePrompts: ControlePrompts
}

/*
 * `catalogo` já vem filtrado por `jogosSelecionados`; é `null` fora do mode `catalog`.
 * `focusedGameId` é o último Jogo lançado, se ainda estiver na view: a volta de uma partida cai no card jogado.
 * `controlePrompts` é a família gravada no Setup (ou a padrão, sem `station.json`).
 */
export type HydrateResult = CommandResult<{
  mode: Mode
  catalogo: Catalogo | null
  focusedGameId: string | null
  controlePrompts: ControlePrompts
}>

/**
 * Superfície da ponte tipada única.
 * Ainda expõe só o mínimo do shell Kiosk + Setup da Estação.
 */
export interface ForjaAPI {
  hydrate(): Promise<HydrateResult>

  /* Assina o evento `operator:open` (Ctrl+Shift+O). Retorna a função de cleanup. */
  onOperatorOpen(cb: () => void): () => void

  /* Roster completo pro `setup-form` escolher os Jogos do Evento; `sincronizadoEm` versiona a `mediaUrl` das Capas. */
  configRoster(): Promise<CommandResult<{ roster: Jogo[]; sincronizadoEm: string }>>
  configSetupSubmit(input: SetupSubmitInput): Promise<CommandResult>

  /* Assina o evento `catalog:updated` (sync em background concluiu), já com a view filtrada do kiosk. Retorna a função de cleanup. */
  onCatalogUpdated(cb: (catalogo: Catalogo) => void): () => void

  /*
   * Pede ao `main` para abrir o Jogo. `ok:true` = o processo iniciou: o `main` recolhe a janela em
   * seguida e a recria quando o Jogo fechar. `ok:false` traz um `LaunchErrorCode`.
   */
  gameLaunch(jogoId: string): Promise<CommandResult>
}
