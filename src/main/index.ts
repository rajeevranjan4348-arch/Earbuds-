import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  net,
  protocol,
  session,
  shell
} from 'electron'
import { optimizer, is } from '@electron-toolkit/utils'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'

import { registerIpcHandlers } from './ipc'
import { applyKeysToEnvironment } from './lib/keys'
import * as adb from './lib/adb'
import { resolveGalleryFile } from './lib/store'
import { shortcutManager } from './shortcuts'

/**
 * `iris-media://gallery/<file>` streams locally captured optics/media into the
 * renderer. A custom scheme (instead of `file://`) keeps the sandbox happy and
 * works identically in dev (http origin) and packaged (file origin) builds.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'iris-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let localServerUrl: string | null = null

/**
 * In production the renderer is served by the embedded IRIS backend, so the
 * relative `/api/*` calls used across the app resolve exactly as they do in the
 * Vite dev server (which mounts the same API middleware).
 */
async function startEmbeddedServer(): Promise<string | null> {
  if (is.dev) return null

  try {
    const { startIrisServer } = await import('../server/http')
    const root = resolve(__dirname, '../renderer')
    const { url } = await startIrisServer({ root, host: '127.0.0.1', port: 0 })
    localServerUrl = url
    console.log(`[IRIS] Embedded backend online at ${url}`)
    return url
  } catch (error) {
    console.error('[IRIS] Embedded backend failed to start:', error)
    return null
  }
}

function registerMediaProtocol(): void {
  protocol.handle('iris-media', async (request) => {
    try {
      const { pathname } = new URL(request.url)
      const filename = decodeURIComponent(pathname.replace(/^\/+/, ''))
      const filePath = resolveGalleryFile(filename.replace(/^gallery\//, ''))
      if (!filePath) return new Response('Not found', { status: 404 })
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.error('[IRIS] media protocol error:', error)
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (localServerUrl) {
    void mainWindow.loadURL(localServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Give the OS-level APIs (mic, camera, screen capture) a permissive default.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'clipboard-read']
    callback(allowed.includes(permission))
  })

  session.defaultSession.setDisplayMediaRequestHandler((_request: any, callback: any) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources && sources.length > 0) {
          callback({ video: sources[0] })
        } else {
          console.error('[IRIS] No screens found to share.')
          // @ts-ignore - explicitly fail the callback safely
          callback()
        }
      })
      .catch((err) => {
        console.error('[IRIS] Screen capture failed:', err)
        // @ts-ignore
        callback()
      })
  })

  registerMediaProtocol()

  // Vault credentials are injected into the backend environment on boot.
  applyKeysToEnvironment()

  registerIpcHandlers({ getServerUrl: () => localServerUrl })
  ipcMain.on('iris-restart-server', () => {
    void startEmbeddedServer()
  })

  await startEmbeddedServer()
  createWindow()

  // Initialize Global Keyboard Shortcut Manager for OS-level hotkeys
  shortcutManager.init(() => mainWindow)

  // Reconnect to the last paired Android device, if any.
  void adb.autoReconnect()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
