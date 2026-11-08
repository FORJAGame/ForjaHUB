import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ConfigEstacao, Jogo } from '@shared/types'
import { createGameLauncher } from '../../launcher'
import { createGameSession } from '../../launcher/game-session'
import { gamesDir, resolveGameExe } from '../../launcher/resolve-exe'
import { createAnalyticsFlusher, type AnalyticsFlusherDeps } from '../flusher'
import {
  createSessionRecorder,
  type SessionRecorder,
  type SessionRecorderDeps
} from '../session-recorder'
import { createSupabaseAnalyticsSink } from '../supabase-sink'
import { createAnalyticsSpool } from '../spool'
import type { AnalyticsFlusher, AnalyticsSpool, InicioSessao } from '../types'
import type { SessaoLinha, SessoesTable } from '../../supabase/client'

const INICIO_BASE = '2026-01-01T12:00:00.000Z'

const CONFIG: ConfigEstacao = {
  estacaoId: 'est-1',
  eventoId: 'ev-1',
  jogosSelecionados: ['jogo-a', 'jogo-b'],
  controlePrompts: 'xbox',
  schemaVersion: 2
}

/** Só o cliente Supabase é fake: a tabela `sessoes` vive em memória (PK id, ON CONFLICT DO NOTHING). */
interface SessoesFake {
  readonly linhas: SessaoLinha[]
  estado: { offline: boolean; falharDepoisDeAplicar: boolean }
  tabela: SessoesTable
  inserir: Mock<SessoesTable['inserir']>
}

function criarSessoes(): SessoesFake {
  const porId = new Map<string, SessaoLinha>()
  const estado = { offline: false, falharDepoisDeAplicar: false }

  const inserir = vi.fn<SessoesTable['inserir']>(async (linhas) => {
    if (estado.offline) throw new Error('supabase offline')
    for (const linha of linhas) {
      if (!porId.has(linha.id)) porId.set(linha.id, { ...linha })
    }
    // Aplicou no servidor e a resposta se perdeu no caminho.
    if (estado.falharDepoisDeAplicar) throw new Error('resposta perdida')
  })

  return {
    get linhas() {
      return [...porId.values()]
    },
    estado,
    tabela: { inserir },
    inserir
  }
}

function criarFlusher(
  spool: Pick<AnalyticsSpool, 'pendentes' | 'confirmar'>,
  sessoes: SessoesFake,
  over: Partial<AnalyticsFlusherDeps> = {}
): AnalyticsFlusher {
  const sink = createSupabaseAnalyticsSink(sessoes.tabela)
  return createAnalyticsFlusher({ spool, obterSink: async () => sink, ...over })
}

function criarRecorder(
  spool: AnalyticsSpool,
  over: Partial<SessionRecorderDeps> = {}
): SessionRecorder {
  return createSessionRecorder({
    spool,
    lerConfigEstacao: async () => CONFIG,
    ...over
  })
}

let contadorSessao = 0

/** Abre e fecha uma Sessão no spool real; devolve o registro gravado. */
async function sessaoFechada(
  spool: AnalyticsSpool,
  over: Partial<InicioSessao> = {},
  duracaoSeg = 60
): Promise<{ id: string; eventoId: string }> {
  const inicioISO = new Date(Date.parse(INICIO_BASE) + contadorSessao++ * 3_600_000).toISOString()
  await spool.abrirSessao({
    jogoId: 'jogo-a',
    estacaoId: 'est-1',
    eventoId: 'ev-1',
    inicioISO,
    ...over
  })
  const registro = await spool.fecharSessao({ duracaoSeg })
  if (!registro) throw new Error('Sessão não fechou')
  return { id: registro.id, eventoId: registro.eventoId }
}

function lerIdsConfirmados(dir: string): string[] {
  return readFileSync(join(dir, 'confirmed.jsonl'), 'utf-8')
    .split('\n')
    .filter((linha) => linha !== '')
    .map((linha) => {
      const dado: unknown = JSON.parse(linha)
      if (typeof dado === 'object' && dado !== null && 'id' in dado && typeof dado.id === 'string') {
        return dado.id
      }
      throw new Error(`confirmed.jsonl: linha sem id: ${linha}`)
    })
}

const dirs: string[] = []

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forja-exactly-once-'))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  contadorSessao = 0
  // Só os timers: fs/promises continuam reais.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('Sessão de Jogo vira exatamente uma linha na tabela sessoes', () => {
  it('1. offline → online: os 3 registros retidos chegam de uma vez, cada um 1×', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    const flusher = criarFlusher(spool, sessoes)

    sessoes.estado.offline = true
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push((await sessaoFechada(spool)).id)

    for (let i = 0; i < 3; i++) {
      expect((await flusher.flushAgora()).ok).toBe(false)
    }
    expect(sessoes.linhas).toHaveLength(0)
    expect(await spool.pendentes()).toHaveLength(3)

    sessoes.estado.offline = false
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 3, pendentes: 0 })

    const naTabela = sessoes.linhas.map((linha) => linha.id)
    expect(naTabela).toEqual(ids)
    expect(new Set(naTabela).size).toBe(3)
    expect(await spool.pendentes()).toEqual([])
    expect(new Set(lerIdsConfirmados(dir))).toEqual(new Set(ids))
  })

  it('2. resposta perdida no insert: o retry reconhece a linha aplicada e não duplica', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    const flusher = criarFlusher(spool, sessoes)
    const { id } = await sessaoFechada(spool)

    sessoes.estado.falharDepoisDeAplicar = true
    expect((await flusher.flushAgora()).ok).toBe(false)
    expect(sessoes.linhas).toHaveLength(1)
    expect(await spool.pendentes()).toHaveLength(1)

    // A resposta se perdeu, mas a linha já estava gravada: o retry não duplica.
    sessoes.estado.falharDepoisDeAplicar = false
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 1, pendentes: 0 })

    expect(sessoes.linhas).toHaveLength(1)
    expect(sessoes.linhas[0].id).toBe(id)
    expect(await spool.pendentes()).toEqual([])
  })

  it('3. confirmação perdida no disco: o segundo envio não duplica a linha', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    let confirmacoes = 0
    const spoolInstavel = {
      pendentes: () => spool.pendentes(),
      confirmar: (ids: string[]) => {
        confirmacoes += 1
        return confirmacoes === 1
          ? Promise.reject(new Error('disco cheio'))
          : spool.confirmar(ids)
      }
    }
    const flusher = criarFlusher(spoolInstavel, sessoes)
    const { id } = await sessaoFechada(spool)

    expect((await flusher.flushAgora()).ok).toBe(false)
    expect(sessoes.linhas).toHaveLength(1)
    expect(await spool.pendentes()).toHaveLength(1)

    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 1, pendentes: 0 })

    expect(sessoes.linhas).toHaveLength(1)
    expect(sessoes.linhas[0].id).toBe(id)
    expect(await spool.pendentes()).toEqual([])
  })

  it('4. Hub reinicia depois de confirmar: nada pendente e nenhuma chamada à tabela sessoes', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    await sessaoFechada(spool)
    await expect(criarFlusher(spool, sessoes).flushAgora()).resolves.toEqual({
      ok: true,
      enviados: 1,
      pendentes: 0
    })
    expect(sessoes.linhas).toHaveLength(1)

    const spool2 = await createAnalyticsSpool({ dir })
    expect(await spool2.pendentes()).toEqual([])

    const sessoes2 = criarSessoes()
    const flusher2 = criarFlusher(spool2, sessoes2)
    await expect(flusher2.flushAgora()).resolves.toEqual({ ok: true, enviados: 0, pendentes: 0 })
    expect(sessoes2.inserir).not.toHaveBeenCalled()
  })

  it('5. queda de energia com Jogo aberto: o marker vira 1 pendente incompleta', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    let hora = new Date(INICIO_BASE)
    const recorder = criarRecorder(spool, { agora: () => hora })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_BASE })

    hora = new Date(Date.parse(INICIO_BASE) + 60_000)
    vi.advanceTimersByTime(60_000)
    hora = new Date(Date.parse(INICIO_BASE) + 120_000)
    vi.advanceTimersByTime(60_000)
    // Barreira: o spool serializa as escritas, então os dois heartbeats já foram ao disco.
    await spool.pendentes()

    // "Morre" sem encerrar: um spool novo no mesmo diretório recupera o marker.
    const spool2 = await createAnalyticsSpool({ dir })
    const pendentes = await spool2.pendentes()
    expect(pendentes).toHaveLength(1)
    expect(pendentes[0]).toMatchObject({
      jogoId: 'jogo-a',
      estacaoId: 'est-1',
      eventoId: 'ev-1',
      duracaoSeg: 120,
      incompleta: true
    })

    await criarFlusher(spool2, sessoes).flushAgora()

    expect(sessoes.linhas).toHaveLength(1)
    expect(sessoes.linhas[0].duracao_seg).toBe(120)
    expect(sessoes.linhas[0].incompleta).toBe(true)
    expect(await spool2.pendentes()).toEqual([])
  })

  it('6. append cortado: o prefixo é descartado e só as linhas válidas chegam', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const valida = await sessaoFechada(spool)

    // Prefixo de uma linha cuja escrita foi interrompida sem `\n`.
    appendFileSync(join(dir, 'spool.jsonl'), '{"id":"cortada","jogoId":"jogo-a","est')

    const spool2 = await createAnalyticsSpool({ dir })
    const nova = await sessaoFechada(spool2)
    const sessoes = criarSessoes()
    await criarFlusher(spool2, sessoes).flushAgora()

    expect(sessoes.linhas.map((linha) => linha.id)).toEqual([valida.id, nova.id])

    const conteudo = readFileSync(join(dir, 'spool.jsonl'), 'utf-8')
    expect(conteudo).not.toContain('cortada')
    expect(conteudo.endsWith('\n')).toBe(true)
    const linhas = conteudo.split('\n').filter((linha) => linha !== '')
    expect(linhas).toHaveLength(2)
    for (const linha of linhas) {
      expect(() => JSON.parse(linha)).not.toThrow()
    }
  })

  it('7. troca de Evento no meio: cada Sessão leva o carimbo do seu início', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    const flusher = criarFlusher(spool, sessoes)
    let config: ConfigEstacao = { ...CONFIG }
    const recorder = criarRecorder(spool, { lerConfigEstacao: async () => config })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: '2026-06-01T10:00:00.000Z' })
    await recorder.encerrar({
      jogoId: 'jogo-a',
      inicioISO: '2026-06-01T10:00:00.000Z',
      duracaoMs: 60_000,
      codigo: 0
    })

    config = { ...config, eventoId: 'ev-2' }
    await recorder.iniciar({ jogoId: 'jogo-b', inicioISO: '2026-06-01T11:00:00.000Z' })
    await recorder.encerrar({
      jogoId: 'jogo-b',
      inicioISO: '2026-06-01T11:00:00.000Z',
      duracaoMs: 60_000,
      codigo: 0
    })

    const ids = (await spool.pendentes()).map((registro) => registro.id)
    expect(ids).toHaveLength(2)
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 2, pendentes: 0 })

    expect(
      sessoes.linhas.map((linha) => [linha.id, linha.evento_id, linha.estacao_id, linha.jogo_id])
    ).toEqual([
      [ids[0], 'ev-1', 'est-1', 'jogo-a'],
      [ids[1], 'ev-2', 'est-1', 'jogo-b']
    ])
  })

  it('8. compactação: o spool esvazia e as 4 linhas já confirmadas não voltam', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    const flusher = criarFlusher(spool, sessoes)

    for (let i = 0; i < 4; i++) await sessaoFechada(spool)
    await expect(flusher.flushAgora()).resolves.toEqual({ ok: true, enviados: 4, pendentes: 0 })
    expect(sessoes.linhas).toHaveLength(4)

    const spool2 = await createAnalyticsSpool({ dir, limiteCompactacao: 2 })
    expect(readFileSync(join(dir, 'spool.jsonl'), 'utf-8')).toBe('')
    expect(await spool2.pendentes()).toEqual([])

    await sessaoFechada(spool2)
    await criarFlusher(spool2, sessoes).flushAgora()

    expect(sessoes.linhas).toHaveLength(5)
    const ids = sessoes.linhas.map((linha) => linha.id)
    expect(new Set(ids).size).toBe(5)
  })

  describe.skipIf(process.platform === 'win32')('9. ciclo real com launcher e .sh', () => {
    function jogoDeTeste(id: string): Jogo {
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

    /** `games/<id>/jogo.sh`: dorme 300 ms e sai limpo. */
    function instalarJogo(base: string, id: string): void {
      const pasta = join(gamesDir(base), id)
      mkdirSync(pasta, { recursive: true })
      writeFileSync(join(pasta, 'jogo.sh'), '#!/bin/sh\nsleep 0.3\nexit 0\n', { mode: 0o755 })
    }

    it('lancar → fim do Jogo → flush deixa 1 linha com carimbo e duração', async () => {
      vi.useRealTimers()
      const base = tmpDir()
      const dir = join(base, 'analytics')
      instalarJogo(base, 'jogo-ciclo')

      const spool = await createAnalyticsSpool({ dir })
      const sessoes = criarSessoes()
      const sink = createSupabaseAnalyticsSink(sessoes.tabela)
      // Sinal do flush agendado pelo `aoRegistrar`, sem esperar por relógio real.
      const flushConcluido = Promise.withResolvers<void>()
      const flusher = createAnalyticsFlusher({
        spool,
        debounceMs: 0,
        obterSink: async () => ({
          flush: async (registros) => {
            try {
              return await sink.flush(registros)
            } finally {
              flushConcluido.resolve()
            }
          }
        })
      })
      const recorder = criarRecorder(spool, { aoRegistrar: () => flusher.agendar() })
      const encerrada = Promise.withResolvers<void>()

      const session = createGameSession({
        launcher: createGameLauncher(),
        acharJogo: async (id) => jogoDeTeste(id),
        resolverExe: (jogo) => resolveGameExe(base, jogo),
        aoIniciar: () => {},
        aoEncerrar: () => encerrada.resolve(),
        abrirSessao: (s) => recorder.iniciar(s),
        registrarSessao: (s) => recorder.encerrar(s)
      })

      expect(await session.lancar('jogo-ciclo')).toEqual({ ok: true })
      await encerrada.promise
      await flushConcluido.promise
      // Se o `confirmar` ainda estiver em voo, esta chamada compartilha a promessa.
      await flusher.flushAgora()

      expect(sessoes.linhas).toHaveLength(1)
      const linha = sessoes.linhas[0]
      expect(linha.jogo_id).toBe('jogo-ciclo')
      expect(linha.estacao_id).toBe('est-1')
      expect(linha.evento_id).toBe('ev-1')
      expect(linha.duracao_seg).toBeGreaterThanOrEqual(0)
      expect(linha.duracao_seg).toBeLessThanOrEqual(2)
      expect(await spool.pendentes()).toEqual([])
      expect(existsSync(join(dir, 'open-session.json'))).toBe(false)
    })
  })

  it('10. quit com Jogo aberto: fecha incompleta com a duração do relógio monotônico', async () => {
    const dir = tmpDir()
    const spool = await createAnalyticsSpool({ dir })
    const sessoes = criarSessoes()
    let relogio = 0
    const recorder = criarRecorder(spool, { relogioMs: () => relogio })

    await recorder.iniciar({ jogoId: 'jogo-a', inicioISO: INICIO_BASE })
    relogio = 45_000
    await recorder.encerrarNoQuit()

    const pendentes = await spool.pendentes()
    expect(pendentes).toHaveLength(1)
    expect(pendentes[0]).toMatchObject({ duracaoSeg: 45, incompleta: true })
    expect(existsSync(join(dir, 'open-session.json'))).toBe(false)

    await criarFlusher(spool, sessoes).flushAgora()
    expect(sessoes.linhas).toHaveLength(1)
    expect(sessoes.linhas[0].incompleta).toBe(true)
  })
})
