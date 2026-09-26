/**
 * Voice Chat Integration
 * Integrates Voice Chat with the Unified Conversation Service
 * Ensures voice transcripts are saved to the shared chat history
 */

import { unifiedConversationService, MessageMode, MessageState } from './unifiedConversationService'
import { chatHistoryService } from './chatHistoryService'

// ============================================================================
// Voice Chat State
// ============================================================================

/**
 * Voice Chat State
 * Tracks the current state of voice chat
 */
export interface VoiceChatState {
  isListening: boolean
  isSpeaking: boolean
  isProcessing: boolean
  currentTranscript: string
  interimTranscript: string
  conversationId: string | null
  messageId: string | null
  status: MessageState
  error: string | null
}

/**
 * Voice Chat Configuration
 */
export interface VoiceChatConfig {
  autoStartListening: boolean
  autoSpeakResponse: boolean
  continuousListening: boolean
  language: string
  voiceRate: number
  voicePitch: number
}

// ============================================================================
// Voice Chat Integration Service
// ============================================================================

/**
 * Voice Chat Integration Service
 * Handles the integration between Voice Chat and the Unified Conversation Service
 * Ensures all voice interactions are saved to the shared conversation history
 */
export class VoiceChatIntegration {
  private static instance: VoiceChatIntegration
  
  private state: VoiceChatState = {
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    currentTranscript: '',
    interimTranscript: '',
    conversationId: null,
    messageId: null,
    status: 'idle',
    error: null
  }
  
  private config: VoiceChatConfig = {
    autoStartListening: false,
    autoSpeakResponse: true,
    continuousListening: false,
    language: 'en-US',
    voiceRate: 1.0,
    voicePitch: 1.0
  }
  
  private listeners: Set<(state: VoiceChatState) => void> = new Set()
  private isInitialized = false
  
  private constructor() {}
  
  public static getInstance(): VoiceChatIntegration {
    if (!VoiceChatIntegration.instance) {
      VoiceChatIntegration.instance = new VoiceChatIntegration()
    }
    return VoiceChatIntegration.instance
  }
  
  /**
   * Initialize the voice chat integration
   */
  initialize(): void {
    if (this.isInitialized) return
    
    // Set up listeners for conversation changes
    this.setupConversationListeners()
    
    this.isInitialized = true
    console.log('[VoiceChatIntegration] Initialized')
  }
  
  /**
   * Set up listeners for conversation changes
   */
  private setupConversationListeners(): void {
    // Listen for session updates
    if (typeof window !== 'undefined') {
      window.addEventListener('iris:sessions-updated', () => {
        this.notifyListeners()
      })
      
      window.addEventListener('iris:active-session-changed', (e: any) => {
        if (e.detail && typeof e.detail === 'string') {
          this.state.conversationId = e.detail
          this.notifyListeners()
        }
      })
    }
  }
  
  /**
   * Get the current state
   */
  getState(): VoiceChatState {
    return { ...this.state }
  }
  
  /**
   * Get the current configuration
   */
  getConfig(): VoiceChatConfig {
    return { ...this.config }
  }
  
  /**
   * Update the configuration
   */
  updateConfig(updates: Partial<VoiceChatConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log('[VoiceChatIntegration] Config updated:', this.config)
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: VoiceChatState) => void): () => void {
    this.listeners.add(callback)
    callback(this.state)
    return () => {
      this.listeners.delete(callback)
    }
  }
  
  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state)
      } catch (e) {
        console.error('[VoiceChatIntegration] Error in listener:', e)
      }
    })
  }
  
  /**
   * Start a voice conversation
   * Creates or activates a conversation for voice input
   */
  async startVoiceConversation(): Promise<{ conversationId: string, success: boolean }> {
    console.log('[VoiceChatIntegration] Starting voice conversation')
    
    try {
      // Switch to voice mode
      unifiedConversationService.switchToVoiceMode()
      
      // Get or create active conversation
      let conversation = await unifiedConversationService.getActiveConversation()
      
      if (!conversation) {
        conversation = await unifiedConversationService.createConversation({
          mode: 'voice'
        })
      }
      
      const conversationId = conversation.metadata.id
      
      // Update state
      this.state = {
        ...this.state,
        conversationId,
        status: 'idle',
        error: null
      }
      
      this.notifyListeners()
      
      return { conversationId, success: true }
    } catch (error) {
      console.error('[VoiceChatIntegration] Failed to start voice conversation:', error)
      this.state.error = error instanceof Error ? error.message : 'Unknown error'
      this.state.status = 'error'
      this.notifyListeners()
      return { conversationId: '', success: false }
    }
  }
  
  /**
   * End a voice conversation
   * Returns to text mode
   */
  async endVoiceConversation(): Promise<void> {
    console.log('[VoiceChatIntegration] Ending voice conversation')
    
    // Switch to text mode
    unifiedConversationService.switchToTextMode()
    
    // Reset state
    this.state = {
      ...this.state,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      currentTranscript: '',
      interimTranscript: '',
      messageId: null,
      status: 'idle',
      error: null
    }
    
    this.notifyListeners()
  }
  
  /**
   * Start listening for voice input
   */
  async startListening(): Promise<{ success: boolean, messageId: string | null }> {
    console.log('[VoiceChatIntegration] Starting to listen')
    
    try {
      // Ensure we have an active conversation
      let conversation = await unifiedConversationService.getActiveConversation()
      
      if (!conversation) {
        conversation = await unifiedConversationService.createConversation({
          mode: 'voice'
        })
      }
      
      const conversationId = conversation.metadata.id
      
      // Update state
      this.state = {
        ...this.state,
        conversationId,
        isListening: true,
        isProcessing: false,
        currentTranscript: '',
        interimTranscript: '',
        messageId: null,
        status: 'listening',
        error: null
      }
      
      this.notifyListeners()
      
      return { success: true, messageId: null }
    } catch (error) {
      console.error('[VoiceChatIntegration] Failed to start listening:', error)
      this.state.status = 'error'
      this.state.error = error instanceof Error ? error.message : 'Unknown error'
      this.notifyListeners()
      return { success: false, messageId: null }
    }
  }
  
  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    console.log('[VoiceChatIntegration] Stopping listening')
    
    this.state = {
      ...this.state,
      isListening: false,
      status: this.state.isProcessing ? 'processing' : 'idle'
    }
    
    this.notifyListeners()
  }
  
  /**
   * Process interim transcript (real-time transcription)
   */
  async processInterimTranscript(text: string): Promise<void> {
    console.log('[VoiceChatIntegration] Interim transcript:', text)
    
    this.state = {
      ...this.state,
      interimTranscript: text,
      status: 'transcribing'
    }
    
    this.notifyListeners()
  }
  
  /**
   * Process final transcript (end of speech)
   * Saves the transcript to the conversation history
   */
  async processFinalTranscript(text: string): Promise<{ success: boolean, messageId: string }> {
    console.log('[VoiceChatIntegration] Final transcript:', text)
    
    try {
      const conversationId = this.state.conversationId
      
      if (!conversationId) {
        throw new Error('No active conversation')
      }
      
      // Add user message to conversation
      const result = await unifiedConversationService.addMessage({
        mode: 'voice',
        text,
        transcript: text,
        role: 'user',
        state: 'completed'
      })
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to save message')
      }
      
      // Update state
      this.state = {
        ...this.state,
        currentTranscript: text,
        interimTranscript: '',
        messageId: result.messageId,
        isListening: false,
        isProcessing: true,
        status: 'thinking'
      }
      
      this.notifyListeners()
      
      return { success: true, messageId: result.messageId }
    } catch (error) {
      console.error('[VoiceChatIntegration] Failed to process final transcript:', error)
      this.state.status = 'error'
      this.state.error = error instanceof Error ? error.message : 'Unknown error'
      this.notifyListeners()
      return { success: false, messageId: '' }
    }
  }
  
  /**
   * Process AI response
   * Saves the assistant response to the conversation history
   */
  async processAIResponse(
    text: string,
    isStreaming: boolean = false,
    isComplete: boolean = true
  ): Promise<{ success: boolean, messageId: string }> {
    console.log('[VoiceChatIntegration] Processing AI response')
    
    try {
      const conversationId = this.state.conversationId
      
      if (!conversationId) {
        throw new Error('No active conversation')
      }
      
      let result: { success: boolean, messageId: string }
      
      if (isStreaming && !isComplete) {
        // Start or continue streaming
        if (!this.state.messageId) {
          const startResult = await unifiedConversationService.startStreamingResponse(text)
          result = startResult
          this.state.messageId = startResult.messageId
        } else {
          await unifiedConversationService.appendToStreamingMessage(this.state.messageId, text)
          result = { success: true, messageId: this.state.messageId }
        }
      } else {
        // Complete response
        if (this.state.messageId) {
          await unifiedConversationService.appendToStreamingMessage(this.state.messageId, text)
          await unifiedConversationService.endStreamingResponse(this.state.messageId)
          result = { success: true, messageId: this.state.messageId }
        } else {
          result = await unifiedConversationService.addMessage({
            mode: this.state.isSpeaking ? 'voice' : 'text',
            text,
            role: 'assistant',
            state: 'completed'
          })
        }
      }
      
      if (!result.success) {
        throw new Error('Failed to save AI response')
      }
      
      // Update state
      this.state = {
        ...this.state,
        isProcessing: isStreaming && !isComplete,
        status: isStreaming && !isComplete ? 'generating' : 'completed'
      }
      
      this.notifyListeners()
      
      return result
    } catch (error) {
      console.error('[VoiceChatIntegration] Failed to process AI response:', error)
      this.state.status = 'error'
      this.state.error = error instanceof Error ? error.message : 'Unknown error'
      this.notifyListeners()
      return { success: false, messageId: '' }
    }
  }
  
  /**
   * Start speaking (TTS)
   */
  async startSpeaking(): Promise<void> {
    console.log('[VoiceChatIntegration] Starting to speak')
    
    this.state = {
      ...this.state,
      isSpeaking: true,
      status: 'speaking'
    }
    
    this.notifyListeners()
  }
  
  /**
   * Stop speaking
   */
  async stopSpeaking(): Promise<void> {
    console.log('[VoiceChatIntegration] Stopping speaking')
    
    this.state = {
      ...this.state,
      isSpeaking: false,
      status: 'completed'
    }
    
    this.notifyListeners()
  }
  
  /**
   * Handle error
   */
  async handleError(error: string | Error): Promise<void> {
    console.error('[VoiceChatIntegration] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : error
    
    this.state = {
      ...this.state,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      status: 'error',
      error: errorMessage
    }
    
    this.notifyListeners()
  }
  
  /**
   * Handle interruption
   */
  async handleInterruption(): Promise<void> {
    console.log('[VoiceChatIntegration] Handling interruption')
    
    // End any streaming message
    if (this.state.messageId) {
      await unifiedConversationService.endStreamingResponse(this.state.messageId)
    }
    
    this.state = {
      ...this.state,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      currentTranscript: '',
      interimTranscript: '',
      messageId: null,
      status: 'interrupted'
    }
    
    this.notifyListeners()
  }
  
  /**
   * Reset the voice chat
   */
  async reset(): Promise<void> {
    console.log('[VoiceChatIntegration] Resetting')
    
    this.state = {
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      currentTranscript: '',
      interimTranscript: '',
      conversationId: null,
      messageId: null,
      status: 'idle',
      error: null
    }
    
    this.notifyListeners()
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.listeners.clear()
    this.reset()
  }
}

// ============================================================================
// Exports
// ============================================================================

export const voiceChatIntegration = new VoiceChatIntegration()

export {
  VoiceChatState,
  VoiceChatConfig
}
