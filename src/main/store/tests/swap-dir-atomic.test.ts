import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  type PathLike
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { swapDirAtomic } from '../atomic-write'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-swap-dir-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function montarDir(path: string, arquivos: Record<string, string>): void {
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const full = join(path, nome)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, conteudo)
  }
}

describe('swapDirAtomic', () => {
  it('sem target/ anterior: staging vira target/', async () => {
    const base = tmpDir()
    const staging = join(base, 'staging-1')
    montarDir(staging, { 'catalog.json': '{"a":1}', 'media/jogo-a/capa.png': 'bytes' })
    const target = join(base, 'catalog', 'current')

    await swapDirAtomic(target, staging)

    expect(readFileSync(join(target, 'catalog.json'), 'utf-8')).toBe('{"a":1}')
    expect(readFileSync(join(target, 'media', 'jogo-a', 'capa.png'), 'utf-8')).toBe('bytes')
    expect(existsSync(staging)).toBe(false)
  })

  it('com target/ anterior: é substituído por completo pelo staging', async () => {
    const base = tmpDir()
    const target = join(base, 'catalog', 'current')
    montarDir(target, { 'catalog.json': '{"a":"velho"}' })

    const staging = join(base, 'staging-2')
    montarDir(staging, { 'catalog.json': '{"a":"novo"}', 'media/jogo-a/capa.png': 'novo-bytes' })

    await swapDirAtomic(target, staging)

    expect(readFileSync(join(target, 'catalog.json'), 'utf-8')).toBe('{"a":"novo"}')
    expect(readFileSync(join(target, 'media', 'jogo-a', 'capa.png'), 'utf-8')).toBe('novo-bytes')
  })

  it('não apaga o diretório anterior — vira um `.previous-*` sibling (limpeza fica pra depois)', async () => {
    const base = tmpDir()
    const target = join(base, 'catalog', 'current')
    montarDir(target, { 'catalog.json': '{"a":"velho"}' })

    const staging = join(base, 'staging-3')
    montarDir(staging, { 'catalog.json': '{"a":"novo"}' })

    await swapDirAtomic(target, staging)

    const irmaos = readdirSync(join(base, 'catalog'))
    const previous = irmaos.find((nome) => nome.startsWith('current.previous-'))
    expect(previous).toBeDefined()
    expect(readFileSync(join(base, 'catalog', previous!, 'catalog.json'), 'utf-8')).toBe('{"a":"velho"}')
  })

  it('cria o diretório pai se não existir', async () => {
    const base = tmpDir()
    const staging = join(base, 'staging-4')
    montarDir(staging, { 'catalog.json': '{}' })
    const target = join(base, 'nested', 'deep', 'current')

    await swapDirAtomic(target, staging)
    expect(readFileSync(join(target, 'catalog.json'), 'utf-8')).toBe('{}')
  })

  it('falha no 2º rename restaura o conteúdo antigo — target/ nunca fica ausente', async () => {
    const base = tmpDir()
    const target = join(base, 'catalog', 'current')
    montarDir(target, { 'catalog.json': '{"a":"velho"}' })

    const staging = join(base, 'staging-5')
    montarDir(staging, { 'catalog.json': '{"a":"novo"}' })

    let chamadas = 0
    const failingRename = vi.fn(async (from: PathLike, to: PathLike) => {
      chamadas += 1
      if (chamadas === 2) throw new Error('disco cheio')
      const { rename } = await import('node:fs/promises')
      return rename(from, to)
    })

    await expect(swapDirAtomic(target, staging, { rename: failingRename })).rejects.toThrow('disco cheio')
    expect(readFileSync(join(target, 'catalog.json'), 'utf-8')).toBe('{"a":"velho"}')
  })

  it('restauração também falha depois do swap falhar -> loga o 2º erro explicitamente (diagnosticável no hub.log)', async () => {
    const base = tmpDir()
    const target = join(base, 'catalog', 'current')
    montarDir(target, { 'catalog.json': '{"a":"velho"}' })

    const staging = join(base, 'staging-7')
    montarDir(staging, { 'catalog.json': '{"a":"novo"}' })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // 1ª chamada (target -> previous) precisa funcionar de verdade pra chegar
    // no cenário; a 2ª (staging -> target) e a 3ª (restauração: previous ->
    // target) falham — o cenário raro (disco cheio bem no meio) que o log
    // existe pra cobrir.
    let chamadas = 0
    const failingRename = vi.fn(async (from: PathLike, to: PathLike) => {
      chamadas += 1
      if (chamadas === 1) {
        const { rename } = await import('node:fs/promises')
        return rename(from, to)
      }
      throw new Error('disco cheio')
    })

    await expect(swapDirAtomic(target, staging, { rename: failingRename })).rejects.toThrow('disco cheio')

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('restauração'),
      expect.any(Error)
    )
  })

  it('primeiro sync (sem target/ anterior) + falha no rename final -> não sobra nada em target/', async () => {
    const base = tmpDir()
    const staging = join(base, 'staging-6')
    montarDir(staging, { 'catalog.json': '{"a":"novo"}' })
    const target = join(base, 'catalog', 'current')

    const failingRename = vi.fn(async (from: PathLike, to: PathLike) => {
      if (from === staging) throw new Error('disco cheio')
      const { rename } = await import('node:fs/promises')
      return rename(from, to)
    })

    await expect(swapDirAtomic(target, staging, { rename: failingRename })).rejects.toThrow('disco cheio')
    expect(existsSync(target)).toBe(false)
  })
})
