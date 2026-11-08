import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { RegistroAnalytics } from '@shared/types'
import type { SessaoLinha, SessoesTable } from '../../supabase/client'
import { AnalyticsNaoConfiguradoError } from '../types'
import { criarSinkPadrao, createSupabaseAnalyticsSink, registroParaLinha } from '../supabase-sink'

interface SessoesFake {
  readonly linhas: SessaoLinha[]
  falharDepoisDeAplicar: boolean
  tabela: SessoesTable
  inserir: Mock<SessoesTable['inserir']>
}

// Tabela em memória: PK id, `ON CONFLICT DO NOTHING`.
function criarSessoesFake(): SessoesFake {
  const porId = new Map<string, SessaoLinha>()
  const fake: SessoesFake = {
    get linhas() {
      return [...porId.values()]
    },
    falharDepoisDeAplicar: false,
    inserir: vi.fn<SessoesTable['inserir']>(async (linhas) => {
      for (const linha of linhas) {
        if (!porId.has(linha.id)) porId.set(linha.id, { ...linha })
      }
      if (fake.falharDepoisDeAplicar) throw new Error('resposta perdida')
    }),
    tabela: { inserir: async (linhas) => fake.inserir(linhas) }
  }
  return fake
}

function registro(over: Partial<RegistroAnalytics> = {}): RegistroAnalytics {
  return {
    id: 'r1',
    jogoId: 'jogo-1',
    estacaoId: 'est-1',
    eventoId: 'ev-1',
    inicioISO: '2026-11-11T17:32:05.000Z',
    duracaoSeg: 90,
    ...over
  }
}

const dirs: string[] = []

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forja-supabase-sink-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('registroParaLinha', () => {
  it('mapeia os campos para as colunas snake_case da tabela sessoes', () => {
    expect(registroParaLinha(registro())).toEqual({
      id: 'r1',
      evento_id: 'ev-1',
      estacao_id: 'est-1',
      jogo_id: 'jogo-1',
      inicio: '2026-11-11T17:32:05.000Z',
      duracao_seg: 90,
      incompleta: false
    })
  })

  it('incompleta true vira true; ausente vira false', () => {
    expect(registroParaLinha(registro({ incompleta: true })).incompleta).toBe(true)
    expect(registroParaLinha(registro()).incompleta).toBe(false)
  })
})

describe('createSupabaseAnalyticsSink', () => {
  it('lote novo -> 1 inserir com as linhas na ordem; devolve todos os ids', async () => {
    const sessoes = criarSessoesFake()
    const sink = createSupabaseAnalyticsSink(sessoes.tabela)
    const r1 = registro({ id: 'r1' })
    const r2 = registro({ id: 'r2', jogoId: 'jogo-2', duracaoSeg: 10, incompleta: true })

    await expect(sink.flush([r1, r2])).resolves.toEqual({ idsAceitos: ['r1', 'r2'] })

    expect(sessoes.inserir).toHaveBeenCalledTimes(1)
    expect(sessoes.inserir).toHaveBeenCalledWith([registroParaLinha(r1), registroParaLinha(r2)])
    expect(sessoes.linhas.map((l) => l.id)).toEqual(['r1', 'r2'])
  })

  it('lote vazio -> nenhuma chamada e nenhum id aceito', async () => {
    const sessoes = criarSessoesFake()
    const sink = createSupabaseAnalyticsSink(sessoes.tabela)

    await expect(sink.flush([])).resolves.toEqual({ idsAceitos: [] })
    expect(sessoes.inserir).not.toHaveBeenCalled()
  })

  it('id repetido no mesmo lote -> uma linha só (o primeiro vence) e id devolvido uma vez', async () => {
    const sessoes = criarSessoesFake()
    const sink = createSupabaseAnalyticsSink(sessoes.tabela)

    const resultado = await sink.flush([
      registro({ id: 'r1', duracaoSeg: 10 }),
      registro({ id: 'r2' }),
      registro({ id: 'r1', duracaoSeg: 999 })
    ])

    expect(resultado).toEqual({ idsAceitos: ['r1', 'r2'] })
    expect(sessoes.inserir).toHaveBeenCalledTimes(1)
    expect(sessoes.linhas.map((l) => [l.id, l.duracao_seg])).toEqual([
      ['r1', 10],
      ['r2', 90]
    ])
  })

  it('rejeição de inserir propaga para o chamador', async () => {
    const tabela: SessoesTable = {
      inserir: async () => {
        throw new Error('sem rede')
      }
    }
    const sink = createSupabaseAnalyticsSink(tabela)

    await expect(sink.flush([registro()])).rejects.toThrow('sem rede')
  })

  it('resposta perdida depois de aplicar: o reenvio do mesmo lote não duplica linhas', async () => {
    const sessoes = criarSessoesFake()
    const sink = createSupabaseAnalyticsSink(sessoes.tabela)
    const lote = [registro({ id: 'r1' }), registro({ id: 'r2' })]

    sessoes.falharDepoisDeAplicar = true
    await expect(sink.flush(lote)).rejects.toThrow('resposta perdida')
    expect(sessoes.linhas).toHaveLength(2)

    sessoes.falharDepoisDeAplicar = false
    await expect(sink.flush(lote)).resolves.toEqual({ idsAceitos: ['r1', 'r2'] })
    expect(sessoes.linhas.map((l) => l.id)).toEqual(['r1', 'r2'])
  })
})

describe('criarSinkPadrao', () => {
  it('sem config/app-config.json -> AnalyticsNaoConfiguradoError', async () => {
    const dir = tmpDir()
    await expect(criarSinkPadrao(dir)).rejects.toThrow(AnalyticsNaoConfiguradoError)
  })
})
