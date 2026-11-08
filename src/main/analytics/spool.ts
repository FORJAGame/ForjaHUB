import { randomUUID } from 'node:crypto'
import { mkdir, readFile, truncate, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { RegistroAnalytics } from '@shared/types'
import { appendLinesDurable, writeJsonAtomic, writeTextAtomic } from '../store/atomic-write'
import type { AnalyticsSpool, InicioSessao } from './types'

export const ANALYTICS_SCHEMA_VERSION = 1

/** Versão maior que a suportada: nada é escrito nem reescrito. */
export class AnalyticsSchemaIncompativelError extends Error {
  constructor(
    public readonly versao: number,
    public readonly suportado: number
  ) {
    super(`meta.json do analytics na versão ${versao}, suportado até ${suportado}`)
    this.name = 'AnalyticsSchemaIncompativelError'
  }
}

const RegistroSchema = z.object({
  id: z.string().min(1),
  jogoId: z.string().min(1),
  estacaoId: z.string().min(1),
  eventoId: z.string().min(1),
  // Data inválida derrubaria todo lote que a contém no envio: a linha cai aqui.
  inicioISO: z.string().refine((valor) => !Number.isNaN(Date.parse(valor)), 'data inválida'),
  duracaoSeg: z.number().int().min(0),
  incompleta: z.literal(true).optional()
})

const ConfirmadoSchema = z.object({ id: z.string().min(1) })

const MarkerSchema = z.object({
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
  id: z.string().min(1),
  jogoId: z.string().min(1),
  estacaoId: z.string().min(1),
  eventoId: z.string().min(1),
  inicioISO: z.string().min(1),
  vistoEm: z.string().min(1)
})

const MetaSchema = z.object({ schemaVersion: z.number().int() })

type SessaoAberta = { id: string; inicio: InicioSessao; vistoEm: string }

function pendentesUnicos(
  registros: RegistroAnalytics[],
  confirmados: Set<string>
): RegistroAnalytics[] {
  const vistos = new Set<string>()
  const pendentes: RegistroAnalytics[] = []
  for (const registro of registros) {
    if (vistos.has(registro.id) || confirmados.has(registro.id)) continue
    vistos.add(registro.id)
    pendentes.push(registro)
  }
  return pendentes
}

function parseLinha(linha: string): unknown {
  try {
    return JSON.parse(linha)
  } catch {
    return null
  }
}

function ehEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT'
}

/**
 * O registro já foi gravado quando isto roda: falhar aqui não pode virar erro de
 * quem chamou (o analytics inteiro ou o flush pós-Sessão cairia junto).
 */
async function apagarMarker(markerPath: string): Promise<void> {
  await unlink(markerPath).catch((err: unknown) => {
    if (!ehEnoent(err)) console.error('[analytics] open-session.json não apagado:', err)
  })
}

async function garantirMeta(metaPath: string): Promise<void> {
  let raw: string | null = null
  try {
    raw = await readFile(metaPath, 'utf-8')
  } catch (err) {
    if (!ehEnoent(err)) throw err
  }

  if (raw === null) {
    await writeJsonAtomic(metaPath, { schemaVersion: ANALYTICS_SCHEMA_VERSION })
    return
  }

  const meta = MetaSchema.safeParse(parseLinha(raw))
  if (!meta.success) {
    // Arquivo ilegível vale como ausente: o spool não pode parar de gravar por isso.
    console.error('[analytics] meta.json inválido, reescrevendo:', meta.error.message)
    await writeJsonAtomic(metaPath, { schemaVersion: ANALYTICS_SCHEMA_VERSION })
    return
  }

  if (meta.data.schemaVersion > ANALYTICS_SCHEMA_VERSION) {
    throw new AnalyticsSchemaIncompativelError(meta.data.schemaVersion, ANALYTICS_SCHEMA_VERSION)
  }
}

/**
 * Lê as linhas completas. Uma linha final sem `\n` foi cortada por uma queda no
 * meio do append: é truncada do disco antes de qualquer escrita nova, senão o
 * próximo append colaria naquela linha.
 */
async function lerLinhas(filePath: string, rotulo: string): Promise<string[]> {
  let conteudo: Buffer
  try {
    conteudo = await readFile(filePath)
  } catch (err) {
    if (ehEnoent(err)) return []
    throw err
  }

  if (conteudo.length > 0 && conteudo[conteudo.length - 1] !== 0x0a) {
    const corte = conteudo.lastIndexOf(0x0a) + 1 // sem nenhum `\n`, corta tudo
    await truncate(filePath, corte)
    console.error(
      `[analytics] ${rotulo}: linha final incompleta, ${conteudo.length - corte} bytes descartados`
    )
    conteudo = conteudo.subarray(0, corte)
  }

  return conteudo
    .toString('utf-8')
    .split('\n')
    .filter((linha) => linha !== '')
}

async function lerRegistros(filePath: string): Promise<RegistroAnalytics[]> {
  const registros: RegistroAnalytics[] = []
  for (const linha of await lerLinhas(filePath, 'spool.jsonl')) {
    const registro = RegistroSchema.safeParse(parseLinha(linha))
    if (!registro.success) {
      console.error('[analytics] spool.jsonl: linha inválida ignorada:', registro.error.message)
      continue
    }
    registros.push(registro.data)
  }
  return registros
}

async function lerConfirmados(filePath: string): Promise<string[]> {
  const ids: string[] = []
  for (const linha of await lerLinhas(filePath, 'confirmed.jsonl')) {
    const confirmado = ConfirmadoSchema.safeParse(parseLinha(linha))
    if (!confirmado.success) {
      console.error(
        '[analytics] confirmed.jsonl: linha inválida ignorada:',
        confirmado.error.message
      )
      continue
    }
    ids.push(confirmado.data.id)
  }
  return ids
}

/** Marker válido vira registro incompleto; inválido é descartado e apagado. */
async function recuperarSessao(markerPath: string): Promise<RegistroAnalytics | null> {
  let raw: string
  try {
    raw = await readFile(markerPath, 'utf-8')
  } catch (err) {
    if (ehEnoent(err)) return null
    throw err
  }

  const marker = MarkerSchema.safeParse(parseLinha(raw))
  const inicioMs = marker.success ? Date.parse(marker.data.inicioISO) : NaN
  const vistoMs = marker.success ? Date.parse(marker.data.vistoEm) : NaN
  if (!marker.success || Number.isNaN(inicioMs) || Number.isNaN(vistoMs)) {
    console.error('[analytics] open-session.json inválido, descartado')
    await unlink(markerPath).catch(() => {})
    return null
  }

  return {
    id: marker.data.id,
    jogoId: marker.data.jogoId,
    estacaoId: marker.data.estacaoId,
    eventoId: marker.data.eventoId,
    inicioISO: marker.data.inicioISO,
    duracaoSeg: Math.max(0, Math.round((vistoMs - inicioMs) / 1000)),
    incompleta: true
  }
}

export async function createAnalyticsSpool(deps: {
  dir: string
  gerarId?: () => string
  limiteCompactacao?: number
}): Promise<AnalyticsSpool> {
  const dir = deps.dir
  const gerarId = deps.gerarId ?? ((): string => randomUUID())
  const limiteCompactacao = deps.limiteCompactacao ?? 5000
  const spoolPath = join(dir, 'spool.jsonl')
  const confirmedPath = join(dir, 'confirmed.jsonl')
  const markerPath = join(dir, 'open-session.json')
  const metaPath = join(dir, 'meta.json')

  await mkdir(dir, { recursive: true })
  await garantirMeta(metaPath)

  let registros = await lerRegistros(spoolPath)
  const confirmados = new Set(await lerConfirmados(confirmedPath))
  let aberta: SessaoAberta | null = null

  const recuperado = await recuperarSessao(markerPath)
  if (recuperado) {
    // Append antes de apagar o marker: se o append falhar, o próximo boot recupera.
    await appendLinesDurable(spoolPath, [JSON.stringify(recuperado)])
    registros.push(recuperado)
    await apagarMarker(markerPath)
  }

  if (registros.filter((registro) => confirmados.has(registro.id)).length > limiteCompactacao) {
    const pendentes = pendentesUnicos(registros, confirmados)
    // Spool primeiro: um crash entre as duas reescritas só deixa ids confirmed sem registro.
    await writeTextAtomic(
      spoolPath,
      pendentes.map((registro) => JSON.stringify(registro) + '\n').join('')
    )
    await writeTextAtomic(confirmedPath, '')
    registros = pendentes
    confirmados.clear()
  }

  // Uma cadeia de promessas serializa todo acesso aos arquivos; uma falha rejeita
  // só a chamada dela e a fila segue.
  let fila: Promise<void> = Promise.resolve()
  function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const resultado = fila.then(tarefa, tarefa)
    fila = resultado.then(
      () => {},
      () => {}
    )
    return resultado
  }

  async function gravarMarker(sessao: SessaoAberta): Promise<void> {
    await writeJsonAtomic(markerPath, {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      id: sessao.id,
      ...sessao.inicio,
      vistoEm: sessao.vistoEm
    })
  }

  async function fecharAberta(fim: {
    duracaoSeg: number
    incompleta?: true
  }): Promise<RegistroAnalytics | null> {
    if (!aberta) return null

    const registro: RegistroAnalytics = {
      id: aberta.id,
      ...aberta.inicio,
      duracaoSeg: Number.isFinite(fim.duracaoSeg) ? Math.max(0, Math.round(fim.duracaoSeg)) : 0,
      ...(fim.incompleta ? { incompleta: true as const } : {})
    }

    await appendLinesDurable(spoolPath, [JSON.stringify(registro)])
    registros.push(registro)
    // Limpa a memória antes do unlink: o registro já está no disco, então um novo
    // `fecharSessao` não pode duplicar o append. Um marker que sobrar volta no
    // boot com o mesmo id e é deduplicado pelos pendentes.
    aberta = null
    await apagarMarker(markerPath)
    return registro
  }

  return {
    abrirSessao: (inicio) =>
      enfileirar(async () => {
        if (aberta) {
          const diff = Date.parse(aberta.vistoEm) - Date.parse(aberta.inicio.inicioISO)
          await fecharAberta({
            duracaoSeg: Number.isFinite(diff) ? Math.max(0, Math.round(diff / 1000)) : 0,
            incompleta: true
          })
        }
        const sessao: SessaoAberta = {
          id: gerarId(),
          inicio: { ...inicio },
          vistoEm: inicio.inicioISO
        }
        await gravarMarker(sessao)
        aberta = sessao
        return sessao.id
      }),

    tocarSessao: (vistoEmISO) =>
      enfileirar(async () => {
        if (!aberta) return
        const sessao: SessaoAberta = { ...aberta, vistoEm: vistoEmISO }
        await gravarMarker(sessao)
        aberta = sessao
      }),

    fecharSessao: (fim) => enfileirar(() => fecharAberta(fim)),

    pendentes: () => enfileirar(async () => pendentesUnicos(registros, confirmados)),

    confirmar: (ids) =>
      enfileirar(async () => {
        const novos = [...new Set(ids)].filter((id) => !confirmados.has(id))
        if (novos.length === 0) return
        await appendLinesDurable(
          confirmedPath,
          novos.map((id) => JSON.stringify({ id }))
        )
        // Só depois do append aceito: memória adiantada esconderia um retry devido.
        for (const id of novos) confirmados.add(id)
      })
  }
}
