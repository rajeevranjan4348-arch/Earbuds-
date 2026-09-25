/**
 * IRIS IPC Bridge (main process)
 *
 * Registers every channel the renderer invokes. This is the desktop half of the
 * app: the browser build satisfies the same contract through
 * `src/renderer/src/shims/electron-shim.ts`, so identical UI code runs in both.
 *
 * Channel contract
 * ────────────────
 *  window-min / window-max / window-close        (send)
 *  get-system-stats / get-installed-apps / get-drives
 *  open-app / close-app
 *  get-notes / save-note / delete-note
 *  get-gallery / save-gallery-image / clear-gallery
 *  delete-image / open-image-location / save-image-external
 *  adb-get-history / adb-connect / adb-disconnect / adb-telemetry
 *  adb-notifications / adb-screenshot / adb-get-installed-packages
 *  adb-launch-app / launch-android-app / adb-quick-action
 *  accessibility-check-permission / accessibility-dispatch-action
 *  secure-get-keys / secure-save-keys
 *  iris-server-url
 */

import { BrowserWindow, IpcMain, ipcMain } from 'electron'

import * as adb from './lib/adb'
import { closeApp, openApp } from './lib/apps'
import { applyKeysToEnvironment, readKeys, writeKeys } from './lib/keys'
import {
  clearGallery,
  deleteGalleryItem,
  deleteNote,
  exportMediaFile,
  listAdbHistory,
  listGallery,
  listNotes,
  revealInFileManager,
  saveGalleryItem,
  saveNote
} from './lib/store'
import { fetchInstalledApps, fetchStorageDrives, fetchSystemStats } from './lib/system'

import { agentOrchestrator } from './agent/agent-orchestrator'
import { permissionManager } from './agent/permission-manager'

export interface IpcContext {
  /** URL of the embedded IRIS backend (empty when running against Vite). */
  getServerUrl?: () => string | null
}

function handle(main: IpcMain, channel: string, listener: (...args: any[]) => any): void {
  main.removeHandler(channel)
  main.handle(channel, async (_event, ...args: any[]) => {
    try {
      return await listener(...args)
    } catch (error: any) {
      console.error(`[IRIS IPC] ${channel} failed:`, error)
      return { success: false, error: error?.message || 'Native operation failed' }
    }
  })
}

export function registerIpcHandlers(context: IpcContext = {}): void {
  /* ------------------------------------------------------ window controls */
  const sendToWindow = (action: 'minimize' | 'maximize' | 'close') => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else win.close()
  }

  ipcMain.removeAllListeners('window-min')
  ipcMain.removeAllListeners('window-max')
  ipcMain.removeAllListeners('window-close')
  ipcMain.on('window-min', () => sendToWindow('minimize'))
  ipcMain.on('window-max', () => sendToWindow('maximize'))
  ipcMain.on('window-close', () => sendToWindow('close'))

  /* --------------------------------------------------------------- system */
  handle(ipcMain, 'get-system-stats', () => fetchSystemStats())
  handle(ipcMain, 'get-installed-apps', () => fetchInstalledApps())
  handle(ipcMain, 'get-drives', () => fetchStorageDrives())
  handle(ipcMain, 'open-app', (name: string) => openApp(name))
  handle(ipcMain, 'close-app', (name: string) => closeApp(name))

  /* ---------------------------------------------------------------- notes */
  handle(ipcMain, 'get-notes', () => listNotes())
  handle(ipcMain, 'save-note', (payload: any) => saveNote(payload || {}))
  handle(ipcMain, 'delete-note', (filename: string) => deleteNote(filename))

  /* -------------------------------------------------------------- gallery */
  handle(ipcMain, 'get-gallery', () => listGallery())
  handle(ipcMain, 'save-gallery-image', (payload: any) => saveGalleryItem(payload || {}))
  handle(ipcMain, 'clear-gallery', () => clearGallery())
  handle(ipcMain, 'delete-image', (filename: string) => deleteGalleryItem(filename))
  handle(ipcMain, 'open-image-location', (filePath: string) => revealInFileManager(filePath))
  handle(ipcMain, 'save-image-external', (filePath: string) => exportMediaFile(filePath))

  /* ------------------------------------------------------------------ adb */
  handle(ipcMain, 'adb-get-history', () => listAdbHistory())
  handle(ipcMain, 'adb-connect', ({ ip, port }: any = {}) => adb.connectDevice(ip, port || '5555'))
  handle(ipcMain, 'adb-disconnect', () => adb.disconnectDevice())
  handle(ipcMain, 'adb-telemetry', () => adb.getTelemetry())
  handle(ipcMain, 'adb-get-notifications', () => adb.getNotifications())
  handle(ipcMain, 'adb-screenshot', () => adb.captureScreen())
  handle(ipcMain, 'adb-get-installed-packages', () => adb.listPackages())
  handle(ipcMain, 'adb-quick-action', ({ action }: any = {}) => adb.quickAction(action))
  handle(ipcMain, 'adb-launch-app', (payload: any = {}) =>
    adb.launchApp(payload.packageName, payload.activityName)
  )
  handle(ipcMain, 'launch-android-app', (payload: any = {}) =>
    adb.launchApp(payload.packageName, payload.activityName || payload.launchActivity)
  )

  /* -------------------------------------------------------- accessibility */
  handle(ipcMain, 'accessibility-check-permission', () => adb.checkAccessibility())
  handle(ipcMain, 'accessibility-dispatch-action', (payload: any = {}) =>
    adb.dispatchAccessibility(payload.action || payload.type, payload.params || payload)
  )

  /* ------------------------------------------------------------- keyvault */
  handle(ipcMain, 'secure-get-keys', () => readKeys())
  handle(ipcMain, 'secure-save-keys', (keys: any = {}) => {
    const result = writeKeys(keys)
    // Hot-swap credentials for the embedded backend without restarting.
    applyKeysToEnvironment(keys)
    return result
  })

  /* ------------------------------------------------------ runtime context */
  handle(ipcMain, 'iris-server-url', () => ({ url: context.getServerUrl?.() ?? null }))

  /* ------------------------------------------------------ agent & permission */
  handle(ipcMain, 'agent-execute-task', (prompt: string) => agentOrchestrator.executeTask(prompt))
  handle(ipcMain, 'agent-get-trace', (taskId: string) => agentOrchestrator.getTrace(taskId))
  handle(ipcMain, 'agent-get-pending-permissions', () => permissionManager.getPendingApprovals())
  handle(ipcMain, 'agent-permission-decision', ({ taskId, requestId, decision }: any = {}) =>
    agentOrchestrator.resumeWithPermissionDecision(taskId, requestId, decision)
  )
  handle(ipcMain, 'agent-cancel-task', (taskId: string) => agentOrchestrator.cancelTask(taskId))
}
