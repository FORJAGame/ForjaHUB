/**
 * Mapa único de canais IPC — importado por `main` e `preload`.
 * `WINDOW_*`, `SYNC_*`, `GAME_STATUS` e `CONTROLLER_STATUS` ainda não têm handler:
 * entram como constante para fixar o contrato.
 */
export const IPC = {
  // Comandos renderer → main (ipcRenderer.invoke / ipcMain.handle)
  APP_HYDRATE: 'app:hydrate',
  CONFIG_ROSTER: 'config:roster',
  CONFIG_SETUP_SUBMIT: 'config:setup-submit',
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  WINDOW_QUIT: 'window:quit',
  GAME_LAUNCH: 'game:launch',
  OPERATOR_STATUS: 'operator:status',
  OPERATOR_FORCE_SYNC: 'operator:force-sync',
  OPERATOR_SET_SFX_MUDO: 'operator:set-sfx-mudo',
  OPERATOR_LOG_TAIL: 'operator:log-tail',

  // Eventos main → renderer (webContents.send)
  CATALOG_UPDATED: 'catalog:updated',
  SYNC_RESULT: 'sync:result',
  SYNC_BUILD_STATUS: 'sync:build-status',
  GAME_STATUS: 'game:status',
  CONTROLLER_STATUS: 'controller:status',
  OPERATOR_OPEN: 'operator:open'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
