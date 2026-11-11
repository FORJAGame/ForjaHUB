import type { HydrateResult } from '@shared/forja-api'
import { CONTROLE_PROMPTS_PADRAO, type Catalogo, type CommandResult, type ConfigEstacao, type Jogo } from '@shared/types'
import { catalogoDoKiosk } from '../catalog/kiosk-view'
import { hubLog } from '../log/hub-log'
import type { Store } from '../ports'
import { CURRENT_SCHEMA_VERSION, SchemaIncompativelError } from '../store/config-estacao'
import { validateSetupSubmit } from '../store/setup-submit'

export type GetCatalogResult = () => Promise<CommandResult<{ catalogo: Catalogo }>>

export async function handleConfigRoster(
  getCatalogResult: GetCatalogResult
): Promise<CommandResult<{ roster: Jogo[]; sincronizadoEm: string }>> {
  const result = await getCatalogResult()
  if (!result.ok) return result
  return { ok: true, roster: result.catalogo.jogos, sincronizadoEm: result.catalogo.sincronizadoEm }
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

  const { estacaoId, eventoId, jogosSelecionados, controlePrompts } = validated
  try {
    await deps.gravarConfigEstacao({
      estacaoId,
      eventoId,
      jogosSelecionados,
      controlePrompts,
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
  ultimoJogoId?: () => string | null
  /** Preferência de SFX do Operador; ausente ou com falha => `false`. */
  lerSfxMudo?: () => Promise<boolean>
}

/**
 * Sem config ⇒ `setup` sem esperar o Catálogo. Com config, espera o Catálogo do boot (até 10s
 * com Cache; sem Cache, até o sync terminar) e entrega só os Jogos selecionados; seleção
 * inteira órfã volta ao `setup`. `focusedGameId` só vale se o Jogo ainda está na view.
 * Sem config, `controlePrompts` é o padrão: o Setup grava a escolha antes do Catálogo abrir.
 */
export async function handleAppHydrate(deps: HandleAppHydrateDeps): Promise<HydrateResult> {
  const sfxMudo = await lerSfxMudo(deps)

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
  if (!config) {
    return {
      ok: true,
      mode: 'setup',
      catalogo: null,
      focusedGameId: null,
      controlePrompts: CONTROLE_PROMPTS_PADRAO,
      sfxMudo
    }
  }
  const { controlePrompts } = config

  const catalogResult = await deps.getCatalogResult()
  if (!catalogResult.ok) return catalogResult

  const catalogo = catalogoDoKiosk(catalogResult.catalogo, config.jogosSelecionados)
  if (!catalogo) {
    return { ok: true, mode: 'setup', catalogo: null, focusedGameId: null, controlePrompts, sfxMudo }
  }

  const ultimo = deps.ultimoJogoId?.() ?? null
  const focusedGameId = ultimo && catalogo.jogos.some((jogo) => jogo.id === ultimo) ? ultimo : null
  return { ok: true, mode: 'catalog', catalogo, focusedGameId, controlePrompts, sfxMudo }
}

async function lerSfxMudo(deps: HandleAppHydrateDeps): Promise<boolean> {
  if (!deps.lerSfxMudo) return false
  try {
    return await deps.lerSfxMudo()
  } catch (err) {
    hubLog.erro('main', 'falha lendo prefs do Operador', err)
    return false
  }
}

/**
 * Só Jogo da view do kiosk (selecionado e presente no Catálogo) pode ser lançado:
 * um id qualquer vindo do renderer nunca abre um build fora da seleção da Estação.
 * Qualquer falha de leitura vira "não conheço esse Jogo".
 */
export async function findLaunchableJogo(
  jogoId: string,
  deps: Pick<HandleAppHydrateDeps, 'lerConfigEstacao' | 'getCatalogResult'>
): Promise<Jogo | null> {
  try {
    const config = await deps.lerConfigEstacao()
    if (!config) return null
    const result = await deps.getCatalogResult()
    if (!result.ok) return null
    const catalogo = catalogoDoKiosk(result.catalogo, config.jogosSelecionados)
    return catalogo?.jogos.find((jogo) => jogo.id === jogoId) ?? null
  } catch (err) {
    console.error('[main] falha buscando o Jogo para lançar:', err)
    return null
  }
}
