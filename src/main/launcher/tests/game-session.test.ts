import { describe, expect, it, vi, type Mock } from 'vitest'
import type { CommandResult, Jogo } from '@shared/types'
import type { ExitInfo, GameLauncher } from '../../ports'
import { createGameSession, type GameSession, type GameSessionDeps, type SessaoEncerrada } from '../game-session'

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

interface LauncherFake {
  launcher: GameLauncher
  launch: Mock<() => Promise<'started' | 'error'>>
  emitirExit: (info: ExitInfo) => Promise<void>
}

/**
 * Launcher fake: o teste dispara o `exited` na mão e o `emitirExit` espera o
 * listener, o que torna o fim da Sessão determinístico (sem timer de espera).
 */
function launcherFake(resultado: 'started' | 'error' = 'started'): LauncherFake {
  const listeners: Array<(info: ExitInfo) => unknown> = []
  const launch = vi.fn(async () => resultado)
  return {
    launcher: {
      launch,
      onExited(cb) {
        listeners.push(cb)
        return () => {
          const i = listeners.indexOf(cb)
          if (i >= 0) listeners.splice(i, 1)
        }
      }
    },
    launch,
    async emitirExit(info) {
      for (const cb of [...listeners]) await cb(info)
    }
  }
}

const OK = { ok: true, exeAbs: '/games/jogo-a/jogo.sh' } as const

interface Montagem {
  session: GameSession
  fake: LauncherFake
  passos: string[]
  sessoes: SessaoEncerrada[]
}

function montar(over: Partial<GameSessionDeps> = {}): Montagem {
  const fake = launcherFake()
  const passos: string[] = []
  const sessoes: SessaoEncerrada[] = []
  const deps: GameSessionDeps = {
    launcher: fake.launcher,
    acharJogo: async () => jogo('jogo-a'),
    resolverExe: async () => OK,
    aoIniciar: (id: string) => passos.push(`iniciar:${id}`),
    aoEncerrar: () => passos.push('encerrar'),
    registrarSessao: async (s: SessaoEncerrada) => {
      passos.push('registrar')
      sessoes.push(s)
    },
    agora: () => new Date('2026-01-01T00:00:00.000Z'),
    ...over
  }
  return { session: createGameSession(deps), fake, passos, sessoes }
}

describe('createGameSession — lancar', () => {
  it('caminho feliz: lança o exe resolvido, marca a Sessão e avisa o início', async () => {
    const { session, fake, passos } = montar()

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: true })
    expect(fake.launch).toHaveBeenCalledWith('/games/jogo-a/jogo.sh')
    expect(session.emExecucao()).toBe(true)
    expect(session.ultimoJogoId()).toBe('jogo-a')
    expect(passos).toEqual(['iniciar:jogo-a'])
  })

  it('Jogo fora da view -> JOGO_DESCONHECIDO, sem resolver nem spawn', async () => {
    const resolver = vi.fn(async () => OK)
    const { session, fake } = montar({ acharJogo: async () => null, resolverExe: resolver })

    await expect(session.lancar('fantasma')).resolves.toEqual({ ok: false, code: 'JOGO_DESCONHECIDO' })
    expect(fake.launch).not.toHaveBeenCalled()
    expect(resolver).not.toHaveBeenCalled()
    expect(session.emExecucao()).toBe(false)
    expect(session.ultimoJogoId()).toBeNull()
  })

  it.each(['JOGO_NAO_INSTALADO', 'EXE_NAO_ENCONTRADO', 'EXE_AMBIGUO'] as const)(
    'resolverExe falhou com %s -> propaga o mesmo code, sem spawn',
    async (code) => {
      const { session, fake } = montar({ resolverExe: async () => ({ ok: false, code }) })

      await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code })
      expect(fake.launch).not.toHaveBeenCalled()
      expect(session.emExecucao()).toBe(false)
      expect(session.ultimoJogoId()).toBeNull()
    }
  )

  it('launch devolve error -> FALHA_AO_ABRIR, sem Sessão', async () => {
    const { session, passos } = montar({ launcher: launcherFake('error').launcher })

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'FALHA_AO_ABRIR' })
    expect(session.emExecucao()).toBe(false)
    expect(passos).toEqual([])
    expect(session.ultimoJogoId()).toBeNull()
  })

  it('launch que lança -> FALHA_AO_ABRIR, sem Sessão', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = launcherFake()
    fake.launch.mockRejectedValueOnce(new Error('EACCES'))
    const { session } = montar({ launcher: fake.launcher })

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'FALHA_AO_ABRIR' })
    expect(session.emExecucao()).toBe(false)
    expect(erro).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('resolverExe que rejeita (disco/permissão) -> FALHA_AO_ABRIR e o pedido seguinte é aceito', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resolver = vi
      .fn<GameSessionDeps['resolverExe']>()
      .mockRejectedValueOnce(new Error('EACCES'))
      .mockResolvedValue({ ok: true, exeAbs: '/games/jogo-a/jogo.exe' })
    const { session } = montar({ resolverExe: resolver })

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'FALHA_AO_ABRIR' })
    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: true })
    vi.restoreAllMocks()
  })

  it('segundo pedido com Sessão ativa -> JOGO_EM_EXECUCAO', async () => {
    const achar = vi.fn(async () => jogo('jogo-a'))
    const { session, fake } = montar({ acharJogo: achar })

    await session.lancar('jogo-a')
    await expect(session.lancar('jogo-b')).resolves.toEqual({ ok: false, code: 'JOGO_EM_EXECUCAO' })
    expect(achar).toHaveBeenCalledTimes(1)
    expect(fake.launch).toHaveBeenCalledTimes(1)
  })

  it('segundo pedido em voo (antes do started) -> JOGO_EM_EXECUCAO', async () => {
    const { promise, resolve } = Promise.withResolvers<Jogo | null>()
    const achar = vi.fn(() => promise)
    const { session, fake } = montar({ acharJogo: achar })

    const primeiro = session.lancar('jogo-a')
    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'JOGO_EM_EXECUCAO' })

    resolve(jogo('jogo-a'))
    await expect(primeiro).resolves.toEqual({ ok: true })
    expect(fake.launch).toHaveBeenCalledTimes(1)
  })

  it('depois de um pedido falho, o próximo pode tentar', async () => {
    const achar = vi.fn(async (id: string) => (id === 'jogo-a' ? jogo('jogo-a') : null))
    const { session } = montar({ acharJogo: achar })

    await expect(session.lancar('nao-existe')).resolves.toEqual({ ok: false, code: 'JOGO_DESCONHECIDO' })
    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: true })
  })
})

describe('createGameSession — fim da Sessão', () => {
  it('exit: registra, depois encerra; limpa a Sessão e mantém o ultimoJogoId', async () => {
    const { session, fake, passos, sessoes } = montar()
    await session.lancar('jogo-a')

    await fake.emitirExit({ durationMs: 1234, code: 0 })

    expect(passos).toEqual(['iniciar:jogo-a', 'registrar', 'encerrar'])
    expect(sessoes).toEqual([
      { jogoId: 'jogo-a', inicioISO: '2026-01-01T00:00:00.000Z', duracaoMs: 1234, codigo: 0 }
    ])
    expect(session.emExecucao()).toBe(false)
    expect(session.ultimoJogoId()).toBe('jogo-a')
  })

  it('duracaoMs é a duração monotônica do launcher, não o delta do relógio da Estação', async () => {
    let agora = new Date('2026-01-01T00:00:00.000Z')
    const { session, fake, sessoes } = montar({ agora: () => agora })
    await session.lancar('jogo-a')

    // Relógio ajustado durante a partida (NTP, fuso): a duração não pode herdar o salto.
    agora = new Date('2025-12-31T23:00:00.000Z')
    await fake.emitirExit({ durationMs: 90_500, code: 2 })

    expect(sessoes[0]).toEqual({
      jogoId: 'jogo-a',
      inicioISO: '2026-01-01T00:00:00.000Z',
      duracaoMs: 90_500,
      codigo: 2
    })
  })

  it('registrarSessao que lança ainda encerra (e loga)', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { session, fake, passos } = montar({
      registrarSessao: async () => {
        passos.push('registrar')
        throw new Error('disco cheio')
      }
    })
    await session.lancar('jogo-a')

    await fake.emitirExit({ durationMs: 10, code: null })

    expect(passos).toEqual(['iniciar:jogo-a', 'registrar', 'encerrar'])
    expect(erro).toHaveBeenCalled()
    expect(session.emExecucao()).toBe(false)
    vi.restoreAllMocks()
  })

  it('sem registrarSessao, só encerra', async () => {
    const { session, fake, passos } = montar({ registrarSessao: undefined })
    await session.lancar('jogo-a')

    await fake.emitirExit({ durationMs: 10, code: 0 })

    expect(passos).toEqual(['iniciar:jogo-a', 'encerrar'])
  })

  it('exit sem Sessão ativa -> ignora', async () => {
    const { session, fake, passos } = montar()

    await fake.emitirExit({ durationMs: 10, code: 0 })

    expect(passos).toEqual([])
    expect(session.emExecucao()).toBe(false)
    expect(session.ultimoJogoId()).toBeNull()
  })

  it('depois do fim, um novo lançamento abre outra Sessão', async () => {
    const { session, fake, passos } = montar()
    await session.lancar('jogo-a')
    await fake.emitirExit({ durationMs: 10, code: 0 })

    const resultado: CommandResult = await session.lancar('jogo-a')
    expect(resultado).toEqual({ ok: true })
    expect(passos).toEqual(['iniciar:jogo-a', 'registrar', 'encerrar', 'iniciar:jogo-a'])
    expect(session.emExecucao()).toBe(true)
  })

  it('assina o launcher uma única vez, na criação', async () => {
    const fake = launcherFake()
    const onExited = vi.spyOn(fake.launcher, 'onExited')
    const session = createGameSession({
      launcher: fake.launcher,
      acharJogo: async () => jogo('jogo-a'),
      resolverExe: async () => OK,
      aoIniciar: () => {},
      aoEncerrar: () => {}
    })

    expect(onExited).toHaveBeenCalledTimes(1)
    await session.lancar('jogo-a')
    await fake.emitirExit({ durationMs: 1, code: 0 })

    expect(onExited).toHaveBeenCalledTimes(1)
  })
})
