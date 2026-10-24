import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JogosTable, MidiaStorage } from '../../supabase/client'
import { catalogPath, mediaDir } from '../cache'
import { sync } from '../sync'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-catalog-sync-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const LINHA_VALIDA = {
  id: 'jogo-a',
  titulo: 'Jogo A',
  ano: 2024,
  guilda: 'Guilda A',
  genero: 'Aventura',
  modalidade: 'single-player',
  sinopse: 'Uma sinopse.',
  redes_url: 'https://exemplo.com',
  exe_relativo: 'Jogo.exe'
}

const LINHA_INVALIDA = {
  ...LINHA_VALIDA,
  id: 'jogo-b',
  titulo: 'Jogo B',
  modalidade: 'coop' // fora do enum de modalidade
}

const PASTA_JOGO_A = ['capa.png', 'hero.jpg', 'logo.png', 'detalhe-1.png']

function fakeJogos(listar: JogosTable['listar']): JogosTable {
  return { listar }
}

function fakeMidia(pastas: Record<string, string[]>, baixar?: MidiaStorage['baixar']): MidiaStorage {
  return {
    listar: async (pasta) => pastas[pasta] ?? [],
    baixar: baixar ?? (async () => Buffer.from('fake-bytes'))
  }
}

function midiaCompleta(): MidiaStorage {
  return fakeMidia({ 'jogo-a': PASTA_JOGO_A })
}

function escreverCacheAnterior(baseDir: string): { jogos: never[]; sincronizadoEm: string } {
  mkdirSync(join(baseDir, 'catalog', 'current'), { recursive: true })
  const cacheAnterior = { jogos: [], sincronizadoEm: '2020-01-01T00:00:00.000Z' }
  writeFileSync(catalogPath(baseDir), JSON.stringify(cacheAnterior))
  return cacheAnterior
}

describe('sync (orquestrador)', () => {
  it('Supabase não configurado (sem clients, sem config) -> CATALOGO_NAO_CONFIGURADO', async () => {
    const baseDir = tmpDir()
    const result = await sync([], { baseDir })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_NAO_CONFIGURADO' })
  })

  it('happy path: sync completa, catalog.json + media/ gravados atomicamente sob current/', async () => {
    const baseDir = tmpDir()
    const result = await sync([], {
      baseDir,
      clients: { jogos: fakeJogos(async () => [LINHA_VALIDA]), midia: midiaCompleta() }
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalogo.jogos).toHaveLength(1)
    expect(result.catalogo.jogos[0]).toMatchObject({
      id: 'jogo-a',
      titulo: 'Jogo A',
      detalheImagens: ['detalhe-1']
    })
    expect(typeof result.catalogo.sincronizadoEm).toBe('string')

    const persisted = JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))
    expect(persisted).toEqual(result.catalogo)
    expect(readFileSync(join(mediaDir(baseDir), 'jogo-a', 'capa.png'))).toBeInstanceOf(Buffer)
    expect(readFileSync(join(mediaDir(baseDir), 'jogo-a', 'detalhe-1.png'))).toBeInstanceOf(Buffer)
  })

  it('linha inválida -> CATALOGO_INVALIDO, Cache anterior preservado intocado (mídia nem é tentada)', async () => {
    const baseDir = tmpDir()
    const cacheAnterior = escreverCacheAnterior(baseDir)
    const listar = vi.fn()

    const result = await sync([], {
      baseDir,
      clients: {
        jogos: fakeJogos(async () => [LINHA_VALIDA, LINHA_INVALIDA]),
        midia: { listar, baixar: vi.fn() }
      }
    })

    expect(result).toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
    expect(listar).not.toHaveBeenCalled()
  })

  it('falha de rede/API na tabela jogos -> CATALOGO_INDISPONIVEL, Cache anterior preservado', async () => {
    const baseDir = tmpDir()
    const cacheAnterior = escreverCacheAnterior(baseDir)
    const result = await sync([], {
      baseDir,
      clients: { jogos: fakeJogos(() => Promise.reject(new Error('ETIMEDOUT'))), midia: midiaCompleta() }
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
  })

  it('asset obrigatório ausente (sem logo.*) -> MIDIA_INDISPONIVEL, Cache anterior preservado', async () => {
    const baseDir = tmpDir()
    const cacheAnterior = escreverCacheAnterior(baseDir)
    const result = await sync([], {
      baseDir,
      clients: {
        jogos: fakeJogos(async () => [LINHA_VALIDA]),
        midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A.filter((nome) => !nome.startsWith('logo')) })
      }
    })

    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
  })

  it('pasta de mídia ausente/vazia pro Jogo -> MIDIA_INDISPONIVEL', async () => {
    const baseDir = tmpDir()
    const result = await sync([], {
      baseDir,
      clients: { jogos: fakeJogos(async () => [LINHA_VALIDA]), midia: fakeMidia({}) }
    })
    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
  })

  it('download de um asset falha (rede) -> MIDIA_INDISPONIVEL, Cache anterior preservado', async () => {
    const baseDir = tmpDir()
    const cacheAnterior = escreverCacheAnterior(baseDir)
    const result = await sync([], {
      baseDir,
      clients: {
        jogos: fakeJogos(async () => [LINHA_VALIDA]),
        midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }, () => Promise.reject(new Error('ETIMEDOUT')))
      }
    })
    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
    expect(JSON.parse(readFileSync(catalogPath(baseDir), 'utf-8'))).toEqual(cacheAnterior)
  })

  it('mutex single-flight: chamada concorrente reusa a mesma Promise e só lê a tabela uma vez', async () => {
    const baseDir = tmpDir()
    const gate = Promise.withResolvers<unknown[]>()
    const listar = vi.fn(() => gate.promise)
    const deps = { baseDir, clients: { jogos: fakeJogos(listar), midia: midiaCompleta() } }

    const p1 = sync([], deps)
    const p2 = sync([], deps)
    expect(p1).toBe(p2)

    gate.resolve([LINHA_VALIDA])
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(r2)
    expect(r1.ok).toBe(true)
    expect(listar).toHaveBeenCalledTimes(1)

    // Depois de resolvido, o mutex libera: uma 3ª chamada dispara uma nova leitura.
    const listar2 = vi.fn().mockResolvedValue([LINHA_VALIDA])
    const r3 = await sync([], { baseDir, clients: { jogos: fakeJogos(listar2), midia: midiaCompleta() } })
    expect(r3.ok).toBe(true)
    expect(listar2).toHaveBeenCalledTimes(1)
  })
})
