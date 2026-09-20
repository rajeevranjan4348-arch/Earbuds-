/**
 * IRIS Voice-to-Text & Speech Interaction Engine
 * Implements real-time microphone capture, audio analysis, Web Speech API recognition,
 * voice command execution, and speech synthesis responses.
 */

import { voiceCommandProcessor } from './voiceCommandProcessor'

export interface VoiceCommandHandlers {
  onNavigate?: (tab: 'DASHBOARD' | 'NOTES' | 'GALLERY' | 'PHONE' | 'SETTINGS') => void
  onVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  onInterimTranscript?: (text: string) => void
  onFinalTranscript?: (text: string) => void
  onSpeakingChange?: (isSpeaking: boolean) => void
  onAudioLevel?: (level: number) => void
  onStatusChange?: (status: VoiceStatus, message?: string) => void
}

export type VoiceStatus =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'denied'
  | 'unsupported'

class VoiceService {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private animFrameId: number | null = null
  private recognition: any = null
  private isRunning: boolean = false
  private isMuted: boolean = false
  private isSpeaking: boolean = false
  private isProcessing: boolean = false
  private handlers: VoiceCommandHandlers = {}
  private status: VoiceStatus = 'idle'
  private lastProcessedTranscript: string = ''
  private lastProcessedTime: number = 0
  private processedRequestIds: Set<string> = new Set()
  private activeStreamInterval: any = null
  private speakingEndTimeout: any = null

  constructor() {
    this.initSpeechRecognition()
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionClass) {
      console.warn('[IRIS Voice] Browser Web Speech API not natively supported in this runtime.')
      return
    }

    try {
      const rec = new SpeechRecognitionClass()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.maxAlternatives = 1

      rec.onstart = () => {
        if (this.isRunning && !this.isMuted && !this.isSpeaking) {
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
            // Deduplicate: same transcript within 2500ms or identical consecutive phrase is dropped
            if (
              cleanFinal.toLowerCase() === this.lastProcessedTranscript.toLowerCase() &&
              now - this.lastProcessedTime < 2500
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
        const err = event.error
        if (err === 'no-speech') {
          // Benign quiet timeout
          return
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.setStatus('denied', 'Microphone or Speech Recognition permission was denied.')
          return
        }
        if (err === 'network') {
          console.warn('[IRIS Voice] Speech recognition network service transient warning.')
          return
        }
        console.warn('[IRIS Voice] Speech recognition event:', err)
      }

      rec.onend = () => {
        // Automatically restart only if session is active, unmuted, and IRIS is NOT speaking
        if (this.isRunning && !this.isMuted && !this.isSpeaking) {
          setTimeout(() => {
            if (this.isRunning && !this.isMuted && !this.isSpeaking) {
              try {
                rec.start()
              } catch (_e) {}
            }
          }, 300)
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

      // 2. Setup AudioContext and Analyser for live visual feedback
      this.setupAudioAnalyser()

      // 3. Start Speech Recognition
      if (this.recognition) {
        try {
          this.recognition.start()
        } catch (_e) {
          // May already be started
        }
      }

      this.setStatus('listening', 'Microphone online. IRIS is listening for commands.')

      // Welcome voice confirmation from IRIS
      this.speak(
        'IRIS Neural Core online. Audio interface synchronized. Speak a command or query.',
        false
      )

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

    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (_e) {}
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }

    this.setStatus('idle', 'Voice interface in standby.')
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
      this.setStatus('muted', 'Microphone muted.')
      if (this.recognition) {
        try {
          this.recognition.stop()
        } catch (_e) {}
      }
    } else {
      this.setStatus('listening', 'Microphone active. IRIS is listening...')
      if (this.recognition && this.isRunning && !this.isSpeaking) {
        try {
          this.recognition.start()
        } catch (_e) {}
      }
    }
  }

  /**
   * Real-time audio waveform/volume analyzer
   */
  private setupAudioAnalyser() {
    if (!this.mediaStream || typeof window === 'undefined') return

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      this.audioContext = new AudioCtx()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.5
      source.connect(this.analyser)

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount)

      const checkVolume = () => {
        if (!this.isRunning || !this.analyser) return

        if (this.isMuted) {
          if (this.handlers.onAudioLevel) this.handlers.onAudioLevel(0)
        } else {
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
  public async processUserSpeech(rawText: string, providedRequestId?: string) {
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
      const iter = this.processedRequestIds.values()
      this.processedRequestIds.delete(iter.next().value)
    }

    this.isProcessing = true
    const userMsgId = `msg_user_${requestId}`

    // 1. Post to Conversation UI with unique ID and requestId
    if (typeof window !== 'undefined' && (window as any).iris?.emitTranscript) {
      ;(window as any).iris.emitTranscript({
        id: userMsgId,
        requestId,
        role: 'user',
        text: text,
        isFinal: true
      })
      if ((window as any).iris?.addHistory) {
        ;(window as any).iris.addHistory({
          id: userMsgId,
          requestId,
          role: 'user',
          text
        })
      }
    }

    this.setStatus('processing', `Processing intent: "${text}"`)

    // 2. Command intent resolution via dedicated VoiceCommandProcessor
    const cmdResult = await voiceCommandProcessor.processCommand(text, {
      navigate: (tab) => this.handlers.onNavigate?.(tab),
      setVisionMode: (mode) => this.handlers.onVisionMode?.(mode),
      setMuted: (muted) => this.setMuted(muted),
      stopSpeaking: () => this.stopSpeaking(),
      setStatusMessage: (msg) => this.setStatus(this.status, msg)
    })

    const responseText = cmdResult.spokenResponse

    // 3. Stream model response to conversation and speak
    this.streamAndSpeakResponse(responseText, requestId)
  }

  /**
   * Stream response text to conversation HUD and speak aloud with TTS
   */
  private streamAndSpeakResponse(fullText: string, requestId: string) {
    if (typeof window === 'undefined') return

    const iris = (window as any).iris
    const assistantMsgId = `msg_model_${requestId}`

    // Clear any previously running stream
    if (this.activeStreamInterval) {
      clearInterval(this.activeStreamInterval)
      this.activeStreamInterval = null
    }

    // Stream text in small chunks for high-tech terminal feel
    const words = fullText.split(' ')
    let i = 0

    this.activeStreamInterval = setInterval(() => {
      if (i < words.length) {
        const chunk = (i === 0 ? '' : ' ') + words[i]
        if (iris?.emitTranscript) {
          iris.emitTranscript({
            id: assistantMsgId,
            requestId,
            role: 'model',
            text: chunk,
            chunkIndex: i,
            mode: 'delta',
            isFinal: false
          })
        }
        i++
      } else {
        if (this.activeStreamInterval) {
          clearInterval(this.activeStreamInterval)
          this.activeStreamInterval = null
        }
        this.isProcessing = false
        if (iris?.emitTranscriptComplete) {
          iris.emitTranscriptComplete({
            id: assistantMsgId,
            requestId,
            role: 'model',
            text: fullText
          })
        }
        if (iris?.addHistory) {
          iris.addHistory({
            id: assistantMsgId,
            requestId,
            role: 'model',
            text: fullText
          })
        }
      }
    }, 45)

    // Synthesize Speech
    this.speak(fullText, true)
  }

  /**
   * Synthesize speech using Web Speech Synthesis
   */
  public speak(text: string, notifyState: boolean = true) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    try {
      window.speechSynthesis.cancel()

      // Pause speech recognition while speaking to completely avoid mic feedback loop
      if (this.recognition) {
        try {
          this.recognition.abort()
        } catch (_e) {}
      }

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

      const handleSpeechEnd = () => {
        if (notifyState) {
          // Acoustic echo buffer: wait 350ms before restarting STT
          if (this.speakingEndTimeout) clearTimeout(this.speakingEndTimeout)
          this.speakingEndTimeout = setTimeout(() => {
            this.isSpeaking = false
            if (this.handlers.onSpeakingChange) {
              this.handlers.onSpeakingChange(false)
            }
            if (this.isRunning && !this.isMuted) {
              this.setStatus('listening', 'Microphone active. IRIS is listening...')
              try {
                this.recognition?.start()
              } catch (_e) {}
            }
          }, 350)
        }
      }

      utterance.onend = handleSpeechEnd
      utterance.onerror = handleSpeechEnd

      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.warn('[IRIS Voice] Speech synthesis error:', e)
      if (notifyState) {
        this.isSpeaking = false
        if (this.handlers.onSpeakingChange) {
          this.handlers.onSpeakingChange(false)
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
    this.isSpeaking = false
    this.isProcessing = false
    if (this.handlers.onSpeakingChange) {
      this.handlers.onSpeakingChange(false)
    }
    if (this.isRunning && !this.isMuted) {
      this.setStatus('listening', 'Microphone active. IRIS is listening...')
      try {
        this.recognition?.start()
      } catch (_e) {}
    }
  }

  /**
   * Test or simulate voice command execution
   */
  public triggerVoiceInput(text: string) {
    if (!this.isRunning) {
      this.isRunning = true
    }
    this.processUserSpeech(text)
  }
}

export const voiceService = new VoiceService()
