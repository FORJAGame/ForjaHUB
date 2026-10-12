import { readdir, realpath, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import type { Jogo } from '@shared/types'

export type ResolveExeResult =
  | { ok: true; exeAbs: string }
  | { ok: false; code: 'JOGO_NAO_INSTALADO' | 'EXE_NAO_ENCONTRADO' | 'EXE_AMBIGUO' }

/**
 * Auxiliares que todo instalador/engine empacota junto do Jogo (o `*.console` é o
 * console de debug do Godot). Fora o `.exe` opcional do Windows, os nomes também
 * aparecem sem extensão nos builds empacotados.
 */
const AUXILIAR_RE =
  /^(unins\d*|unitycrashhandler(32|64)?|crashpad_handler|notification_helper|vc_?redist.*|dxsetup|ue4prereqsetup.*|.+\.console)(\.exe)?$/i

/** Biblioteca compartilhada nunca é o Jogo, mesmo com bit de execução (inclui `libfoo.so.1`). */
const BIBLIOTECA_RE = /\.(so(\.\d+)*|dylib)$/i

/** Níveis abaixo da raiz do Jogo: a própria raiz, subpastas e sub-subpastas. */
const MAX_PROFUNDIDADE = 2

export function gamesDir(baseDir: string): string {
  return join(baseDir, 'games')
}

export async function resolveGameExe(
  baseDir: string,
  jogo: Pick<Jogo, 'id' | 'exeRelativo'>,
  deps: { platform?: NodeJS.Platform } = {}
): Promise<ResolveExeResult> {
  const platform = deps.platform ?? process.platform
  let raiz: string
  try {
    raiz = await realpath(join(gamesDir(baseDir), jogo.id))
    if (!(await stat(raiz)).isDirectory()) return { ok: false, code: 'JOGO_NAO_INSTALADO' }
  } catch {
    return { ok: false, code: 'JOGO_NAO_INSTALADO' }
  }

  if (jogo.exeRelativo) return porRelativo(raiz, jogo.exeRelativo)

  const candidatos = await varrer(raiz, platform)
  if (candidatos.length === 0) return { ok: false, code: 'EXE_NAO_ENCONTRADO' }
  if (candidatos.length > 1) {
    // Só o operador resolve: um build com dois executáveis precisa de `exe_relativo` na Planilha.
    console.warn(
      '[main] build com mais de um executável; aponte `exe_relativo` na Planilha:',
      candidatos.map((caminho) => relative(raiz, caminho))
    )
    return { ok: false, code: 'EXE_AMBIGUO' }
  }
  return { ok: true, exeAbs: candidatos[0] }
}

async function porRelativo(raiz: string, exeRelativo: string): Promise<ResolveExeResult> {
  const rel = exeRelativo.replace(/\\/g, '/')

  let alvo: string
  try {
    alvo = await realpath(resolve(raiz, rel))
  } catch {
    return { ok: false, code: 'EXE_NAO_ENCONTRADO' }
  }

  // Confinamento pelo caminho real: pega `..` e symlink que escapa de `games/<id>/`.
  const prefixo = raiz.endsWith(sep) ? raiz : raiz + sep
  if (alvo === raiz || !alvo.startsWith(prefixo)) {
    return { ok: false, code: 'EXE_NAO_ENCONTRADO' }
  }
  if (!(await stat(alvo)).isFile()) return { ok: false, code: 'EXE_NAO_ENCONTRADO' }
  return { ok: true, exeAbs: alvo }
}

async function varrer(raiz: string, platform: NodeJS.Platform): Promise<string[]> {
  const achados: string[] = []

  async function visitar(dir: string, profundidade: number): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const caminho = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (profundidade < MAX_PROFUNDIDADE) await visitar(caminho, profundidade + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (await ehCandidato(caminho, entry.name, platform)) achados.push(caminho)
    }
  }

  await visitar(raiz, 0)
  return achados
}

async function ehCandidato(
  caminho: string,
  nome: string,
  platform: NodeJS.Platform
): Promise<boolean> {
  if (AUXILIAR_RE.test(nome)) return false

  const ext = extname(nome).toLowerCase()
  if (platform === 'win32') return ext === '.exe'
  if (BIBLIOTECA_RE.test(nome)) return false

  try {
    const info = await stat(caminho)
    return info.isFile() && (info.mode & 0o111) !== 0
  } catch {
    return false
  }
}
