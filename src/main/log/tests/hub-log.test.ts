import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHubLog, hubLog, iniciarHubLog } from '../hub-log'

const AGORA = new Date('2026-01-01T12:00:00.000Z')
const ISO = AGORA.toISOString()

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-hub-log-'))
  dirs.push(d)
  return d
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function ler(dir: string, nome = 'hub.log'): string {
  return readFileSync(join(dir, nome), 'utf-8')
}

describe('createHubLog', () => {
  it('info grava uma linha ISO INFO [origem] msg terminada em \\n', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    log.info('app', 'Hub iniciado')
    await log.ocioso()

    expect(ler(dir)).toBe(`${ISO} INFO [app] Hub iniciado\n`)
  })

  it('erro com Error grava ERRO e inclui a message depois da mensagem', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    log.erro('app', 'sync falhou', new Error('ETIMEDOUT'))
    await log.ocioso()

    expect(ler(dir)).toBe(`${ISO} ERRO [app] sync falhou — ETIMEDOUT\n`)
  })

  it('mensagem com \\n e \\r\\n vira uma linha só (arquivo tem exatamente 1 \\n)', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    log.info('app', 'linha1\nlinha2\r\nlinha3')
    await log.ocioso()

    const conteudo = ler(dir)
    expect(conteudo.split('\n')).toHaveLength(2) // linha + vazio do \n final
    expect(conteudo.match(/\n/g)).toHaveLength(1)
    expect(conteudo).toBe(`${ISO} INFO [app] linha1 linha2 linha3\n`)
  })

  it('rotação que falha (hub.log.1 é um diretório) não perde linha nem trava; sem o obstáculo, rotaciona', async () => {
    const dir = tmpDir()
    mkdirSync(join(dir, 'hub.log.1', 'conteudo'), { recursive: true })
    const log = createHubLog({ dir, maxBytes: 40, agora: () => AGORA })

    for (const msg of ['linha-um', 'linha-dois', 'linha-tres']) {
      log.info('app', msg)
      await log.ocioso()
    }
    const tresLinhas = ler(dir)
    expect(tresLinhas.trimEnd().split('\n')).toHaveLength(3)
    expect(tresLinhas).toContain('linha-um')
    expect(tresLinhas).toContain('linha-dois')
    expect(tresLinhas).toContain('linha-tres')

    rmSync(join(dir, 'hub.log.1'), { recursive: true, force: true })
    log.info('app', 'linha-quatro')
    await log.ocioso()
    expect(ler(dir, 'hub.log.1')).toBe(tresLinhas)
    expect(ler(dir)).toBe(`${ISO} INFO [app] linha-quatro\n`)
  })

  it('erro com objeto não-Error: com message usa "message (code)"; sem message usa String(obj)', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    log.erro('app', 'falha no banco', { message: 'permission denied', code: '42501' })
    const semMessage = { foo: 'bar' }
    log.erro('app', 'falha estranha', semMessage)
    await log.ocioso()

    const linhas = ler(dir).trimEnd().split('\n')
    expect(linhas[0]).toBe(`${ISO} ERRO [app] falha no banco — permission denied (42501)`)
    expect(linhas[1]).toBe(`${ISO} ERRO [app] falha estranha — ${String(semMessage)}`)
  })

  it('dez chamadas seguidas, sem await entre elas, ficam no arquivo na ordem', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    for (let i = 0; i < 10; i++) log.info('app', `linha-${i}`)
    await log.ocioso()

    const linhas = ler(dir).trimEnd().split('\n')
    expect(linhas).toHaveLength(10)
    expect(linhas.map((l) => l.split('] ')[1])).toEqual(
      Array.from({ length: 10 }, (_, i) => `linha-${i}`)
    )
  })

  it('rotação: linha que estoura maxBytes vai para hub.log novo e a anterior inteira em hub.log.1', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, maxBytes: 40, agora: () => AGORA })

    log.info('app', 'primeira geração')
    await log.ocioso()
    log.info('app', 'segunda geração')
    await log.ocioso()

    expect(ler(dir, 'hub.log.1')).toBe(`${ISO} INFO [app] primeira geração\n`)
    expect(ler(dir)).toBe(`${ISO} INFO [app] segunda geração\n`)
  })

  it('segunda rotação substitui o hub.log.1 (1ª geração não existe mais em nenhum arquivo)', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, maxBytes: 40, agora: () => AGORA })

    for (const msg of ['geração-1', 'geração-2', 'geração-3']) {
      log.info('app', msg)
      await log.ocioso()
    }

    expect(ler(dir, 'hub.log.1')).toBe(`${ISO} INFO [app] geração-2\n`)
    expect(ler(dir)).toBe(`${ISO} INFO [app] geração-3\n`)
    expect(ler(dir) + ler(dir, 'hub.log.1')).not.toContain('geração-1')
  })

  it('linha maior que maxBytes em arquivo vazio é gravada mesmo assim', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, maxBytes: 10, agora: () => AGORA })

    log.info('app', 'uma linha bem comprida que passa do limite')
    await log.ocioso()

    expect(ler(dir)).toBe(`${ISO} INFO [app] uma linha bem comprida que passa do limite\n`)
    expect(existsSync(join(dir, 'hub.log.1'))).toBe(false)
  })

  it('reabrir no mesmo dir continua no fim do arquivo e respeita o tamanho que já estava', async () => {
    const dir = tmpDir()
    const bytes = (msg: string): number => Buffer.byteLength(`${ISO} INFO [app] ${msg}\n`, 'utf-8')
    // Cabem exatamente as duas primeiras linhas; a terceira força a rotação.
    const duasLinhas = bytes('linha-um') + bytes('linha-dois')
    const primeira = createHubLog({ dir, agora: () => AGORA })
    primeira.info('app', 'linha-um')
    await primeira.ocioso()

    const reaberto = createHubLog({ dir, maxBytes: duasLinhas, agora: () => AGORA })
    reaberto.info('app', 'linha-dois')
    await reaberto.ocioso()
    expect(ler(dir)).toBe(`${ISO} INFO [app] linha-um\n${ISO} INFO [app] linha-dois\n`)

    reaberto.info('app', 'linha-tres')
    await reaberto.ocioso()
    expect(ler(dir, 'hub.log.1')).toBe(
      `${ISO} INFO [app] linha-um\n${ISO} INFO [app] linha-dois\n`
    )
    expect(ler(dir)).toBe(`${ISO} INFO [app] linha-tres\n`)
  })

  it('lerFinal(3) com 5 linhas devolve as 3 últimas, na ordem, sem \\n; arquivo ausente ⇒ []', async () => {
    const dir = tmpDir()
    const log = createHubLog({ dir, agora: () => AGORA })

    for (let i = 1; i <= 5; i++) log.info('app', `linha-${i}`)
    await log.ocioso()

    expect(await log.lerFinal(3)).toEqual([
      `${ISO} INFO [app] linha-3`,
      `${ISO} INFO [app] linha-4`,
      `${ISO} INFO [app] linha-5`
    ])

    const vazio = createHubLog({ dir: join(dir, 'inexistente') })
    expect(await vazio.lerFinal(3)).toEqual([])
  })

  it('dir inutilizável: info/erro não lançam, ocioso() resolve e escrita posterior também não lança', async () => {
    const dir = tmpDir()
    const paiArquivo = join(dir, 'pai.txt')
    writeFileSync(paiArquivo, 'sou um arquivo')
    const log = createHubLog({ dir: join(paiArquivo, 'sub') })

    expect(() => log.info('app', 'primeira')).not.toThrow()
    expect(() => log.erro('app', 'segunda', new Error('x'))).not.toThrow()
    await expect(log.ocioso()).resolves.toBeUndefined()
    expect(() => log.info('app', 'terceira')).not.toThrow()
    await expect(log.ocioso()).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('singleton: hubLog.info antes de iniciarHubLog só chama console.log; depois, também vai para o arquivo', async () => {
    const dir = tmpDir()

    hubLog.info('app', 'antes de iniciar')
    expect(console.log).toHaveBeenCalledExactlyOnceWith('[app] antes de iniciar')
    vi.mocked(console.log).mockClear()
    expect(existsSync(join(dir, 'hub.log'))).toBe(false)

    const log = iniciarHubLog(dir)
    hubLog.info('app', 'depois de iniciar')
    await log.ocioso()

    expect(console.log).toHaveBeenCalledExactlyOnceWith('[app] depois de iniciar')
    expect(ler(dir)).toContain('depois de iniciar')
  })
})
