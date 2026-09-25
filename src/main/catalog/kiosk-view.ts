import type { Catalogo, ConfigEstacao } from '@shared/types'
import type { Store } from '../ports'

export interface KioskView {
  catalogo: Catalogo
  ausentes: string[]
}

/**
 * Filtro AD-11, ordenado por `id`. Puro: quem chama decide o que fazer com os
 * `ausentes` (log) e com uma view vazia (volta ao setup).
 */
export function kioskView(catalogo: Catalogo, jogosSelecionados: string[]): KioskView {
  const selecionados = new Set(jogosSelecionados)
  const jogos = catalogo.jogos
    .filter((jogo) => selecionados.has(jogo.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const existentes = new Set(jogos.map((jogo) => jogo.id))
  const ausentes = [...selecionados].filter((id) => !existentes.has(id))
  return { catalogo: { ...catalogo, jogos }, ausentes }
}

/** View vazia ⇒ `null`. */
export function catalogoDoKiosk(catalogo: Catalogo, jogosSelecionados: string[]): Catalogo | null {
  const view = kioskView(catalogo, jogosSelecionados)
  if (view.ausentes.length > 0) {
    console.warn('[main] Jogos selecionados ausentes do Catálogo:', view.ausentes)
  }
  return view.catalogo.jogos.length > 0 ? view.catalogo : null
}

/** `null` (sem config, config ilegível ou view vazia) ⇒ quem chama não envia o `catalog:updated`. */
export async function kioskCatalogUpdate(
  catalogo: Catalogo,
  lerConfigEstacao: Store['lerConfigEstacao']
): Promise<Catalogo | null> {
  let config: ConfigEstacao | null
  try {
    config = await lerConfigEstacao()
  } catch (err) {
    console.error('[main] falha lendo station.json para o catalog:updated:', err)
    return null
  }
  if (!config) return null
  return catalogoDoKiosk(catalogo, config.jogosSelecionados)
}
