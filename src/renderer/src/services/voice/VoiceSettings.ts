/**
 * VoiceSettings - Centralized Persistent Voice & Privacy Controls
 *
 * Rules:
 * - Never activate the microphone without permission.
 * - Store all settings in persistent local storage.
 * - Mobile & Android friendly defaults.
 * - Event-driven reactive subscriptions.
 */

import { VoicePrivacySettings } from './VoiceTypes'

const STORAGE_KEY = 'jarvis_voice_privacy_settings'

export const DEFAULT_VOICE_SETTINGS: VoicePrivacySettings = {
  wakeWordEnabled: false,
  wakeWordPhrase: 'Hey JARVIS',
  wakeWordSensitivity: 0.7,
  micPermissionStatus: 'prompt',
  vadEnabled: true,
  silenceTimeoutMs: 700,
  minSpeechDurationMs: 150,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  continuousListening: true,
  autoSendVoiceCommand: true,
  voiceResponseEnabled: true,
  voiceMode: 'jarvis',
  customPrompt: 'You are JARVIS, an exceptionally capable, intelligent, and calm AI assistant.',
  selectedVoice: 'default',
  speed: 1.0,
  pitch: 1.0,
  volume: 1.0,
  language: 'auto',
  responseStyle: 'concise'
}

export type VoiceSettingsListener = (settings: VoicePrivacySettings) => void

export class VoiceSettingsManager {
  private settings: VoicePrivacySettings
  private listeners: Set<VoiceSettingsListener> = new Set()

  constructor() {
    this.settings = this.loadSettings()
    this.checkMicrophonePermission().catch(() => {})
  }

  private loadSettings(): VoicePrivacySettings {
    if (typeof window === 'undefined') return { ...DEFAULT_VOICE_SETTINGS }
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return { ...DEFAULT_VOICE_SETTINGS, ...parsed }
      }
    } catch (e) {
      console.warn('[VoiceSettings] Could not parse stored settings, using defaults:', e)
    }
    return { ...DEFAULT_VOICE_SETTINGS }
  }

  private persist() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch (e) {
      console.warn('[VoiceSettings] Failed to save settings to localStorage:', e)
    }
  }

  public getSettings(): VoicePrivacySettings {
    return { ...this.settings }
  }

  public updateSettings(partial: Partial<VoicePrivacySettings>): VoicePrivacySettings {
    this.settings = { ...this.settings, ...partial }
    this.persist()
    this.notify()
    return { ...this.settings }
  }

  public resetSettings(): VoicePrivacySettings {
    this.settings = { ...DEFAULT_VOICE_SETTINGS }
    this.persist()
    this.notify()
    return { ...this.settings }
  }

  public clearVoiceSessionHistory(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('jarvis_voice_history')
        sessionStorage.removeItem('jarvis_voice_active_session')
      } catch (_e) {}
      window.dispatchEvent(new CustomEvent('jarvis:clear-voice-history'))
    }
  }

  public subscribe(listener: VoiceSettingsListener): () => void {
    this.listeners.add(listener)
    listener(this.getSettings())
    return () => this.listeners.delete(listener)
  }

  private notify() {
    const current = this.getSettings()
    for (const listener of this.listeners) {
      try {
        listener(current)
      } catch (err) {
        console.error('[VoiceSettings] Listener error:', err)
      }
    }
  }

  public setMicPermissionStatus(status: 'prompt' | 'granted' | 'denied' | 'unsupported'): void {
    if (this.settings.micPermissionStatus !== status) {
      this.updateSettings({ micPermissionStatus: status })
    }
  }

  /**
   * Safe non-invasive microphone permission check
   */
  public async checkMicrophonePermission(): Promise<
    'prompt' | 'granted' | 'denied' | 'unsupported'
  > {
    if (
      typeof navigator === 'undefined' ||
      !navigator.permissions ||
      !navigator.permissions.query
    ) {
      this.settings.micPermissionStatus = 'prompt'
      return 'prompt'
    }

    try {
      const status = await navigator.permissions.query({ name: 'microphone' as any })
      const state = (status.state as 'prompt' | 'granted' | 'denied') || 'prompt'
      if (this.settings.micPermissionStatus !== state) {
        this.settings.micPermissionStatus = state
        this.persist()
        this.notify()
      }

      status.onchange = () => {
        const nextState = (status.state as 'prompt' | 'granted' | 'denied') || 'prompt'
        this.settings.micPermissionStatus = nextState
        this.persist()
        this.notify()
      }

      return state
    } catch (_e) {
      return 'prompt'
    }
  }
}

export const voiceSettings = new VoiceSettingsManager()
