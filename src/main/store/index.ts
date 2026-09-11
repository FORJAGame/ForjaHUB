import { join } from 'node:path'
import { app } from 'electron'
import type { ConfigEstacao } from '@shared/types'
import type { Store } from '../ports'
import { readConfigEstacao, writeConfigEstacao } from './config-estacao'

export function createStore(deps: { baseDir?: string } = {}): Store {
  const baseDir = deps.baseDir ?? app.getPath('userData') //deps.baseDir só existe para testes
  const stationPath = join(baseDir, 'station.json')

  return {
    lerConfigEstacao(): Promise<ConfigEstacao | null> {
      return readConfigEstacao(stationPath)
    },
    gravarConfigEstacao(config: ConfigEstacao): Promise<void> {
      return writeConfigEstacao(stationPath, config)
    }
  }
}
