import { join } from 'node:path'
import type { ConfigEstacao } from '@shared/types'
import { createAnalyticsFlusher } from './flusher'
import { createSessionRecorder, type SessionRecorder } from './session-recorder'
import { criarSinkPadrao } from './sheets-sink'
import { createAnalyticsSpool } from './spool'
import type { AnalyticsFlusher, AnalyticsSpool } from './types'

export interface Analytics {
  recorder: SessionRecorder
  flusher: AnalyticsFlusher
}

/**
 * Monta spool → recorder → flusher. Spool inutilizável (ex.: `meta.json` de versão
 * maior) devolve `null`: o Hub segue sem registrar em vez de parar a vitrine.
 */
export async function bootAnalytics(
  baseDir: string,
  lerConfigEstacao: () => Promise<ConfigEstacao | null>
): Promise<Analytics | null> {
  let spool: AnalyticsSpool
  try {
    spool = await createAnalyticsSpool({ dir: join(baseDir, 'analytics') })
  } catch (err) {
    console.error('[analytics] desligado nesta execução, spool indisponível:', err)
    return null
  }

  const flusher = createAnalyticsFlusher({ spool, obterSink: () => criarSinkPadrao(baseDir) })
  const recorder = createSessionRecorder({
    spool,
    lerConfigEstacao,
    aoRegistrar: () => flusher.agendar()
  })
  return { recorder, flusher }
}
