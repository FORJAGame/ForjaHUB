import type { Jogo } from '@shared/types'

/**
 * #TODO:`config:roster` retorna até trocar o miolo por `CatalogSource` real
 * (Google Sheets). O contrato IPC e o `setup-form` já
 * são reais; só a fonte do roster é fixture.
 */
export const ROSTER_STUB: Jogo[] = [
  { id: 'Youre-Gonna-Be-Late', ordem: 1 },
  { id: 'Ismalia', ordem: 2 },
  { id: 'Mortis Pactum', ordem: 3 },
  { id: 'Party of Losers', ordem: 4 },
  { id: 'Lost Fields', ordem: 5 }
]
