import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mediaUrl } from '@shared/media'
import { parseForjaMediaUrl, resolveMediaAsset } from '../media-protocol'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-media-protocol-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function montarMedia(mediaBaseDir: string, id: string, arquivos: string[]): void {
  const dir = join(mediaBaseDir, id)
  mkdirSync(dir, { recursive: true })
  for (const nome of arquivos) writeFileSync(join(dir, nome), 'bytes')
}

describe('resolveMediaAsset', () => {
  it('resolve capa/hero/logo pro arquivo certo com content-type mapeado', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['capa.png', 'hero.jpg', 'logo.webp'])

    await expect(resolveMediaAsset(mediaBaseDir, 'jogo-a', 'capa')).resolves.toEqual({
      path: join(mediaBaseDir, 'jogo-a', 'capa.png'),
      contentType: 'image/png'
    })
    await expect(resolveMediaAsset(mediaBaseDir, 'jogo-a', 'hero')).resolves.toEqual({
      path: join(mediaBaseDir, 'jogo-a', 'hero.jpg'),
      contentType: 'image/jpeg'
    })
    await expect(resolveMediaAsset(mediaBaseDir, 'jogo-a', 'logo')).resolves.toEqual({
      path: join(mediaBaseDir, 'jogo-a', 'logo.webp'),
      contentType: 'image/webp'
    })
  })

  it('resolve detalhe-N', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['detalhe-1.png', 'detalhe-10.png'])

    const resolvido = await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'detalhe-1')
    expect(resolvido?.path).toBe(join(mediaBaseDir, 'jogo-a', 'detalhe-1.png'))

    const resolvido10 = await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'detalhe-10')
    expect(resolvido10?.path).toBe(join(mediaBaseDir, 'jogo-a', 'detalhe-10.png'))
  })

  it.each(['../etc/passwd', 'Jogo_A', 'jogo a', ''])('id fora de kebab-case (%s) -> null, nunca toca o fs', async (id) => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['capa.png'])
    expect(await resolveMediaAsset(mediaBaseDir, id, 'capa')).toBeNull()
  })

  it.each(['../../etc/passwd', 'detalhe', 'detalhe-', 'capaX', 'exe_relativo', ''])(
    'tipo fora do enum fechado (%s) -> null',
    async (tipo) => {
      const mediaBaseDir = tmpDir()
      montarMedia(mediaBaseDir, 'jogo-a', ['capa.png'])
      expect(await resolveMediaAsset(mediaBaseDir, 'jogo-a', tipo)).toBeNull()
    }
  )

  it.each(['qrx', 'qrX', 'qr.png', 'detalhe-'])('quase-qr (%s) -> null', async (tipo) => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['qr.png'])
    expect(await resolveMediaAsset(mediaBaseDir, 'jogo-a', tipo)).toBeNull()
  })

  it('qr nunca sai do disco, mesmo com qr.png na pasta', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['qr.png'])
    expect(await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'qr')).toBeNull()
  })

  it('id válido mas pasta do Jogo não existe -> null', async () => {
    const mediaBaseDir = tmpDir()
    expect(await resolveMediaAsset(mediaBaseDir, 'jogo-fantasma', 'capa')).toBeNull()
  })

  it('tipo válido mas arquivo ausente -> null', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['capa.png'])
    expect(await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'hero')).toBeNull()
  })

  it('extensão fora do mapa conhecido -> null (tratado como não encontrado)', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['capa.bmp'])
    expect(await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'capa')).toBeNull()
  })

  it('nunca resolve fora de mediaBaseDir/<id>/ mesmo com id validado', async () => {
    const mediaBaseDir = tmpDir()
    montarMedia(mediaBaseDir, 'jogo-a', ['capa.png'])
    const resolvido = await resolveMediaAsset(mediaBaseDir, 'jogo-a', 'capa')
    expect(resolvido?.path.startsWith(join(mediaBaseDir, 'jogo-a'))).toBe(true)
  })
})

describe('parseForjaMediaUrl', () => {
  it('URL bem formada -> { id, tipo }', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/capa')).toEqual({ id: 'jogo-a', tipo: 'capa' })
    expect(parseForjaMediaUrl('forja://media/jogo-a/detalhe-3')).toEqual({ id: 'jogo-a', tipo: 'detalhe-3' })
  })

  it('aceita o `qr` do selo das redes', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/qr?v=1')).toEqual({ id: 'jogo-a', tipo: 'qr' })
  })

  it('quase-qr (`qrx`, `detalhe-`) também parseia: o filtro do tipo é do resolveMediaAsset', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/qrx')).toEqual({ id: 'jogo-a', tipo: 'qrx' })
    expect(parseForjaMediaUrl('forja://media/jogo-a/detalhe-')).toEqual({ id: 'jogo-a', tipo: 'detalhe-' })
  })

  it('URL malformada (não parseia como URL) -> null', () => {
    expect(parseForjaMediaUrl('not a url at all')).toBeNull()
    expect(parseForjaMediaUrl('')).toBeNull()
  })

  it('hostname diferente de "media" -> null', () => {
    expect(parseForjaMediaUrl('forja://outracoisa/jogo-a/capa')).toBeNull()
  })

  it('poucos segmentos no path -> null', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a')).toBeNull()
    expect(parseForjaMediaUrl('forja://media/')).toBeNull()
    expect(parseForjaMediaUrl('forja://media')).toBeNull()
  })

  it('segmentos demais no path -> null', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/capa/extra')).toBeNull()
  })

  it('outro protocolo com o mesmo formato -> ainda resolve por hostname (parse não checa scheme)', () => {
    // `protocol.handle('forja', ...)` só recebe requests do scheme registrado;
    // `parseForjaMediaUrl` valida a FORMA (hostname/path), não o scheme em si.
    expect(parseForjaMediaUrl('https://media/jogo-a/capa')).toEqual({ id: 'jogo-a', tipo: 'capa' })
  })
})

describe('mediaUrl (renderer) ↔ parseForjaMediaUrl/resolveMediaAsset (main)', () => {
  it.each(['capa', 'hero', 'logo'] as const)(
    'ida e volta de %s: a query de versão não vaza pro id/tipo e o tipo passa no enum',
    async (tipo) => {
      const url = mediaUrl('mortis-pactum', tipo, '2026-09-25T12:34:56.789Z')
      const parsed = parseForjaMediaUrl(url)
      expect(parsed).toEqual({ id: 'mortis-pactum', tipo })

      const base = tmpDir()
      montarMedia(base, 'mortis-pactum', [`${tipo}.jpg`])
      const resolved = await resolveMediaAsset(base, parsed?.id ?? '', parsed?.tipo ?? '')
      expect(resolved?.path).toBe(join(base, 'mortis-pactum', `${tipo}.jpg`))
    }
  )

  it('ida e volta do `qr`: a rota chega ao main, mas não há arquivo para resolver', async () => {
    const url = mediaUrl('mortis-pactum', 'qr', '2026-09-25T12:34:56.789Z')
    const parsed = parseForjaMediaUrl(url)
    expect(parsed).toEqual({ id: 'mortis-pactum', tipo: 'qr' })

    const base = tmpDir()
    montarMedia(base, 'mortis-pactum', ['capa.png'])
    await expect(resolveMediaAsset(base, parsed?.id ?? '', parsed?.tipo ?? '')).resolves.toBeNull()
  })
})

describe('rota do `qr` — forma aceita e rejeitada', () => {
  it('`forja://media/<id>/qr?v=x` parseia como qr', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/qr?v=x')).toEqual({ id: 'jogo-a', tipo: 'qr' })
  })

  it('`../qr` escapando do id não parseia', () => {
    expect(parseForjaMediaUrl('forja://media/jogo-a/../qr')).toBeNull()
    expect(parseForjaMediaUrl('forja://media/jogo-a/%2e%2e/qr')).toBeNull()
  })

  it.each(['qr.png', 'QR'])('`%s` não chega a ser o tipo `qr` nem serve um arquivo', async (tipo) => {
    const base = tmpDir()
    montarMedia(base, 'jogo-a', ['qr.png', 'QR.png'])

    const parsed = parseForjaMediaUrl(`forja://media/jogo-a/${tipo}`)

    expect(parsed?.tipo).not.toBe('qr')
    await expect(resolveMediaAsset(base, parsed?.id ?? 'jogo-a', parsed?.tipo ?? tipo)).resolves.toBeNull()
  })
})
