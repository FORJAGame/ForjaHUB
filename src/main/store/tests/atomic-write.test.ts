import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendLinesDurable, writeJsonAtomic, writeTextAtomic } from '../atomic-write'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-store-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('writeJsonAtomic', () => {
  it('grava JSON legível no destino', async () => {
    const dir = tmpDir()
    const file = join(dir, 'station.json')
    await writeJsonAtomic(file, { estacaoId: 'tv-principal' })
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ estacaoId: 'tv-principal' })
  })

  it('não deixa arquivo temp para trás após sucesso', async () => {
    const dir = tmpDir()
    await writeJsonAtomic(join(dir, 'station.json'), { a: 1 })
    expect(readdirSync(dir)).toEqual(['station.json'])
  })

  it('cria o diretório se não existir', async () => {
    const dir = tmpDir()
    const file = join(dir, 'nested', 'station.json')
    await writeJsonAtomic(file, { a: 1 })
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ a: 1 })
  })

  it('preserva o arquivo original e não deixa temp se o rename falhar', async () => {
    const dir = tmpDir()
    const file = join(dir, 'station.json')
    writeFileSync(file, JSON.stringify({ estacaoId: 'original' }))

    const failingRename = vi.fn().mockRejectedValue(new Error('disco cheio'))

    await expect(
      writeJsonAtomic(file, { estacaoId: 'novo' }, { rename: failingRename })
    ).rejects.toThrow('disco cheio')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ estacaoId: 'original' })
    expect(readdirSync(dir)).toEqual(['station.json'])
  })
})

describe('writeTextAtomic', () => {
  it('grava o texto exato, sem reformatar', async () => {
    const dir = tmpDir()
    const file = join(dir, 'spool.jsonl')
    const texto = '{"id":"a"}\n{"id":"b"}\n'
    await writeTextAtomic(file, texto)
    expect(readFileSync(file, 'utf-8')).toBe(texto)
  })
})

describe('appendLinesDurable', () => {
  it('cria o arquivo e termina cada linha com quebra de linha', async () => {
    const dir = tmpDir()
    const file = join(dir, 'nested', 'spool.jsonl')
    await appendLinesDurable(file, ['{"id":"a"}'])
    expect(readFileSync(file, 'utf-8')).toBe('{"id":"a"}\n')
  })

  it('acumula o conteúdo de dois appends', async () => {
    const dir = tmpDir()
    const file = join(dir, 'spool.jsonl')
    await appendLinesDurable(file, ['{"id":"a"}'])
    await appendLinesDurable(file, ['{"id":"b"}', '{"id":"c"}'])
    expect(readFileSync(file, 'utf-8')).toBe('{"id":"a"}\n{"id":"b"}\n{"id":"c"}\n')
  })

  it('rejeita linha com quebra de linha sem tocar no arquivo', async () => {
    const dir = tmpDir()
    const file = join(dir, 'spool.jsonl')
    writeFileSync(file, '{"id":"a"}\n')

    await expect(appendLinesDurable(file, ['{"id":"b"}', 'x\ny'])).rejects.toThrow(/quebra de linha/)
    expect(readFileSync(file, 'utf-8')).toBe('{"id":"a"}\n')
  })

  it('não cria o arquivo quando não há linhas', async () => {
    const dir = tmpDir()
    const file = join(dir, 'spool.jsonl')
    await appendLinesDurable(file, [])
    expect(existsSync(file)).toBe(false)
  })

  it('escrita que falha no meio volta o arquivo ao tamanho anterior; o append seguinte fica em linha própria', async () => {
    const dir = tmpDir()
    const file = join(dir, 'spool.jsonl')
    await appendLinesDurable(file, ['{"id":"a"}'])

    await expect(
      appendLinesDurable(file, ['{"id":"b"}'], {
        escrever: async (handle) => {
          await handle.writeFile('{"id":', 'utf-8')
          throw new Error('disco cheio')
        }
      })
    ).rejects.toThrow('disco cheio')
    expect(readFileSync(file, 'utf-8')).toBe('{"id":"a"}\n')

    await appendLinesDurable(file, ['{"id":"b"}'])
    expect(readFileSync(file, 'utf-8')).toBe('{"id":"a"}\n{"id":"b"}\n')
  })
})
