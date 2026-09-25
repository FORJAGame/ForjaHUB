import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, ConfigEstacao, Jogo } from '@shared/types'
import { CURRENT_SCHEMA_VERSION } from '../../store/config-estacao'
import { kioskCatalogUpdate, kioskView } from '../kiosk-view'

function jogo(id: string): Jogo {
  return {
    id,
    titulo: id.toUpperCase(),
    ano: 2025,
    guilda: 'Guilda',
    genero: 'Ação',
    modalidade: 'single-player',
    sinopse: '',
    redesUrl: '',
    exeRelativo: '',
    detalheImagens: ['detalhe-1']
  }
}

const CATALOGO: Catalogo = {
  jogos: [jogo('corvo'), jogo('ancora'), jogo('pancada'), jogo('rebite')],
  sincronizadoEm: '2026-09-25T00:00:00.000Z'
}

describe('kioskView', () => {
  it('mantém só os selecionados, ordenados por id, sem ausentes', () => {
    const view = kioskView(CATALOGO, ['pancada', 'ancora', 'corvo'])
    expect(view.catalogo.jogos.map((j) => j.id)).toEqual(['ancora', 'corvo', 'pancada'])
    expect(view.catalogo.sincronizadoEm).toBe(CATALOGO.sincronizadoEm)
    expect(view.ausentes).toEqual([])
  })

  it('selecionado que sumiu do Catálogo sai da view e vai para ausentes', () => {
    const view = kioskView(CATALOGO, ['rebite', 'fantasma', 'corvo'])
    expect(view.catalogo.jogos.map((j) => j.id)).toEqual(['corvo', 'rebite'])
    expect(view.ausentes).toEqual(['fantasma'])
  })

  it('seleção inteira órfã ⇒ view vazia com todos os ids em ausentes', () => {
    const view = kioskView(CATALOGO, ['x', 'y'])
    expect(view.catalogo.jogos).toEqual([])
    expect(view.ausentes).toEqual(['x', 'y'])
  })

  it('não muta o Catálogo recebido', () => {
    const ids = CATALOGO.jogos.map((j) => j.id)
    kioskView(CATALOGO, ['rebite', 'ancora'])
    expect(CATALOGO.jogos.map((j) => j.id)).toEqual(ids)
  })
})

function config(jogosSelecionados: string[]): ConfigEstacao {
  return { estacaoId: 'tv-1', eventoId: 'evento-1', jogosSelecionados, schemaVersion: CURRENT_SCHEMA_VERSION }
}

describe('kioskCatalogUpdate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('com config -> view filtrada', async () => {
    const view = await kioskCatalogUpdate(CATALOGO, async () => config(['pancada']))
    expect(view?.jogos.map((j) => j.id)).toEqual(['pancada'])
  })

  it('sem config -> null (não envia)', async () => {
    expect(await kioskCatalogUpdate(CATALOGO, async () => null)).toBeNull()
  })

  it('view vazia -> null (não envia)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await kioskCatalogUpdate(CATALOGO, async () => config(['fantasma']))).toBeNull()
  })

  it('config ilegível -> null (não envia)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = await kioskCatalogUpdate(CATALOGO, async () => {
      throw new Error('EIO')
    })
    expect(view).toBeNull()
  })
})
