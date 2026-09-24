import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { firebaseAuthService } from './firebaseAuth'

export interface OSWorkspaceConfig {
  activeTab: string
  activeWorkspaceService: string
  activeModules: string[]
  themeMode: 'system' | 'dark' | 'light'
  accentColor: string
  telemetryTimeRange: 'live' | '1m' | '5m' | '15m' | '1h' | '24h'
  isMinimalHud: boolean
  isGpuBoosted: boolean
  visionMode: 'off' | 'camera' | 'screen'
  lastActiveTimestamp: number
  pinnedServices: string[]
  customNotesFilter?: string
}

const LOCAL_STORAGE_KEY = 'iris_os_workspace_config_v2'

export const DEFAULT_WORKSPACE_CONFIG: OSWorkspaceConfig = {
  activeTab: 'DASHBOARD',
  activeWorkspaceService: 'DRIVE',
  activeModules: ['telemetry', 'location', 'voice', 'optics', 'system_stats'],
  themeMode: 'system',
  accentColor: '#00ff41',
  telemetryTimeRange: 'live',
  isMinimalHud: false,
  isGpuBoosted: true,
  visionMode: 'off',
  lastActiveTimestamp: Date.now(),
  pinnedServices: ['drive', 'docs', 'sheets', 'mail', 'calendar'],
  customNotesFilter: 'all'
}

class WorkspacePersistenceService {
  private cachedConfig: OSWorkspaceConfig = DEFAULT_WORKSPACE_CONFIG
  private listeners: Set<(config: OSWorkspaceConfig) => void> = new Set()
  private unsubscribeFirestore: (() => void) | null = null
  private isInitialized = false

  constructor() {
    this.loadFromLocalStorage()
  }

  private loadFromLocalStorage(): OSWorkspaceConfig {
    if (typeof window === 'undefined') return DEFAULT_WORKSPACE_CONFIG
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        this.cachedConfig = { ...DEFAULT_WORKSPACE_CONFIG, ...parsed }
        return this.cachedConfig
      }
    } catch (_e) {
      // LocalStorage access fallback
    }
    return DEFAULT_WORKSPACE_CONFIG
  }

  private saveToLocalStorage(config: OSWorkspaceConfig): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config))
    } catch (_e) {}
  }

  public getConfig(): OSWorkspaceConfig {
    return this.cachedConfig
  }

  /**
   * Initialize Firestore synchronization for authenticated user
   */
  public initSync(userId?: string): () => void {
    const uid = userId || firebaseAuthService.getUserId()
    if (!uid) {
      // Offline / guest mode using local cache
      return () => {}
    }

    if (this.unsubscribeFirestore) {
      this.unsubscribeFirestore()
    }

    try {
      const docRef = doc(firestore, 'users', uid, 'workspaceConfig', 'current')
      
      // Real-time synchronization across devices & tabs
      this.unsubscribeFirestore = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<OSWorkspaceConfig>
            
            // Check if any value actually changed before updating cachedConfig and notifying listeners
            let changed = false
            const merged: OSWorkspaceConfig = { ...this.cachedConfig }
            for (const key of Object.keys(data) as (keyof OSWorkspaceConfig)[]) {
              if (key === 'lastActiveTimestamp') continue
              if (JSON.stringify(merged[key]) !== JSON.stringify(data[key])) {
                (merged as any)[key] = data[key]
                changed = true
              }
            }

            if (changed) {
              merged.lastActiveTimestamp = Date.now()
              this.cachedConfig = merged
              this.saveToLocalStorage(merged)
              this.notifyListeners(merged)
            }
          } else {
            // First time seeding current configuration to Firestore
            this.saveConfigToFirestore(this.cachedConfig, uid).catch(() => {})
          }
        },
        (_err) => {
          // Fallback gracefully to offline cache
        }
      )
    } catch (_e) {}

    this.isInitialized = true
    return () => {
      if (this.unsubscribeFirestore) {
        this.unsubscribeFirestore()
        this.unsubscribeFirestore = null
      }
    }
  }

  /**
   * Save and persist updated OS Workspace configuration
   */
  public async saveConfig(updates: Partial<OSWorkspaceConfig>, userId?: string): Promise<OSWorkspaceConfig> {
    // Check if anything actually changed before notifying and saving
    let hasChanges = false
    const updated: OSWorkspaceConfig = { ...this.cachedConfig }

    for (const key of Object.keys(updates) as (keyof OSWorkspaceConfig)[]) {
      if (key === 'lastActiveTimestamp') continue
      if (JSON.stringify(updated[key]) !== JSON.stringify(updates[key])) {
        (updated as any)[key] = updates[key]
        hasChanges = true
      }
    }

    if (!hasChanges) {
      return this.cachedConfig
    }

    updated.lastActiveTimestamp = Date.now()
    this.cachedConfig = updated
    this.saveToLocalStorage(updated)
    this.notifyListeners(updated)

    const uid = userId || firebaseAuthService.getUserId()
    if (uid) {
      await this.saveConfigToFirestore(updated, uid)
    }

    return updated
  }

  private async saveConfigToFirestore(config: OSWorkspaceConfig, uid: string): Promise<void> {
    try {
      const docRef = doc(firestore, 'users', uid, 'workspaceConfig', 'current')
      await setDoc(
        docRef,
        {
          ...config,
          updatedAt: serverTimestamp(),
          syncedAt: Date.now()
        },
        { merge: true }
      )
    } catch (_e) {
      // Queued in Firestore persistent cache automatically
    }
  }

  /**
   * Subscribe to real-time configuration changes
   */
  public subscribe(listener: (config: OSWorkspaceConfig) => void): () => void {
    this.listeners.add(listener)
    listener(this.cachedConfig)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(config: OSWorkspaceConfig): void {
    this.listeners.forEach((listener) => {
      try {
        listener(config)
      } catch (_e) {}
    })
  }

  public async resetConfig(userId?: string): Promise<OSWorkspaceConfig> {
    return this.saveConfig(DEFAULT_WORKSPACE_CONFIG, userId)
  }
}

export const workspacePersistenceService = new WorkspacePersistenceService()
