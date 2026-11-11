import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Catalogo, CommandResult, ConfigEstacao, SyncResumo } from '@shared/types'
import type { AnalyticsFlusher, FlushResult } from '../../analytics/types'
import type { CatalogResync } from '../../catalog/resync'
import { handleOperatorForceSync, handleOperatorLogTail, handleOperatorSetSfxMudo, handleOperatorStatus, type OperatorDeps } from '../handlers'

const CONFIG: ConfigEstacao = {
  estacaoId: 'est-1',
  eventoId: 'ev-1',
  jogosSelecionados: ['jogo-a', 'jogo-b'],
  controlePrompts: 'playstation',
  schemaVersion: 2
}

const CATALOGO: Catalogo = {
  jogos: [
    {
      id: 'jogo-a',
      titulo: 'Jogo A',
      ano: 2026,
      estudio: 'FORJA',
      genero: 'ação',
      modalidade: 'single-player',
      sinopse: 'sinopse',
      redesUrl: '',
      exeRelativo: 'Jogo.exe',
      detalheImagens: []
    },
    {
      id: 'jogo-b',
      titulo: 'Jogo B',
      ano: 2025,
      estudio: 'FORJA',
      genero: 'ação',
      modalidade: 'multiplayer',
      sinopse: 'sinopse',
      redesUrl: '',
      exeRelativo: 'Jogo.exe',
      detalheImagens: []
    }
  ],
  sincronizadoEm: '2026-11-01T00:00:00.000Z'
}

const RESUMO: SyncResumo = { ok: true, code: null, em: '2026-11-01T00:00:01.000Z' }
const PROXIMA = '2026-11-01T00:01:00.000Z'
const LOG_PATH = '/estacao/hub.log'

interface Montagem {
  deps: OperatorDeps
  forcar: Mock<() => Promise<CommandResult<{ catalogo: Catalogo }>>>
  flushAgora: Mock<() => Promise<unknown>>
  pendentes: Mock<() => Promise<number>>
  gravar: Mock<(prefs: { sfxMudo: boolean }) => Promise<void>>
  lerFinal: Mock<(max: number) => Promise<string[]>>
}

function montar(over: Partial<OperatorDeps> = {}): Montagem {
  const forcar = vi.fn<() => Promise<CommandResult<{ catalogo: Catalogo }>>>(async () => ({
    ok: true,
    catalogo: CATALOGO
  }))
  const flushAgora = vi.fn<() => Promise<FlushResult>>(async () => ({ ok: true, enviados: 0, pendentes: 0 }))
  const pendentes = vi.fn(async () => 3)
  const gravar = vi.fn(async () => {})
  const lerFinal = vi.fn(async () => ['linha-1', 'linha-2'])

  const deps: OperatorDeps = {
    lerConfigEstacao: async () => CONFIG,
    lerPrefsOperador: async () => ({ sfxMudo: true }),
    gravarPrefsOperador: gravar,
    catalogoAtual: () => CATALOGO,
    ultimoSync: () => RESUMO,
    resync: {
      forcar,
      estado: () => ({ proximaTentativaEm: PROXIMA })
    } satisfies Pick<CatalogResync, 'forcar' | 'estado'>,
    analytics: {
      pendentes,
      flusher: {
        estado: () => ({
          ultimoFlushOk: false,
          ultimoFlushEm: '2026-11-01T00:00:02.000Z',
          ultimoCodigo: 'ANALYTICS_INDISPONIVEL'
        }),
        flushAgora
      } satisfies Pick<AnalyticsFlusher, 'estado' | 'flushAgora'>
    },
    log: { caminho: LOG_PATH, lerFinal },
    versao: '1.2.3',
    ...over
  }
  return { deps, forcar, flushAgora, pendentes, gravar, lerFinal }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleOperatorStatus', () => {
  it('com tudo presente devolve exatamente o retrato da Estação', async () => {
    const { deps } = montar()

    await expect(handleOperatorStatus(deps)).resolves.toEqual({
      ok: true,
      status: {
        config: {
          estacaoId: 'est-1',
          eventoId: 'ev-1',
          jogosSelecionados: ['jogo-a', 'jogo-b'],
          controlePrompts: 'playstation'
        },
        catalogo: { sincronizadoEm: CATALOGO.sincronizadoEm, jogos: 2 },
        ultimoSync: RESUMO,
        proximaTentativaEm: PROXIMA,
        analytics: {
          pendentes: 3,
          ultimoFlushOk: false,
          ultimoFlushEm: '2026-11-01T00:00:02.000Z',
          ultimoFlushCode: 'ANALYTICS_INDISPONIVEL'
        },
        sfxMudo: true,
        logPath: LOG_PATH,
        versao: '1.2.3'
      }
    })
  })

  it('sem config, sem Catálogo e com analytics null ⇒ os três vêm null e ok: true', async () => {
    const { deps } = montar({
      lerConfigEstacao: async () => null,
      catalogoAtual: () => null,
      analytics: null
    })

    const result = await handleOperatorStatus(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status.config).toBeNull()
    expect(result.status.catalogo).toBeNull()
    expect(result.status.analytics).toBeNull()
  })

  it('station.json ilegível ⇒ config: null e o Status abre mesmo assim', async () => {
    const { deps } = montar({
      lerConfigEstacao: async () => {
        throw new Error('EACCES')
      }
    })

    const result = await handleOperatorStatus(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status.config).toBeNull()
  })

  it('pendentes que rejeita ⇒ pendentes: 0 e ok: true', async () => {
    const { deps, pendentes } = montar()
    pendentes.mockRejectedValue(new Error('disco'))

    const result = await handleOperatorStatus(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status.analytics?.pendentes).toBe(0)
    expect(result.status.analytics?.ultimoFlushCode).toBe('ANALYTICS_INDISPONIVEL')
  })

  it('ler o Status não dispara rede: nem forcar nem flushAgora', async () => {
    const { deps, forcar, flushAgora } = montar()

    await handleOperatorStatus(deps)

    expect(forcar).not.toHaveBeenCalled()
    expect(flushAgora).not.toHaveBeenCalled()
  })
})

describe('handleOperatorForceSync', () => {
  it('sync ok ⇒ sincronizadoEm do Catálogo e flushAgora chamado 1×', async () => {
    const { deps, flushAgora } = montar()

    await expect(handleOperatorForceSync(deps)).resolves.toEqual({
      ok: true,
      sincronizadoEm: CATALOGO.sincronizadoEm
    })
    expect(flushAgora).toHaveBeenCalledTimes(1)
  })

  it('sync falho ⇒ o mesmo code e flushAgora ainda chamado 1×', async () => {
    const { deps, forcar, flushAgora } = montar()
    forcar.mockResolvedValue({ ok: false, code: 'CATALOGO_INVALIDO' })

    await expect(handleOperatorForceSync(deps)).resolves.toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(flushAgora).toHaveBeenCalledTimes(1)
  })

  it('flushAgora que nunca resolve não segura a resposta', async () => {
    const { deps, flushAgora } = montar()
    flushAgora.mockReturnValue(new Promise(() => {}))

    await expect(handleOperatorForceSync(deps)).resolves.toEqual({
      ok: true,
      sincronizadoEm: CATALOGO.sincronizadoEm
    })
  })

  it('forcar que rejeita ⇒ CATALOGO_INDISPONIVEL', async () => {
    const { deps, forcar } = montar()
    forcar.mockRejectedValue(new Error('boom'))

    await expect(handleOperatorForceSync(deps)).resolves.toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  })
})

describe('handleOperatorSetSfxMudo', () => {
  it('true ⇒ grava { sfxMudo: true } e devolve ok', async () => {
    const { deps, gravar } = montar()

    await expect(handleOperatorSetSfxMudo(true, deps)).resolves.toEqual({ ok: true })
    expect(gravar).toHaveBeenCalledWith({ sfxMudo: true })
  })

  it.each(['true', 1, null, undefined, {}])('entrada inválida %p ⇒ PREFS_INVALIDAS sem gravar', async (entrada) => {
    const { deps, gravar } = montar()

    await expect(handleOperatorSetSfxMudo(entrada, deps)).resolves.toEqual({ ok: false, code: 'PREFS_INVALIDAS' })
    expect(gravar).not.toHaveBeenCalled()
  })

  it('gravarPrefsOperador que rejeita ⇒ STORE_INDISPONIVEL', async () => {
    const { deps, gravar } = montar()
    gravar.mockRejectedValue(new Error('disco cheio'))

    await expect(handleOperatorSetSfxMudo(true, deps)).resolves.toEqual({ ok: false, code: 'STORE_INDISPONIVEL' })
  })
})

describe('handleOperatorLogTail', () => {
  it('pede 200 linhas e devolve as linhas', async () => {
    const { deps, lerFinal } = montar()

    await expect(handleOperatorLogTail(deps)).resolves.toEqual({
      ok: true,
      linhas: ['linha-1', 'linha-2']
    })
    expect(lerFinal).toHaveBeenCalledWith(200)
  })

  it('lerFinal que rejeita ⇒ LOG_INDISPONIVEL', async () => {
    const { deps, lerFinal } = montar()
    lerFinal.mockRejectedValue(new Error('EACCES'))

    await expect(handleOperatorLogTail(deps)).resolves.toEqual({ ok: false, code: 'LOG_INDISPONIVEL' })
  })
})

