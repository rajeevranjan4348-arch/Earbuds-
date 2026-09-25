import { BrowserWindow, globalShortcut, ipcMain } from 'electron'

class MainShortcutManager {
  private getWindow: (() => BrowserWindow | null) | null = null

  public init(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow

    ipcMain.handle(
      'iris:register-global-shortcut',
      (_event, accelerator: string, actionId: string) => {
        try {
          if (!accelerator) return false
          const registered = globalShortcut.register(accelerator, () => {
            const win = this.getWindow ? this.getWindow() : null
            if (win && !win.isDestroyed()) {
              win.webContents.send('iris:global-shortcut-triggered', actionId)
            }
          })
          return registered
        } catch (err) {
          console.warn(`[Shortcuts] Failed to register global shortcut ${accelerator}:`, err)
          return false
        }
      }
    )

    ipcMain.handle('iris:unregister-all-global-shortcuts', () => {
      try {
        globalShortcut.unregisterAll()
        return true
      } catch (err) {
        return false
      }
    })
  }
}

export const shortcutManager = new MainShortcutManager()
