import { z } from 'zod'
import { CONTROLE_PROMPTS, type CommandResult, type ControlePrompts } from '@shared/types'
import { normalizeId } from '@shared/normalize'

const RawSetupSubmit = z.object({
  estacaoId: z.string(),
  eventoId: z.string(),
  jogosSelecionados: z.array(z.string().min(1)),
  controlePrompts: z.enum(CONTROLE_PROMPTS)
})

export interface SetupSubmit {
  estacaoId: string
  eventoId: string
  jogosSelecionados: string[]
  controlePrompts: ControlePrompts
}

export function validateSetupSubmit(input: unknown, rosterIds: string[]): CommandResult<SetupSubmit> {
  const parsed = RawSetupSubmit.safeParse(input)
  if (!parsed.success) return { ok: false, code: 'SETUP_INVALIDO' }

  const estacaoId = normalizeId(parsed.data.estacaoId)
  const eventoId = normalizeId(parsed.data.eventoId)
  if (!estacaoId || !eventoId) return { ok: false, code: 'SETUP_INVALIDO' }

  const jogosSelecionados = [...new Set(parsed.data.jogosSelecionados)]
  if (jogosSelecionados.length < 1) return { ok: false, code: 'SETUP_SEM_JOGO' }

  const validIds = new Set(rosterIds)
  if (!jogosSelecionados.every((id) => validIds.has(id))) {
    return { ok: false, code: 'SETUP_JOGO_DESCONHECIDO' }
  }

  return { ok: true, estacaoId, eventoId, jogosSelecionados, controlePrompts: parsed.data.controlePrompts }
}
