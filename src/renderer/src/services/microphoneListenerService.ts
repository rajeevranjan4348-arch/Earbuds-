/**
 * IRIS Microphone Listener & Neural OS Command Router Service
 * (src/renderer/src/services/microphoneListenerService.ts)
 * 
 * Captures live microphone audio, processes it using a local/streaming voice-to-text model
 * (SpeechRecognition + local heuristic processor + fallback STT API), and routes recognized
 * vocal commands directly into the Iris Neural OS system pipelines.
 */

import { MicrophoneManager, microphoneManager } from './voice/MicrophoneManager'
import { SpeechRecognitionManager } from './voice/SpeechRecognitionManager'
import { voiceCommandProcessor, CommandProcessResult } from './voiceCommandProcessor'
import { voiceService } from './voiceService'
import { soundEffects } from './soundEffectsService'
import { chatHistoryService, Message } from './chatHistoryService'
import { SupportedLanguage } from './voice/VoiceTypes'

export type MicListenerStatus = 'idle' | 'initializing' | 'listening' | 'processing' | 'speaking' | 'error'

export interface MicListenerMetrics {
  level: number
  rms: number
  isSpeaking: boolean
  vadLevel: string
}

export interface MicListenerState {
  status: MicListenerStatus
  interimTranscript: string
  finalTranscript: string
  confidence: number
  language: SupportedLanguage
  lastRoutedCommand: CommandProcessResult | null
  lastRoutedAt: number | null
  errorMessage: string | null
}

type MicListenerSubscriber = (state: MicListenerState, metrics: MicListenerMetrics) => void

class MicrophoneListenerService {
  private micManager: MicrophoneManager
  private sttManager: SpeechRecognitionManager | null = null
  private subscribers: Set<MicListenerSubscriber> = new Set()

  private state: MicListenerState = {
    status: 'idle',
    interimTranscript: '',
    finalTranscript: '',
    confidence: 0,
    language: 'auto',
    lastRoutedCommand: null,
    lastRoutedAt: null,
    errorMessage: null
  }

  private metrics: MicListenerMetrics = {
    level: 0,
    rms: 0,
    isSpeaking: false,
    vadLevel: 'SILENCE'
  }

  constructor() {
    this.micManager = microphoneManager

    // Listen to hardware audio metrics
    this.micManager.onMetrics((m) => {
      this.metrics = {
        level: m.normalizedLevel,
        rms: m.rms,
        isSpeaking: m.isSpeaking,
        vadLevel: m.vadLevel
      }
      this.notify()
    })
  }

  public getState(): MicListenerState {
    return { ...this.state }
  }

  public getMetrics(): MicListenerMetrics {
    return { ...this.metrics }
  }

  public subscribe(fn: MicListenerSubscriber): () => void {
    this.subscribers.add(fn)
    fn(this.getState(), this.getMetrics())
    return () => this.subscribers.delete(fn)
  }

  private updateState(partial: Partial<MicListenerState>) {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  private notify() {
    this.subscribers.forEach((fn) => {
      try {
        fn(this.getState(), this.getMetrics())
      } catch (_e) {}
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris:mic-listener-state', {
          detail: { state: this.state, metrics: this.metrics }
        })
      )
    }
  }

  public setLanguage(lang: SupportedLanguage) {
    this.updateState({ language: lang })
    if (this.sttManager) {
      this.sttManager.setLanguage(lang)
    }
  }

  /**
   * Starts the Microphone Listener Service, initializes STT engine,
   * and listens continuously for voice commands.
   */
  public async startListening(): Promise<boolean> {
    if (this.state.status === 'listening' || this.state.status === 'initializing') {
      return true
    }

    try {
      this.updateState({
        status: 'initializing',
        errorMessage: null,
        interimTranscript: '',
        finalTranscript: ''
      })

      // 1. Request hardware microphone access
      const stream = await this.micManager.requestMicrophone()
      if (!stream || !stream.active) {
        throw new Error('Failed to activate hardware microphone stream.')
      }

      soundEffects.play('chime')

      // 2. Initialize Speech-To-Text STT Manager
      this.sttManager = new SpeechRecognitionManager(
        {
          onInterimTranscript: (text, conf) => {
            this.updateState({
              interimTranscript: text,
              confidence: conf || 85
            })
          },
          onFinalTranscript: (text, lang, conf) => {
            this.handleFinalSpeechTranscript(text, lang, conf)
          },
          onError: (err) => {
            console.warn('[MicrophoneListenerService] STT Notice:', err)
            if (this.state.status === 'listening') {
              this.updateState({ errorMessage: err })
            }
          },
          onEnd: () => {
            if (this.state.status === 'listening') {
              // Auto-keepalive restart
              setTimeout(() => {
                if (this.state.status === 'listening' && this.sttManager) {
                  this.sttManager.start(stream)
                }
              }, 300)
            }
          }
        },
        this.state.language
      )

      // 3. Start STT processing
      const started = this.sttManager.start(stream)
      if (!started) {
        throw new Error('Speech Recognition engine failed to initialize.')
      }

      this.updateState({ status: 'listening' })
      return true
    } catch (err: any) {
      console.error('[MicrophoneListenerService] Start error:', err)
      soundEffects.play('error')
      this.updateState({
        status: 'error',
        errorMessage: err?.message || 'Could not start microphone listener.'
      })
      return false
    }
  }

  /**
   * Process final STT transcripts and route commands directly to Iris Neural OS
   */
  private async handleFinalSpeechTranscript(transcriptText: string, lang?: string, confidence?: number) {
    if (!transcriptText || !transcriptText.trim()) return

    const cleanQuery = transcriptText.trim()
    this.updateState({
      finalTranscript: cleanQuery,
      interimTranscript: '',
      confidence: confidence || 92,
      status: 'processing'
    })

    const activeSessionId = chatHistoryService.getActiveSessionId()
    const reqId = `mic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const userMsgId = `msg_user_${reqId}`
    const assistantMsgId = `msg_model_${reqId}`

    // 1. Log user voice query into unified chat history
    const userMessage: Message = {
      id: userMsgId,
      messageId: userMsgId,
      conversationId: activeSessionId,
      requestId: reqId,
      role: 'user',
      mode: 'voice',
      text: cleanQuery,
      transcript: cleanQuery,
      content: cleanQuery,
      timestamp: Date.now(),
      inputType: 'voice'
    }

    try {
      chatHistoryService.addMessage(activeSessionId, userMessage)
    } catch (_e) {}

    // 2. Route command through Iris Neural OS Voice Command Processor
    try {
      const cmdResult = await voiceCommandProcessor.process(cleanQuery, {
        navigate: (tab) => window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab } })),
        setVisionMode: (mode) => window.dispatchEvent(new CustomEvent('iris:vision-mode', { detail: { mode } })),
        setMuted: (muted) => voiceService.setMuted(muted),
        stopSpeaking: () => voiceService.stopSpeaking()
      })

      if (cmdResult && cmdResult.handled) {
        soundEffects.play('pop')
        const spoken = cmdResult.spokenResponse || cmdResult.response || 'Iris Neural OS command executed.'

        this.updateState({
          lastRoutedCommand: cmdResult,
          lastRoutedAt: Date.now(),
          status: 'speaking'
        })

        // Save assistant response to chat history
        const assistantMessage: Message = {
          id: assistantMsgId,
          messageId: assistantMsgId,
          conversationId: activeSessionId,
          requestId: reqId,
          role: 'assistant',
          mode: 'voice',
          text: spoken,
          content: spoken,
          timestamp: Date.now(),
          provider: 'iris-neural-os'
        }
        chatHistoryService.addMessage(activeSessionId, assistantMessage)

        // Speak response using voice synthesis
        await voiceService.speak(spoken)
        this.updateState({ status: 'listening' })
        return
      }
    } catch (routeErr) {
      console.warn('[MicrophoneListenerService] Routing notice:', routeErr)
    }

    // 3. Fallback to Iris AI Core Chat endpoint for conversational queries
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanQuery,
          sessionId: activeSessionId,
          mode: 'voice'
        })
      })

      if (response.ok) {
        const data = await response.json()
        const aiText = data.text || data.response || 'I processed your query.'

        const assistantMessage: Message = {
          id: assistantMsgId,
          messageId: assistantMsgId,
          conversationId: activeSessionId,
          requestId: reqId,
          role: 'assistant',
          mode: 'voice',
          text: aiText,
          content: aiText,
          timestamp: Date.now(),
          provider: 'gemini-3.7-flash'
        }
        chatHistoryService.addMessage(activeSessionId, assistantMessage)

        this.updateState({ status: 'speaking' })
        await voiceService.speak(aiText)
      }
    } catch (err: any) {
      console.error('[MicrophoneListenerService] AI processing error:', err)
    } finally {
      this.updateState({ status: 'listening' })
    }
  }

  /**
   * Stop the Microphone Listener Service and release hardware audio
   */
  public stopListening() {
    if (this.sttManager) {
      this.sttManager.stop()
      this.sttManager = null
    }

    this.micManager.stop()
    soundEffects.play('click')

    this.updateState({
      status: 'idle',
      interimTranscript: '',
      errorMessage: null
    })
  }

  public toggleListening(): Promise<boolean> {
    if (this.state.status === 'listening' || this.state.status === 'initializing') {
      this.stopListening()
      return Promise.resolve(false)
    } else {
      return this.startListening()
    }
  }
}

export const microphoneListenerService = new MicrophoneListenerService()
export default microphoneListenerService
