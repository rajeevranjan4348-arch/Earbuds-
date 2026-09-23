/**
 * IRIS Microphone Input Handler & Speech Recognition Engine
 *
 * Integrates directly with the centralized VoiceService and GeminiLiveVoiceClient
 * to pipe raw 16kHz PCM audio data streams to the Gemini Multimodal Live API
 * WebSocket service, handle push-to-talk, VAD, audio level telemetry, and wake words.
 */

import { voiceService, VoiceStatus } from './voiceService'
import { geminiLiveVoiceClient, LiveVoiceState } from './geminiLiveVoiceClient'

export type MicState =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'recording-ai'
  | 'streaming-live'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'interrupted'
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

export interface ContinuousStreamOptions {
  onChunk?: (base64Audio: string) => void
  onTranscript?: (transcript: string) => void
  onResponse?: (data: any) => void
  onError?: (err: any) => void
  sessionId?: string
  voiceName?: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
  timesliceMs?: number
}

class MicrophoneInputHandler {
  private options: MicrophoneHandlerOptions = { autoExecute: true }
  private currentState: MicState = 'idle'
  private statusMessage: string = 'Microphone standby'
  private isPushToTalk: boolean = false
  private continuousStreamingActive: boolean = false
  private liveClientUnsub: (() => void) | null = null
  private liveLevelUnsub: (() => void) | null = null

  constructor() {
    this.bindToVoiceService()
    this.bindToLiveClient()
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
        if (this.continuousStreamingActive) return
        const state = this.mapVoiceStatusToMicState(status)
        this.setState(state, message)
      },
      onAudioLevel: (level) => {
        if (!this.continuousStreamingActive) {
          this.options.onAudioLevel?.(level)
        }
      },
      onInterimTranscript: (text) => {
        this.options.onInterimTranscript?.(text)
        this.checkWakeWord(text)
      },
      onFinalTranscript: (text) => {
        this.options.onFinalTranscript?.(text)
        if (this.options.onCommandTriggered && this.options.autoExecute) {
          this.options.onCommandTriggered(text)
        }
      },
      onSpeakingChange: (isSpeaking) => {
        if (this.continuousStreamingActive) return
        if (isSpeaking) {
          this.setState('speaking', 'JARVIS is speaking...')
        } else if (voiceService.isRunning && !voiceService.isMuted) {
          this.setState('listening', 'Microphone active. JARVIS is listening...')
        }
      }
    })
  }

  private bindToLiveClient() {
    this.liveClientUnsub = geminiLiveVoiceClient.subscribe((state: LiveVoiceState, payload) => {
      if (!this.continuousStreamingActive) return

      if (state === 'speaking') {
        this.setState('speaking', 'JARVIS is speaking...')
      } else if (state === 'interrupted') {
        this.setState('interrupted', 'Interrupted by user speech')
      } else if (state === 'listening') {
        this.setState('streaming-live', 'Piping raw PCM audio to Gemini Live...')
      } else if (state === 'error') {
        this.setState('error', payload?.error || 'Live stream error')
      }

      if (payload?.history) {
        const lastMsg = payload.history[payload.history.length - 1]
        if (lastMsg) {
          if (lastMsg.role === 'user') {
            this.options.onInterimTranscript?.(lastMsg.text)
          } else {
            this.options.onFinalTranscript?.(lastMsg.text)
          }
        }
      }
    })

    this.liveLevelUnsub = geminiLiveVoiceClient.onAudioLevel((level) => {
      if (this.continuousStreamingActive) {
        this.options.onAudioLevel?.(level)
      }
    })
  }

  /**
   * Detects "Hey JARVIS" or "Hey IRIS" wake words
   */
  private checkWakeWord(text: string) {
    const lower = text.toLowerCase()
    if (
      lower.includes('hey jarvis') ||
      lower.includes('jarvis') ||
      lower.includes('hey iris') ||
      lower.includes('ok jarvis')
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('iris:wake-word-detected', {
            detail: { phrase: text, timestamp: Date.now() }
          })
        )
      }
    }
  }

  public get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    )
  }

  public getState(): MicState {
    if (this.continuousStreamingActive) {
      const liveState = geminiLiveVoiceClient.getState()
      if (liveState === 'speaking') return 'speaking'
      if (liveState === 'interrupted') return 'interrupted'
      return 'streaming-live'
    }
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
   * Toggle listening state cleanly via Gemini Live WebSocket raw PCM pipeline
   */
  public async toggleListening(): Promise<boolean> {
    if (this.continuousStreamingActive) {
      await this.stopContinuousStreaming()
      return false
    }

    return await this.startContinuousStreaming()
  }

  /**
   * Push-to-talk press & hold support
   */
  public async startPushToTalk(): Promise<boolean> {
    this.isPushToTalk = true
    if (this.continuousStreamingActive) return true
    return await this.startContinuousStreaming()
  }

  public stopPushToTalk() {
    if (!this.isPushToTalk) return
    this.isPushToTalk = false
    setTimeout(() => {
      if (!this.isPushToTalk && this.continuousStreamingActive) {
        this.stopContinuousStreaming()
      }
    }, 400)
  }

  // ==========================================
  // CONTINUOUS LIVE PCM STREAMING (GEMINI LIVE WEBSOCKET)
  // ==========================================

  public isContinuousStreaming(): boolean {
    return this.continuousStreamingActive
  }

  /**
   * Starts piping raw audio PCM data streams to Gemini Live WebSocket
   */
  public async startContinuousStreaming(
    opts: ContinuousStreamOptions = {}
  ): Promise<boolean> {
    if (!this.isSupported) {
      this.setState('unsupported', 'Microphone not supported on this platform')
      return false
    }

    try {
      this.setState('requesting-permission', 'Requesting microphone access for live stream...')

      // Mute local fallback STT to avoid dual feedback
      if (voiceService.isRunning) {
        voiceService.setMuted(true)
      }

      if (opts.voiceName) {
        geminiLiveVoiceClient.setVoice(opts.voiceName)
      }

      const started = await geminiLiveVoiceClient.startLiveSession()
      if (!started) {
        throw new Error('Could not establish microphone capture for Gemini Live')
      }

      this.continuousStreamingActive = true
      this.setState('streaming-live', 'Piping raw PCM audio to Gemini Live WebSocket...')
      return true
    } catch (err: any) {
      console.error('[MicrophoneHandler] Error starting continuous streaming:', err)
      this.setState('error', err?.message || 'Failed to start raw audio stream')
      this.stopContinuousStreaming()
      return false
    }
  }

  /**
   * Stops continuous audio streaming and frees media hardware
   */
  public async stopContinuousStreaming(): Promise<void> {
    this.continuousStreamingActive = false
    geminiLiveVoiceClient.endLiveSession()

    if (voiceService.isRunning) {
      voiceService.setMuted(false)
    }

    this.options.onAudioLevel?.(0)
    this.setState('idle', 'Microphone standby')
  }
}

export const microphoneHandler = new MicrophoneInputHandler()
