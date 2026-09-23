/**
 * Production-Ready JARVIS Voice Architecture - Types & Provider Interfaces
 */

// ==========================================
// 1. STATE MACHINE & SESSION SNAPSHOT
// ==========================================

export type JarvisVoiceState =
  | 'IDLE'
  | 'LISTENING_FOR_WAKE_WORD'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'

// Lowercase aliases for backward compatibility with existing UI
export type VoiceSessionState =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | JarvisVoiceState

export interface VoiceSessionStateSnapshot {
  wakeWordEnabled: boolean
  microphoneActive: boolean
  vadActive: boolean
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean
  isInterrupted: boolean
  partialTranscript: string
  finalTranscript: string
  currentResponse: string
  voiceMode: VoicePersonalityId | string
  state: JarvisVoiceState
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported'
}

// ==========================================
// 2. LIFECYCLE COMPONENT INTERFACE
// ==========================================

export interface AudioLifecycleComponent {
  start(): Promise<boolean> | boolean
  stop(): void
  pause?(): void
  resume?(): void
  destroy(): void
}

// ==========================================
// 3. PROVIDER INTERFACES
// ==========================================

export interface SpeechRecognitionProvider extends AudioLifecycleComponent {
  setLanguage(lang: SupportedLanguage): void
  commitInterimNow?(): void
}

export interface TextToSpeechProvider extends AudioLifecycleComponent {
  feedStreamToken(token: string): void
  finishStream(): void
  speakFullResponse(text: string): void
  interrupt(): boolean
  stopSpeaking(): void
  getIsSpeaking(): boolean
}

export interface WakeWordProvider extends AudioLifecycleComponent {
  checkText(text: string): boolean
  setEnabled(enabled: boolean): void
  getIsEnabled(): boolean
  setSensitivity(sensitivity: number): void
}

export interface VoiceActivityDetectorProvider extends AudioLifecycleComponent {
  feedAudioLevel(level: number): void
  reset(): void
  setSilenceTimeout(ms: number): void
}

// ==========================================
// 4. PERSONALITY & LANGUAGE
// ==========================================

export type VoicePersonalityId = 'jarvis' | 'assistant' | 'developer' | 'companion' | 'custom'

export interface VoicePersonality {
  id: VoicePersonalityId
  name: string
  title: string
  description: string
  systemInstructionModifier: string
  preferredVoiceKeywords: string[]
  pitch: number
  rate: number
  accentColor: string
}

export type SupportedLanguage = 'auto' | 'en-US' | 'hi-IN' | 'en-IN'

// ==========================================
// 5. PRIVACY & SETTINGS
// ==========================================

export interface VoicePrivacySettings {
  wakeWordEnabled: boolean
  wakeWordPhrase: string
  wakeWordSensitivity: number // 0.1 to 1.0 (default 0.7)
  micPermissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported'
  vadEnabled: boolean
  silenceTimeoutMs: number // default 700ms
  minSpeechDurationMs: number // default 150ms
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  continuousListening: boolean
  autoSendVoiceCommand: boolean
  voiceResponseEnabled: boolean
  voiceMode: VoicePersonalityId
  customPrompt?: string
  selectedVoice: string
  speed: number // 0.5 to 2.0 (default 1.0)
  pitch: number // 0.5 to 1.5 (default 1.0)
  volume: number // 0 to 1.0 (default 1.0)
  language: SupportedLanguage
  responseStyle: 'concise' | 'normal' | 'detailed'
}

// ==========================================
// 6. MESSAGES & SAFETY ACTIONS
// ==========================================

export interface VoiceTurnMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp: number
  isInterim?: boolean
  language?: string
  confidence?: number
  interrupted?: boolean
  metadata?: {
    inputMode?: 'voice' | 'text'
    wakeWord?: string
    voiceMode?: string
    actionExecuted?: string
    interrupted?: boolean
    [key: string]: any
  }
}

export interface SensitiveActionPayload {
  actionId: string
  title: string
  description: string
  commandText: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export interface VoiceSessionConfig {
  wakeWordEnabled: boolean
  wakeWordPhrase: string
  personality: VoicePersonalityId
  language: SupportedLanguage
  vadSilenceMs: number
  continuousConversation: boolean
}
