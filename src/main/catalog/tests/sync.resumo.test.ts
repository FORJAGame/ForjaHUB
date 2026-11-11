import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalogo, CommandResult, SyncResumo } from '@shared/types'
import type { HubLog } from '../../log/hub-log'
import type { SyncDeps } from '../sync'
import type { JogosTable, MidiaStorage } from '../../supabase/client'


type SyncResult = CommandResult<{ catalogo: Catalogo }>

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

const LINHA_INVALIDA = { ...LINHA_VALIDA, ano: 'dois mil e vinte e quatro' }

const PASTA_JOGO_A = ['capa.png', 'hero.jpg', 'logo.png', 'detalhe-1.png']

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-sync-resumo-'))
  dirs.push(d)
  return d
}

// `vi.resetModules` exige import dinâmico para pegar o estado de módulo limpo.
async function novoSync(): Promise<{
  sync: (ids: string[], deps?: SyncDeps) => Promise<SyncResult>
  ultimoSync: () => SyncResumo | null
  hubLog: HubLog
}> {
  vi.resetModules()
  const { sync, ultimoSync } = await import('../sync')
  const { hubLog } = await import('../../log/hub-log')
  return { sync, ultimoSync, hubLog }
}

function fakeJogos(listar: JogosTable['listar']): JogosTable {
  return { listar }
}

function fakeMidia(pastas: Record<string, string[]>): MidiaStorage {
  return {
    listar: async (pasta) => pastas[pasta] ?? [],
    baixar: async () => Buffer.from('fake-bytes')
  }
}

function clientsOk(): { jogos: JogosTable; midia: MidiaStorage } {
  return { jogos: fakeJogos(async () => [LINHA_VALIDA]), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('ultimoSync (resumo do sync)', () => {
  it('antes de qualquer sync é null', async () => {
    const { ultimoSync } = await novoSync()
    expect(ultimoSync()).toBeNull()
  })

  it('sync ok ⇒ { ok: true, code: null, em: <ISO válido> }', async () => {
    const { sync, ultimoSync } = await novoSync()
    const result = await sync([], { baseDir: tmpDir(), clients: clientsOk() })
    expect(result.ok).toBe(true)

    const resumo = ultimoSync()
    expect(resumo!.ok).toBe(true)
    expect(resumo!.code).toBeNull()
    expect(typeof resumo!.em).toBe('string')
    expect(Number.isNaN(Date.parse(resumo!.em))).toBe(false)
  })

  it('jogo inválido ⇒ resumo com code CATALOGO_INVALIDO', async () => {
    const { sync, ultimoSync } = await novoSync()
    const result = await sync([], {
      baseDir: tmpDir(),
      clients: { jogos: fakeJogos(async () => [LINHA_INVALIDA]), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) }
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(ultimoSync()).toMatchObject({ ok: false, code: 'CATALOGO_INVALIDO' })
  })

  it('falha de rede ao ler jogos ⇒ resumo com code CATALOGO_INDISPONIVEL', async () => {
    const { sync, ultimoSync } = await novoSync()
    const result = await sync([], {
      baseDir: tmpDir(),
      clients: { jogos: fakeJogos(() => Promise.reject(new Error('ETIMEDOUT'))), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) }
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
    expect(ultimoSync()).toMatchObject({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  })

  it('mídia faltando ⇒ resumo com code MIDIA_INDISPONIVEL', async () => {
    const { sync, ultimoSync } = await novoSync()
    const result = await sync([], {
      baseDir: tmpDir(),
      clients: { jogos: fakeJogos(async () => [LINHA_VALIDA]), midia: fakeMidia({}) }
    })
    expect(result).toEqual({ ok: false, code: 'MIDIA_INDISPONIVEL' })
    expect(ultimoSync()).toMatchObject({ ok: false, code: 'MIDIA_INDISPONIVEL' })
  })

  it('falha depois de um sucesso substitui o resumo (o último ganha)', async () => {
    const { sync, ultimoSync } = await novoSync()
    const baseDir = tmpDir()

    await sync([], { baseDir, clients: clientsOk() })
    expect(ultimoSync()!.ok).toBe(true)

    await sync([], {
      baseDir,
      clients: { jogos: fakeJogos(async () => [LINHA_INVALIDA]), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) }
    })
    const resumo = ultimoSync()
    expect(resumo!.ok).toBe(false)
    expect(resumo!.code).toBe('CATALOGO_INVALIDO')
    expect(Number.isNaN(Date.parse(resumo!.em))).toBe(false)
  })

  it('duas chamadas na mesma Promise em voo logam o resultado no hubLog uma vez só', async () => {
    const { sync, hubLog } = await novoSync()
    const espiaInfo = vi.spyOn(hubLog, 'info').mockImplementation(() => {})
    const espiaErro = vi.spyOn(hubLog, 'erro').mockImplementation(() => {})

    const gate = Promise.withResolvers<unknown[]>()
    const deps = { baseDir: tmpDir(), clients: { jogos: fakeJogos(() => gate.promise), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) } }
    const p1 = sync([], deps)
    const p2 = sync([], deps)
    expect(p1).toBe(p2)

    gate.resolve([LINHA_VALIDA])
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual(r2)
    expect(r1.ok).toBe(true)
    expect(espiaInfo).toHaveBeenCalledTimes(1)
    expect(espiaErro).not.toHaveBeenCalled()
  })

  it('sync que falha registra no hubLog.erro mensagem contendo o code', async () => {
    const { sync, hubLog } = await novoSync()
    const espiaErro = vi.spyOn(hubLog, 'erro').mockImplementation(() => {})

    const result = await sync([], {
      baseDir: tmpDir(),
      clients: { jogos: fakeJogos(async () => [LINHA_INVALIDA]), midia: fakeMidia({ 'jogo-a': PASTA_JOGO_A }) }
    })
    expect(result).toEqual({ ok: false, code: 'CATALOGO_INVALIDO' })
    expect(espiaErro).toHaveBeenCalledWith('catalogo', expect.stringContaining('CATALOGO_INVALIDO'), expect.anything())
  })
})
