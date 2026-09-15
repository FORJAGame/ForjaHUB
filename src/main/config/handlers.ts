import type { Catalogo, CommandResult, ConfigEstacao, Jogo } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '../store/config-estacao'
import { validateSetupSubmit } from '../store/setup-submit'

export type GetCatalogResult = () => Promise<CommandResult<{ catalogo: Catalogo }>>

export async function handleConfigRoster(
  getCatalogResult: GetCatalogResult
): Promise<CommandResult<{ roster: Jogo[] }>> {
  const result = await getCatalogResult()
  if (!result.ok) return result
  return { ok: true, roster: result.catalogo.jogos }
}

export interface HandleConfigSetupSubmitDeps {
  getCatalogResult: GetCatalogResult
  gravarConfigEstacao: (config: ConfigEstacao) => Promise<void>
}

export async function handleConfigSetupSubmit(
  input: unknown,
  deps: HandleConfigSetupSubmitDeps
): Promise<CommandResult> {
  const catalogResult = await deps.getCatalogResult()
  if (!catalogResult.ok) return catalogResult

  const rosterIds = catalogResult.catalogo.jogos.map((jogo) => jogo.id)
  const validated = validateSetupSubmit(input, rosterIds)
  if (!validated.ok) return validated

  const { estacaoId, eventoId, jogosSelecionados } = validated
  try {
    await deps.gravarConfigEstacao({
      estacaoId,
      eventoId,
      jogosSelecionados,
      schemaVersion: CURRENT_SCHEMA_VERSION
    })
  } catch (err) {
    console.error('[main] falha gravando station.json:', err)
    return { ok: false, code: 'STORE_INDISPONIVEL' }
  }
  return { ok: true }
}
