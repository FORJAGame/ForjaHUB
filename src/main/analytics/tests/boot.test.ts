import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigEstacao } from '@shared/types'
import { bootAnalytics } from '../boot'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-analytics-boot-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const config: ConfigEstacao = {
  estacaoId: 'tv-principal',
  eventoId: 'ev-1',
  jogosSelecionados: ['jogo-a'],
  controlePrompts: 'xbox',
  schemaVersion: 2
}

describe('bootAnalytics', () => {
  it('meta.json de versão maior: devolve null e não toca em nenhum arquivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = tmpDir()
    const dir = join(base, 'analytics')
    mkdirSync(dir)
    writeFileSync(join(dir, 'meta.json'), '{"schemaVersion":2}')
    writeFileSync(join(dir, 'spool.jsonl'), '{"cortado"')

    expect(await bootAnalytics(base, async () => config)).toBeNull()
    expect(readdirSync(dir).sort()).toEqual(['meta.json', 'spool.jsonl'])
    expect(readFileSync(join(dir, 'spool.jsonl'), 'utf-8')).toBe('{"cortado"')
  })

  it('Sessão fechada pelo recorder montado vira pendente e agenda um envio; sem Supabase configurado ele falha sem lançar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    try {
      const base = tmpDir()
      const analytics = await bootAnalytics(base, async () => config)
      expect(analytics).not.toBeNull()

      await analytics!.recorder.iniciar({ jogoId: 'jogo-a', inicioISO: '2026-11-11T17:00:00.000Z' })
      await analytics!.recorder.encerrar({
        jogoId: 'jogo-a',
        inicioISO: '2026-11-11T17:00:00.000Z',
        duracaoMs: 61_400,
        codigo: 0
      })

      const linhas = readFileSync(join(base, 'analytics', 'spool.jsonl'), 'utf-8').trim().split('\n')
      expect(linhas.map((l) => JSON.parse(l))).toEqual([
        expect.objectContaining({ jogoId: 'jogo-a', estacaoId: 'tv-principal', eventoId: 'ev-1', duracaoSeg: 61 })
      ])

      // O envio sai sozinho depois do debounce, sem ninguém chamar `flushAgora`.
      expect(analytics!.flusher.estado().ultimoFlushEm).toBeNull()
      await vi.advanceTimersByTimeAsync(5_000)
      await vi.waitFor(() => expect(analytics!.flusher.estado().ultimoFlushOk).toBe(false))
      analytics!.flusher.parar()

      await expect(analytics!.flusher.flushAgora()).resolves.toEqual({
        ok: false,
        code: 'ANALYTICS_NAO_CONFIGURADO'
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
