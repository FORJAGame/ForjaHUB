interface ImportMetaEnv {
  // URL do projeto Supabase (catálogo, mídia e analytics)
  readonly MAIN_VITE_SUPABASE_URL?: string
  // Anon key do projeto: só lê `jogos`/mídia e só insere em `sessoes` (RLS)
  readonly MAIN_VITE_SUPABASE_ANON_KEY?: string
}
