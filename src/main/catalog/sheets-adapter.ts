import type { JogoMetadata } from './schema'
import { JogoMetadataArraySchema } from './schema'

// Superfície mínima do cliente Sheets que este adaptador precisa, não é o `sheets_v4.Sheets`.
export interface SheetsValuesClient {
  spreadsheets: {
    values: {
      get(params: { spreadsheetId: string; range: string }): Promise<{
        data: { values?: string[][] | null }
      }>
    }
  }
}

export class CatalogoInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'CatalogoInvalidoError'
  }
}

const RANGE = 'A1:Z1000'

const HEADER_MAP: Record<string, keyof JogoMetadata> = {
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

function isLinhaVazia(row: string[]): boolean {
  return row.every((cell) => cell === undefined || cell === '')
}

export function rowsToRawJogos(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const [headerRow, ...dataRows] = rows
  const campos = headerRow.map((h) => HEADER_MAP[h.trim()] ?? null)

  return dataRows
    .filter((row) => !isLinhaVazia(row))
    .map((row) => {
      const obj: Record<string, string> = {}
      campos.forEach((campo, i) => {
        if (campo) obj[campo] = row[i] ?? ''
      })
      return obj
    })
}

// Lê a Planilha e valida: qualquer linha fora do `JogoMetadataSchema`
// lança `CatalogoInvalidoError` e descarta o array inteiro.
// Sem coluna de ordem, a Planilha não define ordem de exibição;
// o Catálogo é sempre ordenado alfabeticamente por `id`.
export async function fetchCatalogo(
  sheets: SheetsValuesClient,
  spreadsheetId: string
): Promise<JogoMetadata[]> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE })
  const rows = (res.data.values ?? []) as string[][]
  const rawJogos = rowsToRawJogos(rows)

  const parsed = JogoMetadataArraySchema.safeParse(rawJogos)
  if (!parsed.success) {
    throw new CatalogoInvalidoError(parsed.error.message)
  }
  return [...parsed.data].sort((a, b) => a.id.localeCompare(b.id))
}
