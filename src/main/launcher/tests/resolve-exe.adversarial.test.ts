import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gamesDir, resolveGameExe, type ResolveExeResult } from '../resolve-exe'

const dirs: string[] = []

function baseDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-resolve-exe-adv-'))
  dirs.push(d)
  return d
}

function raizDoJogo(base: string, id: string): string {
  const raiz = join(gamesDir(base), id)
  mkdirSync(raiz, { recursive: true })
  return raiz
}

function arquivo(raiz: string, rel: string, mode = 0o755): string {
  const p = join(raiz, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, '#!/bin/sh\n', { mode })
  return p
}

/** Executável fora de `games/`, o alvo de todo escape. */
function exeDeFora(base: string): { dir: string; exe: string } {
  const dir = join(base, 'fora')
  return { dir, exe: arquivo(dir, 'segredo.sh') }
}

/** Nunca pode devolver caminho fora da raiz real do Jogo. */
function confinado(raiz: string, r: ResolveExeResult): boolean {
  return !r.ok || realpathSync(r.exeAbs).startsWith(realpathSync(raiz) + sep)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('resolveGameExe — symlink e escape (POSIX)', () => {
  it('symlink de arquivo para executável fora da raiz, via exeRelativo, não é devolvido', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    symlinkSync(exeDeFora(base).exe, join(raiz, 'atalho.sh'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'atalho.sh' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('symlink de diretório para fora, via exeRelativo, não é atravessado', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    symlinkSync(exeDeFora(base).dir, join(raiz, 'lib'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'lib/segredo.sh' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('na descoberta, symlink de arquivo ou de pasta para fora nunca vira candidato', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const fora = exeDeFora(base)
    symlinkSync(fora.exe, join(raiz, 'atalho.sh'))
    symlinkSync(fora.dir, join(raiz, 'lib'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('na descoberta, symlink para fora não tira a unicidade do executável real', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'jogo.sh')
    symlinkSync(exeDeFora(base).exe, join(raiz, 'atalho.sh'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
    expect(confinado(raiz, r)).toBe(true)
  })

  it('symlink interno que aponta para outro arquivo da própria raiz devolve o caminho real, dentro da raiz', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'bin/jogo.sh')
    symlinkSync(real, join(raiz, 'atalho.sh'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'atalho.sh' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })

  it('`..` e `..\\..` (estilo Windows) que escapam da raiz não resolvem', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const fora = exeDeFora(base)
    expect(fora.exe.startsWith(base)).toBe(true)

    const unix = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '../../fora/segredo.sh' })
    const win = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '..\\..\\fora\\segredo.sh' })

    expect(unix).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
    expect(win).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
    expect(confinado(raiz, unix) && confinado(raiz, win)).toBe(true)
  })

  it('`games/<id>` sendo symlink para fora: a raiz real é a de comparação e o Jogo funciona', async () => {
    const base = baseDir()
    const fora = exeDeFora(base)
    mkdirSync(gamesDir(base), { recursive: true })
    symlinkSync(fora.dir, join(gamesDir(base), 'jogo-a'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'segredo.sh' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(fora.exe) })
  })

  it('exeRelativo com `\\` numa plataforma POSIX vira separador, não nome de arquivo', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'bin/jogo.sh')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'bin\\jogo.sh' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })
})

describe('resolveGameExe — nomes e tipos hostis', () => {
  it('diretório chamado `jogo.exe` não é executável (win32), via exeRelativo', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    mkdirSync(join(raiz, 'jogo.exe'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'jogo.exe' }, { platform: 'win32' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('diretório `jogo.exe` na descoberta (win32): não é candidato, mas o `.exe` dentro dele é', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    mkdirSync(join(raiz, 'jogo.exe'))
    const dentro = arquivo(raiz, 'jogo.exe/motor.exe', 0o644)

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(dentro) })
  })

  it('diretório `jogo.exe` vazio na descoberta (win32): nada encontrado', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    mkdirSync(join(raiz, 'jogo.exe'))

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('`JOGO.EXE` em caixa alta é candidato (win32) e `jogo.EXE.txt` não', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'JOGO.EXE', 0o644)
    arquivo(raiz, 'jogo.EXE.txt', 0o755)

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })

  it('auxiliar em caixa alta (`UNINS000.EXE`) continua excluído (win32)', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'jogo.exe', 0o644)
    arquivo(raiz, 'UNINS000.EXE', 0o644)

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })

  it('`games/<id>` sendo um arquivo, e não um diretório -> JOGO_NAO_INSTALADO', async () => {
    const base = baseDir()
    mkdirSync(gamesDir(base), { recursive: true })
    writeFileSync(join(gamesDir(base), 'jogo-a'), 'oi', { mode: 0o755 })

    const porDescoberta = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })
    const porRelativo = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'jogo.sh' })

    expect(porDescoberta).toEqual({ ok: false, code: 'JOGO_NAO_INSTALADO' })
    expect(porRelativo).toEqual({ ok: false, code: 'JOGO_NAO_INSTALADO' })
  })

  it('exeRelativo apontando para a própria raiz (`.`) não é executável', async () => {
    const base = baseDir()
    raizDoJogo(base, 'jogo-a')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '.' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })
})

describe.skipIf(process.platform === 'win32')('resolveGameExe — profundidade e unicidade (POSIX)', () => {
  it('executável a 2 subpastas da raiz é achado; a 3 subpastas, não', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const dentro = arquivo(raiz, 'a/b/jogo.sh')
    const fundo = raizDoJogo(base, 'jogo-b')
    arquivo(fundo, 'a/b/c/jogo.sh')

    expect(await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).toEqual({
      ok: true,
      exeAbs: realpathSync(dentro)
    })
    expect(await resolveGameExe(base, { id: 'jogo-b', exeRelativo: '' })).toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('dois executáveis em níveis diferentes -> EXE_AMBIGUO', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    arquivo(raiz, 'jogo.sh')
    arquivo(raiz, 'bin/x64/jogo64.sh')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: false, code: 'EXE_AMBIGUO' })
  })

  it('executável no 3º nível não desfaz a unicidade do executável da raiz', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const real = arquivo(raiz, 'jogo.sh')
    arquivo(raiz, 'a/b/c/outro.sh')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })

  it('auxiliares excluídos + 1 real em subpasta -> ok', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    arquivo(raiz, 'unins000')
    arquivo(raiz, 'UnityCrashHandler64')
    arquivo(raiz, 'redist/vc_redist.x64')
    const real = arquivo(raiz, 'bin/jogo.sh')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: true, exeAbs: realpathSync(real) })
  })

  it('só auxiliares -> EXE_NAO_ENCONTRADO, nunca um auxiliar como Jogo', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    arquivo(raiz, 'unins000')
    arquivo(raiz, 'crashpad_handler')

    const r = await resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })

    expect(r).toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })
})
