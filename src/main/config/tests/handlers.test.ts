import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult, ConfigEstacao, Jogo } from '@shared/types'
import { CURRENT_SCHEMA_VERSION, SchemaIncompativelError } from '../../store/config-estacao'
import { findLaunchableJogo, handleAppHydrate, handleConfigRoster, handleConfigSetupSubmit } from '../handlers'

const CATALOGO: Catalogo = {
  jogos: [
    {
      id: 'jogo-a',
      titulo: 'Jogo A',
      ano: 2024,
      guilda: 'Guilda A',
      genero: 'Aventura',
      modalidade: 'single-player',
      sinopse: 'Sinopse.',
      redesUrl: '',
      exeRelativo: 'Jogo.exe',
      detalheImagens: ['detalhe-1']
    }
  ],
  sincronizadoEm: '2026-09-14T00:00:00.000Z'
}

function catalogoOk(): { ok: true; catalogo: Catalogo } {
  return { ok: true, catalogo: CATALOGO }
}

describe('handleConfigRoster', () => {
  it('catálogo ok -> devolve o roster com a versão da mídia', async () => {
    const result = await handleConfigRoster(async () => catalogoOk())
    expect(result).toEqual({ ok: true, roster: CATALOGO.jogos, sincronizadoEm: CATALOGO.sincronizadoEm })
  })

  it('catálogo falho -> propaga o mesmo code (sem virar SETUP_* nem sumir)', async () => {
    const falha: CommandResult<{ catalogo: Catalogo }> = { ok: false, code: 'CREDENCIAL_AUSENTE' }
    const result = await handleConfigRoster(async () => falha)
    expect(result).toEqual({ ok: false, code: 'CREDENCIAL_AUSENTE' })
  })
})

describe('handleConfigSetupSubmit', () => {
  const inputValido = { estacaoId: 'tv-1', eventoId: 'evento-1', jogosSelecionados: ['jogo-a'] }

  it('catálogo falho -> propaga o code real ANTES do validateSetupSubmit (regressão do bug: rosterIds=[] escondia o motivo)', async () => {
    const falha: CommandResult<{ catalogo: Catalogo }> = { ok: false, code: 'CATALOGO_NAO_CONFIGURADO' }
    const gravarConfigEstacao = vi.fn()
    const result = await handleConfigSetupSubmit(inputValido, {
      getCatalogResult: async () => falha,
      gravarConfigEstacao
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
    expect(gravarConfigEstacao).not.toHaveBeenCalled()
  })

  it('catálogo ok + input válido -> grava a config e devolve ok', async () => {
    const gravarConfigEstacao = vi.fn().mockResolvedValue(undefined)
    const result = await handleConfigSetupSubmit(inputValido, {
      getCatalogResult: async () => catalogoOk(),
      gravarConfigEstacao
    })
    expect(result).toEqual({ ok: true })
    expect(gravarConfigEstacao).toHaveBeenCalledWith({
      estacaoId: 'tv-1',
      eventoId: 'evento-1',
      jogosSelecionados: ['jogo-a'],
      schemaVersion: expect.any(Number)
    })
  })

  it('catálogo ok + Jogo fora do roster -> SETUP_JOGO_DESCONHECIDO, sem gravar', async () => {
    const gravarConfigEstacao = vi.fn()
    const result = await handleConfigSetupSubmit(
      { ...inputValido, jogosSelecionados: ['jogo-fantasma'] },
      { getCatalogResult: async () => catalogoOk(), gravarConfigEstacao }
    )
    expect(result).toEqual({ ok: false, code: 'SETUP_JOGO_DESCONHECIDO' })
    expect(gravarConfigEstacao).not.toHaveBeenCalled()
  })

  it('falha ao gravar station.json -> STORE_INDISPONIVEL', async () => {
    const gravarConfigEstacao = vi.fn().mockRejectedValue(new Error('disco cheio'))
    const result = await handleConfigSetupSubmit(inputValido, {
      getCatalogResult: async () => catalogoOk(),
      gravarConfigEstacao
    })
    expect(result).toEqual({ ok: false, code: 'STORE_INDISPONIVEL' })
  })
})

function jogo(id: string): Jogo {
  return { ...CATALOGO.jogos[0], id, titulo: id }
}

const CATALOGO_KIOSK: Catalogo = {
  jogos: [jogo('rebite'), jogo('corvo'), jogo('pancada')],
  sincronizadoEm: '2026-09-25T00:00:00.000Z'
}

function config(jogosSelecionados: string[]): ConfigEstacao {
  return {
    estacaoId: 'tv-1',
    eventoId: 'evento-1',
    jogosSelecionados,
    schemaVersion: CURRENT_SCHEMA_VERSION
  }
}

describe('handleAppHydrate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('com config + Catálogo ok -> catalog só com os selecionados, ordem por id', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite', 'corvo']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(result.ok && result.mode).toBe('catalog')
    expect(result.ok && result.catalogo?.jogos.map((j) => j.id)).toEqual(['corvo', 'rebite'])
  })

  it('sem config -> setup sem Catálogo e sem esperar o sync', async () => {
    const getCatalogResult = vi.fn()
    const result = await handleAppHydrate({ lerConfigEstacao: async () => null, getCatalogResult })
    expect(result).toEqual({ ok: true, mode: 'setup', catalogo: null, focusedGameId: null })
    expect(getCatalogResult).not.toHaveBeenCalled()
  })

  it('seleção inteira órfã -> setup sem Catálogo, avisando os ids que caíram', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['fantasma', 'sumido']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(result).toEqual({ ok: true, mode: 'setup', catalogo: null, focusedGameId: null })
    expect(warn).toHaveBeenCalledWith(expect.any(String), ['fantasma', 'sumido'])
  })

  it('parte dos selecionados sumiu -> catalog sem os ausentes, avisando os ids', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['pancada', 'fantasma']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(result.ok && result.mode).toBe('catalog')
    expect(result.ok && result.catalogo?.jogos.map((j) => j.id)).toEqual(['pancada'])
    expect(warn).toHaveBeenCalledWith(expect.any(String), ['fantasma'])
  })

  it('Catálogo indisponível -> propaga o code', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['corvo']),
      getCatalogResult: async () => ({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  })

  it('station.json de versão futura -> SCHEMA_INCOMPATIVEL', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => {
        throw new SchemaIncompativelError(9, 1)
      },
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.code).toBe('SCHEMA_INCOMPATIVEL')
  })

  it('falha qualquer lendo station.json -> STORE_INDISPONIVEL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => {
        throw new Error('EACCES')
      },
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(result).toEqual({ ok: false, code: 'STORE_INDISPONIVEL' })
  })

  it('último Jogo lançado ainda na view -> focusedGameId é ele', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite', 'corvo']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK }),
      ultimoJogoId: () => 'rebite'
    })
    expect(result.ok && result.mode).toBe('catalog')
    expect(result.ok && result.focusedGameId).toBe('rebite')
  })

  it('último Jogo lançado fora da view (não selecionado ou sumido) -> focusedGameId null', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK }),
      ultimoJogoId: () => 'pancada'
    })
    expect(result.ok && result.mode).toBe('catalog')
    expect(result.ok && result.focusedGameId).toBeNull()
  })

  it('sem ultimoJogoId (ou null) -> focusedGameId null', async () => {
    const semDep = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
    })
    expect(semDep.ok && semDep.focusedGameId).toBeNull()

    const comNull = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite']),
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK }),
      ultimoJogoId: () => null
    })
    expect(comNull.ok && comNull.focusedGameId).toBeNull()
  })
})


describe('handleAppHydrate — foco da volta de uma partida', () => {
  afterEach(() => vi.restoreAllMocks())

  it('Jogo desselecionado depois de jogado: o hydrate seguinte não foca nele', async () => {
    let selecionados = ['rebite', 'corvo']
    const deps = {
      lerConfigEstacao: async () => config(selecionados),
      getCatalogResult: async () => ({ ok: true as const, catalogo: CATALOGO_KIOSK }),
      ultimoJogoId: () => 'corvo'
    }

    const antes = await handleAppHydrate(deps)
    expect(antes.ok && antes.focusedGameId).toBe('corvo')

    selecionados = ['rebite']
    const depois = await handleAppHydrate(deps)
    expect(depois.ok && depois.mode).toBe('catalog')
    expect(depois.ok && depois.focusedGameId).toBeNull()
  })

  it('Jogo jogado que sumiu do Catálogo sincronizado: focusedGameId null, mesmo ainda selecionado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => config(['rebite', 'corvo']),
      getCatalogResult: async () => ({
        ok: true,
        catalogo: { ...CATALOGO_KIOSK, jogos: CATALOGO_KIOSK.jogos.filter((j) => j.id !== 'corvo') }
      }),
      ultimoJogoId: () => 'corvo'
    })
    expect(result.ok && result.mode).toBe('catalog')
    expect(result.ok && result.focusedGameId).toBeNull()
  })

  it('config ausente com Jogo jogado: setup, sem foco', async () => {
    const result = await handleAppHydrate({
      lerConfigEstacao: async () => null,
      getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK }),
      ultimoJogoId: () => 'rebite'
    })
    expect(result).toEqual({ ok: true, mode: 'setup', catalogo: null, focusedGameId: null })
  })
})

describe('findLaunchableJogo', () => {
  afterEach(() => vi.restoreAllMocks())

  const deps = (selecionados: string[] | null): Parameters<typeof findLaunchableJogo>[1] => ({
    lerConfigEstacao: async () => (selecionados ? config(selecionados) : null),
    getCatalogResult: async () => ({ ok: true, catalogo: CATALOGO_KIOSK })
  })

  it('Jogo selecionado e no Catálogo -> devolve o Jogo', async () => {
    await expect(findLaunchableJogo('corvo', deps(['corvo', 'rebite']))).resolves.toMatchObject({ id: 'corvo' })
  })

  it('Jogo no Catálogo mas fora da seleção da Estação -> null (o renderer não abre build alheio)', async () => {
    await expect(findLaunchableJogo('pancada', deps(['corvo']))).resolves.toBeNull()
  })

  it('sem config, Catálogo falho ou leitura que lança -> null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(findLaunchableJogo('corvo', deps(null))).resolves.toBeNull()
    await expect(
      findLaunchableJogo('corvo', { ...deps(['corvo']), getCatalogResult: async () => ({ ok: false, code: 'X' }) })
    ).resolves.toBeNull()
    await expect(
      findLaunchableJogo('corvo', {
        ...deps(['corvo']),
        lerConfigEstacao: async () => {
          throw new Error('EIO')
        }
      })
    ).resolves.toBeNull()
  })
})
