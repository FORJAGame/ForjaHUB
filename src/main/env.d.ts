interface ImportMetaEnv {
  // ID da Planilha de Catálogo
  readonly MAIN_VITE_SPREADSHEET_ID?: string
  // ID da pasta Drive raiz de mídia (subpasta por Jogo, nome = id)
  readonly MAIN_VITE_MEDIA_FOLDER_ID?: string
  // ID da Planilha de Analytics (aba `Analytics`, escrita pela service account)
  readonly MAIN_VITE_ANALYTICS_SPREADSHEET_ID?: string
}
