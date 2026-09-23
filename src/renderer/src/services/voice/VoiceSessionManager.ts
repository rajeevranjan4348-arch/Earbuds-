/**
 * VoiceSessionManager - Unified Production-Ready JARVIS Voice Session Engine
 * 
 * Formal Finite State Machine:
 * IDLE
 * → LISTENING_FOR_WAKE_WORD
 * → WAKE_DETECTED
 * → LISTENING
 * → PROCESSING
 * → SPEAKING
 * → INTERRUPTED
 * → IDLE
 * 
 * Rules:
 * - Centralized synchronized state snapshot.
 * - Hands-free wake word detection ("Hey JARVIS" / "JARVIS") with local matching.
 * - Real-time Voice Activity Detection (VAD) with ambient noise floor tracking.
 * - Streaming Speech-to-Text with multi-language support (English, Hindi, Hinglish).
 * - Instant barge-in: user speech while speaking immediately aborts TTS & API calls.
 * - Streaming TTS chunking with markdown/code stripping.
 * - Reusable command routing with safety confirmation layer for destructive actions.
 * - Integration with existing conversation history and TaskOrchestrator.
 * - Clean hardware release on stop/destroy.
 */

import {
  JarvisVoiceState,
  VoiceSessionState,
  VoiceSessionStateSnapshot,
  VoicePersonalityId,
  SupportedLanguage,
  VoiceTurnMessage,
  VoiceSessionConfig,
  SensitiveActionPayload
} from './VoiceTypes'
import { getPersonality } from './personalities'
import { AudioManager } from './AudioManager'
import { VoiceCommandRouter } from './VoiceCommandRouter'
import { voiceSettings, VoiceSettingsManager } from './VoiceSettings'
import { agentClientService } from '../agentClientService'

export type SessionStateListener = (state: VoiceSessionState, payload?: any) => void

export class VoiceSessionManager {
  private formalState: JarvisVoiceState = 'IDLE'
  private listeners: Set<SessionStateListener> = new Set()
  private conversationHistory: VoiceTurnMessage[] = []
  private lastSpokenAnswer: string = ''
  private activeAbortController: AbortController | null = null

  public audioManager: AudioManager
  public commandRouter: VoiceCommandRouter

  // Telemetry & Snapshot State
  private micLevel: number = 0
  private currentInterim: string = ''
  private currentFinal: string = ''
  private currentResponse: string = ''
  private errorMessage: string = ''
  private confirmationPending: SensitiveActionPayload | null = null

  // Backward-compatible config object
  private config: VoiceSessionConfig = {
    wakeWordEnabled: false,
    wakeWordPhrase: 'Hey JARVIS',
    personality: 'jarvis',
    language: 'auto',
    vadSilenceMs: 700,
    continuousConversation: true
  }

  constructor() {
    // 1. Initialize persistent settings sync
    const settings = voiceSettings.getSettings()
    this.config.wakeWordEnabled = settings.wakeWordEnabled
    this.config.wakeWordPhrase = settings.wakeWordPhrase
    this.config.personality = settings.voiceMode
    this.config.language = settings.language
    this.config.vadSilenceMs = settings.silenceTimeoutMs
    this.config.continuousConversation = settings.continuousListening

    // 2. Initialize Command Router
    this.commandRouter = new VoiceCommandRouter({
      onConfirmationRequired: (payload) => {
        this.confirmationPending = payload
        this.notify('confirmation_required', payload)
      },
      onStopSpeaking: () => {
        this.stopSpeaking()
        this.transitionTo('LISTENING')
      },
      onCloseVoiceMode: () => {
        this.stopSession()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('iris:close-voice-modal'))
        }
      },
      onRepeatLastAnswer: () => {
        if (this.lastSpokenAnswer) {
          this.audioManager.tts.speakFullResponse(this.lastSpokenAnswer)
        }
      }
    })

    // 3. Initialize Unified Audio Manager
    this.audioManager = new AudioManager({
      onWakeWordDetected: (phrase, commandTail) => {
        console.log(`[VoiceSessionManager] Wake word "${phrase}" detected!`)
        this.playWakeSound()
        this.transitionTo('WAKE_DETECTED', { phrase, commandTail })

        setTimeout(() => {
          this.transitionTo('LISTENING')
          if (commandTail && commandTail.trim().length > 1) {
            this.handleTurnSubmission(commandTail.trim())
          }
        }, 120)
      },

      onSpeechStart: () => {
        // User Barge-In: If AI is actively speaking, interrupt immediately!
        if (this.formalState === 'SPEAKING' || this.audioManager.tts.getIsSpeaking()) {
          console.log('[VoiceSessionManager] User speech barge-in detected during speaking state!')
          this.handleBargeIn()
        }
      },

      onSpeechPause: (_dur) => {},

      onSpeechEnd: () => {
        if (this.formalState === 'LISTENING' && this.currentInterim) {
          this.handleTurnSubmission(this.currentInterim)
        }
      },

      onInterimTranscript: (text) => {
        this.currentInterim = text
        // Instant barge-in if speech recognition produces text while speaking
        if (this.formalState === 'SPEAKING' && text.length > 1) {
          this.handleBargeIn()
        }
        this.notify('interim_transcript', { text })
      },

      onFinalTranscript: (text, language) => {
        this.currentInterim = ''
        this.currentFinal = text
        if (text && (this.formalState === 'LISTENING' || this.formalState === 'WAKE_DETECTED')) {
          this.handleTurnSubmission(text, language)
        }
      },

      onAudioLevel: (level) => {
        this.micLevel = level
        this.notify('audio_level', { level })
      },

      onFrequencyData: (data) => {
        this.notify('frequency_data', { data })
      },

      onSpeakingStart: () => {
        if (this.formalState === 'PROCESSING') {
          this.transitionTo('SPEAKING')
        }
      },

      onSpeakingChunk: (_chunk) => {},

      onSpeakingEnd: () => {
        if (this.formalState === 'SPEAKING') {
          if (this.config.continuousConversation) {
            this.transitionTo('LISTENING')
          } else {
            this.transitionTo('IDLE')
          }
        }
      },

      onInterrupted: () => {
        this.transitionTo('INTERRUPTED')
        setTimeout(() => {
          if (this.formalState === 'INTERRUPTED') {
            this.transitionTo('LISTENING')
          }
        }, 120)
      },

      onError: (err) => {
        this.handleError(err)
      }
    })

    // Apply initial personality and settings
    const personality = getPersonality(this.config.personality)
    this.audioManager.setPersonality(personality)
    this.audioManager.setWakeWordEnabled(this.config.wakeWordEnabled)
    this.audioManager.setLanguage(this.config.language)
  }

  // ==========================================
  // STATE MACHINE & TRANSITIONS
  // ==========================================

  public getState(): VoiceSessionState {
    // Map formal state to lowercase for existing UI components
    switch (this.formalState) {
      case 'IDLE':
        return 'idle'
      case 'LISTENING_FOR_WAKE_WORD':
      case 'WAKE_DETECTED':
      case 'LISTENING':
        return 'listening'
      case 'PROCESSING':
        return 'thinking'
      case 'SPEAKING':
        return 'speaking'
      case 'INTERRUPTED':
        return 'interrupted'
      default:
        return 'idle'
    }
  }

  public getFormalState(): JarvisVoiceState {
    return this.formalState
  }

  public getStateSnapshot(): VoiceSessionStateSnapshot {
    return {
      wakeWordEnabled: this.config.wakeWordEnabled,
      microphoneActive: this.audioManager.micManager.getIsActive(),
      vadActive: this.audioManager.vad.getIsEnabled(),
      isListening: this.formalState === 'LISTENING' || this.formalState === 'LISTENING_FOR_WAKE_WORD',
      isProcessing: this.formalState === 'PROCESSING',
      isSpeaking: this.formalState === 'SPEAKING' && this.audioManager.tts.getIsSpeaking(),
      isInterrupted: this.formalState === 'INTERRUPTED',
      partialTranscript: this.currentInterim,
      finalTranscript: this.currentFinal,
      currentResponse: this.currentResponse,
      voiceMode: this.config.personality,
      state: this.formalState,
      permissionStatus: voiceSettings.getSettings().micPermissionStatus
    }
  }

  public getConfig(): VoiceSessionConfig {
    return { ...this.config }
  }

  public getHistory(): VoiceTurnMessage[] {
    return [...this.conversationHistory]
  }

  public getMicLevel(): number {
    return this.micLevel
  }

  public getErrorMessage(): string {
    return this.errorMessage
  }

  public getPendingConfirmation(): SensitiveActionPayload | null {
    return this.confirmationPending
  }

  public subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(type: string, payload?: any) {
    const currentState = this.getState()
    for (const listener of this.listeners) {
      try {
        listener(currentState, { type, ...payload })
      } catch (err) {
        console.warn('[VoiceSessionManager] Listener exception:', err)
      }
    }
  }

  private transitionTo(newState: JarvisVoiceState, payload?: any) {
    if (this.formalState === newState) return
    console.log(`[JARVIS State Machine] ${this.formalState} → ${newState}`)
    this.formalState = newState
    this.notify('state_change', { formalState: newState, state: this.getState(), ...payload })
  }

  // ==========================================
  // BARGE-IN & INTERRUPTION
  // ==========================================

  public handleBargeIn(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }

    const wasSpeaking = this.audioManager.tts.interrupt()
    this.transitionTo('INTERRUPTED')

    setTimeout(() => {
      if (this.formalState === 'INTERRUPTED') {
        this.transitionTo('LISTENING')
      }
    }, 100)
  }

  // ==========================================
  // SESSION LIFECYCLE
  // ==========================================

  public async startSession(): Promise<boolean> {
    if (this.formalState !== 'IDLE' && this.formalState !== 'LISTENING_FOR_WAKE_WORD') {
      return true
    }

    this.errorMessage = ''
    this.notify('state_change', { state: 'requesting-permission' })

    const started = await this.audioManager.start()
    if (!started) {
      this.handleError('Failed to access microphone')
      return false
    }

    this.transitionTo('LISTENING')
    return true
  }

  public stopSession(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }

    this.audioManager.stop()
    this.currentInterim = ''
    this.currentResponse = ''
    this.transitionTo('IDLE')
  }

  public stopMicrophoneImmediately(): void {
    this.stopSession()
    this.audioManager.micManager.stop()
  }

  public toggleMute(): boolean {
    const isMuted = !this.audioManager.micManager.getIsMuted()
    this.audioManager.setMuted(isMuted)
    this.notify('mute_change', { isMuted })
    return isMuted
  }

  public isMuted(): boolean {
    return this.audioManager.micManager.getIsMuted()
  }

  public stopSpeaking(): void {
    this.audioManager.tts.stopSpeaking()
    if (this.formalState === 'SPEAKING' || this.formalState === 'PROCESSING') {
      this.transitionTo('LISTENING')
    }
  }

  // ==========================================
  // CONFIGURATION & PERSONALITY
  // ==========================================

  public setPersonality(personalityId: VoicePersonalityId) {
    this.config.personality = personalityId
    voiceSettings.updateSettings({ voiceMode: personalityId })
    const p = getPersonality(personalityId)
    this.audioManager.setPersonality(p)
    this.notify('personality_change', { personality: p })
  }

  public setLanguage(lang: SupportedLanguage) {
    this.config.language = lang
    voiceSettings.updateSettings({ language: lang })
    this.audioManager.setLanguage(lang)
    this.notify('language_change', { language: lang })
  }

  public setWakeWordEnabled(enabled: boolean) {
    this.config.wakeWordEnabled = enabled
    voiceSettings.updateSettings({ wakeWordEnabled: enabled })
    this.audioManager.setWakeWordEnabled(enabled)
    this.notify('wake_word_change', { enabled })

    if (enabled && this.formalState === 'IDLE') {
      this.startSession().then(() => {
        this.transitionTo('LISTENING_FOR_WAKE_WORD')
      })
    } else if (!enabled && this.formalState === 'LISTENING_FOR_WAKE_WORD') {
      this.transitionTo('IDLE')
      this.audioManager.stop()
    }
  }

  // ==========================================
  // CONVERSATION TURN HANDLING
  // ==========================================

  private async handleTurnSubmission(userText: string, language?: string) {
    const cleanPrompt = userText.trim()
    if (!cleanPrompt || cleanPrompt.length < 1) return

    // Add user turn to conversation history with complete metadata
    const userMsg: VoiceTurnMessage = {
      id: `turn_u_${Date.now()}`,
      role: 'user',
      text: cleanPrompt,
      timestamp: Date.now(),
      language,
      metadata: {
        inputMode: 'voice',
        wakeWord: this.config.wakeWordPhrase,
        voiceMode: this.config.personality,
        timestamp: new Date().toISOString()
      }
    }

    this.conversationHistory.push(userMsg)
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20)
    }

    this.notify('transcript_updated', { message: userMsg, history: this.conversationHistory })

    // Forward to existing conversation system
    if (typeof window !== 'undefined' && (window as any).iris?.emitTranscript) {
      ;(window as any).iris.emitTranscript({
        id: userMsg.id,
        role: 'user',
        text: cleanPrompt,
        timestamp: Date.now(),
        inputType: 'voice',
        isFinal: true
      })
    }

    // 1. Evaluate Spoken Commands via VoiceCommandRouter (Safety & Action Layer)
    const routerResult = await this.commandRouter.routeCommand(cleanPrompt, {
      onSpeakConfirmation: (msg) => {
        this.audioManager.tts.speakFullResponse(msg)
      }
    })

    if (routerResult.type === 'handled') {
      if (this.config.continuousConversation) {
        this.transitionTo('LISTENING')
      } else {
        this.transitionTo('IDLE')
      }
      return
    }

    if (routerResult.type === 'confirmation_required') {
      const confirmPrompt = `To proceed with ${routerResult.payload.title}, please say confirm or cancel.`
      this.audioManager.tts.speakFullResponse(confirmPrompt)
      return
    }

    if (routerResult.type === 'task_orchestrator') {
      this.transitionTo('PROCESSING')
      try {
        const res = await agentClientService.executeTaskOrchestrator(
          routerResult.goal,
          'voice_user',
          { source: 'voice_session_modal', rawPrompt: cleanPrompt, timestamp: Date.now() }
        )
        const completedTasks =
          res.completedTasks ||
          (res.nodes ? res.nodes.filter((n: any) => n.status === 'COMPLETED').length : 1)
        const totalTasks = res.totalTasks || (res.nodes ? res.nodes.length : completedTasks)
        const solutionText = res.solution || res.result || 'Task completed successfully.'
        const cleanSummary =
          solutionText.length > 240
            ? solutionText.substring(0, 237).replace(/\n+/g, ' ') + '...'
            : solutionText.replace(/\n+/g, ' ')

        const spokenResponse = `Task orchestrator finished across ${completedTasks} of ${totalTasks} stages. ${cleanSummary}`
        this.lastSpokenAnswer = spokenResponse

        const assistantMsg: VoiceTurnMessage = {
          id: `turn_a_${Date.now()}`,
          role: 'assistant',
          text: `🤖 **TaskOrchestrator Execution Completed**\n\n**Goal:** ${routerResult.goal}\n\n**Status:** ${res.status || 'COMPLETED'} (${completedTasks}/${totalTasks} stages)\n\n${solutionText}`,
          timestamp: Date.now()
        }
        this.conversationHistory.push(assistantMsg)
        this.notify('transcript_updated', { message: assistantMsg, history: this.conversationHistory })
        this.audioManager.tts.speakFullResponse(spokenResponse)
      } catch (err: any) {
        const errMsg = `Error running agent orchestrator: ${err?.message || 'Execution error'}`
        this.audioManager.tts.speakFullResponse(errMsg)
        this.transitionTo('LISTENING')
      }
      return
    }

    // 2. Generate conversational AI response with streaming TTS
    await this.generateAIResponse(cleanPrompt)
  }

  /**
   * Generates AI spoken response with streaming TTS and AbortController
   */
  private async generateAIResponse(prompt: string) {
    this.transitionTo('PROCESSING')

    if (this.activeAbortController) {
      this.activeAbortController.abort()
    }
    this.activeAbortController = new AbortController()

    const personality = getPersonality(this.config.personality)
    const recentHistory = this.conversationHistory.slice(-6).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }))

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.activeAbortController.signal,
        body: JSON.stringify({
          prompt,
          messages: recentHistory,
          systemInstruction: `You are ${personality.name}, an intelligent real-time conversational voice assistant. ${personality.systemInstructionModifier} Always reply in natural, articulate, concise spoken language. Avoid long markdown lists or raw URLs. If the user spoke in Hindi or Hinglish, reply naturally in Hindi or Hinglish.`
        })
      })

      if (!response.ok) {
        throw new Error(`AI service responded with HTTP ${response.status}`)
      }

      const data = await response.json()
      const answerText = data.text || data.response || data.content || 'I understand. Standing by.'
      this.lastSpokenAnswer = answerText
      this.currentResponse = answerText

      const assistantMsg: VoiceTurnMessage = {
        id: `turn_a_${Date.now()}`,
        role: 'assistant',
        text: answerText,
        timestamp: Date.now(),
        metadata: {
          inputMode: 'voice',
          voiceMode: this.config.personality,
          timestamp: new Date().toISOString()
        }
      }

      this.conversationHistory.push(assistantMsg)
      this.notify('transcript_updated', { message: assistantMsg, history: this.conversationHistory })

      // Forward to existing conversation system
      if (typeof window !== 'undefined' && (window as any).iris?.emitTranscript) {
        ;(window as any).iris.emitTranscript({
          id: assistantMsg.id,
          role: 'assistant',
          text: answerText,
          timestamp: Date.now(),
          inputType: 'voice',
          isFinal: true
        })
      }

      // Convert response progressively to speech
      this.audioManager.tts.speakFullResponse(answerText)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('[VoiceSessionManager] AI generation aborted by user.')
        return
      }
      console.warn('[VoiceSessionManager] AI generation error:', err)
      const fallback = "I'm standing by. How can I assist you?"
      this.audioManager.tts.speakFullResponse(fallback)
    } finally {
      this.activeAbortController = null
    }
  }

  // ==========================================
  // CONFIRMATION DIALOG HANDLERS
  // ==========================================

  public confirmPendingAction() {
    if (this.confirmationPending) {
      const p = this.confirmationPending
      this.confirmationPending = null
      p.onConfirm()
      this.audioManager.tts.speakFullResponse(`Confirmed and executed: ${p.title}`)
      this.notify('confirmation_resolved', { approved: true })
    }
  }

  public cancelPendingAction() {
    if (this.confirmationPending) {
      const p = this.confirmationPending
      this.confirmationPending = null
      p.onCancel()
      this.audioManager.tts.speakFullResponse('Action cancelled.')
      this.notify('confirmation_resolved', { approved: false })
    }
  }

  public clearSessionHistory(): void {
    this.conversationHistory = []
    this.currentInterim = ''
    this.currentFinal = ''
    this.currentResponse = ''
    this.notify('transcript_updated', { message: null, history: [] })
  }

  // ==========================================
  // ERROR HANDLING & RECOVERY
  // ==========================================

  private handleError(errorStr: string) {
    console.error('[VoiceSessionManager Error]', errorStr)
    this.errorMessage = errorStr
    this.audioManager.tts.stopSpeaking()
    this.notify('state_change', { state: 'error', error: errorStr })

    // Auto-recover after 2.5 seconds
    setTimeout(() => {
      this.errorMessage = ''
      this.transitionTo('IDLE')
    }, 2500)
  }

  // ==========================================
  // ACOUSTIC FEEDBACK
  // ==========================================

  private playWakeSound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12) // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.22)
    } catch (_e) {}
  }

  // Backward compatibility delegates
  public get inputService() {
    return {
      start: () => this.audioManager.start(),
      stop: () => this.audioManager.stop(),
      setMuted: (m: boolean) => this.audioManager.setMuted(m),
      setLanguage: (l: SupportedLanguage) => this.audioManager.setLanguage(l),
      setWakeWordEnabled: (w: boolean) => this.audioManager.setWakeWordEnabled(w),
      micManager: this.audioManager.micManager
    }
  }

  public get outputService() {
    return this.audioManager.tts
  }

  public get commandService() {
    return this.commandRouter
  }
}

export const voiceSessionManager = new VoiceSessionManager()
