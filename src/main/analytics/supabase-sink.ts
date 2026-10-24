import type { RegistroAnalytics } from '@shared/types'
import type { AnalyticsSink } from '../ports'
import { resolveSupabaseConfig } from '../config/app-config'
import { createSupabaseClients, type SessaoLinha, type SessoesTable } from '../supabase/client'
import { AnalyticsNaoConfiguradoError } from './types'

export function registroParaLinha(r: RegistroAnalytics): SessaoLinha {
  return {
    id: r.id,
    evento_id: r.eventoId,
    estacao_id: r.estacaoId,
    jogo_id: r.jogoId,
    inicio: r.inicioISO,
    duracao_seg: r.duracaoSeg,
    incompleta: r.incompleta === true
  }
}

export function createSupabaseAnalyticsSink(sessoes: SessoesTable): AnalyticsSink {
  return {
    async flush(registros) {
      if (registros.length === 0) return { idsAceitos: [] }

      // Um id repetido no mesmo lote vira uma linha só (fica o primeiro).
      const porId = new Map<string, RegistroAnalytics>()
      for (const registro of registros) {
        if (!porId.has(registro.id)) porId.set(registro.id, registro)
      }

      // `on conflict do nothing`: um id já gravado (envio anterior que caiu
      // depois de aplicar) também conta como aceito, o spool precisa confirmá-lo.
      await sessoes.inserir([...porId.values()].map(registroParaLinha))
      return { idsAceitos: [...porId.keys()] }
    }
  }
}

export async function criarSinkPadrao(baseDir: string): Promise<AnalyticsSink> {
  const config = await resolveSupabaseConfig(baseDir)
  if (!config) throw new AnalyticsNaoConfiguradoError()
  return createSupabaseAnalyticsSink(createSupabaseClients(config).sessoes)
}
