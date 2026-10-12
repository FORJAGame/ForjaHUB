import { readFile } from 'node:fs/promises'
import { join } from 'path'
import { app, BrowserWindow, globalShortcut, ipcMain, protocol } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '@shared/channels'
import type { Catalogo, CommandResult, Jogo, Mode } from '@shared/types'
import { matchOperatorShortcut, type OperatorShortcut } from './shortcuts'
import { bootCatalog } from './catalog/boot'
import { kioskCatalogUpdate } from './catalog/kiosk-view'
import { cleanupOrphanedCacheDirs, mediaDir } from './catalog/cache'
import { parseForjaMediaUrl, resolveMediaAsset } from './catalog/media-protocol'
import { qrResponse } from './catalog/qr'
import {
  findLaunchableJogo,
  handleAppHydrate,
  handleConfigRoster,
  handleConfigSetupSubmit
} from './config/handlers'
import { createGameLauncher } from './launcher'
import { createGameSession, type GameSession } from './launcher/game-session'
import { createRecuo } from './launcher/recuo'
import { resolveGameExe } from './launcher/resolve-exe'
import { createStore } from './store'
import type { Store } from './ports'

// roda no top-level do módulo
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'forja',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: false,
      corsEnabled: false,
      stream: false
    }
  }
])

let mainWindow: BrowserWindow | null = null
let store: Store
/** Fica no módulo porque o `window-all-closed` é registrado fora do `whenReady`. */
let session: GameSession | null = null

let catalogoAtual: CommandResult<{ catalogo: Catalogo }> | null = null
let catalogoInicial: Promise<CommandResult<{ catalogo: Catalogo }>> | null = null

function getCatalogResult(): Promise<CommandResult<{ catalogo: Catalogo }>> {
  if (catalogoAtual) return Promise.resolve(catalogoAtual)
  if (!catalogoInicial) return Promise.resolve({ ok: false, code: 'CATALOGO_INDISPONIVEL' })
  // Um `onSynced` que chegou durante a espera é mais novo que o resultado do boot (ex.: Cache).
  return catalogoInicial.then((result) => catalogoAtual ?? result)
}

function restaurarJanela(): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.reload()
    return
  }
  createWindow()
}

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
  const win = new BrowserWindow({
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
      webviewTag: false,
      // O clique de SFX do foco toca sem gesto: botão de Controle não conta como gesto do usuário.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
    // Foco explícito: sob Wayland um kiosk frameless nem sempre foca ao exibir, e
    // sem foco a janela não recebe `before-input-event` (único caminho de atalho
    // que funciona no meu PC (Hyprland/Linux)).
    win.focus()
  })
  win.on('closed', () => {
    // A janela recriada na volta de um Jogo não pode ser zerada pelo `closed` tardio da anterior.
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('will-redirect', (event) => event.preventDefault())

  // Fallback dos atalhos do Operador quando a janela do Hub está em foco.
  win.webContents.on('before-input-event', (event, input) => {
    const action = matchOperatorShortcut(input)
    if (!action) return
    event.preventDefault()
    runOperatorShortcut(action)
  })

  // Recuperação mínima para operação não-assistida: renderer morto ⇒ recarrega.
  // A janela destruída pelo recuo não volta por aqui: quem a recria é o fim da Sessão.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    win.webContents.reload()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.forja.hub')
    store = createStore()

    // `forja://media/<id>/<tipo>` -> `userData/catalog/current/media/<id>/…`
    // `id`/`tipo` validam contra o enum fechado em `resolveMediaAsset`;
    // `tipo === 'qr'` não é arquivo: sai do gerador de PNG.
    protocol.handle('forja', async (request) => {
      try {
        const parsed = parseForjaMediaUrl(request.url)
        if (!parsed) return new Response(null, { status: 404 })

        if (parsed.tipo === 'qr') return await qrResponse(catalogoAtual?.ok ? catalogoAtual.catalogo : null, parsed.id)

        const resolved = await resolveMediaAsset(mediaDir(app.getPath('userData')), parsed.id, parsed.tipo)
        if (!resolved) return new Response(null, { status: 404 })

        const data = await readFile(resolved.path)
        return new Response(data, { headers: { 'content-type': resolved.contentType } })
      } catch (err) {
        console.error('[main] forja:// handler falhou:', err)
        return new Response(null, { status: 500 })
      }
    })

    const launcher = createGameLauncher()
    const recuo = createRecuo({
      // O Jogo já está na frente: destruir a janela tira o Hub da tela sem matar a Sessão.
      destruirJanela: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
      },
      restaurarJanela
    })
    const sessao = createGameSession({
      launcher,
      acharJogo: (jogoId) =>
        findLaunchableJogo(jogoId, { lerConfigEstacao: () => store.lerConfigEstacao(), getCatalogResult }),
      resolverExe: (jogo) => resolveGameExe(app.getPath('userData'), jogo),
      aoIniciar: () => recuo.recuar(),
      aoEncerrar: () => recuo.voltar()
    })
    session = sessao

    await cleanupOrphanedCacheDirs(app.getPath('userData'))

    catalogoInicial = bootCatalog(app.getPath('userData'), {
      onSynced: async (result) => {
        try {
          catalogoAtual = result
          const view = await kioskCatalogUpdate(result.catalogo, () => store.lerConfigEstacao())
          if (view && mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send(IPC.CATALOG_UPDATED, view)
          }
        } catch (err) {
          console.error('[main] falha enviando catalog:updated:', err)
        }
      }
    })
    catalogoInicial.then((result) => {
      if (!catalogoAtual) catalogoAtual = result
    })

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    ipcMain.handle(
      IPC.APP_HYDRATE,
      (): Promise<
        CommandResult<{ mode: Mode; catalogo: Catalogo | null; focusedGameId: string | null }>
      > =>
        handleAppHydrate({
          lerConfigEstacao: () => store.lerConfigEstacao(),
          getCatalogResult,
          ultimoJogoId: () => sessao.ultimoJogoId()
        })
    )

    ipcMain.handle(IPC.GAME_LAUNCH, (_event, jogoId: unknown): Promise<CommandResult> =>
      typeof jogoId === 'string'
        ? sessao.lancar(jogoId)
        : Promise.resolve({ ok: false, code: 'JOGO_DESCONHECIDO' })
    )

    ipcMain.handle(IPC.CONFIG_ROSTER, (): Promise<CommandResult<{ roster: Jogo[]; sincronizadoEm: string }>> =>
      handleConfigRoster(getCatalogResult)
    )

    ipcMain.handle(IPC.CONFIG_SETUP_SUBMIT, (_event, input: unknown): Promise<CommandResult> =>
      handleConfigSetupSubmit(input, {
        getCatalogResult,
        gravarConfigEstacao: (config) => store.gravarConfigEstacao(config)
      })
    )

    registerGlobalShortcuts()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // Sem a janela o Hub é só o `main`: a Sessão de Jogo continua viva.
    if (session?.emExecucao()) return
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())
}
