import type { CommandResult, RegistroAnalytics } from '@shared/types'

export type InicioSessao = Pick<RegistroAnalytics, 'jogoId' | 'estacaoId' | 'eventoId' | 'inicioISO'>

/** Arquivos locais em `userData/analytics/`: nada se perde numa queda de energia. */
export interface AnalyticsSpool {
  /** Grava `open-session.json`; uma Sessão ainda aberta é fechada antes como incompleta. Devolve o id. */
  abrirSessao(inicio: InicioSessao): Promise<string>
  /** Reescreve o `vistoEm` da Sessão aberta; sem Sessão, no-op. */
  tocarSessao(vistoEmISO: string): Promise<void>
  /** Append do registro no `spool.jsonl` e apaga o marker. Sem Sessão aberta ⇒ `null`. */
  fecharSessao(fim: { duracaoSeg: number; incompleta?: true }): Promise<RegistroAnalytics | null>
  /** ids(spool) − ids(confirmed), na ordem do spool, sem id repetido. */
  pendentes(): Promise<RegistroAnalytics[]>
  /** Append dos ids aceitos pelo destino em `confirmed.jsonl`. */
  confirmar(ids: string[]): Promise<void>
}

export type FlushResult = CommandResult<{ enviados: number; pendentes: number }>

/** Envio em segundo plano; nunca lança exceção nem bloqueia o Visitante. */
export interface AnalyticsFlusher {
  flushAgora(): Promise<FlushResult>
  agendar(): void
  estado(): { ultimoFlushOk: boolean | null; ultimoFlushEm: string | null }
  parar(): void
}

/** URL ou anon key do Supabase ausentes no build e no `app-config.json`. */
export class AnalyticsNaoConfiguradoError extends Error {
  constructor(motivo = 'Supabase não configurado (URL ou anon key ausente)') {
    super(motivo)
    this.name = 'AnalyticsNaoConfiguradoError'
  }
}
