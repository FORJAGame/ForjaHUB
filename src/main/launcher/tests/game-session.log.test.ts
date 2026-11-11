import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Jogo } from '@shared/types'
import type { ExitInfo, GameLauncher } from '../../ports'
import { hubLog } from '../../log/hub-log'
import { createGameSession, type GameSession, type GameSessionDeps, type SessaoEncerrada } from '../game-session'

function jogo(id: string): Jogo {
  return {
    id,
    titulo: id,
    ano: 2026,
    estudio: 'FORJA',
    genero: 'ação',
    modalidade: 'single-player',
    sinopse: 'sinopse',
    redesUrl: '',
    exeRelativo: '',
    detalheImagens: []
  }
}

interface LauncherFake {
  launcher: GameLauncher
  launch: Mock<(exeAbs: string) => Promise<'started' | 'error'>>
  emitirExit: (info: ExitInfo) => Promise<void>
}

/** Launcher fake: o `exited` dispara na mão, sem esperar processo real. */
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
  infos: Array<[string, string]>
  erros: Array<[string, string]>
  sessoes: SessaoEncerrada[]
}

/**
 * Espia o singleton `hubLog` e registra as chamadas numa lista própria:
 * cada montagem guarda só as linhas dos seus próprios cenários.
 */
function montar(over: Partial<GameSessionDeps> = {}): Montagem {
  const fake = launcherFake()
  const infos: Array<[string, string]> = []
  const erros: Array<[string, string]> = []
  vi.spyOn(hubLog, 'info').mockImplementation((origem, msg) => {
    infos.push([origem, msg])
  })
  vi.spyOn(hubLog, 'erro').mockImplementation((origem, msg) => {
    erros.push([origem, msg])
  })
  const sessoes: SessaoEncerrada[] = []
  const deps: GameSessionDeps = {
    launcher: fake.launcher,
    acharJogo: async (id: string) => jogo(id),
    resolverExe: async () => OK,
    aoIniciar: () => {},
    aoEncerrar: () => {},
    registrarSessao: async (s) => {
      sessoes.push(s)
    },
    agora: () => new Date('2026-01-01T00:00:00.000Z'),
    ...over
  }
  return { session: createGameSession(deps), fake, infos, erros, sessoes }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createGameSession — linhas do hub.log', () => {
  it('lançamento ok ⇒ INFO [sessao] com o jogoId', async () => {
    const { session, infos, erros } = montar()

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: true })

    expect(infos).toContainEqual(['sessao', expect.stringContaining('jogo-a')])
    expect(erros).toHaveLength(0)
  })

  it('exited ⇒ INFO [sessao] com o jogoId e a duração em segundos', async () => {
    const { session, fake, infos } = montar()
    await session.lancar('jogo-a')

    await fake.emitirExit({ durationMs: 12_400, code: 0 })

    const fim = infos.find(([origem, msg]) => origem === 'sessao' && msg.includes('12 s'))
    expect(fim).toBeDefined()
    expect(fim?.[1]).toContain('jogo-a')
  })

  it('launcher devolve error ⇒ ERRO [sessao] com FALHA_AO_ABRIR e o jogoId', async () => {
    const { session, erros, infos } = montar({ launcher: launcherFake('error').launcher })

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'FALHA_AO_ABRIR' })

    const linha = erros.find(([origem, msg]) => origem === 'sessao' && msg.includes('FALHA_AO_ABRIR'))
    expect(linha).toBeDefined()
    expect(linha?.[1]).toContain('jogo-a')
    expect(infos).toHaveLength(0)
  })

  it('resolverExe falhou ⇒ ERRO [sessao] com o code devolvido', async () => {
    const { session, erros } = montar({
      resolverExe: async () => ({ ok: false, code: 'EXE_NAO_ENCONTRADO' })
    })

    await expect(session.lancar('jogo-a')).resolves.toEqual({ ok: false, code: 'EXE_NAO_ENCONTRADO' })

    expect(erros).toContainEqual(['sessao', expect.stringContaining('EXE_NAO_ENCONTRADO')])
  })

  it('Jogo desconhecido e Jogo em execução não geram linha de erro', async () => {
    const desconhecido = montar({ acharJogo: async () => null })
    await expect(desconhecido.session.lancar('fantasma')).resolves.toEqual({ ok: false, code: 'JOGO_DESCONHECIDO' })
    expect(desconhecido.erros).toHaveLength(0)

    const ocupado = montar()
    await ocupado.session.lancar('jogo-a')
    await expect(ocupado.session.lancar('jogo-b')).resolves.toEqual({ ok: false, code: 'JOGO_EM_EXECUCAO' })
    expect(ocupado.erros).toHaveLength(0)
  })

  it('nenhuma linha logada leva estacaoId, eventoId ou inícioISO', async () => {
    // Os cenários 1 a 4 de novo, agora só para colher as mensagens.
    const linhas: string[] = []

    const comeco = montar()
    await comeco.session.lancar('jogo-a')
    await comeco.fake.emitirExit({ durationMs: 12_400, code: 0 })
    linhas.push(...comeco.infos.map(([, msg]) => msg), ...comeco.erros.map(([, msg]) => msg))

    const erroLaunch = montar({ launcher: launcherFake('error').launcher })
    await erroLaunch.session.lancar('jogo-a')
    linhas.push(...erroLaunch.infos.map(([, msg]) => msg), ...erroLaunch.erros.map(([, msg]) => msg))

    const erroExe = montar({ resolverExe: async () => ({ ok: false, code: 'EXE_NAO_ENCONTRADO' }) })
    await erroExe.session.lancar('jogo-a')
    linhas.push(...erroExe.infos.map(([, msg]) => msg), ...erroExe.erros.map(([, msg]) => msg))

    expect(linhas.length).toBeGreaterThan(0)
    for (const msg of linhas) {
      expect(msg).not.toContain('estacaoId')
      expect(msg).not.toContain('eventoId')
      expect(msg).not.toContain('2026-01-01T00:00:00.000Z')
    }
  })
})
