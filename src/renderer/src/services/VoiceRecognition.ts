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

let voiceRecognitionInstance: any = null
let voiceStarting = false

/**
 * Robust microphone permission request using navigator.mediaDevices.getUserMedia
 * with echoCancellation, noiseSuppression, and autoGainControl.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('[VOICE] Microphone API unavailable')
      console.warn('[VOICE] microphone unavailable')
      return false
    }

    console.log('[VOICE] requesting microphone')

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (_firstErr) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    console.log('[VOICE] microphone granted')
    return true
  } catch (error: any) {
    console.warn('[VOICE] Microphone permission notice:', error?.message || error)

    if (
      error.name === 'NotAllowedError' ||
      error.name === 'PermissionDeniedError' ||
      error.message?.includes('Permission denied')
    ) {
      console.warn('[VOICE] Microphone permission denied')
      console.warn('[VOICE] microphone denied')
    } else if (error.name === 'NotFoundError') {
      console.warn('[VOICE] No microphone found')
      console.warn('[VOICE] microphone unavailable')
    } else if (error.name === 'NotReadableError') {
      console.warn('[VOICE] Microphone is unavailable or being used')
      console.warn('[VOICE] microphone unavailable')
    } else if (error.name === 'SecurityError') {
      console.warn('[VOICE] Microphone blocked by security policy')
      console.warn('[VOICE] microphone unavailable')
    } else {
      console.warn('[VOICE] microphone unavailable')
    }

    return false
  }
}

/**
 * Starts speech recognition only after microphone permission is granted.
 * Dispatches live transcript to existing AI/chat system without changing UI.
 */
export async function startVoiceRecognition(): Promise<any> {
  if (voiceStarting) return null
  voiceStarting = true

  const microphoneOK = await requestMicrophonePermission()

  if (!microphoneOK) {
    console.warn('[VOICE] Recognition cancelled: microphone unavailable')
    voiceStarting = false
    if (typeof window !== 'undefined' && (window as any).iris?.showToast) {
      ;(window as any).iris.showToast(
        'Microphone access is blocked. Please allow microphone permission and try again.'
      )
    }
    return null
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  if (!SpeechRecognition) {
    console.warn('[VOICE] Speech Recognition is not supported in this browser environment')
    voiceStarting = false
    return null
  }

  if (voiceRecognitionInstance) {
    try {
      voiceRecognitionInstance.abort()
    } catch (_e) {}
    voiceRecognitionInstance = null
  }

  console.log('[VOICE] recognition starting')
  const recognition = new SpeechRecognition()

  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-IN'

  recognition.onstart = () => {
    console.log('[VOICE] recognition started')
    console.log('[VOICE] Recognition started')
    voiceStarting = false
  }

  recognition.onresult = (event: any) => {
    let transcript = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0]?.transcript || ''
    }

    console.log('[VOICE] Transcript:', transcript)

    if (transcript.trim()) {
      if (typeof window !== 'undefined' && (window as any).iris?.emitInterimTranscript) {
        ;(window as any).iris.emitInterimTranscript(transcript.trim())
      }
      sendMessageToExistingAI(transcript.trim())
    }
  }

  recognition.onerror = (event: any) => {
    console.warn('[VOICE] recognition error:', event.error)

    switch (event.error) {
      case 'not-allowed':
        console.warn('[VOICE] Microphone permission denied')
        console.warn('[VOICE] microphone denied')
        if (typeof window !== 'undefined' && (window as any).iris?.showToast) {
          ;(window as any).iris.showToast(
            'Microphone access is blocked. Please allow microphone permission and try again.'
          )
        }
        break

      case 'audio-capture':
        console.warn('[VOICE] Microphone hardware unavailable')
        console.warn('[VOICE] microphone unavailable')
        break

      case 'service-not-allowed':
        console.warn('[VOICE] Speech service not allowed')
        break

      case 'network':
        console.warn('[VOICE] Speech recognition network error')
        break

      default:
        console.warn('[VOICE] Unknown recognition error:', event.error)
    }
  }

  recognition.onend = () => {
    console.log('[VOICE] recognition stopped')
    console.log('[VOICE] Recognition ended')
    voiceStarting = false
  }

  try {
    recognition.start()
    voiceRecognitionInstance = recognition
  } catch (error) {
    console.error('[VOICE] Failed to start recognition:', error)
    voiceStarting = false
  }

  return recognition
}

export class VoiceRecognition {
  private onResult: (result: VoiceRecognitionResult) => void
  private onStart: () => void
  private onEnd: () => void
  private onError: (error: VoiceRecognitionError) => void

  private recognition: any = null
  private running: boolean = false
  private isStarting: boolean = false
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
    this.isStarting = false
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
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      this.onError({
        type: 'unsupported',
        message: 'Speech recognition is not supported by this browser.'
      })
      return
    }

    this.recognition = new SpeechRecognition()

    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-IN'
    this.recognition.maxAlternatives = 1

    this.recognition.onstart = () => {
      this.running = true
      this.isStarting = false
      this.onStart()
      console.log('[VOICE] recognition started')
    }

    this.recognition.onresult = (event: any) => {
      let finalText = ''
      let interimText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || ''

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
      console.warn('[VOICE] recognition error:', event.error)

      if (event.error === 'not-allowed') {
        this.shouldRestart = false
        console.warn('[VOICE] Microphone permission denied')
        console.warn('[VOICE] microphone denied')

        this.onError({
          type: 'permission',
          message: 'Microphone access is blocked. Please allow microphone permission and try again.'
        })
        return
      }

      if (event.error === 'audio-capture') {
        this.shouldRestart = false
        console.warn('[VOICE] Microphone hardware unavailable')
        console.warn('[VOICE] microphone unavailable')
        this.onError({
          type: 'hardware',
          message: 'Microphone hardware unavailable.'
        })
        return
      }

      if (event.error === 'service-not-allowed') {
        this.shouldRestart = false
        console.warn('[VOICE] Speech service not allowed')
        this.onError({
          type: 'permission',
          message: 'Microphone access is blocked. Please allow microphone permission and try again.'
        })
        return
      }

      if (event.error === 'network') {
        console.warn('[VOICE] Speech recognition network error')
        this.onError({
          type: 'network',
          message: 'Speech recognition network error. Retrying...'
        })
        return
      }

      if (event.error === 'aborted' || event.error === 'no-speech') {
        return
      }

      this.onError({
        type: event.error,
        message: `Speech recognition error: ${event.error}`
      })
    }

    this.recognition.onend = () => {
      this.running = false
      this.isStarting = false
      console.log('[VOICE] recognition stopped')
      console.log('[VOICE] Recognition ended')

      this.onEnd()

      if (this.shouldRestart) {
        this.scheduleRestart()
      }
    }
  }

  async start(): Promise<void> {
    if (this.running || this.isStarting) {
      return
    }

    this.isStarting = true

    if (!this.recognition) {
      this.init()
    }

    if (!this.recognition) {
      this.isStarting = false
      return
    }

    const microphoneOK = await requestMicrophonePermission()

    if (!microphoneOK) {
      this.isStarting = false
      this.onError({
        type: 'permission',
        message: 'Microphone access is blocked. Please allow microphone permission and try again.'
      })
      return
    }

    this.shouldRestart = true
    console.log('[VOICE] recognition starting')

    try {
      this.recognition.start()
    } catch (error: any) {
      this.isStarting = false
      if (error.name === 'InvalidStateError') {
        return
      }
      console.error('[VOICE] Failed to start recognition:', error)
    }
  }

  stop(): void {
    this.shouldRestart = false
    this.isStarting = false

    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    if (this.recognition && this.running) {
      try {
        this.recognition.stop()
      } catch {}
    }
    console.log('[VOICE] recognition stopped')
  }

  scheduleRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
    }

    this.restartTimer = setTimeout(() => {
      if (this.shouldRestart && !this.running && !this.isStarting) {
        try {
          console.log('[VOICE] recognition starting')
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
  },

  onResult: ({ final, interim }) => {
    if (interim) {
      console.log('[VOICE] Interim:', interim)
      if (typeof window !== 'undefined' && (window as any).iris?.emitInterimTranscript) {
        ;(window as any).iris.emitInterimTranscript(interim)
      }
    }

    if (final) {
      console.log('[VOICE] Final:', final)
      sendMessageToExistingAI(final)
    }
  },

  onEnd: () => {
    console.log('[VOICE] Listening stopped')
  },

  onError: (error) => {
    console.warn('[VOICE]', error)
    if (typeof window !== 'undefined' && (window as any).iris?.showToast) {
      ;(window as any).iris.showToast(error.message)
    }
  }
})

// Expose globally for developer console inspection & integration
if (typeof window !== 'undefined') {
  ;(window as any).VoiceRecognitionEngine = VoiceRecognition
  ;(window as any).voiceRecognition = voice
  ;(window as any).requestMicrophonePermission = requestMicrophonePermission
  ;(window as any).startVoiceRecognition = startVoiceRecognition
  ;(window as any).sendMessageToExistingAI = sendMessageToExistingAI
}
