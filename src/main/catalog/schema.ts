import { z } from 'zod'

/**
 * Validação tudo-ou-nada da Planilha de Catálogo + mídia.
 * Uma linha/asset inválido derruba o `z.array`/download inteiro, quem chama
 * descarta o sync completo e mantém o Cache anterior intocado.
 */

export const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const MODALIDADES = ['single-player', 'multiplayer'] as const

/**
 * Sem `..` e sem caminho absoluto, nem POSIX (`/...`),
 * nem Windows (`C:\...`, `C:/...`, `\...`).
 */
function isSafeRelativePath(bruto: string): boolean {
  if (!bruto) return false
  const normalizado = bruto.replace(/\\/g, '/')
  if (normalizado.startsWith('/')) return false
  if (/^[a-zA-Z]:/.test(normalizado)) return false
  const segmentos = normalizado.split('/')
  return segmentos.every((seg) => seg !== '..')
}

function isUrlOuVazio(bruto: string): boolean {
  return bruto === '' || z.string().url().safeParse(bruto).success
}

function idsUnicos<T extends { id: string }>(itens: T[]): boolean {
  return new Set(itens.map((item) => item.id)).size === itens.length
}

const UNICIDADE_MSG = 'ids duplicados entre jogos, cada Jogo precisa de um id único'

export const JogoMetadataSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(KEBAB_CASE_RE, 'id deve ser kebab-case (dono é a Planilha, nunca derivado do título)'),
  titulo: z.string().trim().min(1),
  ano: z.coerce.number().int().min(1970).max(2100),
  guilda: z.string().trim().min(1),
  genero: z.string().trim().min(1),
  modalidade: z.enum(MODALIDADES),
  sinopse: z.string().trim().min(1),
  redesUrl: z.string().trim().refine(isUrlOuVazio, 'redesUrl precisa ser uma URL válida, ou vazio'),
  exeRelativo: z
    .string()
    .trim()
    .refine(isSafeRelativePath, 'exeRelativo inválido (path absoluto ou `..`)')
})

export type JogoMetadata = z.infer<typeof JogoMetadataSchema>

export const JogoMetadataArraySchema = z.array(JogoMetadataSchema).refine(idsUnicos, {
  message: UNICIDADE_MSG
})

export const JogoSchema = JogoMetadataSchema.extend({
  detalheImagens: z.array(z.string()).min(1)
})

export type JogoValidado = z.infer<typeof JogoSchema>

export const JogosSchema = z.array(JogoSchema).refine(idsUnicos, {
  message: UNICIDADE_MSG
})

export const CatalogoSchema = z.object({
  jogos: JogosSchema,
  sincronizadoEm: z.string()
})

export type CatalogoValidado = z.infer<typeof CatalogoSchema>
