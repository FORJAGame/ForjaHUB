import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Jogo } from '@shared/types'
import { createGameLauncher } from '../index'
import { createGameSession, type GameSession, type SessaoEncerrada } from '../game-session'
import { gamesDir, resolveGameExe } from '../resolve-exe'

function jogo(id: string, exeRelativo = ''): Jogo {
  return {
    id,
    titulo: id,
    ano: 2026,
    guilda: 'FORJA',
    genero: 'ação',
    modalidade: 'single-player',
    sinopse: 'sinopse',
    redesUrl: '',
    exeRelativo,
    detalheImagens: []
  }
}

describe.skipIf(process.platform === 'win32')('createGameSession com launcher e resolvedor reais', () => {
  let base: string

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'forja-session-it-'))
  })
  afterAll(() => {
    rmSync(base, { recursive: true, force: true })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** `games/<id>/jogo.sh`: dorme 300ms e sai com `codigo`. */
  function instalar(id: string, codigo = 0, modo = 0o755): void {
    const dir = join(gamesDir(base), id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'jogo.sh'), `#!/bin/sh\nsleep 0.3\nexit ${codigo}\n`, { mode: modo })
  }

  interface Montagem {
    session: GameSession
    sessoes: SessaoEncerrada[]
    encerrados: Array<{ emExecucaoDentro: boolean; registrouAntes: boolean }>
    /** Resolve quando `aoEncerrar` roda a `n`-ésima vez. */
    fim: (n?: number) => Promise<void>
  }

  function montar(registrar?: (s: SessaoEncerrada) => Promise<void>): Montagem {
    const sessoes: SessaoEncerrada[] = []
    const encerrados: Montagem['encerrados'] = []
    const esperas: Array<{ n: number; resolve: () => void }> = []
    const launcher = createGameLauncher()
    const session: GameSession = createGameSession({
      launcher,
      acharJogo: async (id) => jogo(id, id.startsWith('relativo-') ? 'jogo.sh' : ''),
      resolverExe: (j) => resolveGameExe(base, j),
      aoIniciar: () => {},
      aoEncerrar: () => {
        encerrados.push({ emExecucaoDentro: session.emExecucao(), registrouAntes: sessoes.length > 0 })
        for (const e of esperas.filter((x) => x.n <= encerrados.length)) e.resolve()
      },
      registrarSessao:
        registrar ??
        (async (s) => {
          sessoes.push(s)
        })
    })
    return {
      session,
      sessoes,
      encerrados,
      fim: (n = 1) => {
        if (encerrados.length >= n) return Promise.resolve()
        const { promise, resolve } = Promise.withResolvers<void>()
        esperas.push({ n, resolve })
        return promise
      }
    }
  }

  it('ciclo completo: Sessão registrada com duração, início e código, e só então aoEncerrar', async () => {
    instalar('ciclo', 7)
    const m = montar()

    expect(await m.session.lancar('ciclo')).toEqual({ ok: true })
    expect(m.session.emExecucao()).toBe(true)
    expect(m.session.ultimoJogoId()).toBe('ciclo')

    await m.fim()

    expect(m.sessoes).toHaveLength(1)
    const s = m.sessoes[0]
    expect(s.jogoId).toBe('ciclo')
    expect(s.codigo).toBe(7)
    expect(s.duracaoMs).toBeGreaterThanOrEqual(250)
    expect(Number.isNaN(Date.parse(s.inicioISO))).toBe(false)
    expect(new Date(s.inicioISO).toISOString()).toBe(s.inicioISO)
    expect(m.encerrados).toEqual([{ emExecucaoDentro: false, registrouAntes: true }])
    expect(m.session.ultimoJogoId()).toBe('ciclo')
  })

  it('segundo lançar durante a Sessão é JOGO_EM_EXECUCAO; depois do fim um novo lançar funciona', async () => {
    instalar('repetido')
    const m = montar()

    expect(await m.session.lancar('repetido')).toEqual({ ok: true })
    expect(await m.session.lancar('repetido')).toEqual({ ok: false, code: 'JOGO_EM_EXECUCAO' })
    await m.fim(1)

    expect(await m.session.lancar('repetido')).toEqual({ ok: true })
    await m.fim(2)
    expect(m.sessoes).toHaveLength(2)
    expect(m.session.emExecucao()).toBe(false)
  })

  it('dois lançar simultâneos: exatamente um ok', async () => {
    instalar('corrida')
    const m = montar()

    const resultados = await Promise.all([m.session.lancar('corrida'), m.session.lancar('corrida')])

    expect(resultados.filter((r) => r.ok)).toHaveLength(1)
    expect(resultados.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'JOGO_EM_EXECUCAO' }])
    await m.fim()
    expect(m.sessoes).toHaveLength(1)
  })

  it('arquivo sem bit de execução: falha ao abrir e a Sessão não fica presa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    instalar('relativo-sem-x', 0, 0o644)
    instalar('sadio')
    const m = montar()

    const falha = await m.session.lancar('relativo-sem-x')
    expect(falha).toEqual({ ok: false, code: 'FALHA_AO_ABRIR' })
    expect(m.session.emExecucao()).toBe(false)
    expect(m.encerrados).toHaveLength(0)

    expect(await m.session.lancar('sadio')).toEqual({ ok: true })
    await m.fim()
  })

  it('registrarSessao rejeitando: aoEncerrar roda mesmo assim, uma única vez', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    instalar('registro-falho')
    const m = montar(async () => {
      throw new Error('disco cheio')
    })

    expect(await m.session.lancar('registro-falho')).toEqual({ ok: true })
    await m.fim()
    expect(m.encerrados).toHaveLength(1)
    expect(m.session.emExecucao()).toBe(false)
  })
})
