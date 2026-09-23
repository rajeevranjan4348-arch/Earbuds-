/**
 * VoiceInputService
 * ├── MicrophoneManager
 * ├── VAD (Voice Activity Detection)
 * ├── SpeechRecognition (Streaming STT & Hindi/Hinglish detection)
 * └── WakeWordDetector ("Hey JARVIS" client-side privacy detector)
 */

import { SupportedLanguage } from './types'

// ==========================================
// 1. MICROPHONE MANAGER
// ==========================================
export class MicrophoneManager {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private isMuted: boolean = false
  private animFrameId: number | null = null

  public async requestMicrophone(): Promise<MediaStream> {
    if (this.mediaStream && this.mediaStream.active) {
      return this.mediaStream
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('Microphone access is not supported by your browser environment.')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (_firstErr) {
      // Fallback to basic unconstrained audio request
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      })
    }

    const audioTracks = stream.getAudioTracks()
    if (!audioTracks || audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
      throw new Error('Microphone did not provide an active audio track.')
    }

    this.mediaStream = stream
    this.isMuted = false
    this.setupAudioContext(stream)
    return stream
  }

  private setupAudioContext(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      this.audioContext = new AudioCtx()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      const source = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.82
      source.connect(this.analyser)
    } catch (err) {
      console.warn('[MicrophoneManager] Analyser setup error:', err)
    }
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted
      })
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted
  }

  public startTelemetryLoop(
    onAudioLevel: (level: number) => void,
    onFrequencyData?: (data: Uint8Array) => void
  ) {
    this.stopTelemetryLoop()

    const bufferLength = this.analyser ? this.analyser.frequencyBinCount : 256
    const dataArray = new Uint8Array(bufferLength)

    const tick = () => {
      if (!this.mediaStream || !this.mediaStream.active) {
        onAudioLevel(0)
        return
      }

      if (this.analyser && !this.isMuted) {
        this.analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(avg / 128, 1)
        onAudioLevel(normalized)
        if (onFrequencyData) {
          onFrequencyData(dataArray)
        }
      } else {
        onAudioLevel(0)
      }

      this.animFrameId = requestAnimationFrame(tick)
    }

    this.animFrameId = requestAnimationFrame(tick)
  }

  public stopTelemetryLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  public stop() {
    this.stopTelemetryLoop()
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
    this.analyser = null
    this.isMuted = false
  }
}

// ==========================================
// 2. VOICE ACTIVITY DETECTION (VAD)
// ==========================================
export interface VADHandlers {
  onSpeechStart: () => void
  onSpeechPause: (durationMs: number) => void
  onSpeechEnd: () => void
  onNoiseFloorUpdated?: (noiseFloor: number) => void
}

export class VoiceActivityDetector {
  private isSpeaking: boolean = false
  private speechStartTime: number = 0
  private silenceStartTime: number = 0
  private silenceTimer: any = null
  private noiseFloor: number = 0.04
  private speechThreshold: number = 0.08
  private silenceTimeoutMs: number = 1100
  private handlers: VADHandlers

  constructor(handlers: VADHandlers, silenceTimeoutMs: number = 1100) {
    this.handlers = handlers
    this.silenceTimeoutMs = silenceTimeoutMs
  }

  public setSilenceTimeout(ms: number) {
    this.silenceTimeoutMs = Math.max(600, Math.min(3000, ms))
  }

  public feedAudioLevel(level: number) {
    const now = Date.now()

    // Dynamically track gentle ambient baseline
    if (level < this.noiseFloor * 1.5) {
      this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05
    }
    const currentSpeechThreshold = Math.max(this.speechThreshold, this.noiseFloor * 2.2)

    if (level > currentSpeechThreshold) {
      // User is actively producing vocal energy
      if (!this.isSpeaking) {
        this.isSpeaking = true
        this.speechStartTime = now
        this.handlers.onSpeechStart()
      }

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
      this.silenceStartTime = 0
    } else if (this.isSpeaking) {
      // Energy dropped below threshold - potential natural pause or sentence completion
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = now
      }

      const pauseDuration = now - this.silenceStartTime
      this.handlers.onSpeechPause(pauseDuration)

      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          if (this.isSpeaking) {
            this.isSpeaking = false
            this.silenceStartTime = 0
            this.silenceTimer = null
            this.handlers.onSpeechEnd()
          }
        }, this.silenceTimeoutMs)
      }
    }
  }

  public reset() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.isSpeaking = false
    this.silenceStartTime = 0
  }
}

// ==========================================
// 3. STREAMING SPEECH RECOGNITION (STT)
// ==========================================
export interface SpeechRecognitionHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string, language?: string) => void
  onError: (error: string) => void
  onEnd: () => void
}

export class StreamingSpeechRecognition {
  private recognition: any = null
  private isListening: boolean = false
  private language: SupportedLanguage = 'auto'
  private handlers: SpeechRecognitionHandlers
  private currentInterimText: string = ''
  private lastFinalText: string = ''
  private lastFinalTime: number = 0

  // Fallback MediaRecorder for environments without Web Speech API
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private isFallbackActive: boolean = false

  constructor(handlers: SpeechRecognitionHandlers) {
    this.handlers = handlers
  }

  public setLanguage(lang: SupportedLanguage) {
    this.language = lang
    if (this.recognition) {
      this.recognition.lang = this.resolveBrowserLang(lang)
    }
  }

  private resolveBrowserLang(lang: SupportedLanguage): string {
    switch (lang) {
      case 'hi-IN':
        return 'hi-IN'
      case 'en-IN':
        return 'en-IN'
      case 'en-US':
        return 'en-US'
      case 'auto':
      default:
        // Try Indian English as default to naturally handle both English & Hinglish, or navigator default
        return navigator.language || 'en-US'
    }
  }

  /**
   * Detects whether a string is Hindi, Hinglish, or English
   */
  public detectLanguageHeuristic(text: string): 'hi-IN' | 'en-IN' | 'en-US' {
    if (!text) return 'en-US'
    // 1. Devanagari script check
    if (/[\u0900-\u097F]/.test(text)) {
      return 'hi-IN'
    }
    // 2. Common Hinglish phonetic tokens
    const hinglishTokens = [
      'kya', 'hai', 'kaise', 'ho', 'batao', 'namaste', 'shukriya', 'theek', 'karo',
      'sunao', 'achha', 'nahi', 'haan', 'mera', 'meri', 'tum', 'aap', 'mujhe', 'kuch'
    ]
    const words = text.toLowerCase().split(/\s+/)
    const hasHinglish = words.some((w) => hinglishTokens.includes(w))
    if (hasHinglish) {
      return 'en-IN'
    }
    return 'en-US'
  }

  public start(stream?: MediaStream): boolean {
    if (this.isListening) return true

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.warn('[STT] Web Speech API not supported; activating fallback recorder.')
      if (stream) {
        this.startFallbackRecorder(stream)
        return true
      }
      this.handlers.onError('Speech Recognition API not supported on this browser.')
      return false
    }

    try {
      this.destroyRecognition()

      const rec = new SpeechRecognitionClass()
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.lang = this.resolveBrowserLang(this.language)

      rec.onstart = () => {
        this.isListening = true
      }

      rec.onresult = (event: any) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          const transcript = item[0]?.transcript || ''
          if (item.isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }

        const trimmedInterim = interim.trim()
        if (trimmedInterim) {
          this.currentInterimText = trimmedInterim
          this.handlers.onInterim(trimmedInterim)
        }

        const trimmedFinal = final.trim()
        if (trimmedFinal) {
          this.currentInterimText = ''
          const now = Date.now()
          // Deduplicate exact duplicate transcripts received within 1s
          if (
            trimmedFinal.toLowerCase() === this.lastFinalText.toLowerCase() &&
            now - this.lastFinalTime < 1000
          ) {
            return
          }
          this.lastFinalText = trimmedFinal
          this.lastFinalTime = now

          const detectedLang =
            this.language === 'auto'
              ? this.detectLanguageHeuristic(trimmedFinal)
              : this.language

          this.handlers.onInterim('')
          this.handlers.onFinal(trimmedFinal, detectedLang)
        }
      }

      rec.onerror = (event: any) => {
        const err = event.error || event.type
        if (err === 'no-speech') {
          // Benign quiet timeout
          return
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.isListening = false
          this.handlers.onError('Microphone permission was denied.')
          return
        }
        if (err === 'network') {
          console.warn('[STT] Network issue with speech recognition.')
          if (stream) {
            this.startFallbackRecorder(stream)
          }
          return
        }
        if (err !== 'aborted') {
          this.handlers.onError(`Speech recognition error: ${err}`)
        }
      }

      rec.onend = () => {
        const wasActive = this.isListening
        this.isListening = false
        // If there was uncommitted interim text when recognition paused, emit it
        if (this.currentInterimText) {
          const text = this.currentInterimText
          this.currentInterimText = ''
          this.handlers.onInterim('')
          this.handlers.onFinal(text, this.detectLanguageHeuristic(text))
        }
        if (wasActive) {
          this.handlers.onEnd()
        }
      }

      rec.start()
      this.recognition = rec
      this.isListening = true
      return true
    } catch (err: any) {
      console.warn('[STT] Initialization exception:', err)
      if (stream) {
        this.startFallbackRecorder(stream)
        return true
      }
      this.handlers.onError(err?.message || 'Failed to start speech recognition')
      return false
    }
  }

  public commitInterimNow() {
    if (this.currentInterimText) {
      const text = this.currentInterimText
      this.currentInterimText = ''
      this.handlers.onInterim('')
      this.handlers.onFinal(text, this.detectLanguageHeuristic(text))
    }
  }

  public stop() {
    this.isListening = false
    this.currentInterimText = ''
    this.destroyRecognition()
    this.stopFallbackRecorder()
  }

  private destroyRecognition() {
    if (this.recognition) {
      try {
        this.recognition.onstart = null
        this.recognition.onresult = null
        this.recognition.onerror = null
        this.recognition.onend = null
        this.recognition.abort()
      } catch (_e) {}
      this.recognition = null
    }
  }

  // --- Fallback Recorder using /api/voice/transcribe ---
  private startFallbackRecorder(stream: MediaStream) {
    if (this.isFallbackActive || typeof MediaRecorder === 'undefined') return

    try {
      const mimeTypes = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4']
      const supported = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      this.mediaRecorder = new MediaRecorder(stream, supported ? { mimeType: supported } : {})
      this.recordedChunks = []
      this.isFallbackActive = true

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        this.isFallbackActive = false
        if (this.recordedChunks.length === 0) return

        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm'
        })
        this.recordedChunks = []

        if (blob.size > 1000) {
          try {
            const reader = new FileReader()
            const base64Promise = new Promise<string>((res, rej) => {
              reader.onloadend = () => res(reader.result as string)
              reader.onerror = rej
            })
            reader.readAsDataURL(blob)
            const audioData = await base64Promise

            const resp = await fetch('/api/voice/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData, mimeType: blob.type })
            })
            if (resp.ok) {
              const data = await resp.json()
              const transcript = data.transcript?.trim()
              if (transcript) {
                this.handlers.onFinal(transcript, this.detectLanguageHeuristic(transcript))
              }
            }
          } catch (err) {
            console.warn('[STT Fallback] Transcription error:', err)
          }
        }
      }

      this.mediaRecorder.start(300)
    } catch (err) {
      console.warn('[STT Fallback] MediaRecorder start error:', err)
    }
  }

  private stopFallbackRecorder() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (_e) {}
    }
    this.isFallbackActive = false
    this.recordedChunks = []
  }
}

// ==========================================
// 4. WAKE WORD DETECTOR ("Hey JARVIS")
// ==========================================
export interface WakeWordHandlers {
  onWakeWordDetected: (phrase: string, commandTail?: string) => void
}

export class WakeWordDetector {
  private isEnabled: boolean = false
  private wakePatterns: RegExp[] = [
    /\bhey\s+jarvis\b/i,
    /\bok\s+jarvis\b/i,
    /\bhello\s+jarvis\b/i,
    /\bjarvis\b/i,
    /\bhey\s+iris\b/i
  ]
  private handlers: WakeWordHandlers
  private lastTriggerTime: number = 0

  constructor(handlers: WakeWordHandlers, enabled: boolean = false) {
    this.handlers = handlers
    this.isEnabled = enabled
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  public getIsEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * Scans text locally without uploading audio to external servers.
   */
  public checkText(text: string): boolean {
    if (!this.isEnabled || !text) return false

    const now = Date.now()
    if (now - this.lastTriggerTime < 2500) {
      return false // Debounce wake triggers
    }

    for (const pattern of this.wakePatterns) {
      const match = text.match(pattern)
      if (match && match.index !== undefined) {
        this.lastTriggerTime = now
        const phrase = match[0]
        const afterWakeIndex = match.index + phrase.length
        const commandTail = text.substring(afterWakeIndex).trim()
        this.handlers.onWakeWordDetected(phrase, commandTail)
        return true
      }
    }

    return false
  }
}

// ==========================================
// UNIFIED VOICE INPUT SERVICE
// ==========================================
export interface VoiceInputServiceHandlers {
  onSpeechStart: () => void
  onSpeechPause: (durationMs: number) => void
  onSpeechEnd: () => void
  onInterimTranscript: (text: string) => void
  onFinalTranscript: (text: string, language?: string) => void
  onAudioLevel: (level: number) => void
  onFrequencyData?: (data: Uint8Array) => void
  onWakeWordDetected: (phrase: string, commandTail?: string) => void
  onError: (error: string) => void
}

export class VoiceInputService {
  public micManager: MicrophoneManager
  public vad: VoiceActivityDetector
  public speechRec: StreamingSpeechRecognition
  public wakeDetector: WakeWordDetector
  private handlers: VoiceInputServiceHandlers

  constructor(handlers: VoiceInputServiceHandlers) {
    this.handlers = handlers

    this.micManager = new MicrophoneManager()

    this.vad = new VoiceActivityDetector({
      onSpeechStart: () => this.handlers.onSpeechStart(),
      onSpeechPause: (duration) => this.handlers.onSpeechPause(duration),
      onSpeechEnd: () => {
        this.speechRec.commitInterimNow()
        this.handlers.onSpeechEnd()
      }
    })

    this.speechRec = new StreamingSpeechRecognition({
      onInterim: (text) => {
        this.handlers.onInterimTranscript(text)
        if (this.wakeDetector.getIsEnabled()) {
          this.wakeDetector.checkText(text)
        }
      },
      onFinal: (text, lang) => {
        if (this.wakeDetector.getIsEnabled()) {
          const triggered = this.wakeDetector.checkText(text)
          if (triggered) return
        }
        this.handlers.onFinalTranscript(text, lang)
      },
      onError: (err) => this.handlers.onError(err),
      onEnd: () => {}
    })

    this.wakeDetector = new WakeWordDetector({
      onWakeWordDetected: (phrase, tail) => {
        this.handlers.onWakeWordDetected(phrase, tail)
      }
    })
  }

  public async start(): Promise<boolean> {
    try {
      let stream: MediaStream | null = null
      try {
        stream = await this.micManager.requestMicrophone()
        this.micManager.startTelemetryLoop(
          (lvl) => {
            this.handlers.onAudioLevel(lvl)
            this.vad.feedAudioLevel(lvl)
          },
          (data) => {
            this.handlers.onFrequencyData?.(data)
          }
        )
      } catch (streamErr: any) {
        console.warn('[VoiceInputService] Raw microphone stream could not be acquired, proceeding to speech recognition directly:', streamErr?.message)
      }

      const recStarted = this.speechRec.start(stream || undefined)
      return recStarted
    } catch (err: any) {
      console.error('[VoiceInputService] Failed to start:', err)
      this.handlers.onError(err?.message || 'Microphone error')
      return false
    }
  }

  public stop() {
    this.speechRec.stop()
    this.vad.reset()
    this.micManager.stop()
    this.handlers.onAudioLevel(0)
  }

  public setMuted(muted: boolean) {
    this.micManager.setMuted(muted)
    if (muted) {
      this.speechRec.stop()
    } else {
      const stream = this.micManager.getMediaStream()
      if (stream) {
        this.speechRec.start(stream)
      }
    }
  }

  public setLanguage(lang: SupportedLanguage) {
    this.speechRec.setLanguage(lang)
  }

  public setWakeWordEnabled(enabled: boolean) {
    this.wakeDetector.setEnabled(enabled)
  }
}
