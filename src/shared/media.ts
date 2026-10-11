/** `qr` não vem do Drive: o `main` gera o PNG a partir do `redesUrl` do Jogo. */
export type MediaTipo = 'capa' | 'hero' | 'logo' | 'qr' | `detalhe-${number}`

/**
 * `versao` (o `sincronizadoEm` do Catálogo) vai na query só para furar o cache de
 * imagem do Chromium depois de um sync; o `main` resolve pelo `pathname`.
 */
export function mediaUrl(id: string, tipo: MediaTipo, versao: string): string {
  return `forja://media/${encodeURIComponent(id)}/${tipo}?v=${encodeURIComponent(versao)}`
}
