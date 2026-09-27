/**
 * BackgroundExecutionService
 * 
 * Enables IRIS to run continuously in the background across browsers, PWAs,
 * desktop windows, and mobile devices even when minimized or screen is locked.
 * 
 * Features:
 * - Web Audio Silent Keep-Alive Anchor (Prevents browser tab suspension)
 * - Screen Wake Lock API (Prevents OS CPU sleep)
 * - Page Visibility & Service Worker Sync
 * - Native System Web Notifications
 * - Continuous Background Voice & Wake Word Listener Keep-Alive
 */

export interface BackgroundSettings {
  enabled: boolean
  wakeLock: boolean
  notifications: boolean
  wakeWordInBackground: boolean
  audioKeepAlive: boolean
}

export type BackgroundState = 'running' | 'idle' | 'suspended' | 'disabled'

class BackgroundExecutionService {
  private settings: BackgroundSettings = {
    enabled: true,
    wakeLock: true,
    notifications: true,
    wakeWordInBackground: true,
    audioKeepAlive: true,
  }

  private state: BackgroundState = 'idle'
  private wakeLockSentinel: any = null
  private audioContext: AudioContext | null = null
  private silentOscillator: OscillatorNode | null = null
  private silentGain: GainNode | null = null
  private listeners: Set<(settings: BackgroundSettings, state: BackgroundState) => void> = new Set()
  private notificationPermission: NotificationPermission = 'default'

  constructor() {
    this.loadSettings()
    this.initVisibilityListener()
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.notificationPermission = Notification.permission
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('iris_background_settings')
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) }
      }
    } catch (err) {
      console.warn('[BackgroundExecutionService] Failed to load settings:', err)
    }
  }

  public saveSettings(newSettings: Partial<BackgroundSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    try {
      localStorage.setItem('iris_background_settings', JSON.stringify(this.settings))
    } catch (err) {
      console.error('[BackgroundExecutionService] Failed to save settings:', err)
    }

    if (this.settings.enabled) {
      this.startBackgroundKeepAlive()
    } else {
      this.stopBackgroundKeepAlive()
    }

    this.notifyListeners()
  }

  public getSettings(): BackgroundSettings {
    return { ...this.settings }
  }

  public getState(): BackgroundState {
    return this.state
  }

  public subscribe(cb: (settings: BackgroundSettings, state: BackgroundState) => void): () => void {
    this.listeners.add(cb)
    cb(this.settings, this.state)
    return () => this.listeners.delete(cb)
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb(this.settings, this.state))
  }

  /**
   * Initializes background keep-alive hooks
   */
  public async startBackgroundKeepAlive(): Promise<void> {
    if (!this.settings.enabled) {
      this.state = 'disabled'
      this.notifyListeners()
      return
    }

    try {
      // 1. Enable Silent Audio Keep-Alive Anchor
      if (this.settings.audioKeepAlive) {
        this.enableSilentAudioAnchor()
      }

      // 2. Acquire Screen Wake Lock
      if (this.settings.wakeLock) {
        await this.acquireWakeLock()
      }

      // 3. Request Notification Permission if enabled
      if (this.settings.notifications && this.notificationPermission === 'default') {
        this.requestNotificationPermission()
      }

      this.state = 'running'
      console.log('[BackgroundExecutionService] IRIS Background Service ACTIVE.')
    } catch (err) {
      console.error('[BackgroundExecutionService] Error starting background keep-alive:', err)
      this.state = 'suspended'
    }

    this.notifyListeners()
  }

  public stopBackgroundKeepAlive(): void {
    this.releaseWakeLock()
    this.disableSilentAudioAnchor()
    this.state = 'disabled'
    console.log('[BackgroundExecutionService] IRIS Background Service STOPPED.')
    this.notifyListeners()
  }

  /**
   * Creates an imperceptible silent Web Audio graph to prevent browser tab throttling
   */
  private enableSilentAudioAnchor(): void {
    if (typeof window === 'undefined') return

    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          this.audioContext = new AudioCtx()
        }
      }

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      if (this.audioContext && !this.silentOscillator) {
        this.silentOscillator = this.audioContext.createOscillator()
        this.silentGain = this.audioContext.createGain()

        // Ultra-low frequency, gain set to near zero (0.00001) so it is silent
        this.silentOscillator.type = 'sine'
        this.silentOscillator.frequency.setValueAtTime(15, this.audioContext.currentTime)
        this.silentGain.gain.setValueAtTime(0.00001, this.audioContext.currentTime)

        this.silentOscillator.connect(this.silentGain)
        this.silentGain.connect(this.audioContext.destination)
        this.silentOscillator.start()
        console.log('[BackgroundExecutionService] Silent Audio Anchor started.')
      }
    } catch (err) {
      console.warn('[BackgroundExecutionService] Silent Audio Anchor setup warning:', err)
    }
  }

  private disableSilentAudioAnchor(): void {
    if (this.silentOscillator) {
      try {
        this.silentOscillator.stop()
        this.silentOscillator.disconnect()
      } catch (_) {}
      this.silentOscillator = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect()
      } catch (_) {}
      this.silentGain = null;
    }
  }

  /**
   * Screen Wake Lock API
   */
  private async acquireWakeLock(): Promise<void> {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return

    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen')
      this.wakeLockSentinel.addEventListener('release', () => {
        console.log('[BackgroundExecutionService] Wake Lock released.')
        if (this.settings.enabled && this.settings.wakeLock && !document.hidden) {
          this.acquireWakeLock()
        }
      })
      console.log('[BackgroundExecutionService] Screen Wake Lock acquired.')
    } catch (err) {
      console.warn('[BackgroundExecutionService] Could not acquire Wake Lock:', err)
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLockSentinel) {
      this.wakeLockSentinel.release().catch(() => {})
      this.wakeLockSentinel = null
    }
  }

  /**
   * Page Visibility API listener
   */
  private initVisibilityListener(): void {
    if (typeof document === 'undefined') return

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('[BackgroundExecutionService] Tab hidden -> IRIS running in background.')
        if (this.settings.enabled) {
          this.enableSilentAudioAnchor()
          if (this.settings.notifications && this.notificationPermission === 'granted') {
            // Optional subtle notification when first hidden if user wants confirmation
          }
        }
      } else {
        console.log('[BackgroundExecutionService] Tab focused -> IRIS running in foreground.')
        if (this.settings.enabled && this.settings.wakeLock) {
          this.acquireWakeLock()
        }
      }
    })
  }

  /**
   * Request Web System Notification Permission
   */
  public async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false

    try {
      const permission = await Notification.requestPermission()
      this.notificationPermission = permission
      if (permission === 'granted') {
        console.log('[BackgroundExecutionService] Notifications granted.')
        return true
      }
    } catch (err) {
      console.error('[BackgroundExecutionService] Error requesting notification permission:', err)
    }
    return false
  }

  /**
   * Send Native OS Notification
   */
  public sendNotification(title: string, options?: NotificationOptions): void {
    if (
      this.settings.notifications &&
      this.notificationPermission === 'granted' &&
      typeof window !== 'undefined' &&
      'Notification' in window
    ) {
      try {
        new Notification(title, {
          icon: '/Logo.png',
          badge: '/pwa-192x192.png',
          tag: 'iris-bg-notification',
          ...options,
        })
      } catch (err) {
        console.warn('[BackgroundExecutionService] Notification failed:', err)
      }
    }
  }
}

export const backgroundExecutionService = new BackgroundExecutionService()
