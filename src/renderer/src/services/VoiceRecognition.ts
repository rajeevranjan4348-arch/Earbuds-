// ===============================
// ROBUST VOICE RECOGNITION ENGINE
// ===============================

import { voiceService } from './voiceService'

export interface VoiceRecognitionError {
  type: string
  message: string
}

export interface VoiceRecognitionResult {
  final: string
  interim: string
}

export interface VoiceRecognitionOptions {
  onResult?: (result: VoiceRecognitionResult) => void
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: VoiceRecognitionError) => void
}

export class VoiceRecognition {
  private onResult: (result: VoiceRecognitionResult) => void
  private onStart: () => void
  private onEnd: () => void
  private onError: (error: VoiceRecognitionError) => void

  private recognition: any = null
  private running: boolean = false
  private shouldRestart: boolean = false
  private restartTimer: any = null

  constructor({
    onResult = () => {},
    onStart = () => {},
    onEnd = () => {},
    onError = () => {}
  }: VoiceRecognitionOptions = {}) {
    this.onResult = onResult
    this.onStart = onStart
    this.onEnd = onEnd
    this.onError = onError

    this.recognition = null
    this.running = false
    this.shouldRestart = false
    this.restartTimer = null

    this.init()
  }

  public isRunning(): boolean {
    return this.running
  }

  public init(): void {
    if (typeof window === 'undefined') return

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      this.onError({
        type: 'unsupported',
        message: 'Speech recognition is not supported by this browser.'
      })
      return
    }

    this.recognition = new SpeechRecognition()

    this.recognition.continuous = false
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 1

    this.recognition.onstart = () => {
      this.running = true
      this.onStart()
      console.log('[VOICE] recognition started')
    }

    this.recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const transcript =
          event.results[i][0]?.transcript || ''

        if (event.results[i].isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }

      this.onResult({
        final: finalText.trim(),
        interim: interimText.trim()
      })
    }

    this.recognition.onerror = (event: any) => {
      console.warn(
        '[VOICE] recognition error:',
        event.error
      )

      if (event.error === 'not-allowed') {
        this.shouldRestart = false

        this.onError({
          type: 'permission',
          message:
            'Microphone permission was denied. Allow microphone access for this site.'
        })

        return
      }

      if (event.error === 'service-not-allowed') {
        this.shouldRestart = false

        this.onError({
          type: 'permission',
          message:
            'Speech recognition service is not allowed by the browser.'
        })

        return
      }

      if (event.error === 'network') {
        console.warn(
          '[VOICE] Speech recognition network error. Retrying...'
        )

        this.onError({
          type: 'network',
          message:
            'Speech recognition network service failed. Retrying...'
        })

        return
      }

      if (event.error === 'aborted') {
        return
      }

      if (event.error === 'no-speech') {
        return
      }

      this.onError({
        type: event.error,
        message: `Speech recognition error: ${event.error}`
      })
    }

    this.recognition.onend = () => {
      this.running = false

      console.log('[VOICE] recognition ended')

      this.onEnd()

      // Automatically recover from network/no-speech endings.
      if (this.shouldRestart) {
        this.scheduleRestart()
      }
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        console.warn('[VOICE] navigator.mediaDevices.getUserMedia not available in environment')
        return true
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      })

      stream.getTracks().forEach((track) => track.stop())

      console.log('[VOICE] microphone permission granted')

      return true
    } catch (error: any) {
      console.error(
        '[VOICE] microphone permission failed:',
        error
      )

      this.onError({
        type: 'microphone',
        message:
          'Microphone permission is required.'
      })

      return false
    }
  }

  async start(): Promise<void> {
    if (!this.recognition) {
      this.init()
    }

    if (!this.recognition || this.running) {
      return
    }

    // Speech recognition normally needs a secure origin.
    if (
      typeof location !== 'undefined' &&
      location.protocol !== 'https:' &&
      location.hostname !== 'localhost' &&
      !location.hostname.endsWith('.run.app') &&
      !location.hostname.endsWith('.local')
    ) {
      this.onError({
        type: 'secure-context',
        message:
          'Voice recognition requires HTTPS or localhost.'
      })

      return
    }

    const microphoneOK =
      await this.requestMicrophonePermission()

    if (!microphoneOK) {
      return
    }

    this.shouldRestart = true

    try {
      this.recognition.start()
    } catch (error: any) {
      if (error.name === 'InvalidStateError') {
        return
      }

      console.error(
        '[VOICE] start failed:',
        error
      )
    }
  }

  stop(): void {
    this.shouldRestart = false

    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    if (this.recognition && this.running) {
      try {
        this.recognition.stop()
      } catch {}
    }
  }

  scheduleRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
    }

    this.restartTimer = setTimeout(() => {
      if (
        this.shouldRestart &&
        !this.running
      ) {
        try {
          this.recognition?.start()
        } catch {}
      }
    }, 700)
  }
}

// ===============================
// BRIDGE TO EXISTING AI SYSTEM
// ===============================

/**
 * Send final text to your EXISTING AI chat system.
 * DO NOT replace your existing chat UI.
 */
export function sendMessageToExistingAI(final: string): void {
  const clean = final?.trim()
  if (!clean) return

  // Dispatches to existing IRIS voiceService pipeline:
  // Microphone → Audio capture → Streaming STT → AI Agent → Tool execution → Streaming TTS → Speaker
  voiceService.triggerVoiceInput(clean, 'voice')
}

// ===============================
// CREATE VOICE ENGINE
// ===============================

export const voice = new VoiceRecognition({
  onStart: () => {
    console.log('[VOICE] Listening...')
    // update existing listening UI
  },

  onResult: ({ final, interim }) => {
    if (interim) {
      console.log('[VOICE] Interim:', interim)
      // update existing live transcript
      if (typeof window !== 'undefined' && (window as any).iris?.emitInterimTranscript) {
        ;(window as any).iris.emitInterimTranscript(interim)
      }
    }

    if (final) {
      console.log('[VOICE] Final:', final)

      // Send final text to your EXISTING AI chat system.
      // DO NOT replace your existing chat UI.
      sendMessageToExistingAI(final)
    }
  },

  onEnd: () => {
    console.log('[VOICE] Listening stopped')
  },

  onError: (error) => {
    console.warn('[VOICE]', error)
    // Show your existing error/toast system here.
    if (typeof window !== 'undefined' && (window as any).iris?.showToast) {
      ;(window as any).iris.showToast(error.message)
    }
  }
})

// Expose globally for developer console inspection & integration
if (typeof window !== 'undefined') {
  ;(window as any).VoiceRecognitionEngine = VoiceRecognition
  ;(window as any).voiceRecognition = voice
  ;(window as any).sendMessageToExistingAI = sendMessageToExistingAI
}
