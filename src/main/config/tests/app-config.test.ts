import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appConfigPath, BUILD_SUPABASE_ANON_KEY, BUILD_SUPABASE_URL, resolveSupabaseConfig } from '../app-config'

const dirs: string[] = []
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'forja-app-config-'))
  dirs.push(d)
  return d
}

function escreverConfig(dir: string, conteudo: string): void {
  mkdirSync(join(dir, 'config'), { recursive: true })
  writeFileSync(appConfigPath(dir), conteudo)
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const BUILD_COMPLETO = BUILD_SUPABASE_URL !== '' && BUILD_SUPABASE_ANON_KEY !== ''

describe('resolveSupabaseConfig', () => {
  it('sem app-config.json -> valores de build (null quando o build não os define)', async () => {
    const esperado = BUILD_COMPLETO ? { url: BUILD_SUPABASE_URL, anonKey: BUILD_SUPABASE_ANON_KEY } : null
    await expect(resolveSupabaseConfig(tmpDir())).resolves.toEqual(esperado)
  })

  it('override completo em app-config.json -> devolve url e anonKey do arquivo', async () => {
    const dir = tmpDir()
    escreverConfig(dir, JSON.stringify({ supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: 'anon-real' }))
    await expect(resolveSupabaseConfig(dir)).resolves.toEqual({
      url: 'https://proj.supabase.co',
      anonKey: 'anon-real'
    })
  })

  it.each([
    { supabaseUrl: 'https://proj.supabase.co' },
    { supabaseAnonKey: 'anon-real' }
  ])('override parcial %o completa só o campo presente com o build (null se o build não o tem)', async (parcial) => {
    const dir = tmpDir()
    escreverConfig(dir, JSON.stringify(parcial))
    const url = 'supabaseUrl' in parcial ? parcial.supabaseUrl : BUILD_SUPABASE_URL
    const anonKey = 'supabaseAnonKey' in parcial ? parcial.supabaseAnonKey : BUILD_SUPABASE_ANON_KEY
    const esperado = url && anonKey ? { url, anonKey } : null
    await expect(resolveSupabaseConfig(dir)).resolves.toEqual(esperado)
  })

  it('JSON inválido -> tratado como sem override, não lança', async () => {
    const dir = tmpDir()
    escreverConfig(dir, '{ nem json')
    await expect(resolveSupabaseConfig(dir)).resolves.toEqual(
      BUILD_COMPLETO ? { url: BUILD_SUPABASE_URL, anonKey: BUILD_SUPABASE_ANON_KEY } : null
    )
  })

  it('shape inválido (campo vazio) -> tratado como sem override, o override válido do mesmo arquivo também cai', async () => {
    const dir = tmpDir()
    escreverConfig(dir, JSON.stringify({ supabaseUrl: 'https://proj.supabase.co', supabaseAnonKey: '' }))
    await expect(resolveSupabaseConfig(dir)).resolves.toEqual(
      BUILD_COMPLETO ? { url: BUILD_SUPABASE_URL, anonKey: BUILD_SUPABASE_ANON_KEY } : null
    )
  })

  it('app-config.json sem as chaves do Supabase -> tratado como sem override', async () => {
    const dir = tmpDir()
    escreverConfig(dir, JSON.stringify({ outraCoisa: true }))
    await expect(resolveSupabaseConfig(dir)).resolves.toEqual(
      BUILD_COMPLETO ? { url: BUILD_SUPABASE_URL, anonKey: BUILD_SUPABASE_ANON_KEY } : null
    )
  })
})
