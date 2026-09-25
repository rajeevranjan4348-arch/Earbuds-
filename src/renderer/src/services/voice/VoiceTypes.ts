/**
 * Advanced AI Voice Conversation System - Types & Provider Interfaces
 * Implements deterministic 17-state finite state machine, audio metrics, VAD levels,
 * command parsing, planning, streaming, and tool routing.
 */

// ==========================================
// 1. DETERMINISTIC STATE MACHINE
// ==========================================

export type VoiceState =
  | 'idle'
  | 'permission_required'
  | 'requesting_permission'
  | 'ready'
  | 'listening'
  | 'user_speaking'
  | 'processing_audio'
  | 'transcribing'
  | 'transcript_ready'
  | 'thinking'
  | 'tool_execution'
  | 'generating'
  | 'speaking'
  | 'paused'
  | 'error'
  | 'cancelled'
  | 'ended'

// Uppercase legacy aliases for backward compatibility
export type JarvisVoiceState =
  | 'IDLE'
  | 'LISTENING_FOR_WAKE_WORD'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'

export type VoiceSessionState = VoiceState | JarvisVoiceState

export interface VoiceSessionStateSnapshot {
  voiceState: VoiceState
  state: JarvisVoiceState // legacy bridge
  wakeWordEnabled: boolean
  microphoneActive: boolean
  vadActive: boolean
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean
  isInterrupted: boolean
  partialTranscript: string
  finalTranscript: string
  transcriptConfidence?: number
  currentResponse: string
  voiceMode: VoicePersonalityId | string
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported'
  thinkingStatus?: ThinkingStatus | string
  activeTool?: string
  continuousMode: boolean
  pushToTalkActive: boolean
}

// ==========================================
// 2. AUDIO METRICS & VAD
// ==========================================

export type VADLevel = 'SILENCE' | 'QUIET' | 'SPEECH' | 'LOUD_SPEECH'

export interface AudioMetrics {
  rms: number
  peak: number
  normalizedLevel: number // 0.0 to 1.0
  isSpeaking: boolean
  silenceDuration: number // ms
  speechDuration: number // ms
  vadLevel: VADLevel
}

// ==========================================
// 3. TRANSCRIPTS & LANGUAGE
// ==========================================

export interface TranscriptData {
  rawTranscript: string
  normalizedTranscript: string
  language: string
  confidence: number
  timestamp: number
  isFinal: boolean
}

export type SupportedLanguage =
  | 'auto'
  | 'en-US'
  | 'en-IN'
  | 'hi-IN'
  | 'bn-IN'
  | 'te-IN'
  | 'ta-IN'
  | 'mr-IN'
  | 'gu-IN'

// ==========================================
// 4. INTENTS & COMMAND PARSER
// ==========================================

export type VoiceIntentType =
  | 'GENERAL_CHAT'
  | 'QUESTION'
  | 'SEARCH'
  | 'OPEN_APP'
  | 'CLOSE_APP'
  | 'NAVIGATE'
  | 'PLAY_MEDIA'
  | 'SEND_MESSAGE'
  | 'MAKE_CALL'
  | 'CREATE_REMINDER'
  | 'WEATHER'
  | 'MAPS'
  | 'VISION'
  | 'OCR'
  | 'CODE'
  | 'FILE_OPERATION'
  | 'DEVICE_ACTION'
  | 'SETTINGS'
  | 'MEMORY'
  | 'IMAGE_GENERATION'
  | 'WEB_SEARCH'
  | 'UNKNOWN'

export interface ParsedVoiceCommand {
  intent: VoiceIntentType
  entities: Record<string, any>
  parameters: Record<string, any>
  confidence: number
  requiresConfirmation: boolean
  confirmationPrompt?: string
  chainedActions?: ParsedVoiceCommand[]
}

// ==========================================
// 5. THINKING & TOOL EXECUTION STATUS
// ==========================================

export type ThinkingStatus =
  | 'Understanding...'
  | 'Thinking...'
  | 'Checking context...'
  | 'Searching...'
  | 'Planning...'
  | 'Generating...'
  | 'Preparing response...'
  | 'Executing tool...'

// ==========================================
// 6. LIFECYCLE & PROVIDERS
// ==========================================

export interface AudioLifecycleComponent {
  start(): Promise<boolean> | boolean
  stop(): void
  pause?(): void
  resume?(): void
  destroy(): void
}

export interface SpeechToTextProvider extends AudioLifecycleComponent {
  isSupported(): boolean
  setLanguage(lang: SupportedLanguage): void
  abort(): void
  onPartialResult(callback: (text: string) => void): void
  onFinalResult(callback: (data: TranscriptData) => void): void
  onError(callback: (error: Error | string) => void): void
  onStart(callback: () => void): void
  onEnd(callback: () => void): void
}

export interface TextToSpeechProvider extends AudioLifecycleComponent {
  speak(text: string): Promise<void> | void
  speakFullResponse(text: string): void
  feedStreamToken(token: string): void
  finishStream(): void
  interrupt(): boolean
  stopSpeaking(): void
  isSpeaking(): boolean
  getIsSpeaking(): boolean
}

export interface WakeWordProvider extends AudioLifecycleComponent {
  checkText(text: string): boolean
  setEnabled(enabled: boolean): void
  getIsEnabled(): boolean
  setSensitivity(sensitivity: number): void
}

export interface VoiceActivityDetectorProvider extends AudioLifecycleComponent {
  feedAudioLevel(level: number, rms?: number, peak?: number): void
  reset(): void
  setSilenceTimeout(ms: number): void
}

// ==========================================
// 7. PERSONALITY & MESSAGES
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

export interface VoicePrivacySettings {
  wakeWordEnabled: boolean
  wakeWordPhrase: string
  wakeWordSensitivity: number
  micPermissionStatus: 'prompt' | 'granted' | 'denied' | 'unsupported'
  vadEnabled: boolean
  silenceTimeoutMs: number
  minSpeechDurationMs: number
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean
  continuousListening: boolean
  autoSendVoiceCommand: boolean
  voiceResponseEnabled: boolean
  voiceMode: VoicePersonalityId
  customPrompt?: string
  selectedVoice: string
  speed: number
  pitch: number
  volume: number
  language: SupportedLanguage
  responseStyle: 'concise' | 'normal' | 'detailed'
}

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
    inputMode?: 'voice' | 'text' | 'push_to_talk'
    wakeWord?: string
    voiceMode?: string
    intent?: VoiceIntentType
    toolExecuted?: string
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
