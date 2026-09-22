/**
 * IRIS Microphone Input Handler & Speech Recognition Engine
 *
 * Integrates directly with the centralized VoiceService to provide
 * unified microphone access, audio level telemetry, real-time STT,
 * and push-to-talk functionality without duplicate streams or conflicting sessions.
 */

import { voiceService, VoiceStatus } from './voiceService'

export type MicState =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'recording-ai'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'denied'
  | 'unsupported'
  | 'error'

export interface MicrophoneHandlerOptions {
  onStateChange?: (state: MicState, message?: string) => void
  onInterimTranscript?: (text: string) => void
  onFinalTranscript?: (text: string) => void
  onAudioLevel?: (level: number) => void
  onCommandTriggered?: (command: string) => void
  autoExecute?: boolean
}

class MicrophoneInputHandler {
  private options: MicrophoneHandlerOptions = { autoExecute: true }
  private currentState: MicState = 'idle'
  private statusMessage: string = 'Microphone standby'
  private isPushToTalk: boolean = false

  constructor() {
    this.bindToVoiceService()
  }

  private mapVoiceStatusToMicState(status: VoiceStatus): MicState {
    switch (status) {
      case 'idle':
        return 'idle'
      case 'requesting-permission':
        return 'requesting-permission'
      case 'listening':
        return 'listening'
      case 'processing':
        return 'processing'
      case 'speaking':
        return 'speaking'
      case 'muted':
        return 'muted'
      case 'denied':
        return 'denied'
      case 'unsupported':
        return 'unsupported'
      case 'error':
        return 'error'
      default:
        return 'idle'
    }
  }

  private bindToVoiceService() {
    voiceService.setHandlers({
      onStatusChange: (status, message) => {
        const state = this.mapVoiceStatusToMicState(status)
        this.setState(state, message)
      },
      onAudioLevel: (level) => {
        this.options.onAudioLevel?.(level)
      },
      onInterimTranscript: (text) => {
        this.options.onInterimTranscript?.(text)
      },
      onFinalTranscript: (text) => {
        this.options.onFinalTranscript?.(text)
        if (this.options.onCommandTriggered && !this.options.autoExecute) {
          this.options.onCommandTriggered(text)
        }
      },
      onSpeakingChange: (isSpeaking) => {
        if (isSpeaking) {
          this.setState('speaking', 'IRIS is responding...')
        } else if (voiceService.isRunning && !voiceService.isMuted) {
          this.setState('listening', 'Microphone active. IRIS is listening...')
        }
      }
    })
  }

  public get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    )
  }

  public get isWebSpeechAvailable(): boolean {
    if (typeof window === 'undefined') return false
    return Boolean(
      (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition ||
        (window as any).mozSpeechRecognition
    )
  }

  public getState(): MicState {
    if (voiceService.isSpeaking) return 'speaking'
    if (voiceService.isProcessing) return 'processing'
    if (voiceService.isMuted) return 'muted'
    return this.mapVoiceStatusToMicState(voiceService.getStatus())
  }

  public getStatusMessage(): string {
    return this.statusMessage
  }

  public configure(options: MicrophoneHandlerOptions) {
    this.options = { ...this.options, ...options }
  }

  private setState(state: MicState, message?: string) {
    this.currentState = state
    if (message) this.statusMessage = message
    this.options.onStateChange?.(state, message || this.statusMessage)
  }

  /**
   * Toggle listening state cleanly via VoiceService
   */
  public async toggleListening(): Promise<boolean> {
    if (voiceService.isSpeaking) {
      voiceService.stopSpeaking()
      return true
    }

    if (!voiceService.isRunning) {
      return await voiceService.start()
    }

    if (voiceService.isMuted) {
      voiceService.setMuted(false)
      return true
    } else {
      voiceService.setMuted(true)
      return false
    }
  }

  /**
   * Push-to-talk press & hold support
   */
  public async startPushToTalk(): Promise<boolean> {
    this.isPushToTalk = true
    if (!voiceService.isRunning) {
      return await voiceService.start()
    }
    if (voiceService.isMuted) {
      voiceService.setMuted(false)
    }
    this.setState('listening', 'Push-to-talk active: Speak now...')
    return true
  }

  public stopPushToTalk() {
    if (!this.isPushToTalk) return
    this.isPushToTalk = false
    // Give speech recognition a moment to finalize and commit
    setTimeout(() => {
      if (!this.isPushToTalk && voiceService.isRunning && !voiceService.isSpeaking && !voiceService.isProcessing) {
        voiceService.setMuted(true)
      }
    }, 600)
  }
}

export const microphoneHandler = new MicrophoneInputHandler()
