/**
 * IRIS Neural Voice Core Service
 * Handles microphone audio stream, live spectrum analysis,
 * Web Speech Recognition (STT) with MediaRecorder fallback,
 * Web Speech Synthesis (TTS) with sentence chunking & Chrome freeze protection,
 * and seamless conversational turn-taking loop:
 * Idle -> Listening -> Processing -> Speaking -> Listening again.
 */

import { voiceCommandProcessor } from './voiceCommandProcessor'

export type VoiceStatus =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'error'
  | 'unsupported'
  | 'denied'

export interface VoiceCommandHandlers {
  onStatusChange?: (status: VoiceStatus, message?: string) => void
  onInterimTranscript?: (text: string) => void
  onFinalTranscript?: (text: string) => void
  onAudioLevel?: (level: number) => void
  onFrequencyData?: (data: Uint8Array) => void
  onSpeakingChange?: (isSpeaking: boolean) => void
  onNavigate?: (
    tab:
      | 'DASHBOARD'
      | 'YOUTUBE'
      | 'WORKSPACE'
      | 'MAPS'
      | 'NOTES'
      | 'GALLERY'
      | 'PHONE'
      | 'SETTINGS'
      | 'SMOOTHNESS'
      | string
  ) => void
  onVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  onKnowledgeOpen?: (open: boolean) => void
}

/**
 * Strips markdown symbols, code blocks, raw URLs, and bracketed citations
 * to produce clean, natural spoken speech.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return ''
  let cleaned = text
    // 1. Remove code blocks ```...``` and inline code `...`
    .replace(/```[\s\S]*?```/g, ' [code block omitted] ')
    .replace(/`([^`]+)`/g, '$1')
    // 2. Remove images and links [label](url) -> label
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 3. Remove citations like [Source: ...], [Document: ...], [Doc 1], [1], [Page 2]
    .replace(/\[(?:source|document|doc|ref|file|page|citation|\d+)[^\]]*\]/gi, '')
    .replace(/\[\s*\d+\s*\]/g, '')
    // 4. Remove raw URLs
    .replace(/https?:\/\/\S+/gi, '')
    // 5. Remove markdown formatting: headers, bold, italics, strikethrough, blockquotes, horizontal rules
    .replace(/[*_#~>]/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // 6. Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // 7. Strip emoji clusters and noisy ASCII tables/dividers
    .replace(/[|─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/g, ' ')
    // 8. Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Task completed.'
}

/**
 * Splits text into speakable sentence chunks (<160 chars) to prevent
 * mobile and desktop Chrome speech synthesis from pausing/cutting off after 15s.
 */
export function splitIntoSpeakableChunks(text: string, maxChunkLength = 160): string[] {
  if (!text || text.length <= maxChunkLength) {
    return text ? [text] : []
  }

  const chunks: string[] = []
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]

  let currentChunk = ''
  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    if (currentChunk.length + trimmed.length + 1 <= maxChunkLength) {
      currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed
    } else {
      if (currentChunk) {
        chunks.push(currentChunk)
      }
      // If a single sentence is longer than maxChunkLength, split by clause or words
      if (trimmed.length > maxChunkLength) {
        const words = trimmed.split(' ')
        let subChunk = ''
        for (const word of words) {
          if (subChunk.length + word.length + 1 <= maxChunkLength) {
            subChunk = subChunk ? `${subChunk} ${word}` : word
          } else {
            if (subChunk) chunks.push(subChunk)
            subChunk = word
          }
        }
        currentChunk = subChunk
      } else {
        currentChunk = trimmed
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks.length > 0 ? chunks : [text]
}

class VoiceService {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private recognition: any = null
  private isRecognitionActive: boolean = false
  private animFrameId: number | null = null
  private handlers: VoiceCommandHandlers = {}
  private watchdogInterval: any = null

  // Fallback MediaRecorder for environments without Web Speech API
  private mediaRecorder: MediaRecorder | null = null
  private recordedAudioChunks: Blob[] = []
  private isFallbackRecording: boolean = false
  private vadSilenceTimeout: any = null
  private vadSpeechDetected: boolean = false

  public isRunning: boolean = false
  public isMuted: boolean = false
  public isSpeaking: boolean = false
  public isProcessing: boolean = false
  public isConversationalMode: boolean = true
  private voiceStarting: boolean = false

  private status: VoiceStatus = 'idle'
  private lastProcessedTranscript: string = ''
  private lastProcessedTime: number = 0
  private processedRequestIds: Set<string> = new Set()
  private activeStreamInterval: any = null

  private pendingInterimText: string = ''
  private silenceDebounceTimeout: any = null
  private selectedLanguage: string = 'en-US'

  // Speech synthesis queue & heartbeat state
  private speechQueue: string[] = []
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private ttsHeartbeatInterval: any = null
  private availableVoices: SpeechSynthesisVoice[] = []
  private isTtsInitialized: boolean = false

  // Restart backoff limiter to avoid infinite loops
  private restartCount: number = 0
  private lastRestartTime: number = 0

  constructor() {
    this.initVoices()
    this.initVisibilityListener()
  }

  /**
   * Initializes SpeechSynthesis voices with asynchronous browser loading support
   */
  private initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const loadVoices = () => {
      try {
        const voices = window.speechSynthesis.getVoices()
        if (voices && voices.length > 0) {
          this.availableVoices = voices
          this.isTtsInitialized = true
          const selected = this.getBestVoice()
          console.log('[TTS] voice selected:', selected?.name || 'browser default')
        }
      } catch (err) {
        console.warn('[TTS] Error loading voices:', err)
      }
    }

    loadVoices()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }

  private initVisibilityListener() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isRunning && this.isRecognitionActive) {
          this.stopRecognition()
        }
      } else {
        if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
          this.startRecognition()
        }
      }
    })
  }

  public setLanguage(lang: string) {
    this.selectedLanguage = lang
    if (this.recognition) {
      this.recognition.lang = lang
    }
  }

  /**
   * Selects the most natural-sounding voice matching the language
   */
  private getBestVoice(): SpeechSynthesisVoice | null {
    if (
      this.availableVoices.length === 0 &&
      typeof window !== 'undefined' &&
      window.speechSynthesis
    ) {
      try {
        this.availableVoices = window.speechSynthesis.getVoices()
      } catch (_e) {}
    }

    if (this.availableVoices.length === 0) return null

    const langPrefix = (this.selectedLanguage || 'en').split('-')[0].toLowerCase()
    const langVoices = this.availableVoices.filter((v) =>
      v.lang.toLowerCase().startsWith(langPrefix)
    )

    const candidates = langVoices.length > 0 ? langVoices : this.availableVoices

    // Priority keywords for natural browser voices
    const qualityKeywords = [
      'natural',
      'google',
      'neural',
      'samantha',
      'alex',
      'daniel',
      'karen',
      'siri',
      'enhanced',
      'premium',
      'en-us'
    ]

    for (const keyword of qualityKeywords) {
      const match = candidates.find((v) => v.name.toLowerCase().includes(keyword))
      if (match) return match
    }

    // Default voice in candidate list
    const defaultVoice = candidates.find((v) => v.default)
    return defaultVoice || candidates[0] || null
  }

  /**
   * Play acoustic activation chime via Web Audio API
   */
  public playAcousticFeedback(type: 'activate' | 'deactivate' | 'recognized') {
    if (typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime
      if (type === 'activate') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15)
        gain.gain.setValueAtTime(0.04, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
        osc.start(now)
        osc.stop(now + 0.2)
      } else if (type === 'recognized') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(659.25, now)
        osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.12)
        gain.gain.setValueAtTime(0.035, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
        osc.start(now)
        osc.stop(now + 0.18)
      } else {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(660, now)
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.15)
        gain.gain.setValueAtTime(0.04, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
        osc.start(now)
        osc.stop(now + 0.2)
      }

      setTimeout(() => {
        try {
          ctx.close()
        } catch (_e) {}
      }, 350)
    } catch (_e) {}
  }

  /**
   * Checks whether Web Speech API is supported in the current environment
   */
  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition
    )
  }

  /**
   * Request microphone permission using navigator.mediaDevices.getUserMedia
   * with explicit noise suppression, auto gain control, and echo cancellation.
   */
  public async requestMicrophonePermission(): Promise<MediaStream | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        console.warn('[VOICE] Microphone API unavailable')
        console.warn('[VOICE] microphone unavailable')
        this.setStatus('error', 'Microphone API unavailable in this browser.')
        return null
      }

      console.log('[VOICE] requesting microphone')
      this.setStatus('requesting-permission', 'Connecting microphone audio input...')

      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } catch (_constraintErr) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }

      console.log('[VOICE] microphone granted')
      return stream
    } catch (error: any) {
      console.warn('[VOICE] Microphone permission notice:', error?.message || error)

      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError' ||
        error.message?.includes('Permission denied')
      ) {
        console.warn('[VOICE] Microphone permission denied')
        console.warn('[VOICE] microphone denied')
        this.setStatus(
          'denied',
          'Microphone access is blocked. Please allow microphone permission and try again.'
        )
      } else if (error.name === 'NotFoundError') {
        console.warn('[VOICE] No microphone found')
        console.warn('[VOICE] microphone unavailable')
        this.setStatus('error', 'No microphone hardware found on this device.')
      } else if (error.name === 'NotReadableError') {
        console.warn('[VOICE] Microphone is unavailable or being used')
        console.warn('[VOICE] microphone unavailable')
        this.setStatus(
          'error',
          'Microphone is unavailable or already in use by another application.'
        )
      } else if (error.name === 'SecurityError') {
        console.warn('[VOICE] Microphone blocked by security policy')
        console.warn('[VOICE] microphone unavailable')
        this.setStatus(
          'denied',
          'Microphone access is blocked. Please allow microphone permission and try again.'
        )
      } else {
        console.warn('[VOICE] microphone unavailable')
        this.setStatus('error', error?.message || 'Audio input hardware unavailable.')
      }

      return null
    }
  }

  /**
   * Initializes Web Speech API Recognition with mobile and Android reliability
   */
  private initSpeechRecognition(): boolean {
    if (typeof window === 'undefined') return false

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.warn('[VOICE] Web Speech API not supported; using MediaRecorder fallback.')
      return false
    }

    try {
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

      const rec = new SpeechRecognitionClass()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = this.selectedLanguage || navigator.language || 'en-IN'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        this.isRecognitionActive = true
        console.log('[VOICE] recognition started')
        if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
          this.setStatus('listening', 'Microphone active. IRIS is listening...')
        }
      }

      rec.onresult = (event: any) => {
        // Guard against capturing speech while IRIS is speaking (prevents TTS feedback loop)
        if (!this.isRunning || this.isMuted || this.isSpeaking || this.isProcessing) return

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

        if (trimmedInterim && !this.isSpeaking) {
          console.log('[VOICE] interim transcript:', trimmedInterim)
          this.pendingInterimText = trimmedInterim
          this.handlers.onInterimTranscript?.(trimmedInterim)

          // Debounced Silence Detection: If browser pauses without setting isFinal, commit after 900ms
          if (this.silenceDebounceTimeout) {
            clearTimeout(this.silenceDebounceTimeout)
          }
          this.silenceDebounceTimeout = setTimeout(() => {
            if (
              this.pendingInterimText &&
              !this.isSpeaking &&
              !this.isProcessing &&
              this.isRunning &&
              !this.isMuted
            ) {
              const textToCommit = this.pendingInterimText
              this.pendingInterimText = ''
              console.log('[VOICE] final transcript (debounced interim):', textToCommit)
              this.handlers.onInterimTranscript?.('')
              this.handlers.onFinalTranscript?.(textToCommit)
              this.playAcousticFeedback('recognized')
              this.processUserSpeech(textToCommit)
            }
          }, 900)
        }

        if (final && !this.isSpeaking) {
          if (this.silenceDebounceTimeout) {
            clearTimeout(this.silenceDebounceTimeout)
            this.silenceDebounceTimeout = null
          }
          this.pendingInterimText = ''

          const cleanFinal = final.trim()
          if (cleanFinal.length > 0) {
            const now = Date.now()
            // Deduplicate exact duplicate transcript within 1200ms
            if (
              cleanFinal.toLowerCase() === this.lastProcessedTranscript.toLowerCase() &&
              now - this.lastProcessedTime < 1200
            ) {
              return
            }

            console.log('[VOICE] final transcript:', cleanFinal)
            this.lastProcessedTranscript = cleanFinal
            this.lastProcessedTime = now

            this.handlers.onInterimTranscript?.('')
            this.handlers.onFinalTranscript?.(cleanFinal)
            this.playAcousticFeedback('recognized')
            this.processUserSpeech(cleanFinal)
          }
        }
      }

      rec.onerror = (event: any) => {
        this.isRecognitionActive = false
        const err = event.error || event.type
        console.warn('[VOICE] recognition error:', err)

        switch (err) {
          case 'not-allowed':
            console.warn('[VOICE] Microphone permission denied')
            console.warn('[VOICE] microphone denied')
            this.setStatus(
              'denied',
              'Microphone access is blocked. Please allow microphone permission and try again.'
            )
            this.stop()
            break

          case 'audio-capture':
            console.warn('[VOICE] Microphone hardware unavailable')
            console.warn('[VOICE] microphone unavailable')
            this.setStatus('error', 'Microphone hardware unavailable.')
            break

          case 'service-not-allowed':
            console.warn('[VOICE] Speech service not allowed')
            this.setStatus(
              'denied',
              'Microphone access is blocked. Please allow microphone permission and try again.'
            )
            break

          case 'network':
            console.warn('[VOICE] Speech recognition network error')
            if (this.mediaStream && !this.isFallbackRecording) {
              this.startFallbackRecorder()
            }
            break

          case 'no-speech':
            // Benign silence timeout, smoothly continue
            break

          case 'aborted':
            // Normal abort upon user action or speak transition
            break

          default:
            console.warn('[VOICE] Unknown recognition error:', err)
            break
        }
      }

      rec.onend = () => {
        this.isRecognitionActive = false
        console.log('[VOICE] recognition stopped')
        console.log('[VOICE] Recognition ended')

        // If fallback recorder is active, let it handle audio capture
        if (this.isFallbackRecording) {
          return
        }

        // If pending interim text was waiting when recognition paused, commit it
        if (
          this.pendingInterimText &&
          !this.isSpeaking &&
          !this.isProcessing &&
          this.isRunning &&
          !this.isMuted
        ) {
          const textToCommit = this.pendingInterimText
          this.pendingInterimText = ''
          console.log('[VOICE] final transcript (commit on end):', textToCommit)
          this.handlers.onInterimTranscript?.('')
          this.handlers.onFinalTranscript?.(textToCommit)
          this.playAcousticFeedback('recognized')
          this.processUserSpeech(textToCommit)
          return
        }

        // Conversational continuous loop: restart recognition if session is active and not speaking
        if (
          this.isRunning &&
          !this.isMuted &&
          !this.isSpeaking &&
          !this.isProcessing &&
          this.isConversationalMode
        ) {
          const now = Date.now()
          if (now - this.lastRestartTime < 1000) {
            this.restartCount++
          } else {
            this.restartCount = 0
          }
          this.lastRestartTime = now

          // Protect against infinite tight restart loops
          if (this.restartCount > 10) {
            console.warn('[VOICE] Backing off restart loop')
            setTimeout(() => {
              this.restartCount = 0
              if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
                this.startRecognition()
              }
            }, 1000)
            return
          }

          setTimeout(() => {
            if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
              this.startRecognition()
            }
          }, 150)
        }
      }

      this.recognition = rec
      return true
    } catch (e) {
      console.warn('[VOICE] SpeechRecognition initialization error:', e)
      return false
    }
  }

  public setHandlers(handlers: VoiceCommandHandlers) {
    this.handlers = { ...this.handlers, ...handlers }
  }

  public getStatus(): VoiceStatus {
    return this.status
  }

  private setStatus(status: VoiceStatus, message?: string) {
    this.status = status
    this.handlers.onStatusChange?.(status, message)
  }

  public startRecognition() {
    if (!this.isRunning || this.isMuted || this.isSpeaking || this.isProcessing) return
    if (this.isRecognitionActive) return

    console.log('[VOICE] recognition starting')

    if (!this.recognition) {
      const initialized = this.initSpeechRecognition()
      if (!initialized) {
        this.startFallbackRecorder()
        return
      }
    }

    if (this.recognition) {
      try {
        this.recognition.start()
      } catch (err: any) {
        if (err.name === 'InvalidStateError') {
          this.isRecognitionActive = true
          return
        }
        try {
          this.initSpeechRecognition()
          this.recognition?.start()
        } catch (_e) {
          this.startFallbackRecorder()
        }
      }
    }
  }

  public stopRecognition() {
    this.isRecognitionActive = false
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch (_e) {}
    }
    this.stopFallbackRecorder()
  }

  private startWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
    }
    this.watchdogInterval = setInterval(() => {
      if (
        this.isRunning &&
        !this.isMuted &&
        !this.isSpeaking &&
        !this.isProcessing &&
        this.isConversationalMode
      ) {
        if (!this.isRecognitionActive && !this.isFallbackRecording) {
          this.startRecognition()
        }
      }
    }, 1500)
  }

  /**
   * Starts fallback MediaRecorder capture when Web Speech API is absent or fails
   */
  private startFallbackRecorder() {
    if (!this.mediaStream || this.isFallbackRecording || typeof MediaRecorder === 'undefined')
      return

    try {
      const mimeTypes = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ]
      const supportedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || ''

      this.mediaRecorder = new MediaRecorder(
        this.mediaStream,
        supportedMime ? { mimeType: supportedMime } : {}
      )
      this.recordedAudioChunks = []
      this.isFallbackRecording = true
      this.vadSpeechDetected = false

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedAudioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        this.isFallbackRecording = false
        if (this.recordedAudioChunks.length === 0) return

        const audioBlob = new Blob(this.recordedAudioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm'
        })
        this.recordedAudioChunks = []

        if (!this.isRunning || this.isMuted || this.isSpeaking) return

        // Transcribe via backend /api/voice/transcribe
        await this.transcribeAudioBlob(audioBlob)
      }

      this.mediaRecorder.start(250)
      this.setStatus('listening', 'Microphone listening (neural voice recorder)...')
    } catch (err) {
      console.warn('[VOICE] MediaRecorder fallback start error:', err)
    }
  }

  private stopFallbackRecorder() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (_e) {}
    }
    this.isFallbackRecording = false
    if (this.vadSilenceTimeout) {
      clearTimeout(this.vadSilenceTimeout)
      this.vadSilenceTimeout = null
    }
  }

  /**
   * Transcribe recorded audio blob using the server Gemini transcription endpoint
   */
  private async transcribeAudioBlob(blob: Blob) {
    if (blob.size < 1000) return // Skip empty audio

    try {
      this.setStatus('processing', 'Transcribing audio speech...')
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
      })
      reader.readAsDataURL(blob)
      const base64Audio = await base64Promise

      const res = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioData: base64Audio,
          mimeType: blob.type
        })
      })

      if (res.ok) {
        const data = await res.json()
        const transcript = data.transcript?.trim()
        if (transcript) {
          console.log('[VOICE] final transcript (neural fallback):', transcript)
          this.handlers.onFinalTranscript?.(transcript)
          this.playAcousticFeedback('recognized')
          this.processUserSpeech(transcript)
          return
        }
      }
    } catch (err) {
      console.warn('[VOICE] Audio transcription error:', err)
    }

    if (this.isRunning && !this.isMuted && !this.isSpeaking) {
      this.setStatus('listening', 'Microphone active. IRIS is listening...')
      this.startFallbackRecorder()
    }
  }

  /**
   * Start microphone capture, verify tracks, and initialize audio pipeline
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true
    if (this.voiceStarting) return false

    this.voiceStarting = true

    try {
      // 1. Request microphone permission using getUserMedia
      const stream = await this.requestMicrophonePermission()
      if (!stream) {
        console.warn('[VOICE] Recognition cancelled: microphone unavailable')
        this.voiceStarting = false
        this.isRunning = false
        return false
      }

      // Cleanup prior stream if any
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop())
        this.mediaStream = null
      }

      this.mediaStream = stream
      this.isRunning = true
      this.isMuted = false
      this.isSpeaking = false
      this.isProcessing = false

      // 2. Setup AudioContext and Analyser for visual waves and VAD
      this.setupAudioAnalyser()

      // Resume AudioContext if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      // 3. Start Speech Recognition ONLY after microphone permission is granted
      if (this.isSpeechRecognitionSupported()) {
        this.startRecognition()
      } else if (this.mediaStream) {
        this.startFallbackRecorder()
      }

      // 4. Start Watchdog to ensure continuous loop
      this.startWatchdog()

      this.setStatus('listening', 'Microphone active. IRIS is listening for commands.')
      this.playAcousticFeedback('activate')

      this.voiceStarting = false
      return true
    } catch (err: any) {
      console.warn('[VOICE] microphone permission: handled fallback', err)
      this.voiceStarting = false
      this.stop()
      return false
    }
  }

  /**
   * Updates running state without creating a conflicting microphone pipeline
   */
  public setRunningState(running: boolean) {
    this.isRunning = running
    if (!running) {
      this.stop()
    }
  }

  /**
   * Stop microphone and voice pipelines
   */
  public stop() {
    this.isRunning = false
    this.voiceStarting = false
    this.isMuted = false
    this.isSpeaking = false
    this.isProcessing = false

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
      this.watchdogInterval = null
    }

    this.stopRecognition()
    this.stopSpeaking()

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close()
      } catch (_e) {}
      this.audioContext = null
    }

    console.log('[VOICE] recognition stopped')
    this.setStatus('idle', 'Microphone and Voice interface disconnected.')
  }

  /**
   * Toggle mute state
   */
  public setMuted(muted: boolean) {
    this.isMuted = muted

    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted
      })
    }

    if (muted) {
      this.stopRecognition()
      this.setStatus('muted', 'Microphone muted.')
    } else {
      if (this.isRunning && !this.isSpeaking && !this.isProcessing) {
        this.setStatus('listening', 'Microphone unmuted. IRIS is listening...')
        this.startRecognition()
      }
    }
  }

  /**
   * Live Web Audio API Analyser loop & Voice Activity Detection (VAD)
   */
  private setupAudioAnalyser() {
    if (!this.mediaStream) return

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      this.audioContext = new AudioCtx()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8
      source.connect(this.analyser)

      const bufferLength = this.analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const checkVolume = () => {
        if (!this.isRunning) return

        if (this.analyser && !this.isMuted) {
          this.analyser.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]
          }
          const avg = sum / dataArray.length
          const normalized = Math.min(avg / 128, 1)

          this.handlers.onAudioLevel?.(normalized)
          this.handlers.onFrequencyData?.(dataArray)

          // VAD for fallback recorder
          if (this.isFallbackRecording && !this.isSpeaking && !this.isProcessing) {
            if (normalized > 0.02) {
              this.vadSpeechDetected = true
              if (this.vadSilenceTimeout) {
                clearTimeout(this.vadSilenceTimeout)
                this.vadSilenceTimeout = null
              }
            } else if (this.vadSpeechDetected && !this.vadSilenceTimeout) {
              this.vadSilenceTimeout = setTimeout(() => {
                if (this.isFallbackRecording) {
                  this.stopFallbackRecorder()
                }
              }, 1000)
            }
          }
        }

        this.animFrameId = requestAnimationFrame(checkVolume)
      }

      checkVolume()
    } catch (e) {
      console.warn('[VOICE] Audio analyser setup warning:', e)
    }
  }

  /**
   * Main conversational and command handler for user speech & text
   */
  public async processUserSpeech(
    rawText: string,
    providedRequestId?: string,
    inputType: 'voice' | 'text' = 'voice'
  ) {
    const text = rawText.trim()
    if (!text) return

    console.log('[AI_INPUT]', { text, inputType })

    const requestId =
      providedRequestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    // Ensure request is processed exactly once
    if (this.processedRequestIds.has(requestId)) {
      return
    }
    this.processedRequestIds.add(requestId)
    if (this.processedRequestIds.size > 200) {
      const iter = this.processedRequestIds.values()
      const oldest = iter.next().value
      if (oldest) {
        this.processedRequestIds.delete(oldest)
      }
    }

    console.log('[AI_REQUEST_START]', { requestId, text, inputType, timestamp: Date.now() })
    this.isProcessing = true
    const userMsgId = `msg_user_${requestId}`

    // 1. Post to Conversation UI
    if (typeof window !== 'undefined' && (window as any).iris?.emitTranscript) {
      ;(window as any).iris.emitTranscript({
        id: userMsgId,
        messageId: userMsgId,
        requestId,
        role: 'user',
        text: text,
        content: text,
        timestamp: Date.now(),
        inputType,
        isFinal: true
      })
      if ((window as any).iris?.addHistory) {
        ;(window as any).iris.addHistory({
          id: userMsgId,
          messageId: userMsgId,
          requestId,
          role: 'user',
          text,
          content: text,
          timestamp: Date.now(),
          inputType
        })
      }
      console.log('[AI_STATE_UPDATED]', { requestId, role: 'user', messageId: userMsgId })
    }

    this.setStatus('processing', `AI Thinking: "${text}"`)

    try {
      console.log('[AI_REQUEST_SENT]', { requestId, text, stage: 'command_dispatch' })
      // 2. Command intent resolution with safety watchdog timeout (prevents hanging)
      const commandExecutionPromise = voiceCommandProcessor.processCommand(text, {
        navigate: (tab) => this.handlers.onNavigate?.(tab),
        setVisionMode: (mode) => this.handlers.onVisionMode?.(mode),
        setMuted: (muted) => this.setMuted(muted),
        stopSpeaking: () => this.stopSpeaking(),
        setStatusMessage: (msg) => this.setStatus(this.status, msg),
        setKnowledgeOpen: (open) => this.handlers.onKnowledgeOpen?.(open)
      })

      const timeoutWatchdogPromise = new Promise<any>((resolve) => {
        setTimeout(() => {
          resolve({
            handled: true,
            intent: 'CONVERSATIONAL_AI',
            actionExecuted: 'TIMEOUT_FALLBACK_ENGAGED',
            status: 'failed',
            spokenResponse: 'The AI request timed out. A fallback response is displayed.',
            displayText: `⚠️ **AI Service Notice:** The API execution timed out.\n\n**Fallback Mode:** I received your prompt: *" ${text} "*. You can try again or rephrase your query.`,
            isFallback: true
          })
        }, 12000)
      })

      const cmdResult = await Promise.race([commandExecutionPromise, timeoutWatchdogPromise])

      const displayText =
        cmdResult.displayText || cmdResult.spokenResponse || 'I processed your request.'
      const spokenText = cmdResult.spokenResponse || displayText
      const isFailureStatus = cmdResult.status === 'failed' || (cmdResult as any).isFallback

      console.log('[AI_RESPONSE_RECEIVED]', {
        requestId,
        handled: cmdResult.handled,
        intent: cmdResult.intent
      })
      console.log('[AI_RESPONSE_PARSED]', {
        requestId,
        displayTextLength: displayText.length,
        spokenTextLength: spokenText.length,
        intent: cmdResult.intent,
        isFailureStatus
      })

      // 3. Stream model response to conversation and speak aloud
      this.streamAndSpeakResponse(
        displayText,
        spokenText,
        requestId,
        inputType,
        isFailureStatus ? 'failed' : 'success'
      )
    } catch (err: any) {
      console.warn('[AI_REQUEST_NOTICE]', { requestId, message: err?.message || err })
      const assistantMsgId = `msg_model_${requestId}`
      const isQuota = String(err?.message || err).includes('quota') || String(err?.message || err).includes('429')
      const errorMsg = isQuota
        ? `⚠️ **AI Rate Limit Notice:** The AI model is temporarily rate limited. Your query *" ${text} "* was safely acknowledged. Please retry in a few moments.`
        : `⚠️ **AI Notice:** Processing *" ${text} "* encountered a temporary issue (${err?.message || 'Execution note'}). Standing by to assist.`
      if (typeof window !== 'undefined' && (window as any).iris?.emitTranscriptComplete) {
        ;(window as any).iris.emitTranscriptComplete({
          id: assistantMsgId,
          messageId: assistantMsgId,
          requestId,
          role: 'model',
          text: errorMsg,
          content: errorMsg,
          timestamp: Date.now(),
          inputType,
          status: 'success'
        })
        console.log('[AI_STATE_UPDATED]', { requestId, role: 'model', status: 'handled' })
      }
      this.isProcessing = false
      this.setStatus('idle', 'Ready')
      this.speak(isQuota ? 'Rate limit reached on AI model. Responding in local mode.' : 'Received your instruction. Standing by to assist.', true)
    }
  }

  /**
   * Stream response text to conversation HUD and speak aloud with TTS
   */
  private streamAndSpeakResponse(
    displayText: string,
    spokenText: string,
    requestId: string,
    inputType: 'voice' | 'text' = 'voice',
    finalStatus: 'success' | 'failed' = 'success'
  ) {
    if (typeof window === 'undefined') return

    const iris = (window as any).iris
    const assistantMsgId = `msg_model_${requestId}`

    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }

    // Stream text in responsive word chunks
    const words = displayText.split(' ')
    let i = 0

    this.activeStreamInterval = setInterval(() => {
      if (i < words.length) {
        const chunk = (i === 0 ? '' : ' ') + words[i]
        iris?.emitTranscript?.({
          id: assistantMsgId,
          messageId: assistantMsgId,
          requestId,
          role: 'model',
          text: chunk,
          chunkIndex: i,
          mode: 'delta',
          inputType,
          isFinal: false
        })
        i++
      } else {
        if (this.activeStreamInterval) {
          clearInterval(this.activeStreamInterval)
          this.activeStreamInterval = null
        }
        iris?.emitTranscriptComplete?.({
          id: assistantMsgId,
          messageId: assistantMsgId,
          requestId,
          role: 'model',
          text: displayText,
          content: displayText,
          timestamp: Date.now(),
          inputType,
          status: finalStatus
        })
        iris?.addHistory?.({
          id: assistantMsgId,
          messageId: assistantMsgId,
          requestId,
          role: 'model',
          text: displayText,
          content: displayText,
          timestamp: Date.now(),
          inputType,
          status: finalStatus
        })
        console.log('[AI_STATE_UPDATED]', {
          requestId,
          role: 'model',
          messageId: assistantMsgId,
          status: finalStatus
        })
        this.isProcessing = false
        this.setStatus('idle', 'Ready')
      }
    }, 35)

    // Clean text and speak if voice input or speech synthesis desired
    const cleanSpeech = cleanTextForSpeech(spokenText || displayText)
    if (inputType === 'voice' || this.isConversationalMode) {
      this.speak(cleanSpeech, true)
    }
  }

  /**
   * Synthesize speech using Web Speech Synthesis with chunking, natural voices,
   * and Chrome freeze protection.
   */
  public speak(text: string, notifyState: boolean = true) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    try {
      const cleaned = cleanTextForSpeech(text)
      if (!cleaned) return

      console.log(
        '[TTS] response received:',
        cleaned.substring(0, 80) + (cleaned.length > 80 ? '...' : '')
      )

      // 1. Cancel previous speech before starting new speech to prevent overlapping voices
      this.stopSpeaking()

      // 2. Temporarily pause or stop microphone recognition to avoid microphone feedback loop
      this.stopRecognition()

      // 3. Split long responses into speakable sentences/chunks (<160 chars)
      this.speechQueue = splitIntoSpeakableChunks(cleaned, 160)
      if (this.speechQueue.length === 0) return

      if (notifyState) {
        this.isSpeaking = true
        this.setStatus('speaking', 'IRIS is responding...')
        this.handlers.onSpeakingChange?.(true)
      }

      // 4. Start Chrome/Android heartbeat to prevent speech synthesis freeze
      this.startTtsHeartbeat()

      // 5. Play first chunk
      this.playNextSpeechChunk(notifyState)
    } catch (e) {
      console.warn('[TTS] speech error:', e)
      this.handleSpeechComplete(notifyState)
    }
  }

  /**
   * Sequential speech chunk player
   */
  private playNextSpeechChunk(notifyState: boolean) {
    if (this.speechQueue.length === 0) {
      this.handleSpeechComplete(notifyState)
      return
    }

    const chunk = this.speechQueue.shift()!
    try {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.rate = 1.05
      utterance.pitch = 1.0

      const bestVoice = this.getBestVoice()
      if (bestVoice) {
        utterance.voice = bestVoice
      }

      utterance.onstart = () => {
        if (this.isSpeaking) {
          console.log('[TTS] speaking started')
        }
      }

      utterance.onend = () => {
        this.currentUtterance = null
        if (this.speechQueue.length > 0) {
          this.playNextSpeechChunk(notifyState)
        } else {
          this.handleSpeechComplete(notifyState)
        }
      }

      utterance.onerror = (err) => {
        console.warn('[TTS] speech error:', err)
        this.currentUtterance = null
        if (this.speechQueue.length > 0) {
          this.playNextSpeechChunk(notifyState)
        } else {
          this.handleSpeechComplete(notifyState)
        }
      }

      this.currentUtterance = utterance

      // Android/Chrome resume check
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('[TTS] speech error:', err)
      this.handleSpeechComplete(notifyState)
    }
  }

  /**
   * Heartbeat to fix Chrome / WebKit 15-second pause bug
   */
  private startTtsHeartbeat() {
    if (this.ttsHeartbeatInterval) {
      clearInterval(this.ttsHeartbeatInterval)
    }
    this.ttsHeartbeatInterval = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        }
      }
    }, 3000)
  }

  private stopTtsHeartbeat() {
    if (this.ttsHeartbeatInterval) {
      clearInterval(this.ttsHeartbeatInterval)
      this.ttsHeartbeatInterval = null
    }
  }

  /**
   * Handles completion of full speech response and restarts conversation loop
   */
  private handleSpeechComplete(notifyState: boolean) {
    this.stopTtsHeartbeat()
    this.currentUtterance = null
    this.speechQueue = []

    if (notifyState) {
      console.log('[TTS] speaking ended')
      this.isSpeaking = false
      this.isProcessing = false
      this.handlers.onSpeakingChange?.(false)

      // Automatically return to listening in conversational mode
      if (this.isRunning && !this.isMuted && this.isConversationalMode) {
        this.setStatus('listening', 'Microphone active. IRIS is listening...')
        setTimeout(() => {
          if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
            this.startRecognition()
          }
        }, 200)
      } else if (!this.isRunning) {
        this.setStatus('idle', 'Voice core standby')
      }
    }
  }

  /**
   * Immediately halts active speech synthesis and cancels chunk queue
   */
  public stopSpeaking() {
    this.stopTtsHeartbeat()
    this.speechQueue = []
    this.currentUtterance = null

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch (_e) {}
    }

    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }

    const wasSpeaking = this.isSpeaking
    this.isSpeaking = false
    this.isProcessing = false

    if (wasSpeaking) {
      console.log('[TTS] speaking ended')
      this.handlers.onSpeakingChange?.(false)
    }

    if (this.isRunning && !this.isMuted && this.isConversationalMode) {
      this.setStatus('listening', 'Microphone active. IRIS is listening...')
      this.startRecognition()
    }
  }

  /**
   * Returns whether the voice loop or mic is currently active
   */
  public getIsConnected(): boolean {
    return this.isRunning
  }

  /**
   * Programmatically submits a prompt to the voice processor
   */
  public submitPrompt(text: string, inputType: 'voice' | 'text' = 'voice') {
    this.triggerVoiceInput(text, inputType)
  }

  /**
   * Programmatic voice or text command entry
   */
  public triggerVoiceInput(text: string, inputType: 'voice' | 'text' = 'text') {
    if (!this.isRunning) {
      this.isRunning = true
    }
    this.processUserSpeech(text, undefined, inputType)
  }
}

export const voiceService = new VoiceService()

export { VoiceRecognition, voice, sendMessageToExistingAI } from './VoiceRecognition'
