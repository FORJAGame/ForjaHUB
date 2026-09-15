import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JogoMetadata } from '../schema'
import type { DriveMediaClient } from '../google-client'
import { downloadMediaParaJogos, MidiaIndisponivelError } from '../drive-adapter'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-drive-adapter-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const MEDIA_FOLDER_ID = 'media-root'

const METADATA_A: JogoMetadata = {
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

function driveClient(
  folders: Record<string, Array<{ id: string; name: string }>>,
  fileBytes: Record<string, string> = {}
): DriveMediaClient {
  return {
    listFolder: async (folderId) => folders[folderId] ?? [],
    downloadFile: async (fileId) => Buffer.from(fileBytes[fileId] ?? `bytes-${fileId}`)
  }
}

describe('downloadMediaParaJogos', () => {
  it('happy path: baixa capa/hero/logo + detalhe-N, ordenado numericamente, devolve Jogo[] completo', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa', name: 'capa.png' },
        { id: 'f-hero', name: 'hero.jpg' },
        { id: 'f-logo', name: 'logo.png' },
        { id: 'f-d3', name: 'detalhe-3.png' },
        { id: 'f-d1', name: 'detalhe-1.jpg' }
      ]
    })

    const [jogo] = await downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)

    expect(jogo).toMatchObject({ id: 'jogo-a', titulo: 'Jogo A', detalheImagens: ['detalhe-1', 'detalhe-3'] })
    expect(readFileSync(join(staging, 'jogo-a', 'capa.png'), 'utf-8')).toBe('bytes-f-capa')
    expect(readFileSync(join(staging, 'jogo-a', 'hero.jpg'), 'utf-8')).toBe('bytes-f-hero')
    expect(readFileSync(join(staging, 'jogo-a', 'logo.png'), 'utf-8')).toBe('bytes-f-logo')
    expect(readFileSync(join(staging, 'jogo-a', 'detalhe-1.jpg'), 'utf-8')).toBe('bytes-f-d1')
    expect(readFileSync(join(staging, 'jogo-a', 'detalhe-3.png'), 'utf-8')).toBe('bytes-f-d3')
  })

  it('gap no meio (detalhe-1/detalhe-3, sem detalhe-2) não é erro', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa', name: 'capa.png' },
        { id: 'f-hero', name: 'hero.png' },
        { id: 'f-logo', name: 'logo.png' },
        { id: 'f-d1', name: 'detalhe-1.png' },
        { id: 'f-d3', name: 'detalhe-3.png' }
      ]
    })

    const [jogo] = await downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)
    expect(jogo.detalheImagens).toEqual(['detalhe-1', 'detalhe-3'])
  })

  it('pasta do Jogo ausente na raiz -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({ [MEDIA_FOLDER_ID]: [] })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it.each(['capa', 'hero', 'logo'] as const)('%s.* ausente -> MidiaIndisponivelError', async (tipo) => {
    const staging = join(tmpDir(), 'media')
    const todos = [
      { id: 'f-capa', name: 'capa.png' },
      { id: 'f-hero', name: 'hero.png' },
      { id: 'f-logo', name: 'logo.png' },
      { id: 'f-d1', name: 'detalhe-1.png' }
    ]
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': todos.filter((f) => !f.name.startsWith(tipo))
    })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('zero detalhe-N -> MidiaIndisponivelError (obrigatório ao menos 1)', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa', name: 'capa.png' },
        { id: 'f-hero', name: 'hero.png' },
        { id: 'f-logo', name: 'logo.png' }
      ]
    })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('download de um asset falha (rede) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive: DriveMediaClient = {
      listFolder: async (folderId) =>
        folderId === MEDIA_FOLDER_ID
          ? [{ id: 'sub-a', name: 'jogo-a' }]
          : [
              { id: 'f-capa', name: 'capa.png' },
              { id: 'f-hero', name: 'hero.png' },
              { id: 'f-logo', name: 'logo.png' },
              { id: 'f-d1', name: 'detalhe-1.png' }
            ],
      downloadFile: vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))
    }
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('assets obrigatórios case-insensitive (alvo Windows/NTFS) -- Capa.PNG conta como capa', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa', name: 'Capa.PNG' },
        { id: 'f-hero', name: 'HERO.jpg' },
        { id: 'f-logo', name: 'Logo.png' },
        { id: 'f-d1', name: 'Detalhe-1.PNG' }
      ]
    })

    const [jogo] = await downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)
    expect(jogo.detalheImagens).toEqual(['detalhe-1'])
    expect(readFileSync(join(staging, 'jogo-a', 'capa.PNG'), 'utf-8')).toBe('bytes-f-capa')
  })

  it('capa.* duplicado (mais de uma extensão pro mesmo tipo obrigatório) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa-png', name: 'capa.png' },
        { id: 'f-capa-jpg', name: 'capa.jpg' },
        { id: 'f-hero', name: 'hero.png' },
        { id: 'f-logo', name: 'logo.png' },
        { id: 'f-d1', name: 'detalhe-1.png' }
      ]
    })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('detalhe-N duplicado entre extensões (detalhe-1.png E detalhe-1.jpg) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [{ id: 'sub-a', name: 'jogo-a' }],
      'sub-a': [
        { id: 'f-capa', name: 'capa.png' },
        { id: 'f-hero', name: 'hero.png' },
        { id: 'f-logo', name: 'logo.png' },
        { id: 'f-d1-png', name: 'detalhe-1.png' },
        { id: 'f-d1-jpg', name: 'detalhe-1.jpg' }
      ]
    })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('subpastas Drive duplicadas com o mesmo nome (id do Jogo) -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive = driveClient({
      [MEDIA_FOLDER_ID]: [
        { id: 'sub-a-1', name: 'jogo-a' },
        { id: 'sub-a-2', name: 'jogo-a' }
      ]
    })
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })

  it('falha listando a subpasta do Jogo -> MidiaIndisponivelError', async () => {
    const staging = join(tmpDir(), 'media')
    const drive: DriveMediaClient = {
      listFolder: vi.fn(async (folderId: string) => {
        if (folderId === MEDIA_FOLDER_ID) return [{ id: 'sub-a', name: 'jogo-a' }]
        throw new Error('ETIMEDOUT')
      }),
      downloadFile: vi.fn()
    }
    await expect(downloadMediaParaJogos(drive, MEDIA_FOLDER_ID, [METADATA_A], staging)).rejects.toThrow(
      MidiaIndisponivelError
    )
  })
})
