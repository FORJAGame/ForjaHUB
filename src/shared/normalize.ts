/**
 * Regra única de normalização de identificadores capturados no Setup (Estação/Evento)
 */
export function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}
