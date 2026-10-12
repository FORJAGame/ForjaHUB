import { toBuffer } from 'qrcode'
import type { Catalogo } from '@shared/types'

/**
 * PNG do selo QR das redes do Jogo. Gerado no `main` porque o renderer não
 * alcança a rede; o selo chega pela rota `forja://media/<id>/qr`.
 */
export async function renderQrPng(url: string): Promise<Buffer> {
  return toBuffer(url, { type: 'png', margin: 1, width: 256, errorCorrectionLevel: 'M' })
}

export async function qrResponse(catalogo: Catalogo | null, jogoId: string): Promise<Response> {
  const jogo = catalogo?.jogos.find((item) => item.id === jogoId)
  if (!jogo?.redesUrl) return new Response(null, { status: 404 })

  const png = await renderQrPng(jogo.redesUrl)
  const corpo = new Uint8Array(png.buffer as ArrayBuffer, png.byteOffset, png.byteLength)
  return new Response(corpo, { headers: { 'content-type': 'image/png' } })
}
