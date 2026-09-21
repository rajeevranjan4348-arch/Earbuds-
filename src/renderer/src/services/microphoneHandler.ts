/**
 * IRIS Microphone Input Handler & Speech Recognition Engine
 *
 * Provides unified microphone audio capture, Web Speech API real-time STT,
 * integrated Gemini AI acoustic fallback transcription, and live audio
 * waveform/analyser telemetry to power voice-first commands for IRIS.
 */

import { voiceService } from './voiceService'

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
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private recognition: any = null
  private isRecognitionSupported: boolean = false
  private isListeningActive: boolean = false
  private animFrameId: number | null = null
  private options: MicrophoneHandlerOptions = { autoExecute: true }
  private currentState: MicState = 'idle'
  private statusMessage: string = 'Microphone standby'
  private silenceTimer: any = null
  private currentInterim: string = ''

  constructor() {
    this.checkSpeechRecognitionSupport()
  }

  private checkSpeechRecognitionSupport(): boolean {
    if (typeof window === 'undefined') return false
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition
    this.isRecognitionSupported = Boolean(SpeechRecognitionClass)
    return this.isRecognitionSupported
  }

  public get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    )
  }

  public get isWebSpeechAvailable(): boolean {
    return this.isRecognitionSupported
  }

  public getState(): MicState {
    return this.currentState
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
   * Request microphone stream and attach live AudioContext analyser
   */
  public async requestMicrophone(): Promise<MediaStream | null> {
    if (this.mediaStream && this.mediaStream.active) {
      return this.mediaStream
    }

    this.setState('requesting-permission', 'Requesting microphone permission...')

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported in browser environment')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      })

      this.mediaStream = stream
      this.setupAudioAnalyser(stream)
      return stream
    } catch (err: any) {
      console.warn('[MicrophoneHandler] Microphone access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.setState(
          'denied',
          'Microphone permission denied. Allow mic access in browser settings.'
        )
      } else {
        this.setState('unsupported', `Audio input hardware error: ${err.message || 'Unavailable'}`)
      }
      return null
    }
  }

  /**
   * Setup Web Audio API Analyser for live visual feedback
   */
  private setupAudioAnalyser(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close()
        } catch (_e) {}
      }

      this.audioContext = new AudioCtx()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      const source = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.75
      source.connect(this.analyser)

      const bufferLength = this.analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateLevel = () => {
        if (!this.isListeningActive || !this.analyser) return

        this.analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(avg / 120, 1)

        this.options.onAudioLevel?.(normalized)
        this.animFrameId = requestAnimationFrame(updateLevel)
      }

      updateLevel()
    } catch (e) {
      console.warn('[MicrophoneHandler] Analyser setup notice:', e)
    }
  }

  /**
   * Start listening for voice commands using Web Speech API (primary)
   * with MediaRecorder AI fallback if Web Speech is unsupported or blocked.
   */
  public async startListening(): Promise<boolean> {
    if (this.isListeningActive) return true

    const stream = await this.requestMicrophone()
    if (!stream) return false

    this.isListeningActive = true
    this.currentInterim = ''

    // Primary: Web Speech API
    if (this.checkSpeechRecognitionSupport()) {
      return this.startWebSpeechRecognition()
    }

    // Fallback: Integrated AI Recording & Transcription via Gemini
    return this.startAiMediaRecorder()
  }

  /**
   * Web Speech API SpeechRecognition Flow
   */
  private startWebSpeechRecognition(): boolean {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    try {
      if (this.recognition) {
        try {
          this.recognition.abort()
        } catch (_e) {}
      }

      const rec = new SpeechRecognitionClass()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        this.setState('listening', 'Microphone active. IRIS is listening...')
      }

      rec.onresult = (event: any) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }

        if (interim) {
          this.currentInterim = interim.trim()
          this.options.onInterimTranscript?.(this.currentInterim)
        }

        if (final) {
          const cleanFinal = final.trim()
          if (cleanFinal.length > 0) {
            this.handleFinalSpeech(cleanFinal)
          }
        }
      }

      rec.onerror = (event: any) => {
        const err = event.error
        if (err === 'no-speech') return // Silence is normal
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          // Switch to MediaRecorder AI fallback
          console.warn(
            '[MicrophoneHandler] WebSpeech restricted, falling back to Gemini AI audio transcribe.'
          )
          this.startAiMediaRecorder()
          return
        }
        console.warn('[MicrophoneHandler] WebSpeech error event:', err)
      }

      rec.onend = () => {
        if (this.isListeningActive && this.currentState === 'listening') {
          // Auto-resume continuous listening
          setTimeout(() => {
            if (this.isListeningActive && this.currentState === 'listening') {
              try {
                this.recognition?.start()
              } catch (_e) {}
            }
          }, 200)
        }
      }

      this.recognition = rec
      this.recognition.start()
      return true
    } catch (err) {
      console.warn('[MicrophoneHandler] WebSpeech start failed, using AI fallback:', err)
      return this.startAiMediaRecorder()
    }
  }

  /**
   * Integrated AI MediaRecorder Fallback Flow
   */
  private startAiMediaRecorder(): boolean {
    if (!this.mediaStream) return false

    try {
      this.recordedChunks = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/ogg'

      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        if (this.recordedChunks.length === 0) return
        const audioBlob = new Blob(this.recordedChunks, { type: mimeType })
        this.recordedChunks = []
        await this.transcribeAudioWithAi(audioBlob, mimeType)
      }

      this.mediaRecorder.start(250)
      this.setState('recording-ai', 'Recording voice for Gemini AI processing...')
      return true
    } catch (err) {
      console.error('[MicrophoneHandler] MediaRecorder fallback initialization failed:', err)
      this.setState('error', 'Failed to initialize audio recorder.')
      return false
    }
  }

  /**
   * Transcribe recorded audio with server-side Gemini AI
   */
  private async transcribeAudioWithAi(audioBlob: Blob, mimeType: string) {
    this.setState('transcribing', 'Transcribing voice command with Gemini AI...')

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      const base64Data = await base64Promise
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioData: base64Data,
          mimeType
        })
      })

      const data = await response.json()
      if (data.success && data.transcript && data.transcript.trim()) {
        const text = data.transcript.trim()
        this.handleFinalSpeech(text)
      } else {
        this.setState('listening', 'No speech detected. Ready for next command.')
      }
    } catch (err: any) {
      console.error('[MicrophoneHandler] AI Transcription error:', err)
      this.setState('error', 'AI speech transcription failed.')
    }
  }

  /**
   * Process final spoken command string
   */
  private handleFinalSpeech(commandText: string) {
    const cleanText = commandText.trim()
    if (!cleanText) return

    this.options.onFinalTranscript?.(cleanText)
    this.options.onCommandTriggered?.(cleanText)

    if (this.options.autoExecute !== false) {
      this.setState('processing', `Executing: "${cleanText}"`)
      voiceService.triggerVoiceInput(cleanText, 'voice')
    }
  }

  /**
   * Stop listening and release microphone resources
   */
  public stopListening() {
    this.isListeningActive = false

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }

    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch (_e) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop()
      } catch (_e) {}
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    this.options.onAudioLevel?.(0)
    this.setState('idle', 'Microphone standby')
  }

  /**
   * Toggle listening state
   */
  public async toggleListening(): Promise<boolean> {
    if (this.isListeningActive) {
      this.stopListening()
      return false
    } else {
      return this.startListening()
    }
  }

  /**
   * Push to talk helper
   */
  public async startPushToTalk() {
    return this.startListening()
  }

  public stopPushToTalk() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop()
    }
    this.stopListening()
  }

  /**
   * Complete shutdown
   */
  public dispose() {
    this.stopListening()

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close()
      } catch (_e) {}
      this.audioContext = null
    }
  }
}

export const microphoneHandler = new MicrophoneInputHandler()
