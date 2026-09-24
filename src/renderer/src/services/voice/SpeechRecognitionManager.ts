/**
 * SpeechRecognitionManager - Streaming Multi-Language STT Engine with Safe Restart
 *
 * Rules:
 * - Real-time streaming partial transcript updates.
 * - Differentiate interim vs final results cleanly.
 * - Safe restart mechanism for unexpected terminations without infinite loops.
 * - Support Hindi + English + Hinglish with auto-detection.
 * - Deduplicate duplicate transcripts.
 * - Fallback MediaRecorder when Web Speech API is absent or restricted.
 */

import { SpeechRecognitionProvider, SupportedLanguage } from './VoiceTypes'

export interface SpeechRecognitionManagerHandlers {
  onInterimTranscript: (text: string) => void
  onFinalTranscript: (text: string, language?: string) => void
  onError: (error: string) => void
  onEnd: () => void
}

export class SpeechRecognitionManager implements SpeechRecognitionProvider {
  private recognition: any = null
  private isListening: boolean = false
  private isPaused: boolean = false
  private shouldRestart: boolean = false
  private language: SupportedLanguage = 'auto'
  private handlers: SpeechRecognitionManagerHandlers
  private currentInterimText: string = ''
  private lastFinalText: string = ''
  private lastFinalTime: number = 0

  // Safe restart tracking to prevent runaway restart loops
  private restartTimer: any = null
  private consecutiveRestarts: number = 0
  private lastRestartTimestamp: number = 0
  private sessionStartTime: number = 0
  private maxConsecutiveRestarts: number = 8

  // Fallback MediaRecorder for environments without Web Speech API
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private isFallbackActive: boolean = false
  private activeStream: MediaStream | null = null

  constructor(handlers: SpeechRecognitionManagerHandlers, language: SupportedLanguage = 'auto') {
    this.handlers = handlers
    this.language = language
  }

  public setLanguage(lang: SupportedLanguage): void {
    this.language = lang
    if (this.recognition) {
      try {
        this.recognition.lang = this.resolveBrowserLang(lang)
      } catch (_e) {}
    }
  }

  public getLanguage(): SupportedLanguage {
    return this.language
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
        return 'en-IN' // Indian English handles English + Hinglish natively
    }
  }

  /**
   * Identifies whether a string has Hindi Devanagari or Hinglish vocabulary
   */
  public detectLanguageHeuristic(text: string): 'hi-IN' | 'en-IN' | 'en-US' {
    if (!text) return 'en-US'
    // 1. Devanagari script check
    if (/[\u0900-\u097F]/.test(text)) {
      return 'hi-IN'
    }
    // 2. Common Hinglish phonetic tokens
    const hinglishTokens = [
      'kya',
      'hai',
      'kaise',
      'ho',
      'batao',
      'namaste',
      'shukriya',
      'theek',
      'karo',
      'sunao',
      'achha',
      'nahi',
      'haan',
      'mera',
      'meri',
      'tum',
      'aap',
      'mujhe',
      'kuch',
      'yaar'
    ]
    const words = text.toLowerCase().split(/\s+/)
    if (words.some((w) => hinglishTokens.includes(w))) {
      return 'en-IN'
    }
    return 'en-US'
  }

  public start(stream?: MediaStream): boolean {
    if (this.isListening && this.recognition) return true
    this.isPaused = false
    this.shouldRestart = true
    this.activeStream = stream || null
    this.consecutiveRestarts = 0
    this.sessionStartTime = Date.now()

    return this.initRecognition(stream)
  }

  private initRecognition(stream?: MediaStream): boolean {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.warn(
        '[SpeechRecognitionManager] Web Speech API not supported; activating fallback recorder.'
      )
      if (stream) {
        this.startFallbackRecorder(stream)
        return true
      }
      this.handlers.onError('Speech Recognition API is not supported on this browser.')
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
        // If session ran stably for > 4 seconds, reset consecutive restarts counter
        if (Date.now() - this.sessionStartTime > 4000) {
          this.consecutiveRestarts = 0
        }
      }

      rec.onresult = (event: any) => {
        if (this.isPaused) return
        this.consecutiveRestarts = 0 // Successful recognition resets error counters

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
          this.handlers.onInterimTranscript(trimmedInterim)
        }

        const trimmedFinal = final.trim()
        if (trimmedFinal) {
          this.currentInterimText = ''
          const now = Date.now()

          // Deduplicate exact duplicate transcripts received within 1000ms
          if (
            trimmedFinal.toLowerCase() === this.lastFinalText.toLowerCase() &&
            now - this.lastFinalTime < 1000
          ) {
            return
          }
          this.lastFinalText = trimmedFinal
          this.lastFinalTime = now

          const detectedLang =
            this.language === 'auto' ? this.detectLanguageHeuristic(trimmedFinal) : this.language

          this.handlers.onInterimTranscript('')
          this.handlers.onFinalTranscript(trimmedFinal, detectedLang)
        }
      }

      rec.onerror = (event: any) => {
        const err = event.error || event.type

        if (err === 'no-speech' || err === 'aborted') {
          // Benign pause in vocal activity, let onend handle graceful keepalive
          return
        }

        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.shouldRestart = false
          this.isListening = false
          console.warn('[SpeechRecognitionManager] Microphone permission denied by browser.')
          this.handlers.onError(
            'Microphone permission was denied. Please allow microphone access in your browser.'
          )
          return
        }

        if (err === 'network') {
          console.warn(
            '[SpeechRecognitionManager] Network issue with speech recognition, trying fallback.'
          )
          if (this.activeStream) {
            this.startFallbackRecorder(this.activeStream)
          }
          return
        }

        this.handlers.onError(`Speech recognition error: ${err}`)
      }

      rec.onend = () => {
        const wasActive = this.isListening
        this.isListening = false

        // 1. Commit any remaining interim words as final transcript before restarting or exiting
        if (this.currentInterimText) {
          const text = this.currentInterimText
          this.currentInterimText = ''
          this.handlers.onInterimTranscript('')
          this.handlers.onFinalTranscript(text, this.detectLanguageHeuristic(text))
        }

        // 2. Safe Auto-Restart for unexpected terminations
        if (this.shouldRestart && !this.isPaused) {
          this.scheduleSafeRestart()
        } else if (wasActive && !this.isPaused) {
          this.handlers.onEnd()
        }
      }

      rec.start()
      this.recognition = rec
      this.isListening = true
      return true
    } catch (err: any) {
      console.warn('[SpeechRecognitionManager] Native recognition error:', err)
      if (stream) {
        this.startFallbackRecorder(stream)
        return true
      }
      this.handlers.onError(err?.message || 'Failed to start speech recognition')
      return false
    }
  }

  /**
   * Schedules a safe restart with rate limiting and exponential backoff to prevent infinite loops.
   */
  private scheduleSafeRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    const now = Date.now()
    if (now - this.lastRestartTimestamp < 15000) {
      this.consecutiveRestarts++
    } else {
      this.consecutiveRestarts = 1
    }
    this.lastRestartTimestamp = now

    if (this.consecutiveRestarts > this.maxConsecutiveRestarts) {
      console.warn(
        '[SpeechRecognitionManager] Maximum consecutive restarts reached. Stopping recognition loop.'
      )
      this.shouldRestart = false
      this.handlers.onEnd()
      return
    }

    // Adaptive backoff: 200ms -> 400ms -> 800ms
    const backoffMs = Math.min(200 * Math.pow(1.5, Math.max(0, this.consecutiveRestarts - 1)), 2500)

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.shouldRestart && !this.isListening && !this.isPaused) {
        try {
          this.initRecognition(this.activeStream || undefined)
        } catch (_err) {}
      }
    }, backoffMs)
  }

  public commitInterimNow(): void {
    if (this.currentInterimText) {
      const text = this.currentInterimText
      this.currentInterimText = ''
      this.handlers.onInterimTranscript('')
      this.handlers.onFinalTranscript(text, this.detectLanguageHeuristic(text))
    }
  }

  public pause(): void {
    this.isPaused = true
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (_e) {}
    }
  }

  public resume(): void {
    this.isPaused = false
    if (!this.isListening && this.shouldRestart) {
      this.initRecognition(this.activeStream || undefined)
    }
  }

  public stop(): void {
    this.shouldRestart = false
    this.isListening = false
    this.isPaused = false
    this.currentInterimText = ''
    this.consecutiveRestarts = 0

    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    this.destroyRecognition()
    this.stopFallbackRecorder()
  }

  public destroy(): void {
    this.stop()
  }

  private destroyRecognition(): void {
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

  // --- Fallback Recorder for environments without Web Speech API ---
  private startFallbackRecorder(stream: MediaStream): void {
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
                this.handlers.onFinalTranscript(
                  transcript,
                  this.detectLanguageHeuristic(transcript)
                )
              }
            }
          } catch (err) {
            console.warn('[SpeechRecognitionManager Fallback] Transcription error:', err)
          }
        }
      }

      this.mediaRecorder.start(300)
    } catch (err) {
      console.warn('[SpeechRecognitionManager Fallback] Start error:', err)
    }
  }

  private stopFallbackRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (_e) {}
    }
    this.isFallbackActive = false
    this.recordedChunks = []
  }
}
