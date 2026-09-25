/**
 * IRIS Keyboard Shortcuts & Global Hotkeys Service
 *
 * Manages customizable key bindings for IRIS AI:
 * - Trigger / Toggle AI voice input
 * - Toggle Core UI (Minimalist HUD mode vs Full Interface)
 * - Toggle Quick Actions Menu (Cmd+K / Ctrl+K)
 * - Mute / Unmute microphone
 * - Stop active speech / Interrupt AI
 * - Cycle Vision modes (Camera / Screen / Off)
 * - Toggle PDF / Document Knowledge Base
 * - Open Settings
 *
 * Features:
 * - Real-time keyboard recording
 * - Conflict detection between shortcuts
 * - Built-in presets (Default, Streamer/Media, One-Handed, Function Keys)
 * - Safe input field isolation (doesn't trigger while typing in text inputs unless modified)
 * - Persistent storage via localStorage
 */

export type ShortcutActionId =
  | 'TRIGGER_VOICE'
  | 'TOGGLE_CORE_UI'
  | 'TOGGLE_QUICK_MENU'
  | 'OPEN_LAUNCHER'
  | 'TOGGLE_MUTE'
  | 'STOP_SPEECH'
  | 'TOGGLE_VISION'
  | 'TOGGLE_KNOWLEDGE'
  | 'OPEN_SETTINGS'

export type ShortcutCategory = 'voice' | 'ui' | 'system'

export interface KeyCombo {
  key: string // e.g. 'v', 'k', 'm', 'c', 'd', 's', 'Space', 'Escape', '\\', 'F2'
  ctrlKey?: boolean
  metaKey?: boolean // Command on Mac / Windows key
  altKey?: boolean
  shiftKey?: boolean
}

export interface ShortcutItem extends KeyCombo {
  id: ShortcutActionId
  name: string
  description: string
  category: ShortcutCategory
  defaultCombo: KeyCombo
  enabled: boolean
}

export type ShortcutConfig = ShortcutItem

export interface ShortcutPreset {
  id: string
  name: string
  description: string
  shortcuts: Partial<Record<ShortcutActionId, KeyCombo>>
}

const STORAGE_KEY = 'iris_keyboard_shortcuts_v1'
const SETTINGS_KEY = 'iris_shortcut_settings_v1'

export interface ShortcutGlobalSettings {
  enabled: boolean
  soundFeedback: boolean
  showHudToast: boolean
}

export const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'TRIGGER_VOICE',
    name: 'Trigger Voice Input',
    description: 'Toggle active microphone listening for IRIS AI voice commands',
    category: 'voice',
    key: 'v',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'v', altKey: true },
    enabled: true
  },
  {
    id: 'TOGGLE_CORE_UI',
    name: 'Toggle Core UI',
    description: 'Switch between full workspace interface and minimalist Zen / HUD mode',
    category: 'ui',
    key: '\\',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: '\\', ctrlKey: true },
    enabled: true
  },
  {
    id: 'TOGGLE_QUICK_MENU',
    name: 'Quick Actions Menu',
    description: 'Open the floating command palette and multi-tool launcher',
    category: 'ui',
    key: 'k',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'k', ctrlKey: true },
    enabled: true
  },
  {
    id: 'OPEN_LAUNCHER',
    name: 'AI App Launcher',
    description: 'Open the universal application launcher and interactive command palette',
    category: 'ui',
    key: 'Space',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'Space', ctrlKey: true },
    enabled: true
  },
  {
    id: 'TOGGLE_MUTE',
    name: 'Mute / Unmute Microphone',
    description: 'Instantly toggle microphone privacy without halting voice core',
    category: 'voice',
    key: 'm',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'm', altKey: true },
    enabled: true
  },
  {
    id: 'STOP_SPEECH',
    name: 'Stop AI Speech',
    description: 'Immediately interrupt and silence ongoing IRIS vocal synthesis',
    category: 'voice',
    key: 'Escape',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'Escape' },
    enabled: true
  },
  {
    id: 'TOGGLE_VISION',
    name: 'Cycle Vision Mode',
    description: 'Cycle neural perception between Camera, Screen share, and Off',
    category: 'system',
    key: 'c',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'c', altKey: true },
    enabled: true
  },
  {
    id: 'TOGGLE_KNOWLEDGE',
    name: 'PDF & Knowledge Overlay',
    description: 'Toggle document ingestion dashboard and vector memory status',
    category: 'ui',
    key: 'd',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 'd', altKey: true },
    enabled: true
  },
  {
    id: 'OPEN_SETTINGS',
    name: 'Open Settings & Shortcuts',
    description: 'Quickly navigate to system settings and configuration',
    category: 'system',
    key: 's',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultCombo: { key: 's', altKey: true },
    enabled: true
  }
]

export const SHORTCUT_PRESETS: ShortcutPreset[] = [
  {
    id: 'default',
    name: 'Standard (Balanced)',
    description: 'Ergonomic Alt and Ctrl modifier bindings designed for desktop workflows',
    shortcuts: {
      TRIGGER_VOICE: { key: 'v', altKey: true },
      TOGGLE_CORE_UI: { key: '\\', ctrlKey: true },
      TOGGLE_QUICK_MENU: { key: 'k', ctrlKey: true },
      TOGGLE_MUTE: { key: 'm', altKey: true },
      STOP_SPEECH: { key: 'Escape' },
      TOGGLE_VISION: { key: 'c', altKey: true },
      TOGGLE_KNOWLEDGE: { key: 'd', altKey: true },
      OPEN_SETTINGS: { key: 's', altKey: true }
    }
  },
  {
    id: 'streamer',
    name: 'Streamer / Broadcast',
    description: 'Single-key shortcuts with Shift modifiers for rapid live production',
    shortcuts: {
      TRIGGER_VOICE: { key: 'Space', shiftKey: true },
      TOGGLE_CORE_UI: { key: 'F10' },
      TOGGLE_QUICK_MENU: { key: 'F1' },
      TOGGLE_MUTE: { key: 'm', shiftKey: true },
      STOP_SPEECH: { key: 'Escape' },
      TOGGLE_VISION: { key: 'v', shiftKey: true },
      TOGGLE_KNOWLEDGE: { key: 'k', shiftKey: true },
      OPEN_SETTINGS: { key: 'F12' }
    }
  },
  {
    id: 'one_handed',
    name: 'Left-Hand Compact (WASD/Alt)',
    description: 'Grouped around left-hand resting position for quick thumb-and-finger reach',
    shortcuts: {
      TRIGGER_VOICE: { key: 'q', altKey: true },
      TOGGLE_CORE_UI: { key: '`', ctrlKey: true },
      TOGGLE_QUICK_MENU: { key: 'e', altKey: true },
      TOGGLE_MUTE: { key: 'w', altKey: true },
      STOP_SPEECH: { key: 'Escape' },
      TOGGLE_VISION: { key: 'r', altKey: true },
      TOGGLE_KNOWLEDGE: { key: 't', altKey: true },
      OPEN_SETTINGS: { key: 'g', altKey: true }
    }
  },
  {
    id: 'function_keys',
    name: 'Function Keys (F1-F12)',
    description: 'Uses dedicated top-row function keys without requiring modifier keys',
    shortcuts: {
      TRIGGER_VOICE: { key: 'F2' },
      TOGGLE_CORE_UI: { key: 'F11' },
      TOGGLE_QUICK_MENU: { key: 'F3' },
      TOGGLE_MUTE: { key: 'F4' },
      STOP_SPEECH: { key: 'Escape' },
      TOGGLE_VISION: { key: 'F6' },
      TOGGLE_KNOWLEDGE: { key: 'F7' },
      OPEN_SETTINGS: { key: 'F9' }
    }
  }
]

export function normalizeKey(rawKey: string): string {
  if (!rawKey) return ''
  if (rawKey === ' ') return 'Space'
  if (rawKey.toLowerCase() === 'esc') return 'Escape'
  if (rawKey.length === 1) return rawKey.toLowerCase()
  return rawKey
}

export function formatKeyCombo(combo: KeyCombo): string[] {
  const parts: string[] = []
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  if (combo.ctrlKey) parts.push(isMac ? '⌃ Control' : 'Ctrl')
  if (combo.metaKey) parts.push(isMac ? '⌘ Command' : 'Win')
  if (combo.altKey) parts.push(isMac ? '⌥ Option' : 'Alt')
  if (combo.shiftKey) parts.push(isMac ? '⇧ Shift' : 'Shift')

  const keyDisplay = combo.key === ' ' ? 'Space' : combo.key.toUpperCase()
  parts.push(keyDisplay)
  return parts
}

export function areCombosEqual(a: KeyCombo, b: KeyCombo): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    Boolean(a.ctrlKey) === Boolean(b.ctrlKey) &&
    Boolean(a.metaKey) === Boolean(b.metaKey) &&
    Boolean(a.altKey) === Boolean(b.altKey) &&
    Boolean(a.shiftKey) === Boolean(b.shiftKey)
  )
}

export interface ShortcutTriggerToast {
  id: string
  actionId: ShortcutActionId
  title: string
  comboDisplay: string
  timestamp: number
}

type ShortcutListener = (shortcuts: ShortcutItem[], settings: ShortcutGlobalSettings) => void
type ActionHandler = () => void
type ToastListener = (toast: ShortcutTriggerToast) => void

class ShortcutService {
  private shortcuts: ShortcutItem[] = []
  private settings: ShortcutGlobalSettings = {
    enabled: true,
    soundFeedback: true,
    showHudToast: true
  }
  private listeners: Set<ShortcutListener> = new Set()
  private actionHandlers: Map<ShortcutActionId, ActionHandler> = new Map()
  private toastListeners: Set<ToastListener> = new Set()

  // Live recording state
  private recordingActionId: ShortcutActionId | null = null
  private recordCallback: ((combo: KeyCombo) => void) | null = null

  constructor() {
    this.shortcuts = this.loadShortcuts()
    this.settings = this.loadSettings()
    this.setupGlobalListener()
  }

  private loadShortcuts(): ShortcutItem[] {
    if (typeof window === 'undefined') return [...DEFAULT_SHORTCUTS]
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: Partial<ShortcutItem>[] = JSON.parse(saved)
        return DEFAULT_SHORTCUTS.map((def) => {
          const found = parsed.find((p) => p.id === def.id)
          if (!found) return def
          return {
            ...def,
            key: found.key !== undefined ? found.key : def.key,
            ctrlKey: found.ctrlKey !== undefined ? found.ctrlKey : def.ctrlKey,
            altKey: found.altKey !== undefined ? found.altKey : def.altKey,
            metaKey: found.metaKey !== undefined ? found.metaKey : def.metaKey,
            shiftKey: found.shiftKey !== undefined ? found.shiftKey : def.shiftKey,
            enabled: found.enabled !== undefined ? found.enabled : def.enabled
          }
        })
      }
    } catch (_e) {}
    return [...DEFAULT_SHORTCUTS]
  }

  private loadSettings(): ShortcutGlobalSettings {
    if (typeof window === 'undefined') {
      return { enabled: true, soundFeedback: true, showHudToast: true }
    }
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) {
        return { ...this.settings, ...JSON.parse(saved) }
      }
    } catch (_e) {}
    return { enabled: true, soundFeedback: true, showHudToast: true }
  }

  private persist() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.shortcuts))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch (_e) {}
    this.notify()
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn([...this.shortcuts], { ...this.settings })
      } catch (_e) {}
    })
  }

  public subscribe(fn: ShortcutListener): () => void {
    this.listeners.add(fn)
    fn([...this.shortcuts], { ...this.settings })
    return () => {
      this.listeners.delete(fn)
    }
  }

  public subscribeToast(fn: ToastListener): () => void {
    this.toastListeners.add(fn)
    return () => {
      this.toastListeners.delete(fn)
    }
  }

  public registerActionHandler(id: ShortcutActionId, handler: ActionHandler): () => void {
    this.actionHandlers.set(id, handler)
    return () => {
      if (this.actionHandlers.get(id) === handler) {
        this.actionHandlers.delete(id)
      }
    }
  }

  public getShortcuts(): ShortcutItem[] {
    return [...this.shortcuts]
  }

  public getSettings(): ShortcutGlobalSettings {
    return { ...this.settings }
  }

  public setGlobalSettings(settings: Partial<ShortcutGlobalSettings>) {
    this.settings = { ...this.settings, ...settings }
    this.persist()
  }

  public updateShortcut(id: ShortcutActionId, combo: Partial<KeyCombo> & { enabled?: boolean }) {
    this.shortcuts = this.shortcuts.map((item) => {
      if (item.id !== id) return item
      return {
        ...item,
        key: combo.key !== undefined ? normalizeKey(combo.key) : item.key,
        ctrlKey: combo.ctrlKey !== undefined ? combo.ctrlKey : item.ctrlKey,
        altKey: combo.altKey !== undefined ? combo.altKey : item.altKey,
        metaKey: combo.metaKey !== undefined ? combo.metaKey : item.metaKey,
        shiftKey: combo.shiftKey !== undefined ? combo.shiftKey : item.shiftKey,
        enabled: combo.enabled !== undefined ? combo.enabled : item.enabled
      }
    })
    this.persist()
  }

  public resetShortcut(id: ShortcutActionId) {
    this.shortcuts = this.shortcuts.map((item) => {
      if (item.id !== id) return item
      return {
        ...item,
        ...item.defaultCombo,
        key: normalizeKey(item.defaultCombo.key),
        enabled: true
      }
    })
    this.persist()
  }

  public resetAllToDefaults() {
    this.shortcuts = DEFAULT_SHORTCUTS.map((def) => ({ ...def }))
    this.persist()
  }

  public applyPreset(presetId: string) {
    const preset = SHORTCUT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    this.shortcuts = this.shortcuts.map((item) => {
      const presetCombo = preset.shortcuts[item.id]
      if (!presetCombo) return item
      return {
        ...item,
        key: normalizeKey(presetCombo.key),
        ctrlKey: Boolean(presetCombo.ctrlKey),
        altKey: Boolean(presetCombo.altKey),
        metaKey: Boolean(presetCombo.metaKey),
        shiftKey: Boolean(presetCombo.shiftKey),
        enabled: true
      }
    })
    this.persist()
  }

  /**
   * Conflict Detection
   * Returns list of action IDs that share the exact same key combination
   */
  public getConflicts(): Map<ShortcutActionId, ShortcutActionId[]> {
    const conflicts = new Map<ShortcutActionId, ShortcutActionId[]>()
    const enabled = this.shortcuts.filter((s) => s.enabled)

    for (let i = 0; i < enabled.length; i++) {
      for (let j = i + 1; j < enabled.length; j++) {
        const a = enabled[i]
        const b = enabled[j]
        if (areCombosEqual(a, b)) {
          const listA = conflicts.get(a.id) || []
          listA.push(b.id)
          conflicts.set(a.id, listA)

          const listB = conflicts.get(b.id) || []
          listB.push(a.id)
          conflicts.set(b.id, listB)
        }
      }
    }
    return conflicts
  }

  public startRecording(actionId: ShortcutActionId, callback: (combo: KeyCombo) => void) {
    this.recordingActionId = actionId
    this.recordCallback = callback
  }

  public cancelRecording() {
    this.recordingActionId = null
    this.recordCallback = null
  }

  public isRecording(actionId?: ShortcutActionId): boolean {
    if (actionId) return this.recordingActionId === actionId
    return this.recordingActionId !== null
  }

  private playFeedbackBeep() {
    if (!this.settings.soundFeedback || typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08)

      gain.gain.setValueAtTime(0.03, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.14)
      setTimeout(() => {
        try {
          ctx.close()
        } catch (_e) {}
      }, 200)
    } catch (_e) {}
  }

  private triggerToast(item: ShortcutItem) {
    if (!this.settings.showHudToast) return
    const toast: ShortcutTriggerToast = {
      id: `toast_${Date.now()}`,
      actionId: item.id,
      title: item.name,
      comboDisplay: formatKeyCombo(item).join(' + '),
      timestamp: Date.now()
    }
    this.toastListeners.forEach((fn) => {
      try {
        fn(toast)
      } catch (_e) {}
    })
  }

  private setupGlobalListener() {
    if (typeof window === 'undefined') return

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // 1. Handle live recording mode
      if (this.recordingActionId && this.recordCallback) {
        // Ignore modifier-only key presses during recording
        const modifierOnly = ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)
        if (modifierOnly) {
          return
        }

        e.preventDefault()
        e.stopPropagation()

        // If user presses Escape without modifiers, cancel recording
        if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
          this.cancelRecording()
          return
        }

        const newCombo: KeyCombo = {
          key: normalizeKey(e.key),
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey
        }

        const cb = this.recordCallback
        this.recordingActionId = null
        this.recordCallback = null
        cb(newCombo)
        return
      }

      // 2. Master enable check
      if (!this.settings.enabled) return

      // 3. Isolated typing check:
      // If user is currently typing in an input, textarea, or contenteditable element,
      // only trigger shortcuts that possess Ctrl, Alt, or Meta modifiers
      // (to prevent typing letters or space in chat from triggering hotkeys)
      const target = e.target as HTMLElement | null
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')

      const pressedKey = normalizeKey(e.key)
      const hasModifiers = e.ctrlKey || e.altKey || e.metaKey

      if (isTyping && !hasModifiers) {
        // Allow normal input typing (except Escape which can blur or cancel)
        if (e.key !== 'Escape') {
          return
        }
      }

      // 4. Match against active shortcuts
      const matched = this.shortcuts.find((item) => {
        if (!item.enabled) return false
        const keyMatch = normalizeKey(item.key) === pressedKey
        const ctrlMatch = Boolean(item.ctrlKey) === Boolean(e.ctrlKey)
        const altMatch = Boolean(item.altKey) === Boolean(e.altKey)
        const metaMatch = Boolean(item.metaKey) === Boolean(e.metaKey)
        const shiftMatch = Boolean(item.shiftKey) === Boolean(e.shiftKey)

        return keyMatch && ctrlMatch && altMatch && metaMatch && shiftMatch
      })

      if (matched) {
        // Prevent default browser shortcuts (e.g. Ctrl+K search, Alt+D location bar)
        e.preventDefault()

        // Play feedback
        this.playFeedbackBeep()
        this.triggerToast(matched)

        // Execute handler
        const handler = this.actionHandlers.get(matched.id)
        if (handler) {
          handler()
        }

        // Also dispatch browser custom event for decoupling
        window.dispatchEvent(
          new CustomEvent('iris-shortcut-triggered', {
            detail: { actionId: matched.id, item: matched }
          })
        )
      }
    })
  }

  /**
   * Programmatically triggers a shortcut action
   */
  public triggerAction(actionId: ShortcutActionId): void {
    const matched = this.shortcuts.find((s) => s.id === actionId)
    if (matched) {
      this.playFeedbackBeep()
      this.triggerToast(matched)
    }
    const handler = this.actionHandlers.get(actionId)
    if (handler) {
      handler()
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris-shortcut-triggered', {
          detail: { actionId, item: matched }
        })
      )
    }
  }
}

export const shortcutService = new ShortcutService()
