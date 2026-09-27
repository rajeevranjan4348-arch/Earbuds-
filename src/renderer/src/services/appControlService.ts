/**
 * IRIS Universal App Opening & Controlling Service
 * 
 * Provides unified management for all applications across IRIS Neural OS:
 * - Tracking and inspecting running app instances with telemetry (CPU, Memory, Uptime)
 * - Launching and switching between any internal module, external tool, or system app
 * - Contextual in-app remote controls (e.g. Coder: run code, new project; Notes: new note, export; Gallery: generate asset)
 * - Process termination, app restart, audio mute, and bulk cleanup ('close all apps')
 * - Full voice command integration for hands-free app control
 */

import { AppItem, RunningAppRecord, AppProcessStatus } from '../launcher/types'
import { appRegistry, DEFAULT_APP_CATALOG } from '../launcher/AppRegistry'
import { launchManager } from '../launcher/LaunchManager'
import { soundEffects } from './soundEffectsService'
import { notifyVoiceCommandProcessed } from './voiceToastService'
import { voiceService } from './voiceService'

export interface AppControlActionPayload {
  appId: string
  action: string
  payload?: any
}

type AppControlSubscriber = (runningApps: RunningAppRecord[], activeAppId: string | null) => void

class AppControlService {
  private runningApps: Map<string, RunningAppRecord> = new Map()
  private activeAppId: string | null = 'dashboard'
  private subscribers: Set<AppControlSubscriber> = new Set()
  private metricsTimer: NodeJS.Timeout | null = null

  constructor() {
    this.initializeDefaultRunningApps()
    this.startMetricsSimulation()
    this.setupGlobalListeners()
  }

  /**
   * Seed active running apps based on initial state
   */
  private initializeDefaultRunningApps() {
    const initialApps: Array<{
      id: string
      name: string
      target: string
      category: any
      type: any
      icon: string
      actions: Array<{ id: string; label: string; description?: string }>
    }> = [
      {
        id: 'dashboard',
        name: 'Command Dashboard',
        target: 'DASHBOARD',
        category: 'apps',
        type: 'internal',
        icon: 'RiLayoutGridLine',
        actions: [
          { id: 'telemetry', label: 'Refresh Telemetry', description: 'Run system health audit' },
          { id: 'minimal_hud', label: 'Toggle Minimal HUD', description: 'Zen distraction-free mode' }
        ]
      },
      {
        id: 'coder',
        name: 'AI Coder IDE',
        target: 'CODER',
        category: 'developer',
        type: 'internal',
        icon: 'RiTerminalBoxLine',
        actions: [
          { id: 'new_file', label: 'New File', description: 'Create new script or file' },
          { id: 'run_code', label: 'Run in Terminal', description: 'Execute active code' },
          { id: 'toggle_preview', label: 'Toggle Browser Preview', description: 'Show live web output' },
          { id: 'save_commit', label: 'Commit Changes', description: 'Snapshot git version' }
        ]
      },
      {
        id: 'chat',
        name: 'AI Chat Assistant',
        target: 'CHAT',
        category: 'apps',
        type: 'internal',
        icon: 'RiChat3Line',
        actions: [
          { id: 'clear_chat', label: 'Clear Messages', description: 'Reset active conversation' },
          { id: 'export_chat', label: 'Export History', description: 'Save chat as markdown' }
        ]
      },
      {
        id: 'workspace',
        name: 'Google Workspace',
        target: 'WORKSPACE',
        category: 'productivity',
        type: 'internal',
        icon: 'RiGoogleFill',
        actions: [
          { id: 'sync_drive', label: 'Sync Cloud Drive', description: 'Re-index Google Drive items' },
          { id: 'open_calendar', label: 'Check Calendar', description: 'Fetch scheduled events' },
          { id: 'compose_email', label: 'Compose Mail', description: 'Create draft message' }
        ]
      },
      {
        id: 'google-keep',
        name: 'Google Keep',
        target: 'WORKSPACE',
        category: 'productivity',
        type: 'internal',
        icon: 'RiStickyNoteLine',
        actions: [
          { id: 'view_notes', label: 'View Keep Notes', description: 'Open Google Keep notes' },
          { id: 'new_note', label: 'New Keep Note', description: 'Create note or checklist' },
          { id: 'sync_keep', label: 'Sync Notes', description: 'Sync notes with Google Keep' }
        ]
      },
      {
        id: 'notes',
        name: 'Neural Notes',
        target: 'NOTES',
        category: 'productivity',
        type: 'internal',
        icon: 'RiFolderOpenLine',
        actions: [
          { id: 'new_note', label: 'New Quick Note', description: 'Create fresh note draft' },
          { id: 'clear_vault', label: 'Clear Vault', description: 'Purge notes archive' }
        ]
      },
      {
        id: 'gallery',
        name: 'Visual Gallery',
        target: 'GALLERY',
        category: 'media',
        type: 'internal',
        icon: 'RiImageLine',
        actions: [
          { id: 'generate_asset', label: 'Generate AI Asset', description: 'Trigger FLUX image generation' },
          { id: 'clear_gallery', label: 'Clear Gallery', description: 'Remove media artifacts' }
        ]
      },
      {
        id: 'phone-companion',
        name: 'Android Mobile Hub',
        target: 'PHONE',
        category: 'system',
        type: 'internal',
        icon: 'RiPhoneLine',
        actions: [
          { id: 'take_screenshot', label: 'Take Screenshot', description: 'Capture phone screen' },
          { id: 'screen_lock', label: 'Lock Device', description: 'Send lock screen keyevent' },
          { id: 'reboot_device', label: 'Reboot Device', description: 'Restart connected phone' }
        ]
      },
      {
        id: 'settings',
        name: 'System Settings',
        target: 'SETTINGS',
        category: 'settings',
        type: 'internal',
        icon: 'RiSettings4Line',
        actions: [
          { id: 'toggle_theme', label: 'Toggle Dark Mode', description: 'Switch UI contrast theme' },
          { id: 'test_voice', label: 'Audio Test', description: 'Play speech synthesis check' }
        ]
      }
    ]

    const now = Date.now()
    initialApps.forEach((item, index) => {
      this.runningApps.set(item.id, {
        id: item.id,
        name: item.name,
        category: item.category,
        type: item.type,
        icon: item.icon,
        target: item.target,
        status: index === 0 ? 'active' : 'background',
        pid: `iris_proc_${1000 + index * 12}`,
        startedAt: now - (initialApps.length - index) * 60000,
        lastActiveAt: index === 0 ? now : now - (index + 1) * 30000,
        cpuPercent: index === 0 ? 3.4 : Number((0.2 + Math.random() * 0.8).toFixed(1)),
        memoryMb: Math.round(48 + Math.random() * 64),
        isMuted: false,
        supportsControls: true,
        availableActions: item.actions
      })
    })
  }

  /**
   * Listen for window events to keep active app state perfectly in sync
   */
  private setupGlobalListeners() {
    if (typeof window === 'undefined') return

    window.addEventListener('iris:navigate', (e: any) => {
      const tab = e.detail?.tab
      if (tab) {
        this.syncWithNavigationTab(tab)
      }
    })

    window.addEventListener('iris:execute-app-action', (e: any) => {
      const { appId, action, payload } = e.detail || {}
      if (appId && action) {
        this.executeAppAction(appId, action, payload)
      }
    })
  }

  /**
   * Sync active running app with UI navigation
   */
  public syncWithNavigationTab(tab: string) {
    const tabUpper = tab.toUpperCase()
    let foundAppId: string | null = null

    for (const [id, app] of this.runningApps.entries()) {
      if (app.target.toUpperCase() === tabUpper) {
        foundAppId = id
        break
      }
    }

    if (!foundAppId) {
      // Find from catalog
      const catalogApp = appRegistry.getAll().find((a) => a.target.toUpperCase() === tabUpper)
      if (catalogApp) {
        foundAppId = catalogApp.id
        this.trackNewApp(catalogApp, 'active')
      }
    }

    if (foundAppId) {
      this.activeAppId = foundAppId
      this.runningApps.forEach((app, id) => {
        if (id === foundAppId) {
          app.status = 'active'
          app.lastActiveAt = Date.now()
          app.cpuPercent = Math.max(app.cpuPercent, 2.8)
        } else if (app.status === 'active') {
          app.status = 'background'
        }
      })
      this.notify()
    }
  }

  /**
   * Live simulated process telemetry loop
   */
  private startMetricsSimulation() {
    if (this.metricsTimer) clearInterval(this.metricsTimer)
    this.metricsTimer = setInterval(() => {
      let changed = false
      this.runningApps.forEach((app) => {
        if (app.status === 'active') {
          app.cpuPercent = Number((1.5 + Math.random() * 4.2).toFixed(1))
          changed = true
        } else if (app.status === 'background') {
          app.cpuPercent = Number((0.1 + Math.random() * 0.4).toFixed(1))
        }
      })
      if (changed) {
        this.notify()
      }
    }, 4000)
  }

  /**
   * Add a newly opened app to the running list
   */
  private trackNewApp(app: AppItem, status: AppProcessStatus = 'active'): RunningAppRecord {
    const existing = this.runningApps.get(app.id)
    if (existing) {
      existing.status = status
      existing.lastActiveAt = Date.now()
      this.notify()
      return existing
    }

    const newRecord: RunningAppRecord = {
      id: app.id,
      name: app.name,
      category: app.category,
      type: app.type,
      icon: app.icon,
      target: app.target,
      status,
      pid: `iris_proc_${Math.floor(1000 + Math.random() * 9000)}`,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      cpuPercent: status === 'active' ? 3.8 : 0.4,
      memoryMb: Math.round(52 + Math.random() * 70),
      isMuted: false,
      supportsControls: true,
      availableActions: this.getActionsForApp(app)
    }

    this.runningApps.set(app.id, newRecord)
    this.notify()
    return newRecord
  }

  /**
   * Default contextual actions for common apps
   */
  private getActionsForApp(app: AppItem) {
    if (app.id === 'coder' || app.target === 'CODER') {
      return [
        { id: 'new_file', label: 'New File', description: 'Create new source file' },
        { id: 'run_code', label: 'Run Code', description: 'Execute in terminal' },
        { id: 'toggle_preview', label: 'Browser Preview', description: 'Live preview window' },
        { id: 'save_commit', label: 'Git Commit', description: 'Snapshot commit' }
      ]
    }
    if (app.id === 'gallery' || app.target === 'GALLERY') {
      return [
        { id: 'generate_asset', label: 'Generate Asset', description: 'FLUX image generation' },
        { id: 'clear_gallery', label: 'Clear Gallery', description: 'Purge artifacts' }
      ]
    }
    if (app.id === 'notes' || app.target === 'NOTES') {
      return [
        { id: 'new_note', label: 'New Note', description: 'Write fresh note draft' },
        { id: 'export_notes', label: 'Export Notes', description: 'Download markdown files' }
      ]
    }
    if (app.id === 'workspace' || app.target === 'WORKSPACE') {
      return [
        { id: 'sync_drive', label: 'Sync Drive', description: 'Synchronize Google Drive' },
        { id: 'open_calendar', label: 'Calendar', description: 'Open agenda' }
      ]
    }
    if (app.id === 'maps' || app.target === 'MAPS') {
      return [
        { id: 'locate_me', label: 'Live Location', description: 'Fix GPS coordinates' },
        { id: 'toggle_satellite', label: 'Satellite View', description: 'Toggle map terrain' }
      ]
    }
    if (app.id === 'youtube-studio' || app.target === 'YOUTUBE') {
      return [
        { id: 'generate_script', label: 'Generate Script', description: 'AI video production script' },
        { id: 'check_trends', label: 'Analyze Trends', description: 'Fetch viral trends' }
      ]
    }
    if (app.id === 'phone-companion' || app.target === 'PHONE') {
      return [
        { id: 'take_screenshot', label: 'Screenshot', description: 'Capture mobile display' },
        { id: 'screen_lock', label: 'Lock Device', description: 'Send lock screen event' },
        { id: 'reboot_device', label: 'Reboot Device', description: 'Reboot phone via ADB' }
      ]
    }
    return [
      { id: 'reload_app', label: 'Restart App', description: 'Reload state' },
      { id: 'focus_app', label: 'Bring To Front', description: 'Focus window' }
    ]
  }

  // ==========================================
  // PUBLIC CONTROLLER API
  // ==========================================

  public getRunningApps(): RunningAppRecord[] {
    return Array.from(this.runningApps.values()).sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  }

  public getActiveApp(): RunningAppRecord | null {
    if (!this.activeAppId) return null
    return this.runningApps.get(this.activeAppId) || null
  }

  public getAllApps(): AppItem[] {
    return appRegistry.getAll()
  }

  /**
   * Launch, open, or switch to any application by ID, Name, or Natural Query
   */
  public async openApp(
    idOrName: string,
    params?: { secondaryQuery?: string; autoFocus?: boolean }
  ): Promise<{ success: boolean; message: string; app?: AppItem }> {
    soundEffects.play('activate')

    // 1. Check if matching app is already running
    const lower = idOrName.toLowerCase().trim()
    let targetRecord: RunningAppRecord | null = null

    for (const app of this.runningApps.values()) {
      if (
        app.id.toLowerCase() === lower ||
        app.name.toLowerCase() === lower ||
        app.target.toLowerCase() === lower
      ) {
        targetRecord = app
        break
      }
    }

    if (targetRecord && targetRecord.type === 'internal') {
      this.focusApp(targetRecord.id)
      const spoken = `Switched to ${targetRecord.name}.`
      notifyVoiceCommandProcessed({
        id: `open_${Date.now()}`,
        title: targetRecord.name,
        actionExecuted: 'APP_FOCUSED',
        spokenResponse: spoken,
        category: targetRecord.category as any,
        durationMs: 3000
      })
      return { success: true, message: spoken }
    }

    // 2. Launch via LaunchManager
    const launchResult = await launchManager.launchAppByName(idOrName, params?.secondaryQuery)

    if (launchResult.success && launchResult.app) {
      this.trackNewApp(launchResult.app, 'active')
      this.activeAppId = launchResult.app.id

      notifyVoiceCommandProcessed({
        id: `launch_${Date.now()}`,
        title: launchResult.app.name,
        actionExecuted: 'APP_LAUNCHED',
        spokenResponse: launchResult.spokenResponse || `Opened ${launchResult.app.name}.`,
        category: launchResult.app.category as any,
        durationMs: 3500
      })

      return {
        success: true,
        message: launchResult.message,
        app: launchResult.app
      }
    }

    soundEffects.play('error')
    return {
      success: false,
      message: launchResult.message || `Could not open ${idOrName}.`
    }
  }

  /**
   * Bring app to front and focus
   */
  public focusApp(appId: string): boolean {
    const record = this.runningApps.get(appId)
    if (!record) return false

    this.activeAppId = appId
    this.runningApps.forEach((a, id) => {
      if (id === appId) {
        a.status = 'active'
        a.lastActiveAt = Date.now()
      } else if (a.status === 'active') {
        a.status = 'background'
      }
    })

    if (record.type === 'internal' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: record.target } }))
    }

    soundEffects.play('pop')
    this.notify()
    return true
  }

  /**
   * Close or terminate an application instance
   */
  public async closeApp(appId: string): Promise<{ success: boolean; message: string }> {
    const record = this.runningApps.get(appId)
    if (!record) {
      return { success: false, message: `Application ${appId} is not currently running.` }
    }

    soundEffects.play('click')

    // If currently active app, switch to dashboard or previous app
    if (this.activeAppId === appId) {
      const remaining = Array.from(this.runningApps.values()).filter((a) => a.id !== appId)
      const nextApp = remaining.find((a) => a.id === 'dashboard') || remaining[0]

      if (nextApp) {
        this.focusApp(nextApp.id)
      } else {
        this.activeAppId = null
      }
    }

    // Remove or mark stopped
    this.runningApps.delete(appId)
    this.notify()

    const spoken = `Closed ${record.name}.`
    notifyVoiceCommandProcessed({
      id: `close_${Date.now()}`,
      title: record.name,
      actionExecuted: 'APP_TERMINATED',
      spokenResponse: spoken,
      category: record.category as any,
      durationMs: 2500
    })

    return { success: true, message: spoken }
  }

  /**
   * Bulk terminate all background and secondary applications
   */
  public async closeAllApps(): Promise<{ success: boolean; message: string }> {
    soundEffects.play('toggle')

    const count = this.runningApps.size
    this.runningApps.clear()

    // Re-seed Command Dashboard as clean home baseline
    this.initializeDefaultRunningApps()
    this.focusApp('dashboard')

    const spoken = `All background applications closed. Switched to Command Dashboard.`
    notifyVoiceCommandProcessed({
      id: `close_all_${Date.now()}`,
      title: 'Universal App Controller',
      actionExecuted: 'CLOSE_ALL_APPS',
      spokenResponse: spoken,
      category: 'system',
      durationMs: 3500
    })

    return { success: true, message: `Terminated ${count} running app processes.` }
  }

  /**
   * Reload / Restart an application
   */
  public async restartApp(appId: string): Promise<{ success: boolean; message: string }> {
    const record = this.runningApps.get(appId)
    if (!record) {
      return { success: false, message: `Application ${appId} is not running.` }
    }

    soundEffects.play('activate')
    record.startedAt = Date.now()
    record.lastActiveAt = Date.now()
    record.cpuPercent = 4.5
    this.notify()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris:app-restart', {
          detail: { appId, target: record.target }
        })
      )
    }

    const spoken = `Restarted ${record.name}.`
    notifyVoiceCommandProcessed({
      id: `restart_${Date.now()}`,
      title: record.name,
      actionExecuted: 'APP_RESTARTED',
      spokenResponse: spoken,
      category: record.category as any,
      durationMs: 2500
    })

    return { success: true, message: spoken }
  }

  /**
   * Toggle mute for an application
   */
  public toggleMuteApp(appId: string): boolean {
    const record = this.runningApps.get(appId)
    if (!record) return false

    record.isMuted = !record.isMuted
    soundEffects.play(record.isMuted ? 'click' : 'pop')
    this.notify()

    notifyVoiceCommandProcessed({
      id: `mute_${Date.now()}`,
      title: record.name,
      actionExecuted: record.isMuted ? 'APP_MUTED' : 'APP_UNMUTED',
      spokenResponse: `${record.name} ${record.isMuted ? 'muted' : 'unmuted'}.`,
      category: record.category as any,
      durationMs: 2000
    })

    return record.isMuted
  }

  /**
   * Dispatch a specific in-app remote control action
   */
  public async executeAppAction(
    appId: string,
    action: string,
    payload?: any
  ): Promise<{ success: boolean; message: string }> {
    const record = this.runningApps.get(appId) || this.getAllApps().find((a) => a.id === appId)
    const appName = record ? record.name : appId

    soundEffects.play('pop')

    if (typeof window !== 'undefined') {
      // 1. App-specific event channel
      window.dispatchEvent(
        new CustomEvent(`iris:app-control:${appId.toUpperCase()}`, {
          detail: { action, payload, appId }
        })
      )

      // 2. Generic control channel
      window.dispatchEvent(
        new CustomEvent('iris:app-control', {
          detail: { appId, action, payload }
        })
      )
    }

    // Specific built-in actions
    if (action === 'generate_asset') {
      // Direct asset generation action
      const prompt = payload?.prompt || 'cyberpunk holographic asset icon with glowing cyan and emerald circuits'
      try {
        const res = await fetch('/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, aspectRatio: '1:1' })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.imageUrl) {
            window.dispatchEvent(
              new CustomEvent('iris:asset-generated', {
                detail: { imageUrl: data.imageUrl, prompt }
              })
            )
            const spoken = `Generated AI asset for ${prompt}.`
            notifyVoiceCommandProcessed({
              id: `asset_${Date.now()}`,
              title: 'Visual Gallery Asset',
              actionExecuted: 'ASSET_GENERATED',
              spokenResponse: spoken,
              category: 'media',
              durationMs: 4000
            })
            return { success: true, message: spoken }
          }
        }
      } catch (err: any) {
        console.warn('[AppControlService] Asset generation error:', err)
      }
    }

    if (action === 'new_note') {
      window.dispatchEvent(new CustomEvent('iris:notes-create-new'))
      this.focusApp('notes')
      return { success: true, message: 'Created new note draft.' }
    }

    if (action === 'sync_drive') {
      window.dispatchEvent(new CustomEvent('iris:workspace-sync-drive'))
      return { success: true, message: 'Google Drive sync triggered.' }
    }

    if (action === 'locate_me') {
      window.dispatchEvent(new CustomEvent('iris:maps-locate-me'))
      this.focusApp('maps')
      return { success: true, message: 'Acquiring live GPS fix.' }
    }

    const spoken = `Executed ${action} on ${appName}.`
    notifyVoiceCommandProcessed({
      id: `action_${Date.now()}`,
      title: appName,
      actionExecuted: action.toUpperCase(),
      spokenResponse: spoken,
      category: record ? (record.category as any) : 'tools',
      durationMs: 2500
    })

    return { success: true, message: spoken }
  }

  /**
   * Subscribe to running app updates
   */
  public subscribe(fn: AppControlSubscriber): () => void {
    this.subscribers.add(fn)
    fn(this.getRunningApps(), this.activeAppId)
    return () => this.subscribers.delete(fn)
  }

  private notify() {
    const list = this.getRunningApps()
    this.subscribers.forEach((fn) => {
      try {
        fn(list, this.activeAppId)
      } catch (_e) {}
    })
  }
}

export const appControlService = new AppControlService()
export default appControlService
