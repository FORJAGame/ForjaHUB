import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult, Jogo, OperatorStatus, SyncResumo } from '@shared/types'
import type { OperatorDeps } from '../handlers'
import type { JogosTable, MidiaStorage } from '../../supabase/client'

/**
 * Ponta a ponta do "forçar sincronização": `sync` real + `createCatalogResync`
 * real + `createStore` real + `iniciarHubLog` real + `handleOperator*` reais.
 * Só os clientes Supabase são fake.
 *
 * Os `await import()` são necessários porque `vi.resetModules()` entre testes
 * exige reimportar módulos com singletons (hub.log, resumo do sync) — import
 * estático devolveria a instância do teste anterior.
 */

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-forcar-sync-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const LINHA_VALIDA = {
  id: 'jogo-a',
  titulo: 'Jogo A',
  ano: 2024,
  estudio: 'Estúdio A',
  genero: 'Aventura',
  modalidade: 'single-player',
  sinopse: 'Uma sinopse.',
  redes_url: 'https://exemplo.com',
  exe_relativo: 'Jogo.exe'
}

const LINHA_INVALIDA = { ...LINHA_VALIDA, id: 'jogo-b', titulo: 'Jogo B', modalidade: 'coop' }
const PASTA_JOGO_A = ['capa.png', 'hero.jpg', 'logo.png', 'detalhe-1.png']

function fakeMidia(): MidiaStorage {
  return {
    listar: async (pasta: string) => (pasta === 'jogo-a' ? PASTA_JOGO_A : []),
    baixar: async () => Buffer.from('fake-bytes')
  }
}

function catalogoDeBase(): Catalogo {
  const jogo: Jogo = {
    id: 'jogo-a',
    titulo: 'Jogo A',
    ano: 2024,
    estudio: 'Estúdio A',
    genero: 'Aventura',
    modalidade: 'single-player',
    sinopse: 'Uma sinopse.',
    redesUrl: 'https://exemplo.com',
    exeRelativo: 'Jogo.exe',
    detalheImagens: ['detalhe-1']
  }
  return { jogos: [jogo], sincronizadoEm: '2026-01-01T00:00:00.000Z' }
}

type SyncResult = CommandResult<{ catalogo: Catalogo }>

interface Estacao {
  baseDir: string
  deps: OperatorDeps
  forcar: () => Promise<CommandResult<{ sincronizadoEm: string }>>
  setSfxMudo: (valor: boolean) => Promise<CommandResult>
  logTail: () => Promise<CommandResult<{ linhas: string[] }>>
  onSynced: ReturnType<typeof vi.fn>
  setRede: (listar: JogosTable['listar']) => void
  logOcioso: () => Promise<void>
}

/** Monta a Estação com peças reais; `vi.resetModules` limpa os singletons do teste anterior. */
async function montarEstacao(): Promise<Estacao> {
  vi.resetModules()
  const baseDir = tmpDir()

  const { sync, ultimoSync } = await import('../../catalog/sync')
  const { createCatalogResync } = await import('../../catalog/resync')
  const { createStore } = await import('../../store')
  const { iniciarHubLog } = await import('../../log/hub-log')
  const { handleOperatorForceSync, handleOperatorLogTail, handleOperatorSetSfxMudo } = await import('../handlers')

  const log = iniciarHubLog(baseDir)
  const store = createStore({ baseDir })

  // Clientes mutáveis: o teste liga/desliga a rede trocando a leitura da tabela `jogos`.
  let listarImpl: JogosTable['listar'] = async () => [LINHA_VALIDA]
  const clientes: { jogos: JogosTable; midia: MidiaStorage } = {
    jogos: { listar: () => listarImpl() },
    midia: fakeMidia()
  }
  const setRede = (listar: JogosTable['listar']): void => {
    listarImpl = listar
  }

  let catalogoEmUso: Catalogo | null = null
  const onSynced = vi.fn((result: Extract<SyncResult, { ok: true }>) => {
    catalogoEmUso = result.catalogo
  })
  const resync = createCatalogResync({
    sync: (selecionados: string[]) => sync(selecionados, { baseDir, clients: clientes }),
    onSynced
  })

  const deps: OperatorDeps = {
    lerConfigEstacao: () => store.lerConfigEstacao(),
    lerPrefsOperador: () => store.lerPrefsOperador(),
    gravarPrefsOperador: (prefs) => store.gravarPrefsOperador(prefs),
    catalogoAtual: () => catalogoEmUso,
    ultimoSync: () => ultimoSync() as SyncResumo | null,
    resync,
    analytics: null,
    log,
    versao: '0.0.0-teste'
  }

  return {
    baseDir,
    deps,
    forcar: () => handleOperatorForceSync(deps),
    setSfxMudo: (valor) => handleOperatorSetSfxMudo(valor, deps),
    logTail: () => handleOperatorLogTail(deps),
    onSynced,
    setRede,
    logOcioso: () => log.ocioso()
  }
}

async function linhasDoLog(baseDir: string): Promise<string[]> {
  return readFileSync(join(baseDir, 'hub.log'), 'utf-8')
    .split('\n')
    .filter((linha) => linha !== '')
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('forçar sincronização — ponta a ponta', () => {
  it('offline → online: falha, Status reflete, volta a rede e o 2º forçar salva o Catálogo', async () => {
    const estacao = await montarEstacao()

    // Rede fora: o 1º forçar falha.
    estacao.setRede(() => Promise.reject(new Error('ETIMEDOUT')))
    await expect(estacao.forcar()).resolves.toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })

    // O Status abre mesmo offline: falha registrada, retry armado, sem Catálogo.
    const statusOffline = await handleStatus(estacao)
    expect(statusOffline.ok).toBe(true)
    if (!statusOffline.ok) return
    expect(statusOffline.status.ultimoSync?.ok).toBe(false)
    expect(statusOffline.status.ultimoSync?.code).toBe('CATALOGO_INDISPONIVEL')
    expect(statusOffline.status.proximaTentativaEm).not.toBeNull()
    expect(statusOffline.status.catalogo).toBeNull()
    expect(estacao.onSynced).not.toHaveBeenCalled()

    // Rede volta: o 2º forçar dá certo.
    estacao.setRede(async () => [LINHA_VALIDA])
    const forcarOk = await estacao.forcar()
    expect(forcarOk.ok).toBe(true)

    const statusOnline = await handleStatus(estacao)
    expect(statusOnline.ok).toBe(true)
    if (!statusOnline.ok) return
    expect(statusOnline.status.ultimoSync?.ok).toBe(true)
    expect(statusOnline.status.proximaTentativaEm).toBeNull()
    expect(statusOnline.status.catalogo?.jogos).toBe(1)
    expect(estacao.onSynced).toHaveBeenCalledTimes(1)
    expect(existsSync(join(estacao.baseDir, 'catalog', 'current', 'catalog.json'))).toBe(true)
  })

  it('falha preserva o Cache: catálogo em disco segue byte a byte o do sync que deu certo', async () => {
    const estacao = await montarEstacao()
    const caminho = join(estacao.baseDir, 'catalog', 'current', 'catalog.json')

    await expect(estacao.forcar()).resolves.toMatchObject({ ok: true })
    const cacheBom = readFileSync(caminho)

    // Tabela com Jogo inválido: o sync é tudo-ou-nada e não encosta no Cache.
    estacao.setRede(async () => [LINHA_VALIDA, LINHA_INVALIDA])
    await expect(estacao.forcar()).resolves.toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })

    expect(readFileSync(caminho).equals(cacheBom)).toBe(true)
  })

  it('hub.log registra a falha e, depois dela, o sucesso de Catálogo', async () => {
    const estacao = await montarEstacao()

    estacao.setRede(() => Promise.reject(new Error('ETIMEDOUT')))
    await estacao.forcar()
    estacao.setRede(async () => [LINHA_VALIDA])
    await expect(estacao.forcar()).resolves.toMatchObject({ ok: true })
    await estacao.logOcioso()
    const linhas = await linhasDoLog(estacao.baseDir)
    const indiceErro = linhas.findIndex((linha) => /ERRO \[catalogo\].*CATALOGO_INDISPONIVEL/.test(linha))
    expect(indiceErro).toBeGreaterThanOrEqual(0)
    const infoDepois = linhas
      .slice(indiceErro + 1)
      .find((linha) => /INFO \[catalogo\]/.test(linha) && /sync/.test(linha))
    expect(infoDepois).toBeDefined()
  })

  it('logTail devolve as mesmas linhas do hub.log, na ordem do arquivo', async () => {
    const estacao = await montarEstacao()

    estacao.setRede(() => Promise.reject(new Error('ETIMEDOUT')))
    await estacao.forcar()
    estacao.setRede(async () => [LINHA_VALIDA])
    await expect(estacao.forcar()).resolves.toMatchObject({ ok: true })

    await estacao.logOcioso()
    const noDisco = await linhasDoLog(estacao.baseDir)

    await expect(estacao.logTail()).resolves.toEqual({ ok: true, linhas: noDisco })
  })

  it('mudo de ponta a ponta: grava, reinicia o Store e o hydrate lê a preferência', async () => {
    const estacao = await montarEstacao()

    await expect(estacao.setSfxMudo(true)).resolves.toEqual({ ok: true })

    // Reinício: um Store novo no mesmo baseDir + hydrate com lerSfxMudo nas prefs.
    const { createStore } = await import('../../store')
    const { handleAppHydrate } = await import('../../config/handlers')
    const storeReinicio = createStore({ baseDir: estacao.baseDir })

    const result = await handleAppHydrate({
      lerConfigEstacao: () => storeReinicio.lerConfigEstacao(),
      getCatalogResult: async () => ({ ok: true, catalogo: catalogoDeBase() }),
      lerSfxMudo: async () => (await storeReinicio.lerPrefsOperador()).sfxMudo
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sfxMudo).toBe(true)
  })
})

/** Status da Estação montada (pega o handler do mesmo grafo de módulos do teste). */
async function handleStatus(
  estacao: Estacao
): Promise<CommandResult<{ status: OperatorStatus }>> {
  const { handleOperatorStatus } = await import('../handlers')
  return handleOperatorStatus(estacao.deps)
}
