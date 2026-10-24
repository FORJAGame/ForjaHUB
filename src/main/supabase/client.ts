import { createClient } from '@supabase/supabase-js'
import type { SupabaseConfig } from '../config/app-config'

export const BUCKET_MIDIA = 'midia'

// Superfícies mínimas que catálogo e analytics usam, não o `SupabaseClient` inteiro:
// os testes trocam cada uma por um fake em memória.

export interface JogosTable {
  /** Todas as linhas de `jogos`, cruas; quem chama valida. */
  listar(): Promise<unknown[]>
}

export interface MidiaStorage {
  /** Nomes dos arquivos (sem subpastas) em `midia/<pasta>/`. */
  listar(pasta: string): Promise<string[]>
  baixar(caminho: string): Promise<Buffer>
}

export interface SessaoLinha {
  id: string
  evento_id: string
  estacao_id: string
  jogo_id: string
  inicio: string
  duracao_seg: number
  incompleta: boolean
}

export interface SessoesTable {
  /** `registrar_sessoes`: insert com `on conflict (id) do nothing`, reenviar um id já gravado é no-op. */
  inserir(linhas: SessaoLinha[]): Promise<void>
}

export interface SupabaseClients {
  jogos: JogosTable
  midia: MidiaStorage
  sessoes: SessoesTable
}

// Acima disso o Storage pagina; uma pasta de mídia de Jogo nunca chega perto.
const LIMITE_LISTAGEM = 1000

export function createSupabaseClients(config: SupabaseConfig): SupabaseClients {
  // Main process sem login: nada de sessão persistida nem refresh de token.
  const supabase = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
  const bucket = supabase.storage.from(BUCKET_MIDIA)

  return {
    jogos: {
      async listar() {
        const { data, error } = await supabase.from('jogos').select('*')
        if (error) throw new Error(`jogos: ${error.message}`)
        return data
      }
    },
    midia: {
      async listar(pasta) {
        const { data, error } = await bucket.list(pasta, { limit: LIMITE_LISTAGEM })
        if (error) throw new Error(`midia/${pasta}: ${error.message}`)
        // Subpasta vem com `id: null`.
        return data.filter((entry) => entry.id !== null).map((entry) => entry.name)
      },
      async baixar(caminho) {
        const { data, error } = await bucket.download(caminho)
        if (error) throw new Error(`midia/${caminho}: ${error.message}`)
        return Buffer.from(await data.arrayBuffer())
      }
    },
    sessoes: {
      async inserir(linhas) {
        // RPC em vez de upsert: `on conflict (id)` direto na tabela exigiria dar SELECT à anon key.
        const { error } = await supabase.rpc('registrar_sessoes', { sessoes: linhas })
        if (error) throw new Error(`sessoes: ${error.message}`)
      }
    }
  }
}
