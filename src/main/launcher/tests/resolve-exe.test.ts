import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gamesDir, resolveGameExe } from '../resolve-exe'

const dirs: string[] = []

function baseDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-resolve-exe-'))
  dirs.push(d)
  return d
}

/** Cria `games/<id>/` e devolve a raiz real do Jogo. */
function raizDoJogo(base: string, id: string): string {
  const raiz = join(gamesDir(base), id)
  mkdirSync(raiz, { recursive: true })
  return raiz
}

/** Arquivo executável de mentira (`0o755`) no caminho relativo pedido. */
function exe(raiz: string, rel: string, conteudo = '#!/bin/sh\n'): string {
  const p = join(raiz, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, conteudo, { mode: 0o755 })
  return p
}

function arquivoSimples(raiz: string, rel: string): string {
  const p = join(raiz, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, 'dados', { mode: 0o644 })
  return p
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('gamesDir', () => {
  it('é `<base>/games`', () => {
    expect(gamesDir('/tmp/x')).toBe(join('/tmp/x', 'games'))
  })
})

describe('resolveGameExe — exeRelativo preenchido', () => {
  it('resolve o caminho real dentro da raiz', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = exe(raiz, 'bin/Jogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'bin/Jogo.sh' })).resolves.toEqual(
      { ok: true, exeAbs: realpathSync(alvo) }
    )
  })

  it('aceita separador do Windows (`\\`) na Planilha', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = exe(raiz, 'bin/Jogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'bin\\Jogo.sh' })).resolves.toEqual(
      { ok: true, exeAbs: realpathSync(alvo) }
    )
  })

  it.each(['../fora.sh', 'sub/../../fora.sh', '/bin/sh'])(
    'alvo fora da raiz (%s) -> EXE_NAO_ENCONTRADO',
    async (exeRelativo) => {
      const base = baseDir()
      const raiz = raizDoJogo(base, 'jogo-a')
      exe(raiz, '../fora.sh')
      await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo })).resolves.toEqual({
        ok: false,
        code: 'EXE_NAO_ENCONTRADO'
      })
    }
  )

  it('symlink para fora da raiz -> EXE_NAO_ENCONTRADO (confinamento pelo caminho real)', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const fora = exe(join(base, 'fora'), 'jogo.sh')
    symlinkSync(fora, join(raiz, 'atalho.sh'))

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'atalho.sh' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('diretório em vez de arquivo -> EXE_NAO_ENCONTRADO', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    mkdirSync(join(raiz, 'bin'))

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'bin' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('alvo inexistente -> EXE_NAO_ENCONTRADO', async () => {
    const base = baseDir()
    raizDoJogo(base, 'jogo-a')
    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'nao-existe.sh' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('mesmo com exeRelativo ruim, não varre o build', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'unico.sh')
    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'nao-existe.sh' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })
})

describe('resolveGameExe — descoberta sem exeRelativo', () => {
  it('jogo sem pasta em games/ -> JOGO_NAO_INSTALADO', async () => {
    const base = baseDir()
    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'JOGO_NAO_INSTALADO'
    })
  })

  it('um executável na raiz -> ok', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = exe(raiz, 'jogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(alvo)
    })
  })

  it('acha até 2 níveis abaixo (subpasta e sub-subpasta)', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const raso = exe(raiz, 'nivel1/jogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(raso)
    })

    rmSync(raso)
    const fundo = exe(raiz, 'nivel1/nivel2/jogo.sh')
    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(fundo)
    })
  })

  it('ignora o 3º nível', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'nivel1/nivel2/nivel3/jogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('arquivo sem bit de execução não é candidato', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    arquivoSimples(raiz, 'leiame.txt')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it.each(['libjogo.so', 'libjogo.dylib'])('biblioteca %s com execução é ignorada', async (lib) => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, lib)

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it.each([
    'unins000',
    'unins000.exe',
    'UnityCrashHandler64.exe',
    'unitycrashhandler',
    'crashpad_handler',
    'crashpad_handler.exe',
    'vc_redist.x64.exe',
    'vcredist_x86.exe',
    'dxsetup',
    'dxsetup.exe',
    'UE4PrereqSetup_x64.exe'
  ])('auxiliar conhecido %s é ignorado (mesmo com execução)', async (nome) => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, nome)

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'EXE_NAO_ENCONTRADO'
    })
  })

  it('ignora os auxiliares e acha o único executável', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'unins000.exe')
    exe(raiz, 'UnityCrashHandler64.exe')
    const alvo = exe(raiz, 'MeuJogo.sh')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(alvo)
    })
  })

  it('mais de um candidato -> EXE_AMBIGUO com os relativos no console.warn', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'jogo.sh')
    exe(raiz, 'ferramenta/jogo2.sh')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: false,
      code: 'EXE_AMBIGUO'
    })
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['ferramenta/jogo2.sh', 'jogo.sh'])
    )
    const [, listados] = warn.mock.calls[0] as [string, string[]]
    expect(listados).toHaveLength(2)
    vi.restoreAllMocks()
  })

  it('console de debug do Godot (`*.console`) não empata com o executável do Jogo', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'MeuJogo.console.exe')
    const alvo = exe(raiz, 'MeuJogo.exe')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(alvo)
    })
  })

  it('biblioteca versionada (`libfoo.so.1`) com bit de execução não é candidata', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'lib/libUnityPlayer.so.1')
    const alvo = exe(raiz, 'Jogo.x86_64')

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'linux' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(alvo)
    })
  })

  it('symlink solto no build não é candidato', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = exe(raiz, 'jogo.sh')
    symlinkSync(alvo, join(raiz, 'atalho.sh'))

    await expect(resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' })).resolves.toEqual({
      ok: true,
      exeAbs: realpathSync(alvo)
    })
  })
})

describe('resolveGameExe — ramo win32 (plataforma injetada)', () => {
  it('aceita `.exe` sem diferenciar caixa, sem bit de execução', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = arquivoSimples(raiz, 'Jogo.EXE')

    await expect(
      resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })
    ).resolves.toEqual({ ok: true, exeAbs: realpathSync(alvo) })
  })

  it('ignora arquivo com execução mas sem .exe', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    exe(raiz, 'jogo.sh')

    await expect(
      resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })
    ).resolves.toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('ignora os auxiliares também no win32', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    arquivoSimples(raiz, 'unins000.exe')
    arquivoSimples(raiz, 'UnityCrashHandler32.exe')
    arquivoSimples(raiz, 'dxsetup.exe')

    await expect(
      resolveGameExe(base, { id: 'jogo-a', exeRelativo: '' }, { platform: 'win32' })
    ).resolves.toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
  })

  it('exeRelativo resolve com `\\` também no win32', async () => {
    const base = baseDir()
    const raiz = raizDoJogo(base, 'jogo-a')
    const alvo = arquivoSimples(raiz, 'bin/Jogo.exe')

    await expect(
      resolveGameExe(base, { id: 'jogo-a', exeRelativo: 'bin\\Jogo.exe' }, { platform: 'win32' })
    ).resolves.toEqual({ ok: true, exeAbs: realpathSync(alvo) })
  })
})
