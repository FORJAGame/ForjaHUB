import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MidiaStorage } from '../../supabase/client'
import type { JogoMetadata } from '../schema'
import { downloadMediaParaJogos, MidiaIndisponivelError } from '../midia-adapter'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-midia-adapter-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const METADATA_A: JogoMetadata = {
  id: 'jogo-a',
  titulo: 'Jogo A',
  ano: 2024,
  estudio: 'Estúdio A',
  genero: 'Aventura',
  modalidade: 'single-player',
  sinopse: 'Sinopse.',
  redesUrl: '',
  exeRelativo: 'Jogo.exe'
}

const ASSETS_BASE = ['capa.png', 'hero.png', 'logo.png', 'detalhe-1.png']

// Bytes de cada arquivo = `bytes-<jogoId>/<arquivo>`; pasta ausente lista vazio (como o Storage).
function fakeMidia(pastas: Record<string, string[]>): MidiaStorage {
  return {
    listar: async (pasta) => pastas[pasta] ?? [],
    baixar: async (caminho) => Buffer.from(`bytes-${caminho}`)
  }
}

describe('downloadMediaParaJogos', () => {
  it('happy path: baixa capa/hero/logo + detalhe-N, ordenado numericamente, devolve Jogo[] completo', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({
      'jogo-a': ['capa.png', 'hero.jpg', 'logo.png', 'detalhe-10.png', 'detalhe-3.png', 'detalhe-1.jpg']
    })

    const [jogo] = await downloadMediaParaJogos(midia, [METADATA_A], staging)

    expect(jogo).toMatchObject({
      id: 'jogo-a',
      titulo: 'Jogo A',
      detalheImagens: ['detalhe-1', 'detalhe-3', 'detalhe-10']
    })
    expect(readFileSync(join(staging, 'jogo-a', 'capa.png'), 'utf-8')).toBe('bytes-jogo-a/capa.png')
    expect(readFileSync(join(staging, 'jogo-a', 'hero.jpg'), 'utf-8')).toBe('bytes-jogo-a/hero.jpg')
    expect(readFileSync(join(staging, 'jogo-a', 'logo.png'), 'utf-8')).toBe('bytes-jogo-a/logo.png')
    expect(readFileSync(join(staging, 'jogo-a', 'detalhe-1.jpg'), 'utf-8')).toBe('bytes-jogo-a/detalhe-1.jpg')
    expect(readFileSync(join(staging, 'jogo-a', 'detalhe-3.png'), 'utf-8')).toBe('bytes-jogo-a/detalhe-3.png')
    expect(readFileSync(join(staging, 'jogo-a', 'detalhe-10.png'), 'utf-8')).toBe('bytes-jogo-a/detalhe-10.png')
  })

  it('vários Jogos: cada um baixa da própria pasta', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': ASSETS_BASE, 'jogo-b': ASSETS_BASE })
    const jogos = await downloadMediaParaJogos(midia, [METADATA_A, { ...METADATA_A, id: 'jogo-b' }], staging)
    expect(jogos.map((j) => j.id)).toEqual(['jogo-a', 'jogo-b'])
    expect(readFileSync(join(staging, 'jogo-b', 'capa.png'), 'utf-8')).toBe('bytes-jogo-b/capa.png')
  })

  it('gap no meio (detalhe-1/detalhe-3, sem detalhe-2) não é erro', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({
      'jogo-a': ['capa.png', 'hero.png', 'logo.png', 'detalhe-1.png', 'detalhe-3.png']
    })
    const [jogo] = await downloadMediaParaJogos(midia, [METADATA_A], staging)
    expect(jogo.detalheImagens).toEqual(['detalhe-1', 'detalhe-3'])
  })

  it('pasta do Jogo ausente -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({})
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('pasta do Jogo vazia -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': [] })
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it.each(['capa', 'hero', 'logo'] as const)('%s.* ausente -> MidiaIndisponivelError', async (tipo) => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': ASSETS_BASE.filter((nome) => !nome.startsWith(tipo)) })
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('zero detalhe-N -> MidiaIndisponivelError (obrigatório ao menos 1)', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': ['capa.png', 'hero.png', 'logo.png'] })
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('download de um asset falha (rede) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia: MidiaStorage = {
      listar: async () => ASSETS_BASE,
      baixar: vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    }
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('assets obrigatórios case-insensitive (alvo Windows/NTFS) -- Capa.PNG conta como capa', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': ['Capa.PNG', 'HERO.jpg', 'Logo.png', 'Detalhe-1.PNG'] })
    const [jogo] = await downloadMediaParaJogos(midia, [METADATA_A], staging)
    expect(jogo.detalheImagens).toEqual(['detalhe-1'])
    expect(readFileSync(join(staging, 'jogo-a', 'capa.PNG'), 'utf-8')).toBe('bytes-jogo-a/Capa.PNG')
  })

  it('capa.* duplicado (mais de uma extensão pro mesmo tipo obrigatório) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({ 'jogo-a': ['capa.png', 'capa.jpg', 'hero.png', 'logo.png', 'detalhe-1.png'] })
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('detalhe-N duplicado entre extensões (detalhe-1.png E detalhe-1.jpg) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia = fakeMidia({
      'jogo-a': ['capa.png', 'hero.png', 'logo.png', 'detalhe-1.png', 'detalhe-1.jpg']
    })
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })

  it('falha listando a pasta do Jogo -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const midia: MidiaStorage = {
      listar: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')),
      baixar: vi.fn()
    }
    await expect(downloadMediaParaJogos(midia, [METADATA_A], staging)).rejects.toThrow(MidiaIndisponivelError)
  })
})
