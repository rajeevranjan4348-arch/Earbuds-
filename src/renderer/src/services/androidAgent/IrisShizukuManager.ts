/**
 * IRIS — Shizuku Privileged Operations Manager
 * 
 * Provides Shizuku integration for privileged Android operations
 * (ADB shell execution, direct tap/swipe/text input dispatch, package management)
 * with graceful fallback when Shizuku is unavailable or permission is pending.
 */

export interface ShizukuStatus {
  available: boolean
  version?: number
  permissionGranted: boolean
  isRoot?: boolean
  message: string
}

export interface ShizukuExecResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  executionTimeMs: number
}

export class IrisShizukuManager {
  private static instance: IrisShizukuManager
  private status: ShizukuStatus = {
    available: false,
    permissionGranted: false,
    message: 'Shizuku service not initialized'
  }

  private constructor() {
    this.refreshStatus()
  }

  public static getInstance(): IrisShizukuManager {
    if (!IrisShizukuManager.instance) {
      IrisShizukuManager.instance = new IrisShizukuManager()
    }
    return IrisShizukuManager.instance
  }

  /**
   * Refreshes Shizuku availability & permission status from native Android bridge or electron IPC
   */
  public async refreshStatus(): Promise<ShizukuStatus> {
    if (typeof window !== 'undefined') {
      const nativeShizuku = (window as any).AndroidShizuku || (window as any).Shizuku
      if (nativeShizuku) {
        try {
          const isRunning = Boolean(nativeShizuku.isPreV11() || nativeShizuku.checkSelfPermission?.() === 0 || nativeShizuku.pingBinder?.())
          const granted = Boolean(nativeShizuku.checkSelfPermission?.() === 0 || nativeShizuku.hasPermission?.())
          this.status = {
            available: isRunning,
            permissionGranted: granted,
            version: nativeShizuku.getVersion?.() || 13,
            message: granted ? 'Shizuku service online and authorized' : 'Shizuku running, permission pending'
          }
          return this.status
        } catch (e) {
          console.warn('[IrisShizukuManager] Error querying native Shizuku interface:', e)
        }
      }

      // Check Electron IPC fallback
      if ((window as any).electron?.ipcRenderer) {
        try {
          const res = await (window as any).electron.ipcRenderer.invoke('shizuku-check-status')
          if (res) {
            this.status = res
            return this.status
          }
        } catch (e) {
          // IPC not bound or in web mode
        }
      }
    }

    // Default mock/simulation status when running in web preview
    this.status = {
      available: false,
      permissionGranted: false,
      message: 'Shizuku environment unavailable (running in web preview mode). Gracefully using AccessibilityService fallback.'
    }
    return this.status
  }

  public isAvailable(): boolean {
    return this.status.available && this.status.permissionGranted
  }

  public getStatus(): ShizukuStatus {
    return { ...this.status }
  }

  /**
   * Requests Shizuku runtime permission from Android user
   */
  public async requestPermission(): Promise<boolean> {
    if (typeof window !== 'undefined') {
      const nativeShizuku = (window as any).AndroidShizuku || (window as any).Shizuku
      if (nativeShizuku?.requestPermission) {
        try {
          nativeShizuku.requestPermission(1001)
          await new Promise((r) => setTimeout(r, 1000))
          await this.refreshStatus()
          return this.status.permissionGranted
        } catch (e) {
          console.error('[IrisShizukuManager] Failed to request Shizuku permission:', e)
        }
      }
    }
    return false
  }

  /**
   * Executes a privileged shell command via Shizuku ADB service
   */
  public async execAdbCommand(command: string, timeoutMs = 5000): Promise<ShizukuExecResult> {
    const startTime = Date.now()
    const currentStatus = await this.refreshStatus()

    if (!currentStatus.available || !currentStatus.permissionGranted) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: currentStatus.message,
        executionTimeMs: Date.now() - startTime
      }
    }

    if (typeof window !== 'undefined') {
      const nativeShizuku = (window as any).AndroidShizuku || (window as any).Shizuku
      if (nativeShizuku?.exec) {
        try {
          const res = nativeShizuku.exec(command)
          return {
            success: res.exitCode === 0,
            exitCode: res.exitCode ?? 0,
            stdout: res.stdout || '',
            stderr: res.stderr || '',
            executionTimeMs: Date.now() - startTime
          }
        } catch (e: any) {
          return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: e.message || 'Shizuku execution failed',
            executionTimeMs: Date.now() - startTime
          }
        }
      }
    }

    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: 'Shizuku native bridge unavailable',
      executionTimeMs: Date.now() - startTime
    }
  }

  /**
   * Privileged tap gesture via input tap (fast, bypasses accessibility focus rules)
   */
  public async shizukuTap(x: number, y: number): Promise<boolean> {
    const res = await this.execAdbCommand(`input tap ${x} ${y}`)
    return res.success
  }

  /**
   * Privileged swipe gesture via input swipe
   */
  public async shizukuSwipe(x1: number, y1: number, x2: number, y2: number, durationMs = 300): Promise<boolean> {
    const res = await this.execAdbCommand(`input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`)
    return res.success
  }

  /**
   * Privileged text input via input text
   */
  public async shizukuTypeText(text: string): Promise<boolean> {
    // Escape special characters for adb shell input
    const escaped = text.replace(/([\\'":;&<>()$`#*?|[\]{}])/g, '\\$1').replace(/ /g, '%s')
    const res = await this.execAdbCommand(`input text "${escaped}"`)
    return res.success
  }

  /**
   * Privileged key event (e.g., KeyCode 3 = HOME, 4 = BACK, 66 = ENTER, 187 = APP_SWITCH)
   */
  public async shizukuKeyEvent(keyCode: number): Promise<boolean> {
    const res = await this.execAdbCommand(`input keyevent ${keyCode}`)
    return res.success
  }

  /**
   * Force stop an application
   */
  public async shizukuForceStop(packageName: string): Promise<boolean> {
    const res = await this.execAdbCommand(`am force-stop ${packageName}`)
    return res.success
  }
}

export const irisShizukuManager = IrisShizukuManager.getInstance()
