import { describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult } from '@shared/types'
import { handleConfigRoster, handleConfigSetupSubmit } from '../handlers'

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
      exeRelativo: 'Jogo.exe'
    }
  ],
  sincronizadoEm: '2026-09-14T00:00:00.000Z'
}

function catalogoOk(): { ok: true; catalogo: Catalogo } {
  return { ok: true, catalogo: CATALOGO }
}

describe('handleConfigRoster', () => {
  it('catálogo ok -> devolve o roster', async () => {
    const result = await handleConfigRoster(async () => catalogoOk())
    expect(result).toEqual({ ok: true, roster: CATALOGO.jogos })
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

