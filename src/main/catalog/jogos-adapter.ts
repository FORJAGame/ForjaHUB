import type { JogosTable } from '../supabase/client'
import type { JogoMetadata } from './schema'
import { JogoMetadataArraySchema } from './schema'

export class CatalogoInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'CatalogoInvalidoError'
  }
}

// Coluna da tabela `jogos` -> campo do Jogo; colunas fora daqui (ex.: `criado_em`) são ignoradas.
const COLUNAS: Record<string, keyof JogoMetadata> = {
  id: 'id',
  titulo: 'titulo',
  ano: 'ano',
  guilda: 'guilda',
  genero: 'genero',
  modalidade: 'modalidade',
  sinopse: 'sinopse',
  redes_url: 'redesUrl',
  exe_relativo: 'exeRelativo'
}

export function linhaParaRawJogo(linha: unknown): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  if (typeof linha !== 'object' || linha === null) return raw
  for (const [coluna, valor] of Object.entries(linha)) {
    const campo = COLUNAS[coluna]
    if (campo) raw[campo] = valor
  }
  return raw
}

// Lê a tabela `jogos` e valida: qualquer linha fora do `JogoMetadataSchema`
// lança `CatalogoInvalidoError` e descarta o array inteiro.
// Sem coluna de ordem, o Catálogo é sempre ordenado alfabeticamente por `id`.
export async function fetchCatalogo(jogos: JogosTable): Promise<JogoMetadata[]> {
  const linhas = await jogos.listar()
  const parsed = JogoMetadataArraySchema.safeParse(linhas.map(linhaParaRawJogo))
  if (!parsed.success) {
    throw new CatalogoInvalidoError(parsed.error.message)
  }
  return [...parsed.data].sort((a, b) => a.id.localeCompare(b.id))
}
