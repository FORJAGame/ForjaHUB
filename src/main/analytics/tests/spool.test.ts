import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistroAnalytics } from '@shared/types'
import type { InicioSessao } from '../types'
import {
  ANALYTICS_SCHEMA_VERSION,
  AnalyticsSchemaIncompativelError,
  createAnalyticsSpool
} from '../spool'

const INICIO = '2026-10-24T12:00:00.000Z'
const dirs: string[] = []

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forja-analytics-'))
  dirs.push(dir)
  return dir
}

function inicio(over: Partial<InicioSessao> = {}): InicioSessao {
  return { jogoId: 'jogo-1', estacaoId: 'tv-1', eventoId: 'ev-1', inicioISO: INICIO, ...over }
}

function linhaRegistro(over: Partial<RegistroAnalytics> = {}): string {
  return JSON.stringify({
    id: 'r1',
    jogoId: 'jogo-1',
    estacaoId: 'tv-1',
    eventoId: 'ev-1',
    inicioISO: INICIO,
    duracaoSeg: 10,
    ...over
  })
}

function arquivos(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir).map((nome) => [nome, readFileSync(join(dir, nome), 'utf-8')])
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createAnalyticsSpool', () => {
  it('fecha uma Sessão em uma linha, apaga o marker e mantém o estado após reiniciar', async () => {
    const dir = tmpDir()
    const spoolPath = join(dir, 'spool.jsonl')
    const markerPath = join(dir, 'open-session.json')
    const spool = await createAnalyticsSpool({ dir, gerarId: () => 'sessao-1' })

    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8'))).toEqual({
      schemaVersion: ANALYTICS_SCHEMA_VERSION
    })
    expect(await spool.abrirSessao(inicio())).toBe('sessao-1')
    expect(existsSync(markerPath)).toBe(true)

    expect(await spool.fecharSessao({ duracaoSeg: 42.6 })).toEqual({
      id: 'sessao-1',
      jogoId: 'jogo-1',
      estacaoId: 'tv-1',
      eventoId: 'ev-1',
      inicioISO: INICIO,
      duracaoSeg: 43
    })
    expect(readFileSync(spoolPath, 'utf-8')).toBe(linhaRegistro({ id: 'sessao-1', duracaoSeg: 43 }) + '\n')
    expect(existsSync(markerPath)).toBe(false)
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['sessao-1'])

    await spool.confirmar(['sessao-1'])
    expect(await spool.pendentes()).toEqual([])
    expect(readFileSync(join(dir, 'confirmed.jsonl'), 'utf-8')).toBe('{"id":"sessao-1"}\n')

    const outro = await createAnalyticsSpool({ dir })
    expect(await outro.pendentes()).toEqual([])
  })

  it('recupera Sessão aberta na queda como incompleta, com a duração do vistoEm', async () => {
    const dir = tmpDir()
    const markerPath = join(dir, 'open-session.json')
    const spool = await createAnalyticsSpool({ dir, gerarId: () => 'sessao-q' })
    await spool.abrirSessao(inicio())
    await spool.tocarSessao('2026-10-24T12:00:30.000Z')

    const outro = await createAnalyticsSpool({ dir })
    expect(await outro.pendentes()).toEqual([
      {
        id: 'sessao-q',
        jogoId: 'jogo-1',
        estacaoId: 'tv-1',
        eventoId: 'ev-1',
        inicioISO: INICIO,
        duracaoSeg: 30,
        incompleta: true
      }
    ])
    expect(existsSync(markerPath)).toBe(false)
  })

  it('descarta marker corrompido sem criar registro', async () => {
    const dir = tmpDir()
    const markerPath = join(dir, 'open-session.json')
    writeFileSync(markerPath, '{"schemaVersion":1,"id":')

    const spool = await createAnalyticsSpool({ dir })
    expect(await spool.pendentes()).toEqual([])
    expect(existsSync(markerPath)).toBe(false)
  })

  it('trunca a linha final cortada do spool e o append seguinte fica íntegro', async () => {
    const dir = tmpDir()
    const spoolPath = join(dir, 'spool.jsonl')
    writeFileSync(spoolPath, linhaRegistro({ id: 'r1' }) + '\n' + '{"id":"cortada"')

    const spool = await createAnalyticsSpool({ dir, gerarId: () => 'sessao-nova' })
    expect(readFileSync(spoolPath, 'utf-8')).toBe(linhaRegistro({ id: 'r1' }) + '\n')
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['r1'])

    await spool.abrirSessao(inicio())
    await spool.fecharSessao({ duracaoSeg: 5 })

    const linhas = readFileSync(spoolPath, 'utf-8').split('\n').filter(Boolean)
    expect(linhas).toHaveLength(2)
    expect(JSON.parse(linhas[1])).toMatchObject({ id: 'sessao-nova', duracaoSeg: 5 })
  })

  it('trunca a linha final cortada de confirmed.jsonl', async () => {
    const dir = tmpDir()
    const spoolPath = join(dir, 'spool.jsonl')
    const confirmedPath = join(dir, 'confirmed.jsonl')
    writeFileSync(
      spoolPath,
      [linhaRegistro({ id: 'a' }), linhaRegistro({ id: 'b' })].join('\n') + '\n'
    )
    writeFileSync(confirmedPath, '{"id":"a"}\n{"id":"b"')

    const spool = await createAnalyticsSpool({ dir })
    expect(readFileSync(confirmedPath, 'utf-8')).toBe('{"id":"a"}\n')
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['b'])

    await spool.confirmar(['b'])
    expect(await spool.pendentes()).toEqual([])
    expect(readFileSync(confirmedPath, 'utf-8')).toBe('{"id":"a"}\n{"id":"b"}\n')
  })

  it('recusa meta.json de versão maior sem tocar em nenhum arquivo', async () => {
    const dir = tmpDir()
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ schemaVersion: 2 }))
    writeFileSync(join(dir, 'spool.jsonl'), linhaRegistro({ id: 'a' }) + '\n')
    writeFileSync(join(dir, 'confirmed.jsonl'), '{"id":"x"}\n')
    const antes = arquivos(dir)

    const erro: unknown = await createAnalyticsSpool({ dir }).catch((err: unknown) => err)
    expect(erro).toBeInstanceOf(AnalyticsSchemaIncompativelError)
    expect(erro).toMatchObject({ versao: 2, suportado: ANALYTICS_SCHEMA_VERSION })
    expect(arquivos(dir)).toEqual(antes)
  })

  it('compacta o spool quando os registros confirmados passam do limite', async () => {
    const dir = tmpDir()
    const spoolPath = join(dir, 'spool.jsonl')
    const confirmedPath = join(dir, 'confirmed.jsonl')
    writeFileSync(
      spoolPath,
      ['a', 'b', 'c', 'd'].map((id) => linhaRegistro({ id })).join('\n') + '\n'
    )
    writeFileSync(
      confirmedPath,
      ['a', 'b', 'c'].map((id) => JSON.stringify({ id })).join('\n') + '\n'
    )

    const semCompactar = await createAnalyticsSpool({ dir, limiteCompactacao: 100 })
    expect((await semCompactar.pendentes()).map((registro) => registro.id)).toEqual(['d'])
    expect(readFileSync(spoolPath, 'utf-8').split('\n').filter(Boolean)).toHaveLength(4)

    const spool = await createAnalyticsSpool({ dir, limiteCompactacao: 2 })
    expect(readFileSync(spoolPath, 'utf-8')).toBe(linhaRegistro({ id: 'd' }) + '\n')
    expect(readFileSync(confirmedPath, 'utf-8')).toBe('')
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['d'])

    const outro = await createAnalyticsSpool({ dir, limiteCompactacao: 2 })
    expect((await outro.pendentes()).map((registro) => registro.id)).toEqual(['d'])
  })

  it('devolve null sem Sessão e fecha a anterior como incompleta ao abrir outra', async () => {
    const dir = tmpDir()
    const ids = ['s1', 's2']
    let proximo = 0
    const spool = await createAnalyticsSpool({ dir, gerarId: () => ids[proximo++] })

    expect(await spool.fecharSessao({ duracaoSeg: 1 })).toBeNull()

    await spool.abrirSessao(inicio())
    await spool.tocarSessao('2026-10-24T12:01:00.000Z')
    await spool.abrirSessao(inicio({ jogoId: 'jogo-2', inicioISO: '2026-10-24T13:00:00.000Z' }))

    expect(await spool.pendentes()).toEqual([
      {
        id: 's1',
        jogoId: 'jogo-1',
        estacaoId: 'tv-1',
        eventoId: 'ev-1',
        inicioISO: INICIO,
        duracaoSeg: 60,
        incompleta: true
      }
    ])
    expect(JSON.parse(readFileSync(join(dir, 'open-session.json'), 'utf-8'))).toMatchObject({
      id: 's2',
      jogoId: 'jogo-2',
      vistoEm: '2026-10-24T13:00:00.000Z'
    })
  })

  it('serializa chamadas concorrentes em uma linha inteira por Sessão', async () => {
    const dir = tmpDir()
    const ids = ['s1', 's2', 's3']
    let proximo = 0
    const spool = await createAnalyticsSpool({ dir, gerarId: () => ids[proximo++] })

    await Promise.all([
      spool.abrirSessao(inicio()),
      spool.fecharSessao({ duracaoSeg: 10 }),
      spool.abrirSessao(inicio({ jogoId: 'jogo-2' })),
      spool.fecharSessao({ duracaoSeg: 20 }),
      spool.abrirSessao(inicio({ jogoId: 'jogo-3' })),
      spool.fecharSessao({ duracaoSeg: 30 })
    ])

    const linhas = readFileSync(join(dir, 'spool.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean)
    expect(linhas.map((linha) => JSON.parse(linha).id)).toEqual(['s1', 's2', 's3'])
    expect(linhas.map((linha) => JSON.parse(linha).duracaoSeg)).toEqual([10, 20, 30])
    expect(existsSync(join(dir, 'open-session.json'))).toBe(false)
  })

  it('devolve uma única vez um id repetido no spool', async () => {
    const dir = tmpDir()
    writeFileSync(
      join(dir, 'spool.jsonl'),
      [
        linhaRegistro({ id: 'dup', duracaoSeg: 1 }),
        linhaRegistro({ id: 'dup', duracaoSeg: 2 }),
        linhaRegistro({ id: 'outro' })
      ].join('\n') + '\n'
    )

    const spool = await createAnalyticsSpool({ dir })
    const pendentes = await spool.pendentes()
    expect(pendentes.map((registro) => registro.id)).toEqual(['dup', 'outro'])
    expect(pendentes[0].duracaoSeg).toBe(1)
  })

  it('linha com data de início inválida não vira pendente (não envenena o lote)', async () => {
    const dir = tmpDir()
    writeFileSync(
      join(dir, 'spool.jsonl'),
      [linhaRegistro({ id: 'ruim', inicioISO: 'ontem' }), linhaRegistro({ id: 'bom' })].join('\n') +
        '\n'
    )

    const spool = await createAnalyticsSpool({ dir })
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['bom'])
  })

  it('marker que não sai do disco no fecho não rejeita: o registro já está gravado', async () => {
    const dir = tmpDir()
    const markerPath = join(dir, 'open-session.json')
    const spool = await createAnalyticsSpool({ dir, gerarId: () => 'sessao-u' })
    await spool.abrirSessao(inicio())
    // Diretório no lugar do arquivo: o `unlink` falha com erro diferente de ENOENT.
    rmSync(markerPath)
    mkdirSync(markerPath)

    await expect(spool.fecharSessao({ duracaoSeg: 5 })).resolves.toMatchObject({ id: 'sessao-u' })
    expect((await spool.pendentes()).map((registro) => registro.id)).toEqual(['sessao-u'])
  })
})
