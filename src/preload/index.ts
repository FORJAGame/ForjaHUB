import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type { ForjaAPI } from '@shared/forja-api'

const forjaAPI: ForjaAPI = {
  hydrate: () => ipcRenderer.invoke(IPC.APP_HYDRATE),
  onOperatorOpen: (cb) => {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.OPERATOR_OPEN, handler)
    return () => ipcRenderer.removeListener(IPC.OPERATOR_OPEN, handler)
  },
  configRoster: () => ipcRenderer.invoke(IPC.CONFIG_ROSTER),
  configSetupSubmit: (input) => ipcRenderer.invoke(IPC.CONFIG_SETUP_SUBMIT, input)
}

contextBridge.exposeInMainWorld('forjaAPI', forjaAPI)
