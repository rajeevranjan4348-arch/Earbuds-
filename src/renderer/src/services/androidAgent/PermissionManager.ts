/**
 * IRIS — Centralized Android Permission Manager
 * Enforces least-privilege capability gating, explicit user approval,
 * permission status audits, and settings intent deep-linking.
 */

import { PermissionName, PermissionState, DeviceCapabilityMap } from './types'
import { confirmationEngine } from './ConfirmationEngine'

const PERMISSION_CONFIGS: Record<PermissionName, { rationale: string; isSensitive: boolean; settingsIntent: string }> = {
  microphone: {
    rationale: 'Required for real-time speech-to-text, voice activity detection, and vocal interaction.',
    isSensitive: true,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  camera: {
    rationale: 'Required for visual question answering, document OCR scanning, and object recognition.',
    isSensitive: true,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  location: {
    rationale: 'Required for Google Maps places search, real-time route directions, and GPS navigation.',
    isSensitive: true,
    settingsIntent: 'android.settings.LOCATION_SOURCE_SETTINGS'
  },
  notifications: {
    rationale: 'Required for reading incoming alerts, summarizing messages, and dispatching reminders.',
    isSensitive: true,
    settingsIntent: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'
  },
  accessibility: {
    rationale: 'Required for inspecting UI hierarchy, automated assistive tapping, scrolling, and navigation.',
    isSensitive: true,
    settingsIntent: 'android.settings.ACCESSIBILITY_SETTINGS'
  },
  bluetooth: {
    rationale: 'Required for discovering paired earbuds, headsets, and monitoring audio connection state.',
    isSensitive: false,
    settingsIntent: 'android.settings.BLUETOOTH_SETTINGS'
  },
  contacts: {
    rationale: 'Required for searching contact names, phone numbers, and resolving message recipients.',
    isSensitive: true,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  calendar: {
    rationale: 'Required for reading schedule events and creating verified appointments.',
    isSensitive: false,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  files: {
    rationale: 'Required for reading requested documents, analyzing images, and downloading files.',
    isSensitive: true,
    settingsIntent: 'android.settings.STORAGE_SETTINGS'
  },
  media_control: {
    rationale: 'Required for playback control (play, pause, next track, volume adjustment).',
    isSensitive: false,
    settingsIntent: 'android.settings.SOUND_SETTINGS'
  },
  calls: {
    rationale: 'Required for opening the phone dialer and placing user-confirmed phone calls.',
    isSensitive: true,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  messaging: {
    rationale: 'Required for preparing message drafts and dispatching user-confirmed SMS/chat messages.',
    isSensitive: true,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  wifi: {
    rationale: 'Required for inspecting network connectivity and signal state.',
    isSensitive: false,
    settingsIntent: 'android.settings.WIFI_SETTINGS'
  },
  mobile_data: {
    rationale: 'Required for monitoring cellular data state and network carrier info.',
    isSensitive: false,
    settingsIntent: 'android.settings.DATA_ROAMING_SETTINGS'
  },
  battery: {
    rationale: 'Required for inspecting power percentage, charging status, and battery saver.',
    isSensitive: false,
    settingsIntent: 'android.settings.BATTERY_SAVER_SETTINGS'
  },
  alarms: {
    rationale: 'Required for scheduling timer countdowns and system wake alarms.',
    isSensitive: false,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  web_browser: {
    rationale: 'Required for opening web search URLs and deep-links in the default browser.',
    isSensitive: false,
    settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  }
}

class PermissionManager {
  private permissions: Map<PermissionName, PermissionState> = new Map()
  private listeners: Set<(states: Map<PermissionName, PermissionState>) => void> = new Set()

  constructor() {
    this.initDefaultStates()
    this.loadPersistedStates()
  }

  private initDefaultStates() {
    (Object.keys(PERMISSION_CONFIGS) as PermissionName[]).forEach((name) => {
      const config = PERMISSION_CONFIGS[name]
      this.permissions.set(name, {
        name,
        // Sensitive permissions require explicit user prompt / authorization
        status: config.isSensitive ? 'prompt' : 'granted',
        rationale: config.rationale,
        isSensitive: config.isSensitive
      })
    })
  }

  private loadPersistedStates() {
    try {
      const raw = localStorage.getItem('iris_android_permissions_v1')
      if (raw) {
        const parsed = JSON.parse(raw)
        Object.entries(parsed).forEach(([key, val]) => {
          if (this.permissions.has(key as PermissionName)) {
            const current = this.permissions.get(key as PermissionName)!
            this.permissions.set(key as PermissionName, {
              ...current,
              status: val as any
            })
          }
        })
      }
    } catch (_e) {}
  }

  private saveStates() {
    try {
      const obj: Record<string, string> = {}
      this.permissions.forEach((val, key) => {
        obj[key] = val.status
      })
      localStorage.setItem('iris_android_permissions_v1', JSON.stringify(obj))
    } catch (_e) {}
    this.notify()
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(new Map(this.permissions))
      } catch (_e) {}
    })
  }

  public isGranted(permission: PermissionName): boolean {
    const state = this.permissions.get(permission)
    return state?.status === 'granted'
  }

  public checkPermission(permission: PermissionName): PermissionState {
    const state = this.permissions.get(permission)
    if (!state) {
      const config = PERMISSION_CONFIGS[permission] || {
        rationale: 'Required capability',
        isSensitive: false,
        settingsIntent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
      }
      return {
        name: permission,
        status: config.isSensitive ? 'prompt' : 'granted',
        rationale: config.rationale,
        isSensitive: config.isSensitive
      }
    }
    return { ...state }
  }

  /**
   * Requests permission with explicit user authorization
   */
  public async requestPermission(
    permission: PermissionName,
    reason?: string
  ): Promise<{ granted: boolean; status: PermissionState['status']; rationale: string }> {
    const current = this.permissions.get(permission)
    const rationale = reason || current?.rationale || PERMISSION_CONFIGS[permission]?.rationale || 'Permission needed'

    // If already granted by user, return directly
    if (current && current.status === 'granted') {
      return { granted: true, status: 'granted', rationale }
    }

    // Attempt native Android permission request if bridge is available
    if (window.electron?.ipcRenderer) {
      try {
        const res = await window.electron.ipcRenderer.invoke('android-request-permission', {
          permission,
          rationale
        })
        if (res && typeof res.granted === 'boolean') {
          const newStatus: PermissionState['status'] = res.granted ? 'granted' : 'denied'
          this.setPermissionStatus(permission, newStatus)
          return { granted: res.granted, status: newStatus, rationale }
        }
      } catch (_e) {}
    }

    // Explicit User Authorization Gate
    const userApproved = await confirmationEngine.requestApproval({
      action: `Authorize Android ${permission.toUpperCase()} Permission`,
      target: `Capability: ${permission}`,
      reason: rationale,
      consequences: `Allowing this grant enables IRIS to access ${permission} for device automation and real-time operations.`,
      riskLevel: current?.isSensitive ? 'high' : 'medium'
    })

    const newStatus: PermissionState['status'] = userApproved ? 'granted' : 'denied'
    this.setPermissionStatus(permission, newStatus)

    return {
      granted: userApproved,
      status: newStatus,
      rationale
    }
  }

  public setPermissionStatus(permission: PermissionName, status: PermissionState['status']) {
    const current = this.permissions.get(permission)
    if (current) {
      current.status = status
      current.lastRequestedAt = Date.now()
      this.permissions.set(permission, current)
      this.saveStates()
    }
  }

  public getCapabilityMap(): DeviceCapabilityMap {
    const map = {} as DeviceCapabilityMap
    (Object.keys(PERMISSION_CONFIGS) as PermissionName[]).forEach((name) => {
      const state = this.permissions.get(name)
      if (!state) {
        map[name] = 'available'
      } else if (state.status === 'granted') {
        map[name] = 'available'
      } else if (state.status === 'denied' || state.status === 'blocked') {
        map[name] = 'blocked'
      } else {
        map[name] = 'prompt'
      }
    })
    return map
  }

  public async openSettings(permission: PermissionName): Promise<boolean> {
    const config = PERMISSION_CONFIGS[permission]
    const intent = config?.settingsIntent || 'android.settings.APPLICATION_DETAILS_SETTINGS'
    if (window.electron?.ipcRenderer) {
      try {
        await window.electron.ipcRenderer.invoke('adb-run-shell', {
          command: `am start -a ${intent}`
        })
        return true
      } catch (_e) {}
    }
    window.dispatchEvent(
      new CustomEvent('iris:show-toast', {
        detail: { message: `Navigate to Android Settings: ${intent}` }
      })
    )
    return true
  }

  public subscribe(fn: (states: Map<PermissionName, PermissionState>) => void): () => void {
    this.listeners.add(fn)
    fn(new Map(this.permissions))
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const permissionManager = new PermissionManager()
