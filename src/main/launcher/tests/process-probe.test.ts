import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultProbe, run, sanitizeProcessName } from '../process-probe'

const onLinux = process.platform !== 'win32'

describe('sanitizeProcessName', () => {
  it.each([
    ['Jogo.exe', 'Jogo.exe'],
    ['  Jogo.exe  ', 'Jogo.exe'],
    ['Age of Empires II.exe', 'Age of Empires II.exe'],
    ['jogo_2024-v1.exe', 'jogo_2024-v1.exe'],
    ['Ação.exe', 'Ação.exe'],
    ['Game (2024).exe', 'Game (2024).exe']
  ])('aceita %j', (entrada, esperado) => {
    expect(sanitizeProcessName(entrada)).toBe(esperado)
  })

  it.each([
    ['vazio', ''],
    ['so espacos', '   '],
    ['flag de CLI', '-rf'],
    ['separador barra', 'pasta/jogo.exe'],
    ['separador contrabarra', 'jogo.exe\\x'],
    ['tab no meio', 'jogo\t.exe'],
    ['nova linha', 'jogo\n.exe'],
    ['metacaractere', 'jogo;rm.exe'],
    ['longo demais', 'a'.repeat(261)]
  ])('rejeita (%s)', (_rotulo, entrada) => {
    expect(sanitizeProcessName(entrada)).toBeNull()
  })
})

describe.skipIf(!onLinux)('defaultProbe (Linux dev)', () => {
  // Cópia do `sleep` com nome único, em vez do próprio runner: o vitest troca o
  // `process.title` (o `comm` vira `node (vitest)`, então `pgrep -x node` não acha o
  // runner) e um nome comum (`sleep`) já pode estar em uso na máquina, o que faria a
  // asserção passar mesmo com o probe quebrado. `comm` trunca em 15 chars.
  it('true para um processo em execucao', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forja-probe-'))
    const alvo = `forjaprobe${randomBytes(2).toString('hex')}`
    const bin = join(dir, alvo)
    await cp('/bin/sleep', bin)

    const filho = spawn(bin, ['30'], { stdio: 'ignore' })
    try {
      await once(filho, 'spawn')
      expect(await defaultProbe(alvo)).toBe(true)
    } finally {
      filho.kill()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('false para um nome garantidamente ausente', async () => {
    expect(await defaultProbe('zzz-processo-inexistente-zzz')).toBe(false)
  })

  it('false (sem lancar) quando o nome nao sanitiza', async () => {
    expect(await defaultProbe('nome invalido!!')).toBe(false)
  })
})

describe('run', () => {
  it('resolve "" quando o binario nao existe (engole ENOENT, nao rejeita)', async () => {
    await expect(run('binario-que-nao-existe-xyz', [])).resolves.toBe('')
  })
})
