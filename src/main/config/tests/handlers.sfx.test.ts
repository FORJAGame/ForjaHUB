import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, ConfigEstacao, Jogo } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '../../store/config-estacao'
import { handleAppHydrate } from '../handlers'

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
    } satisfies Jogo
  ],
  sincronizadoEm: '2026-11-01T00:00:00.000Z'
}

function config(jogosSelecionados: string[]): ConfigEstacao {
  return {
    estacaoId: 'est-1',
    eventoId: 'ev-1',
    jogosSelecionados,
    controlePrompts: 'playstation',
    schemaVersion: CURRENT_SCHEMA_VERSION
  }
}

const lerSfxMudo = async (): Promise<boolean> => true

describe('handleAppHydrate — preferência de SFX do Operador', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lerSfxMudo true chega no hydrate nos três desfechos ok', async () => {
    const semConfig = await handleAppHydrate({
      lerConfigEstacao: async () => null,
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO }),
      lerSfxMudo
    })
    expect(semConfig.ok).toBe(true)
    if (!semConfig.ok) return
    expect(semConfig.mode).toBe('setup')
    expect(semConfig.sfxMudo).toBe(true)

    const comCatalogo = await handleAppHydrate({
      lerConfigEstacao: async () => config(['jogo-a']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO }),
      lerSfxMudo
    })
    expect(comCatalogo.ok).toBe(true)
    if (!comCatalogo.ok) return
    expect(comCatalogo.mode).toBe('catalog')
    expect(comCatalogo.sfxMudo).toBe(true)

    const orfa = await handleAppHydrate({
      lerConfigEstacao: async () => config(['fantasma']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO }),
      lerSfxMudo
    })
    expect(orfa.ok).toBe(true)
    if (!orfa.ok) return
    expect(orfa.mode).toBe('setup')
    expect(orfa.sfxMudo).toBe(true)
  })

  it('sem a dep lerSfxMudo ⇒ sfxMudo: false', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['jogo-a']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO })
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sfxMudo).toBe(false)
  })
  it('lerSfxMudo que rejeita ⇒ sfxMudo: false e o hydrate continua ok', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['jogo-a']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO }),
      lerSfxMudo: async () => {
        throw new Error('disco')
      }
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sfxMudo).toBe(false)
    expect(erro).toHaveBeenCalled()
  })
})

