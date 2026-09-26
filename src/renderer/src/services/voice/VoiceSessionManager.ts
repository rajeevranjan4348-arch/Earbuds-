/**
 * VoiceSessionManager - Unified Production-Ready JARVIS Voice Session Engine
 *
 * Implements deterministic 17-state finite state machine:
 * IDLE -> PERMISSION_REQUIRED -> REQUESTING_PERMISSION -> READY -> LISTENING ->
 * USER_SPEAKING -> PROCESSING_AUDIO -> TRANSCRIBING -> TRANSCRIPT_READY ->
 * THINKING -> TOOL_EXECUTION -> GENERATING -> SPEAKING -> PAUSED -> ERROR ->
 * CANCELLED -> ENDED
 *
 * Capabilities:
 * - Centralized state validation (zero contradictory states: e.g. cannot speak and listen simultaneously)
 * - True RMS/Peak audio metrics & VAD level detection
 * - Streaming Speech-to-Text with multi-lingual (Hindi/Hinglish/English) support
 * - Instant Barge-in: user speech or mic tap immediately halts TTS and model streams
 * - AI Input Pipeline: transcript normalization, intent detection, chained commands, planning
 * - Tool Router integration: visual tool execution statuses
 * - Push-to-Talk and Continuous Conversation modes
 * - Clean hardware track release & leak prevention
 */

import {
  JarvisVoiceState,
  VoiceSessionState,
  VoiceSessionStateSnapshot,
  VoicePersonalityId,
  SupportedLanguage,
  VoiceTurnMessage,
  VoiceSessionConfig,
  SensitiveActionPayload,
  VoiceState,
  ThinkingStatus,
  AudioMetrics
} from './VoiceTypes'
import { getPersonality } from './personalities'
import { AudioManager } from './AudioManager'
import { VoiceCommandRouter } from './VoiceCommandRouter'
import { voiceSettings } from './VoiceSettings'
import { agentClientService } from '../agentClientService'
import { voiceTranscriptStorage } from './VoiceTranscriptStorage'
import { chatHistoryService } from '../chatHistoryService'
import { aiInputPipeline } from './AIInputPipeline'
import { responseStreamManager } from './ResponseStreamManager'

export type SessionStateListener = (state: VoiceSessionState, payload?: any) => void

export class VoiceSessionManager {
  private formalState: JarvisVoiceState = 'IDLE'
  private canonicalVoiceState: VoiceState = 'idle'
  private listeners: Set<SessionStateListener> = new Set()
  private conversationHistory: VoiceTurnMessage[] = []
  private lastSpokenAnswer: string = ''
  private activeAbortController: AbortController | null = null
  private activeStorageSessionId: string | null = null

  public audioManager: AudioManager
  public commandRouter: VoiceCommandRouter

  // Telemetry & Snapshot State
  private micLevel: number = 0
  private audioMetrics: AudioMetrics = {
    rms: 0,
    peak: 0,
    normalizedLevel: 0,
    isSpeaking: false,
    silenceDuration: 0,
    speechDuration: 0,
    vadLevel: 'SILENCE'
  }
  private currentInterim: string = ''
  private currentFinal: string = ''
  private currentResponse: string = ''
  private transcriptConfidence: number = 0
  private currentThinkingStatus: ThinkingStatus | string = 'Thinking...'
  private currentActiveTool: string = ''
  private errorMessage: string = ''
  private confirmationPending: SensitiveActionPayload | null = null
  private pushToTalkActive: boolean = false
  private continuousMode: boolean = false

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
    const settings = voiceSettings.getSettings()
    this.config.wakeWordEnabled = settings.wakeWordEnabled
    this.config.wakeWordPhrase = settings.wakeWordPhrase
    this.config.personality = settings.voiceMode
    this.config.language = settings.language
    this.config.vadSilenceMs = settings.silenceTimeoutMs
    this.config.continuousConversation = settings.continuousListening
    this.continuousMode = settings.continuousListening

    // Initialize Command Router
    this.commandRouter = new VoiceCommandRouter({
      onConfirmationRequired: (payload) => {
        this.confirmationPending = payload
        this.notify('confirmation_required', payload)
      },
      onStopSpeaking: () => {
        this.stopSpeaking()
        this.transitionToCanonical('listening')
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

    // Initialize Unified Audio Manager
    this.audioManager = new AudioManager({
      onWakeWordDetected: (phrase, commandTail) => {
        console.log(`[VoiceSessionManager] Wake word "${phrase}" detected!`)
        this.playWakeSound()
        this.transitionToCanonical('listening', { phrase, commandTail })

        setTimeout(() => {
          if (commandTail && commandTail.trim().length > 1) {
            this.handleTurnSubmission(commandTail.trim())
          }
        }, 120)
      },

      onSpeechStart: () => {
        // Instant Barge-In: If AI is speaking or generating, immediately interrupt!
        if (this.canonicalVoiceState === 'speaking' || this.canonicalVoiceState === 'generating') {
          console.log('[VoiceSessionManager] Barge-in detected during AI speech!')
          this.handleBargeIn()
          return
        }

        if (this.canonicalVoiceState === 'listening' || this.canonicalVoiceState === 'ready') {
          this.transitionToCanonical('user_speaking')
        }
      },

      onSpeechPause: (_dur) => {},

      onSpeechEnd: () => {
        if (this.canonicalVoiceState === 'user_speaking') {
          this.transitionToCanonical('processing_audio')
          if (this.currentInterim) {
            this.handleTurnSubmission(this.currentInterim)
          }
        }
      },

      onInterimTranscript: (text, confidence) => {
        this.currentInterim = text
        if (confidence !== undefined) {
          this.transcriptConfidence = confidence
        }

        const lowerText = text.trim().toLowerCase()

        // Barge-in check: If AI is speaking or generating and user speaks or says "stop"
        if (
          (this.canonicalVoiceState === 'speaking' || this.canonicalVoiceState === 'generating') &&
          (text.trim().length > 0 || lowerText.includes('stop') || lowerText.includes('quiet') || lowerText.includes('halt'))
        ) {
          console.log('[VoiceSessionManager] Immediate barge-in / stop keyword detected:', text)
          this.handleBargeIn()
          return
        }

        if (this.canonicalVoiceState === 'listening' || this.canonicalVoiceState === 'ready') {
          this.transitionToCanonical('user_speaking', { interimText: text, confidence: this.transcriptConfidence })
        } else {
          this.notify('interim_transcript', { text, confidence: this.transcriptConfidence })
        }
      },

      onFinalTranscript: (text, language, confidence) => {
        this.currentInterim = ''
        this.currentFinal = text
        if (confidence !== undefined) {
          this.transcriptConfidence = confidence
        }
        if (text) {
          this.transitionToCanonical('transcribing', { finalText: text, language, confidence: this.transcriptConfidence })
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
        this.transitionToCanonical('speaking')
      },

      onSpeakingChunk: (_chunk) => {},

      onSpeakingEnd: () => {
        this.transitionToCanonical('ended')

        if (this.continuousMode || this.config.continuousConversation) {
          setTimeout(() => {
            if (this.canonicalVoiceState === 'ended' || this.canonicalVoiceState === 'idle') {
              this.transitionToCanonical('listening')
            }
          }, 450)
        } else {
          setTimeout(() => {
            if (this.canonicalVoiceState === 'ended') {
              this.transitionToCanonical('idle')
            }
          }, 350)
        }
      },

      onInterrupted: () => {
        this.transitionToCanonical('cancelled')
        setTimeout(() => {
          this.transitionToCanonical('listening')
        }, 120)
      },

      onError: (err) => {
        this.handleError(err)
      }
    })

    // Listen to real-time audio metrics from MicrophoneManager
    this.audioManager.micManager.onMetrics((metrics) => {
      this.audioMetrics = metrics
      // Barge-in check on significant mic audio activity while speaking or generating
      if (
        (this.canonicalVoiceState === 'speaking' || this.canonicalVoiceState === 'generating') &&
        (metrics.isSpeaking || metrics.normalizedLevel > 0.12)
      ) {
        console.log('[VoiceSessionManager] Significant mic activity detected during AI speech! Initiating barge-in.')
        this.handleBargeIn()
        return
      }
      if (this.canonicalVoiceState === 'listening' && metrics.isSpeaking) {
        this.transitionToCanonical('user_speaking')
      }
    })

    const personality = getPersonality(this.config.personality)
    this.audioManager.setPersonality(personality)
    this.audioManager.setWakeWordEnabled(this.config.wakeWordEnabled)
    this.audioManager.setLanguage(this.config.language)
  }

  // ==========================================
  // CENTRAL DETERMINISTIC STATE TRANSITIONS
  // ==========================================

  public getVoiceState(): VoiceState {
    return this.canonicalVoiceState
  }

  public getState(): VoiceSessionState {
    // Backward compatibility for existing UI
    switch (this.canonicalVoiceState) {
      case 'idle':
        return 'idle'
      case 'permission_required':
      case 'requesting_permission':
        return 'requesting-permission'
      case 'ready':
      case 'listening':
      case 'user_speaking':
      case 'processing_audio':
        return 'listening'
      case 'transcribing':
      case 'transcript_ready':
      case 'thinking':
      case 'tool_execution':
      case 'generating':
        return 'thinking'
      case 'speaking':
        return 'speaking'
      case 'paused':
        return 'idle'
      case 'error':
        return 'error'
      case 'cancelled':
      case 'ended':
        return 'interrupted'
      default:
        return 'idle'
    }
  }

  public getFormalState(): JarvisVoiceState {
    return this.formalState
  }

  /**
   * Deterministic state transition with strict validation:
   * Prevents contradictory states (e.g. listening while speaking).
   */
  public transitionToCanonical(nextState: VoiceState, payload?: any) {
    if (this.canonicalVoiceState === nextState) return

    // State invariants
    if (nextState === 'speaking') {
      // Microphone must not be actively broadcasting user input while AI speaks
      this.currentInterim = ''
    } else if (nextState === 'listening' || nextState === 'user_speaking') {
      // AI TTS must be stopped when user speaks
      if (this.audioManager.tts.getIsSpeaking()) {
        this.audioManager.tts.stopSpeaking()
      }
    }

    const prevState = this.canonicalVoiceState
    this.canonicalVoiceState = nextState

    // Map to formalState legacy enum
    switch (nextState) {
      case 'idle':
        this.formalState = 'IDLE'
        break
      case 'ready':
      case 'listening':
      case 'user_speaking':
        this.formalState = 'LISTENING'
        break
      case 'processing_audio':
      case 'transcribing':
      case 'transcript_ready':
      case 'thinking':
      case 'tool_execution':
      case 'generating':
        this.formalState = 'PROCESSING'
        break
      case 'speaking':
        this.formalState = 'SPEAKING'
        break
      case 'cancelled':
      case 'ended':
        this.formalState = 'INTERRUPTED'
        break
      default:
        this.formalState = 'IDLE'
    }

    console.log(`[Voice State Machine] ${prevState} → ${nextState}`)
    this.notify('state_change', {
      voiceState: nextState,
      state: this.getState(),
      formalState: this.formalState,
      ...payload
    })
  }

  public getStateSnapshot(): VoiceSessionStateSnapshot {
    return {
      voiceState: this.canonicalVoiceState,
      state: this.formalState,
      wakeWordEnabled: this.config.wakeWordEnabled,
      microphoneActive: this.audioManager.micManager.isMicrophoneActive(),
      vadActive: this.audioManager.vad.getIsEnabled(),
      isListening:
        this.canonicalVoiceState === 'listening' ||
        this.canonicalVoiceState === 'user_speaking' ||
        this.canonicalVoiceState === 'ready',
      isProcessing:
        this.canonicalVoiceState === 'thinking' ||
        this.canonicalVoiceState === 'tool_execution' ||
        this.canonicalVoiceState === 'generating' ||
        this.canonicalVoiceState === 'processing_audio' ||
        this.canonicalVoiceState === 'transcribing',
      isSpeaking:
        this.canonicalVoiceState === 'speaking' && this.audioManager.tts.getIsSpeaking(),
      isInterrupted: this.canonicalVoiceState === 'cancelled',
      partialTranscript: this.currentInterim,
      finalTranscript: this.currentFinal,
      transcriptConfidence: this.transcriptConfidence,
      currentResponse: this.currentResponse,
      voiceMode: this.config.personality,
      permissionStatus: voiceSettings.getSettings().micPermissionStatus,
      thinkingStatus: this.currentThinkingStatus,
      activeTool: this.currentActiveTool,
      continuousMode: this.continuousMode,
      pushToTalkActive: this.pushToTalkActive
    }
  }

  // ==========================================
  // PUSH-TO-TALK & CONTINUOUS VOICE MODE
  // ==========================================

  public async startPushToTalk(): Promise<boolean> {
    this.pushToTalkActive = true
    if (this.canonicalVoiceState === 'speaking') {
      this.handleBargeIn()
    }
    await this.startSession()
    this.transitionToCanonical('listening')
    return true
  }

  public stopPushToTalk(): void {
    this.pushToTalkActive = false
    if (this.currentInterim) {
      this.transitionToCanonical('processing_audio')
      this.handleTurnSubmission(this.currentInterim)
    } else {
      this.transitionToCanonical('idle')
    }
  }

  public setContinuousMode(enabled: boolean): void {
    this.continuousMode = enabled
    this.config.continuousConversation = enabled
    voiceSettings.updateSettings({ continuousListening: enabled })
    this.notify('continuous_mode_change', { continuousMode: enabled })
  }

  public getContinuousMode(): boolean {
    return this.continuousMode
  }

  // ==========================================
  // BARGE-IN & INTERRUPTION
  // ==========================================

  public handleBargeIn(): void {
    responseStreamManager.abortCurrentStream()

    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }

    // Call TextToSpeechManager stop() immediately
    this.audioManager.tts.stop()
    this.transitionToCanonical('listening')
  }

  // ==========================================
  // SESSION LIFECYCLE
  // ==========================================

  public async startSession(): Promise<boolean> {
    this.errorMessage = ''
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }

    if (!this.activeStorageSessionId) {
      this.activeStorageSessionId = chatHistoryService.getActiveSessionId()
    }

    // Hydrate conversationHistory from active unified chat session to maintain complete continuity between text & voice
    if (this.conversationHistory.length === 0 && this.activeStorageSessionId) {
      const activeSession = chatHistoryService.getActiveSession(this.activeStorageSessionId)
      if (activeSession && Array.isArray(activeSession.messages) && activeSession.messages.length > 0) {
        this.conversationHistory = activeSession.messages.map((m) => ({
          id: m.id,
          role: m.role === 'model' || m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          text: m.text || m.content || m.transcript || '',
          timestamp: m.timestamp || Date.now(),
          language: 'auto',
          metadata: {
            inputMode: m.mode || (m.inputType === 'voice' ? 'voice' : 'text'),
            timestamp: new Date(m.timestamp || Date.now()).toISOString()
          }
        }))
        this.notify('transcript_updated', { history: this.conversationHistory })
      }
    }

    // Check permission state first
    const permState = await this.audioManager.micManager.getPermissionState()
    if (permState === 'denied') {
      this.transitionToCanonical('permission_required')
      this.handleError('Microphone permission was denied. Allow microphone access in your browser/app settings and try again.')
      return false
    }

    this.transitionToCanonical('requesting_permission')

    const started = await this.audioManager.start()
    if (!started) {
      this.transitionToCanonical('permission_required')
      this.handleError('Microphone access is required for voice chat.')
      return false
    }

    this.transitionToCanonical('ready')
    setTimeout(() => {
      if (this.canonicalVoiceState === 'ready') {
        this.transitionToCanonical('listening')
      }
    }, 100)

    return true
  }

  public stopSession(): void {
    responseStreamManager.abortCurrentStream()

    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }

    this.audioManager.stop()
    this.currentInterim = ''
    this.currentResponse = ''
    this.errorMessage = ''
    this.transitionToCanonical('idle')
  }

  public submitManualPrompt(text: string): void {
    if (!text || !text.trim()) return
    this.handleTurnSubmission(text.trim())
  }

  public stopMicrophoneImmediately(): void {
    this.stopSession()
    this.audioManager.micManager.stop()
  }

  public toggleMute(): boolean {
    const isMuted = !this.audioManager.micManager.isMute()
    this.audioManager.setMuted(isMuted)
    this.notify('mute_change', { isMuted })
    return isMuted
  }

  public isMuted(): boolean {
    return this.audioManager.micManager.isMute()
  }

  public stopSpeaking(): void {
    this.audioManager.tts.stopSpeaking()
    if (this.canonicalVoiceState === 'speaking' || this.canonicalVoiceState === 'generating') {
      this.transitionToCanonical('listening')
    }
  }

  public async sendTextMessage(text: string): Promise<void> {
    await this.handleTurnSubmission(text, 'en')
  }

  // ==========================================
  // CONVERSATION TURN HANDLING & AI PIPELINE
  // ==========================================

  private async handleTurnSubmission(userText: string, language?: string) {
    const rawPrompt = userText.trim()
    if (!rawPrompt || rawPrompt.length < 1) return

    // 1. Transcript Normalization & Language Detection
    const normalizedPrompt = aiInputPipeline.normalizeInput(rawPrompt)
    const detectedLang = language || aiInputPipeline.detectLanguage(normalizedPrompt)

    this.transitionToCanonical('transcript_ready', {
      rawPrompt,
      normalizedPrompt,
      language: detectedLang
    })

    // Record user turn in conversation history
    const userMsg: VoiceTurnMessage = {
      id: `turn_u_${Date.now()}`,
      role: 'user',
      text: normalizedPrompt,
      timestamp: Date.now(),
      language: detectedLang,
      metadata: {
        rawTranscript: rawPrompt,
        inputMode: this.pushToTalkActive ? 'push_to_talk' : 'voice',
        wakeWord: this.config.wakeWordPhrase,
        voiceMode: this.config.personality,
        timestamp: new Date().toISOString()
      }
    }

    this.conversationHistory.push(userMsg)
    if (this.conversationHistory.length > 30) {
      this.conversationHistory = this.conversationHistory.slice(-30)
    }

    const savedSession = voiceTranscriptStorage.recordTurn(this.activeStorageSessionId, userMsg, {
      personality: this.config.personality,
      language: this.config.language
    })
    this.activeStorageSessionId = savedSession.id

    this.notify('transcript_updated', { message: userMsg, history: this.conversationHistory })

    if (typeof window !== 'undefined' && (window as any).iris?.emitTranscript) {
      ;(window as any).iris.emitTranscript({
        id: userMsg.id,
        role: 'user',
        text: normalizedPrompt,
        timestamp: Date.now(),
        inputType: 'voice',
        isFinal: true
      })
    }

    // 2. Intent Detection & Command Parsing
    const parsedCommand = aiInputPipeline.parseCommand(normalizedPrompt)
    const plan = aiInputPipeline.planExecution(parsedCommand, normalizedPrompt)

    // Check for missing parameter clarification
    if (plan.needsClarification && plan.clarificationQuestion) {
      this.transitionToCanonical('speaking')
      this.audioManager.tts.speakFullResponse(plan.clarificationQuestion)
      return
    }

    // 3. Command Safety & VoiceCommandRouter
    const routerResult = await this.commandRouter.routeCommand(normalizedPrompt, {
      onSpeakConfirmation: (msg) => {
        this.audioManager.tts.speakFullResponse(msg)
      }
    })

    if (routerResult.type === 'handled') {
      if (this.continuousMode) {
        this.transitionToCanonical('listening')
      } else {
        this.transitionToCanonical('idle')
      }
      return
    }

    if (routerResult.type === 'confirmation_required') {
      const confirmPrompt = `To proceed with ${routerResult.payload.title}, please say confirm or cancel.`
      this.audioManager.tts.speakFullResponse(confirmPrompt)
      return
    }

    if (routerResult.type === 'task_orchestrator') {
      this.transitionToCanonical('tool_execution', {
        tool: 'task_orchestrator',
        status: `Executing ${routerResult.goal}...`
      })
      try {
        const res = await agentClientService.executeTaskOrchestrator(
          routerResult.goal,
          'voice_user',
          { source: 'voice_session_modal', rawPrompt: normalizedPrompt, timestamp: Date.now() }
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

        const spokenResponse = `Task finished across ${completedTasks} of ${totalTasks} stages. ${cleanSummary}`
        this.lastSpokenAnswer = spokenResponse

        const assistantMsg: VoiceTurnMessage = {
          id: `turn_a_${Date.now()}`,
          role: 'assistant',
          text: `🤖 **Task Execution Completed**\n\n**Goal:** ${routerResult.goal}\n\n**Status:** ${res.status || 'COMPLETED'} (${completedTasks}/${totalTasks} stages)\n\n${solutionText}`,
          timestamp: Date.now()
        }
        this.conversationHistory.push(assistantMsg)
        voiceTranscriptStorage.recordTurn(this.activeStorageSessionId, assistantMsg, {
          personality: this.config.personality,
          language: this.config.language
        })
        this.notify('transcript_updated', {
          message: assistantMsg,
          history: this.conversationHistory
        })
        this.audioManager.tts.speakFullResponse(spokenResponse)
      } catch (err: any) {
        const errMsg = `Error running agent task: ${err?.message || 'Execution error'}`
        this.audioManager.tts.speakFullResponse(errMsg)
        this.transitionToCanonical('listening')
      }
      return
    }

    // 4. Generate Conversational AI Response with Context & Memory
    await this.generateAIResponse(normalizedPrompt, plan)
  }

  /**
   * Generates AI response with thinking status, context injection, and streaming
   */
  private async generateAIResponse(prompt: string, plan?: any) {
    const rawTool = plan?.steps?.[0]?.tool
    let statusLabel = plan?.steps?.[0]?.statusDescription || 'Thinking...'

    if (rawTool) {
      this.currentActiveTool = rawTool
      statusLabel = rawTool.toLowerCase().includes('search')
        ? 'Searching...'
        : rawTool.toLowerCase().includes('rag') || rawTool.toLowerCase().includes('code')
        ? 'Processing codebase...'
        : rawTool.toLowerCase().includes('map')
        ? 'Locating on map...'
        : `Executing ${rawTool}...`
      this.currentThinkingStatus = statusLabel
      this.transitionToCanonical('tool_execution', {
        activeTool: this.currentActiveTool,
        thinkingStatus: statusLabel
      })
    } else {
      const lowerPrompt = prompt.toLowerCase()
      if (lowerPrompt.includes('search') || lowerPrompt.includes('find') || lowerPrompt.includes('google') || lowerPrompt.includes('latest')) {
        statusLabel = 'Searching...'
      } else if (lowerPrompt.includes('file') || lowerPrompt.includes('code') || lowerPrompt.includes('repo')) {
        statusLabel = 'Processing...'
      } else {
        statusLabel = 'Thinking...'
      }
      this.currentThinkingStatus = statusLabel
      this.transitionToCanonical('thinking', { thinkingStatus: statusLabel })
    }

    if (this.activeAbortController) {
      this.activeAbortController.abort()
    }
    this.activeAbortController = new AbortController()

    const personality = getPersonality(this.config.personality)
    const recentHistory = this.conversationHistory.slice(-6).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
      text: m.text
    }))

    // Build context with memory
    const { systemInstruction } = await aiInputPipeline.buildContext(prompt, recentHistory as any)

    try {
      this.currentThinkingStatus = 'Generating...'
      this.transitionToCanonical('generating', { thinkingStatus: 'Generating...' })

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.activeAbortController.signal,
        body: JSON.stringify({
          prompt,
          conversationHistory: recentHistory,
          messages: recentHistory,
          systemInstruction: `${systemInstruction}\n\nPersonality: ${personality.name} (${personality.title}). ${personality.systemInstructionModifier} Always reply concisely in spoken language.`
        })
      })

      if (!response.ok) {
        throw new Error(`AI service responded with HTTP ${response.status}`)
      }

      const data = await response.json()
      const answerText = data.text || data.response || data.content || 'I understand. Standing by.'
      this.lastSpokenAnswer = answerText
      this.currentResponse = answerText

      const cleanSpoken = responseStreamManager.cleanTextForSpeech(answerText)

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
      voiceTranscriptStorage.recordTurn(this.activeStorageSessionId, assistantMsg, {
        personality: this.config.personality,
        language: this.config.language
      })
      this.notify('transcript_updated', {
        message: assistantMsg,
        history: this.conversationHistory
      })

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

      // Transition to speaking and output TTS
      this.transitionToCanonical('speaking')
      this.audioManager.tts.speakFullResponse(cleanSpoken)
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('[VoiceSessionManager] AI generation aborted by user.')
        this.transitionToCanonical('cancelled')
        return
      }

      console.warn('[VoiceSessionManager] AI generation error:', err)
      const fallback = "I'm standing by. How can I assist you?"
      this.lastSpokenAnswer = fallback
      this.currentResponse = fallback

      const fallbackMsg: VoiceTurnMessage = {
        id: `turn_a_${Date.now()}`,
        role: 'assistant',
        text: fallback,
        timestamp: Date.now(),
        metadata: {
          inputMode: 'voice',
          voiceMode: this.config.personality,
          timestamp: new Date().toISOString()
        }
      }

      this.conversationHistory.push(fallbackMsg)
      voiceTranscriptStorage.recordTurn(this.activeStorageSessionId, fallbackMsg, {
        personality: this.config.personality,
        language: this.config.language
      })
      this.notify('transcript_updated', { message: fallbackMsg, history: this.conversationHistory })

      this.transitionToCanonical('speaking')
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

  public getHistory(): VoiceTurnMessage[] {
    return [...this.conversationHistory]
  }

  public getActiveStorageSessionId(): string | null {
    return this.activeStorageSessionId
  }

  public clearCurrentSessionHistory(): void {
    this.conversationHistory = []
    this.activeStorageSessionId = null
    this.notify('transcript_updated', { history: [] })
  }

  public loadHistoricalSession(messages: VoiceTurnMessage[], sessionId?: string): void {
    this.conversationHistory = [...messages]
    this.activeStorageSessionId = sessionId || null
    if (sessionId) {
      chatHistoryService.setActiveSessionId(sessionId)
    }
    this.notify('transcript_updated', { history: this.conversationHistory })
  }

  public getMicLevel(): number {
    return this.micLevel
  }

  public getAudioMetrics(): AudioMetrics {
    return { ...this.audioMetrics }
  }

  public getErrorMessage(): string {
    return this.errorMessage
  }

  public getPendingConfirmation(): SensitiveActionPayload | null {
    return this.confirmationPending
  }

  public getConfig(): VoiceSessionConfig {
    return { ...this.config }
  }

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
        listener(currentState, {
          type,
          voiceState: this.canonicalVoiceState,
          ...payload
        })
      } catch (err) {
        console.warn('[VoiceSessionManager] Listener exception:', err)
      }
    }
  }

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

      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.15)
      setTimeout(() => ctx.close().catch(() => {}), 200)
    } catch (_e) {}
  }

  private handleError(errorStr: string) {
    const isPermissionError =
      errorStr.toLowerCase().includes('permission') ||
      errorStr.toLowerCase().includes('denied') ||
      errorStr.toLowerCase().includes('not allowed')

    if (isPermissionError) {
      voiceSettings.setMicPermissionStatus('denied')
      this.transitionToCanonical('permission_required', { error: errorStr })
    } else {
      this.transitionToCanonical('error', { error: errorStr })
    }

    this.errorMessage = errorStr
    this.audioManager.tts.stopSpeaking()
  }
}

export const voiceSessionManager = new VoiceSessionManager()
