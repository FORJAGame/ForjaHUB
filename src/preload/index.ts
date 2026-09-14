import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type { ForjaAPI } from '@shared/forja-api'
import type { Catalogo } from '@shared/types'

const forjaAPI: ForjaAPI = {
  hydrate: () => ipcRenderer.invoke(IPC.APP_HYDRATE),
  onOperatorOpen: (cb) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.OPERATOR_OPEN, handler)
    return () => ipcRenderer.removeListener(IPC.OPERATOR_OPEN, handler)
  },
  configRoster: () => ipcRenderer.invoke(IPC.CONFIG_ROSTER),
  configSetupSubmit: (input) => ipcRenderer.invoke(IPC.CONFIG_SETUP_SUBMIT, input),
  onCatalogUpdated: (cb) => {
    const handler = (_event: unknown, catalogo: Catalogo): void => cb(catalogo)
    ipcRenderer.on(IPC.CATALOG_UPDATED, handler)
    return () => ipcRenderer.removeListener(IPC.CATALOG_UPDATED, handler)
  }
}

contextBridge.exposeInMainWorld('forjaAPI', forjaAPI)
