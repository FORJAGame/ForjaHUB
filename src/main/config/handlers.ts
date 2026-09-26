import type { Catalogo, CommandResult, ConfigEstacao, Jogo, Mode } from '@shared/types'
import { catalogoDoKiosk } from '../catalog/kiosk-view'
import type { Store } from '../ports'
import { CURRENT_SCHEMA_VERSION, SchemaIncompativelError } from '../store/config-estacao'
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

export interface HandleAppHydrateDeps {
  lerConfigEstacao: Store['lerConfigEstacao']
  getCatalogResult: GetCatalogResult
}

/**
 * Sem config ⇒ `setup` sem esperar o Catálogo. Com config, espera o Catálogo do boot (até 10s
 * com Cache; sem Cache, até o sync terminar) e entrega só os Jogos selecionados; seleção
 * inteira órfã volta ao `setup`.
 */
export async function handleAppHydrate(
  deps: HandleAppHydrateDeps
): Promise<CommandResult<{ mode: Mode; catalogo: Catalogo | null }>> {
  let config: ConfigEstacao | null
  try {
    config = await deps.lerConfigEstacao()
  } catch (err) {
    if (err instanceof SchemaIncompativelError) {
      return { ok: false, code: 'SCHEMA_INCOMPATIVEL', msg: err.message }
    }
    console.error('[main] falha lendo station.json:', err)
    return { ok: false, code: 'STORE_INDISPONIVEL' }
  }
  if (!config) return { ok: true, mode: 'setup', catalogo: null }

  const catalogResult = await deps.getCatalogResult()
  if (!catalogResult.ok) return catalogResult

  const catalogo = catalogoDoKiosk(catalogResult.catalogo, config.jogosSelecionados)
  if (!catalogo) return { ok: true, mode: 'setup', catalogo: null }
  return { ok: true, mode: 'catalog', catalogo }
}
