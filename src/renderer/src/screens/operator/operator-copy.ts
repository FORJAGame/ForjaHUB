import type { OperatorStatus, SyncResumo } from '@shared/types'

/** Copy do Operador para um `code` de falha; código fora da tabela ⇒ `Falha inesperada (${code}). Veja o log.` */
export function codeCopy(code: string): string {
  const copy = CODE_COPY[code]
  return copy ?? `Falha inesperada (${code}). Veja o log.`
}

const CODE_COPY: Record<string, string> = {
  CATALOGO_INDISPONIVEL: 'Sem rede. Catálogo mantido do cache local.',
  CATALOGO_INVALIDO: 'Catálogo com erro. Mantido o catálogo anterior; falha registrada no log.',
  MIDIA_INDISPONIVEL: 'Mídia incompleta no catálogo. Mantido o catálogo anterior.',
  CATALOGO_NAO_CONFIGURADO: 'Catálogo não configurado nesta Estação.',
  ANALYTICS_NAO_CONFIGURADO: 'Envio de sessões não configurado nesta Estação.',
  ANALYTICS_INDISPONIVEL: 'Sem rede. Sessões guardadas para o próximo envio.',
  STORE_INDISPONIVEL: 'Não foi possível salvar agora. Tente de novo.',
  LOG_INDISPONIVEL: 'Não foi possível ler o log agora.',
  STATUS_FALHOU: 'Não foi possível ler o estado da Estação.'
}

/** `null` ⇒ 'Nenhuma sincronização nesta execução.'; ok ⇒ 'Catálogo atualizado.'; falha ⇒ codeCopy. */
export function syncCopy(resumo: SyncResumo | null): string {
  if (!resumo) return 'Nenhuma sincronização nesta execução.'
  if (resumo.ok) return 'Catálogo atualizado.'
  return codeCopy(resumo.code ?? 'CATALOGO_INDISPONIVEL')
}

/** `null` ⇒ 'Registro de sessões desligado nesta execução.' */
export function analyticsCopy(analytics: OperatorStatus['analytics']): string {
  if (!analytics) return 'Registro de sessões desligado nesta execução.'
  const pendentes = `${analytics.pendentes} sessão(ões) aguardando envio.`
  if (analytics.ultimoFlushOk === null) return `${pendentes} Nenhum envio nesta execução.`
  if (analytics.ultimoFlushOk) return `${pendentes} Último envio: ok.`
  return `${pendentes} ${codeCopy(analytics.ultimoFlushCode ?? 'ANALYTICS_INDISPONIVEL')}`
}

const DIA_MS = 86_400_000

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'hoje, 08:14' · 'ontem, 22:10' · '08/11, 14:02' (hora local, 24 h); ISO inválido ⇒ '—'. */
export function formatarQuando(iso: string, agora: Date): string {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return '—'

  const hora = `${doisDigitos(quando.getHours())}:${doisDigitos(quando.getMinutes())}`
  // Compara dias do calendário local; `Date.UTC` evita o atalho errado nos dias de 23/25 h.
  const diaQuando = Date.UTC(quando.getFullYear(), quando.getMonth(), quando.getDate())
  const diaAgora = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const diferenca = Math.round((diaAgora - diaQuando) / DIA_MS)

  if (diferenca === 0) return `hoje, ${hora}`
  if (diferenca === 1) return `ontem, ${hora}`
  if (diferenca === -1) return `amanhã, ${hora}`
  return `${doisDigitos(quando.getDate())}/${doisDigitos(quando.getMonth() + 1)}, ${hora}`
}
