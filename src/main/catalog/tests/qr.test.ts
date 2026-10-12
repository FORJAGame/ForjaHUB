import { describe, expect, it } from 'vitest'
import type { Catalogo, Jogo } from '@shared/types'
import { qrResponse, renderQrPng } from '../qr'

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

describe('renderQrPng', () => {
  it('gera um PNG válido (assinatura 89 50 4E 47)', async () => {
    const png = await renderQrPng('https://store.steampowered.com/app/1/exemplo')

    expect(png.subarray(0, 4)).toEqual(ASSINATURA_PNG)
    expect(png.length).toBeGreaterThan(ASSINATURA_PNG.length)
  })

  it('sai com 256px de largura', async () => {
    const png = await renderQrPng('https://forja.example/jogo')

    // Largura no IHDR (offset 16 do PNG), em big-endian.
    expect(png.readUInt32BE(16)).toBe(256)
  })

  it('URLs diferentes geram pixels diferentes', async () => {
    const a = await renderQrPng('https://forja.example/a')
    const b = await renderQrPng('https://forja.example/b')

    expect(a.equals(b)).toBe(false)
  })
})

function catalogo(...jogos: Array<Pick<Jogo, 'id' | 'redesUrl'>>): Catalogo {
  return {
    sincronizadoEm: '2026-10-11T00:00:00.000Z',
    jogos: jogos.map((j) => ({
      ...j,
      titulo: j.id,
      ano: 2026,
      guilda: 'FORJA',
      genero: 'Ação',
      modalidade: 'single-player',
      sinopse: 'Sinopse.',
      exeRelativo: '',
      detalheImagens: ['detalhe-1']
    }))
  }
}

describe('qrResponse (rota forja://media/<id>/qr)', () => {
  it('Jogo com redes -> 200 image/png com o PNG inteiro', async () => {
    const url = 'https://forja.example/a'
    const res = await qrResponse(catalogo({ id: 'jogo-a', redesUrl: url }), 'jogo-a')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await res.arrayBuffer()).equals(await renderQrPng(url))).toBe(true)
  })

  it.each([
    ['sem redes', catalogo({ id: 'jogo-a', redesUrl: '' }), 'jogo-a'],
    ['Jogo fora do Catálogo', catalogo({ id: 'jogo-a', redesUrl: 'https://forja.example/a' }), 'jogo-b'],
    ['Catálogo ainda não carregado', null, 'jogo-a']
  ])('%s -> 404 (o renderer esconde o selo)', async (_caso, cat, id) => {
    expect((await qrResponse(cat, id)).status).toBe(404)
  })
})
