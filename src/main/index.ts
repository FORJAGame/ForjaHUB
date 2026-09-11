import { join } from 'path'
import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '@shared/channels'
import type { CommandResult, Jogo, Mode } from '@shared/types'
import { matchOperatorShortcut, type OperatorShortcut } from './shortcuts'
import { CURRENT_SCHEMA_VERSION, SchemaIncompativelError } from './store/config-estacao'
import { createStore } from './store'
import { ROSTER_STUB } from './store/roster-stub'
import { validateSetupSubmit } from './store/setup-submit'
import type { Store } from './ports'

let mainWindow: BrowserWindow | null = null
let store: Store

function runOperatorShortcut(action: OperatorShortcut): void {
  switch (action) {
    case 'quit':
      app.quit()
      return
    case 'toggle-fullscreen':
      mainWindow?.setFullScreen(!mainWindow.isFullScreen())
      return
    case 'open-operator':
      // Status de tela real só na pós refactor.
      if (mainWindow && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(IPC.OPERATOR_OPEN)
      }
      return
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // Tela em modo KIOSK
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#140d0b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // Foco explícito: sob Wayland um kiosk frameless nem sempre foca ao exibir, e
    // sem foco a janela não recebe `before-input-event` (único caminho de atalho
    // que funciona no meu PC (Hyprland/Linux)).
    mainWindow?.focus()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.on('will-redirect', (event) => event.preventDefault())

  // Fallback dos atalhos do Operador quando a janela do Hub está em foco.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const action = matchOperatorShortcut(input)
    if (!action) return
    event.preventDefault()
    runOperatorShortcut(action)
  })

  // Recuperação mínima para operação não-assistida: renderer morto ⇒ recarrega.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    mainWindow?.webContents.reload()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Registro dos atalhos no nível do SO, respondem mesmo com um Jogo em foco. */
function registerGlobalShortcuts(): void {
  const bind = (accelerator: string, action: OperatorShortcut): void => {
    const ok = globalShortcut.register(accelerator, () => {
      if (mainWindow?.isFocused()) return
      runOperatorShortcut(action)
    })
    if (!ok) console.warn(`[main] globalShortcut indisponível: ${accelerator}`)
  }
  bind('CommandOrControl+Shift+Q', 'quit')
  bind('CommandOrControl+Shift+M', 'toggle-fullscreen')
  bind('CommandOrControl+Shift+O', 'open-operator')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.forja.hub')
    store = createStore()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // #TODO: cache real no lugar de catalog
    ipcMain.handle(IPC.APP_HYDRATE, async (): Promise<CommandResult<{ mode: Mode }>> => {
      try {
        const config = await store.lerConfigEstacao()
        return { ok: true, mode: config ? 'catalog' : 'setup' }
      } catch (err) {
        if (err instanceof SchemaIncompativelError) {
          return { ok: false, code: 'SCHEMA_INCOMPATIVEL', msg: err.message }
        }
        console.error('[main] falha lendo station.json:', err)
        return { ok: false, code: 'STORE_INDISPONIVEL' }
      }
    })

    // #TODO: catalogSource real
    ipcMain.handle(
      IPC.CONFIG_ROSTER,
      (): CommandResult<{ roster: Jogo[] }> => ({ ok: true, roster: ROSTER_STUB })
    )

    ipcMain.handle(IPC.CONFIG_SETUP_SUBMIT, async (_event, input: unknown): Promise<CommandResult> => {
      const validated = validateSetupSubmit(
        input,
        ROSTER_STUB.map((jogo) => jogo.id)
      )
      if (!validated.ok) return validated
      const { estacaoId, eventoId, jogosSelecionados } = validated
      try {
        await store.gravarConfigEstacao({
          estacaoId,
          eventoId,
          jogosSelecionados,
          schemaVersion: CURRENT_SCHEMA_VERSION
        })
      } catch (err) {
        console.error('[main] falha gravando station.json:', err)
        return { ok: false, code: 'STORE_INDISPONIVEL' }
      }
      return { ok: true }
    })

    registerGlobalShortcuts()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
}
