import type { Catalogo, CommandResult, OperatorStatus, PrefsOperador, SyncResumo } from '@shared/types'
import type { AnalyticsFlusher } from '../analytics/types'
import type { CatalogResync } from '../catalog/resync'
import { hubLog, type HubLogArquivo } from '../log/hub-log'
import type { Store } from '../ports'

export interface OperatorDeps {
  lerConfigEstacao: Store['lerConfigEstacao']
  lerPrefsOperador: Store['lerPrefsOperador']
  gravarPrefsOperador: Store['gravarPrefsOperador']
  /** Catálogo em uso agora, sem esperar o boot; `null` se ainda não há. */
  catalogoAtual: () => Catalogo | null
  ultimoSync: () => SyncResumo | null
  resync: Pick<CatalogResync, 'forcar' | 'estado'>
  /** `null` = analytics desligado nesta execução. */
  analytics: { pendentes(): Promise<number>; flusher: Pick<AnalyticsFlusher, 'estado' | 'flushAgora'> } | null
  log: Pick<HubLogArquivo, 'caminho' | 'lerFinal'>
  versao: string
}

export const LOG_TAIL_LINHAS = 200

async function lerSfxMudo(deps: OperatorDeps): Promise<boolean> {
  try {
    return (await deps.lerPrefsOperador()).sfxMudo
  } catch (err) {
    hubLog.erro('operador', 'falha lendo prefs do Operador, assumindo SFX ligado', err)
    return false
  }
}

async function montarConfig(
  deps: OperatorDeps
): Promise<OperatorStatus['config']> {
  try {
    const config = await deps.lerConfigEstacao()
    if (!config) return null
    const { estacaoId, eventoId, jogosSelecionados, controlePrompts } = config
    return { estacaoId, eventoId, jogosSelecionados, controlePrompts }
  } catch (err) {
    hubLog.erro('operador', 'falha lendo station.json para a Tela de Status', err)
    return null
  }
}

/**
 * Retrato da Estação para a Tela de Status: só leitura local, nunca espera rede
 * nem deixa uma leitura quebrada derrubar o painel.
 */
export async function handleOperatorStatus(
  deps: OperatorDeps
): Promise<CommandResult<{ status: OperatorStatus }>> {
  try {
    const [config, sfxMudo] = await Promise.all([montarConfig(deps), lerSfxMudo(deps)])

    let catalogo: OperatorStatus['catalogo'] = null
    try {
      const atual = deps.catalogoAtual()
      if (atual) catalogo = { sincronizadoEm: atual.sincronizadoEm, jogos: atual.jogos.length }
    } catch (err) {
      hubLog.erro('operador', 'falha lendo o Catálogo em uso', err)
    }

    let analytics: OperatorStatus['analytics'] = null
    if (deps.analytics) {
      const estado = deps.analytics.flusher.estado()
      const pendentes = await deps.analytics.pendentes().catch((err: unknown) => {
        hubLog.erro('operador', 'falha contando Sessões pendentes', err)
        return 0
      })
      analytics = {
        pendentes,
        ultimoFlushOk: estado.ultimoFlushOk,
        ultimoFlushEm: estado.ultimoFlushEm,
        ultimoFlushCode: estado.ultimoCodigo
      }
    }

    return {
      ok: true,
      status: {
        config,
        catalogo,
        ultimoSync: deps.ultimoSync(),
        proximaTentativaEm: deps.resync.estado().proximaTentativaEm,
        analytics,
        sfxMudo,
        logPath: deps.log.caminho,
        versao: deps.versao
      }
    }
  } catch (err) {
    hubLog.erro('operador', 'falha montando o Status da Estação', err)
    return { ok: false, code: 'STATUS_FALHOU' }
  }
}

/**
 * Sync pedido pelo Operador. O envio das Sessões pendentes dispara junto, sem
 * segurar a resposta: o Operador quer o Catálogo, não esperar a rede duas vezes.
 */
export async function handleOperatorForceSync(
  deps: OperatorDeps
): Promise<CommandResult<{ sincronizadoEm: string }>> {
  let result: CommandResult<{ catalogo: Catalogo }>
  try {
    result = await deps.resync.forcar()
  } catch (err) {
    hubLog.erro('operador', 'sync forçado falhou inesperadamente', err)
    return { ok: false, code: 'CATALOGO_INDISPONIVEL' }
  }

  void deps.analytics?.flusher.flushAgora().catch(() => {})

  if (!result.ok) return { ok: false, code: result.code }
  return { ok: true, sincronizadoEm: result.catalogo.sincronizadoEm }
}

export async function handleOperatorSetSfxMudo(
  input: unknown,
  deps: OperatorDeps
): Promise<CommandResult> {
  if (typeof input !== 'boolean') return { ok: false, code: 'PREFS_INVALIDAS' }

  const prefs: PrefsOperador = { sfxMudo: input }
  try {
    await deps.gravarPrefsOperador(prefs)
  } catch (err) {
    hubLog.erro('operador', 'falha gravando prefs do Operador', err)
    return { ok: false, code: 'STORE_INDISPONIVEL' }
  }
  return { ok: true }
}

export async function handleOperatorLogTail(
  deps: OperatorDeps
): Promise<CommandResult<{ linhas: string[] }>> {
  try {
    return { ok: true, linhas: await deps.log.lerFinal(LOG_TAIL_LINHAS) }
  } catch (err) {
    hubLog.erro('operador', 'falha lendo o final do hub.log', err)
    return { ok: false, code: 'LOG_INDISPONIVEL' }
  }
}
