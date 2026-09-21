/**
 * IRIS Neural Voice Core Service
 * Handles microphone audio stream, live spectrum analysis,
 * Web Speech Recognition (STT), Web Speech Synthesis (TTS),
 * and audio reactivity state.
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
  onSpeakingChange?: (isSpeaking: boolean) => void
  onNavigate?: (
    tab: 'DASHBOARD' | 'YOUTUBE' | 'WORKSPACE' | 'MAPS' | 'NOTES' | 'GALLERY' | 'PHONE' | 'SETTINGS'
  ) => void
  onVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  onKnowledgeOpen?: (open: boolean) => void
}

function cleanTextForSpeech(text: string): string {
  if (!text) return ''
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`~>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'Task completed.'
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

  public isRunning: boolean = false
  public isMuted: boolean = false
  public isSpeaking: boolean = false
  public isProcessing: boolean = false

  private status: VoiceStatus = 'idle'
  private lastProcessedTranscript: string = ''
  private lastProcessedTime: number = 0
  private processedRequestIds: Set<string> = new Set()
  private activeStreamInterval: any = null
  private speakingEndTimeout: any = null

  private selectedLanguage: string = 'en-US'

  constructor() {
    this.initSpeechRecognition()
    this.initVisibilityListener()
  }

  private initVisibilityListener() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isRunning && this.isRecognitionActive) {
        this.stopRecognition()
      } else if (
        !document.hidden &&
        this.isRunning &&
        !this.isMuted &&
        !this.isSpeaking &&
        !this.isProcessing
      ) {
        this.startRecognition()
      }
    })
  }

  public setLanguage(lang: string) {
    this.selectedLanguage = lang
    if (this.recognition) {
      this.recognition.lang = lang
    }
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.warn('[IRIS Voice] Browser Web Speech API not natively supported in this runtime.')
      return
    }

    try {
      if (this.recognition) {
        try {
          this.recognition.abort()
        } catch (_e) {}
        this.recognition = null
      }

      const rec = new SpeechRecognitionClass()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = this.selectedLanguage || 'en-US'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        this.isRecognitionActive = true
        if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
          this.setStatus('listening', 'Microphone active. IRIS is listening...')
        }
      }

      rec.onresult = (event: any) => {
        // Critical: Never capture STT while IRIS is speaking (prevents TTS feedback loop)
        if (!this.isRunning || this.isMuted || this.isSpeaking || this.isProcessing) return

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

        if (interim && !this.isSpeaking && this.handlers.onInterimTranscript) {
          this.handlers.onInterimTranscript(interim.trim())
        }

        if (final && !this.isSpeaking) {
          const cleanFinal = final.trim()
          if (cleanFinal.length > 0) {
            const now = Date.now()
            // Deduplicate: exact same transcript within 1200ms
            if (
              cleanFinal.toLowerCase() === this.lastProcessedTranscript.toLowerCase() &&
              now - this.lastProcessedTime < 1200
            ) {
              return
            }

            this.lastProcessedTranscript = cleanFinal
            this.lastProcessedTime = now

            if (this.handlers.onFinalTranscript) {
              this.handlers.onFinalTranscript(cleanFinal)
            }
            this.processUserSpeech(cleanFinal)
          }
        }
      }

      rec.onerror = (event: any) => {
        this.isRecognitionActive = false
        const err = event.error
        if (err === 'no-speech') {
          // Benign timeout from silence, auto-restart
          return
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.setStatus('denied', 'Microphone or Speech Recognition permission was denied.')
          return
        }
        if (err === 'network') {
          console.warn('[IRIS Voice] Speech recognition network service warning.')
          return
        }
        console.warn('[IRIS Voice] Speech recognition event:', err)
      }

      rec.onend = () => {
        this.isRecognitionActive = false
        // Automatically restart if session is active, unmuted, and IRIS is NOT speaking
        if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
          setTimeout(() => {
            if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
              this.startRecognition()
            }
          }, 200)
        }
      }

      this.recognition = rec
    } catch (e) {
      console.warn('[IRIS Voice] SpeechRecognition initialization error:', e)
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
    if (this.handlers.onStatusChange) {
      this.handlers.onStatusChange(status, message)
    }
  }

  public startRecognition() {
    if (!this.isRunning || this.isMuted || this.isSpeaking || this.isProcessing) return
    if (this.isRecognitionActive) return

    if (!this.recognition) {
      this.initSpeechRecognition()
    }
    if (this.recognition) {
      try {
        this.recognition.start()
      } catch (err: any) {
        if (err.name === 'InvalidStateError') {
          this.isRecognitionActive = true
          return
        }
        // Re-initialize fresh instance if failed
        try {
          this.initSpeechRecognition()
          this.recognition?.start()
        } catch (_e) {}
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
  }

  private startWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
    }
    this.watchdogInterval = setInterval(() => {
      if (this.isRunning && !this.isMuted && !this.isSpeaking && !this.isProcessing) {
        if (!this.isRecognitionActive) {
          this.startRecognition()
        }
      }
    }, 1200)
  }

  /**
   * Start microphone capture and speech recognition
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true

    this.setStatus('requesting-permission', 'Requesting microphone permission...')

    try {
      // 1. Request microphone permission
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } else {
        throw new Error('MediaDevices API not supported in this environment')
      }

      this.isRunning = true
      this.isMuted = false
      this.isSpeaking = false
      this.isProcessing = false

      // 2. Setup AudioContext and Analyser for live visual feedback
      this.setupAudioAnalyser()

      // 3. Start Speech Recognition
      this.startRecognition()

      // 4. Start Watchdog to ensure continuous listening
      this.startWatchdog()

      this.setStatus('listening', 'Microphone online. IRIS is listening for commands.')

      return true
    } catch (err: any) {
      console.warn('[IRIS Voice] Microphone access failed or denied:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.setStatus('denied', 'Microphone access denied by browser permission settings.')
      } else {
        this.setStatus('unsupported', 'Audio input hardware unavailable or restricted.')
      }
      return false
    }
  }

  /**
   * Stop microphone and speech recognition
   */
  public stop() {
    this.isRunning = false
    this.isMuted = false
    this.isSpeaking = false
    this.isProcessing = false

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
      this.watchdogInterval = null
    }

    this.stopRecognition()

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.speakingEndTimeout) {
      clearTimeout(this.speakingEndTimeout)
      this.speakingEndTimeout = null
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

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch (_e) {}
    }

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
   * Live Web Audio API Analyser loop
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

          if (this.handlers.onAudioLevel) {
            this.handlers.onAudioLevel(normalized)
          }
        }

        this.animFrameId = requestAnimationFrame(checkVolume)
      }

      checkVolume()
    } catch (e) {
      console.warn('[IRIS Voice] Audio analyser setup warning:', e)
    }
  }

  /**
   * Main conversational and command handler for user speech
   */
  public async processUserSpeech(
    rawText: string,
    providedRequestId?: string,
    inputType: 'voice' | 'text' = 'voice'
  ) {
    const text = rawText.trim()
    if (!text) return

    // Generate or use unique requestId for this conversational turn
    const requestId =
      providedRequestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    // Ensure this request is processed exactly ONCE
    if (this.processedRequestIds.has(requestId)) {
      return
    }
    this.processedRequestIds.add(requestId)
    if (this.processedRequestIds.size > 200) {
      const oldest = this.processedRequestIds.values().next()
      if (typeof oldest.value === 'string') {
        this.processedRequestIds.delete(oldest.value)
      }
    }

    this.isProcessing = true
    const userMsgId = `msg_user_${requestId}`

    // 1. Post to Conversation UI with unique ID and requestId (Voice/Text Input)
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
    }

    this.setStatus('processing', `Processing intent: "${text}"`)

    try {
      // 2. Command intent resolution via dedicated VoiceCommandProcessor
      const cmdResult = await voiceCommandProcessor.processCommand(text, {
        navigate: (tab) => this.handlers.onNavigate?.(tab),
        setVisionMode: (mode) => this.handlers.onVisionMode?.(mode),
        setMuted: (muted) => this.setMuted(muted),
        stopSpeaking: () => this.stopSpeaking(),
        setStatusMessage: (msg) => this.setStatus(this.status, msg),
        setKnowledgeOpen: (open) => this.handlers.onKnowledgeOpen?.(open)
      })

      const displayText =
        cmdResult.displayText || cmdResult.spokenResponse || 'I processed your request.'
      const spokenText = cmdResult.spokenResponse || displayText

      // 3. Stream model response to conversation and speak
      this.streamAndSpeakResponse(displayText, spokenText, requestId, inputType)
    } catch (err: any) {
      console.error('[IRIS Voice] Command processing error:', err)
      const assistantMsgId = `msg_model_${requestId}`
      const errorMsg = 'I encountered an issue processing that command. Please try again.'
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
          status: 'failed'
        })
      }
      this.speak(errorMsg, true)
    }
  }

  /**
   * Stream response text to conversation HUD and speak aloud with TTS
   */
  private streamAndSpeakResponse(
    displayText: string,
    spokenText: string,
    requestId: string,
    inputType: 'voice' | 'text' = 'voice'
  ) {
    if (typeof window === 'undefined') return

    const iris = (window as any).iris
    const assistantMsgId = `msg_model_${requestId}`

    // Clear any previously running stream
    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }

    // Stream text in small chunks for responsive feel
    const words = displayText.split(' ')
    let i = 0

    this.activeStreamInterval = setInterval(() => {
      if (i < words.length) {
        const chunk = (i === 0 ? '' : ' ') + words[i]
        if (iris?.emitTranscript) {
          iris.emitTranscript({
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
        }
        i++
      } else {
        if (this.activeStreamInterval) {
          clearInterval(this.activeStreamInterval)
          this.activeStreamInterval = null
        }
        if (iris?.emitTranscriptComplete) {
          iris.emitTranscriptComplete({
            id: assistantMsgId,
            messageId: assistantMsgId,
            requestId,
            role: 'model',
            text: displayText,
            content: displayText,
            timestamp: Date.now(),
            inputType,
            status: 'success'
          })
        }
        if (iris?.addHistory) {
          iris.addHistory({
            id: assistantMsgId,
            messageId: assistantMsgId,
            requestId,
            role: 'model',
            text: displayText,
            content: displayText,
            timestamp: Date.now(),
            inputType,
            status: 'success'
          })
        }
      }
    }, 45)

    // Synthesize Clean Speech (stripped of markdown / code blocks / URLs)
    const cleanSpeech = cleanTextForSpeech(spokenText || displayText)
    this.speak(cleanSpeech, true)
  }

  /**
   * Synthesize speech using Web Speech Synthesis
   */
  public speak(text: string, notifyState: boolean = true) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    try {
      window.speechSynthesis.cancel()

      // Pause speech recognition while speaking to completely avoid mic feedback loop
      this.stopRecognition()

      if (this.speakingEndTimeout) {
        clearTimeout(this.speakingEndTimeout)
        this.speakingEndTimeout = null
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0

      // Pick a clean English voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Alex'))
      )
      if (preferred) {
        utterance.voice = preferred
      }

      if (notifyState) {
        this.isSpeaking = true
        this.setStatus('speaking', 'IRIS is responding...')
        if (this.handlers.onSpeakingChange) {
          this.handlers.onSpeakingChange(true)
        }
      }

      let hasEnded = false
      const handleSpeechEnd = () => {
        if (hasEnded) return
        hasEnded = true

        if (this.speakingEndTimeout) {
          clearTimeout(this.speakingEndTimeout)
          this.speakingEndTimeout = null
        }

        if (notifyState) {
          this.isSpeaking = false
          this.isProcessing = false
          if (this.handlers.onSpeakingChange) {
            this.handlers.onSpeakingChange(false)
          }
          if (this.isRunning && !this.isMuted) {
            this.setStatus('listening', 'Microphone active. IRIS is listening...')
            this.startRecognition()
          }
        }
      }

      utterance.onend = handleSpeechEnd
      utterance.onerror = handleSpeechEnd

      // Safety fallback: Chrome speech synthesis sometimes drops onend event
      const approxDuration = Math.max(3000, Math.min(25000, text.length * 80))
      this.speakingEndTimeout = setTimeout(handleSpeechEnd, approxDuration)

      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.warn('[IRIS Voice] Speech synthesis error:', e)
      if (notifyState) {
        this.isSpeaking = false
        this.isProcessing = false
        if (this.handlers.onSpeakingChange) {
          this.handlers.onSpeakingChange(false)
        }
        if (this.isRunning && !this.isMuted) {
          this.setStatus('listening', 'Microphone active. IRIS is listening...')
          this.startRecognition()
        }
      }
    }
  }

  /**
   * Immediately halt active speech synthesis and audio output
   */
  public stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch (_e) {}
    }
    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }
    if (this.speakingEndTimeout) {
      clearTimeout(this.speakingEndTimeout)
      this.speakingEndTimeout = null
    }
    this.isSpeaking = false
    this.isProcessing = false
    if (this.handlers.onSpeakingChange) {
      this.handlers.onSpeakingChange(false)
    }
    if (this.isRunning && !this.isMuted) {
      this.setStatus('listening', 'Microphone active. IRIS is listening...')
      this.startRecognition()
    }
  }

  /**
   * Test or simulate voice command execution
   */
  public triggerVoiceInput(text: string, inputType: 'voice' | 'text' = 'text') {
    if (!this.isRunning) {
      this.isRunning = true
    }
    this.processUserSpeech(text, undefined, inputType)
  }
}

export const voiceService = new VoiceService()
