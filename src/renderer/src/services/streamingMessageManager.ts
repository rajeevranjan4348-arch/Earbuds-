/**
 * Streaming Message Manager
 * Manages streaming responses to ensure only ONE message is created per response
 * Prevents duplicate messages from streaming chunks
 */

import { unifiedConversationService } from './unifiedConversationService'
import { messageStateMachine } from './messageStateMachine'
import { v4 as uuidv4 } from 'uuid'

// ============================================================================
// Types
// ============================================================================

/**
 * Streaming session for a single response
 */
export interface StreamingSession {
  sessionId: string
  conversationId: string
  messageId: string
  role: 'user' | 'assistant' | 'model'
  mode: 'voice' | 'text'
  text: string
  chunks: string[]
  startedAt: number
  lastUpdatedAt: number
  isComplete: boolean
  isError: boolean
  error?: string
}

/**
 * Streaming chunk
 */
export interface StreamingChunk {
  text: string
  isComplete: boolean
  isError: boolean
  error?: string
}

// ============================================================================
// Streaming Message Manager
// ============================================================================

/**
 * Manages streaming responses to ensure:
 * 1. Only ONE assistant message is created per response
 * 2. Streaming chunks update the same message
 * 3. Duplicate messages are prevented
 * 4. Cleanup happens properly
 */
export class StreamingMessageManager {
  private static instance: StreamingMessageManager
  
  private activeSessions: Map<string, StreamingSession> = new Map()
  private messageTextCache: Map<string, string> = new Map()
  
  private constructor() {}
  
  public static getInstance(): StreamingMessageManager {
    if (!StreamingMessageManager.instance) {
      StreamingMessageManager.instance = new StreamingMessageManager()
    }
    return StreamingMessageManager.instance
  }
  
  /**
   * Start a new streaming session
   * Creates a single message that will be updated with chunks
   */
  async startStreamingSession(
    conversationId: string,
    role: 'user' | 'assistant' | 'model' = 'assistant',
    mode: 'voice' | 'text' = 'text'
  ): Promise<StreamingSession> {
    console.log(`[StreamingMessageManager] Starting streaming session for conversation ${conversationId}`)
    
    const sessionId = uuidv4()
    const messageId = uuidv4()
    const startedAt = Date.now()
    
    // Create initial message with empty text
    const result = await unifiedConversationService.addMessage({
      mode,
      text: '',
      role,
      state: 'generating',
      isStreaming: true
    })
    
    if (!result.success) {
      throw new Error(`Failed to create streaming message: ${result.error}`)
    }
    
    const session: StreamingSession = {
      sessionId,
      conversationId,
      messageId: result.messageId,
      role,
      mode,
      text: '',
      chunks: [],
      startedAt,
      lastUpdatedAt: startedAt,
      isComplete: false,
      isError: false
    }
    
    this.activeSessions.set(sessionId, session)
    this.messageTextCache.set(result.messageId, '')
    
    // Initialize state machine for this message
    messageStateMachine.initializeMessage(result.messageId, conversationId, 'generating', mode)
    
    console.log(`[StreamingMessageManager] Created streaming session ${sessionId} with message ${result.messageId}`)
    
    return session
  }
  
  /**
   * Process a streaming chunk
   * Updates the existing message instead of creating a new one
   */
  async processChunk(
    sessionId: string,
    chunk: StreamingChunk
  ): Promise<{ success: boolean, messageId: string, text: string }> {
    const session = this.activeSessions.get(sessionId)
    
    if (!session) {
      console.error(`[StreamingMessageManager] Session ${sessionId} not found`)
      return { success: false, messageId: '', text: '' }
    }
    
    // Update the session
    session.lastUpdatedAt = Date.now()
    session.chunks.push(chunk.text)
    
    if (chunk.isError) {
      session.isError = true
      session.error = chunk.error
    }
    
    // Build the complete text
    const completeText = session.chunks.join('')
    session.text = completeText
    
    // Cache the text
    this.messageTextCache.set(session.messageId, completeText)
    
    // Update the message in the conversation
    const updateResult = await unifiedConversationService.updateMessage(
      session.messageId,
      {
        text: completeText,
        content: completeText,
        state: chunk.isComplete ? 'completed' : 'generating',
        isStreaming: !chunk.isComplete
      }
    )
    
    if (!updateResult) {
      console.error(`[StreamingMessageManager] Failed to update message ${session.messageId}`)
      return { success: false, messageId: session.messageId, text: completeText }
    }
    
    // Update state machine
    if (chunk.isComplete) {
      messageStateMachine.transitionMessage(session.messageId, 'completed')
    }
    
    if (chunk.isError) {
      messageStateMachine.transitionMessage(session.messageId, 'error')
    }
    
    console.log(`[StreamingMessageManager] Processed chunk for session ${sessionId}, message ${session.messageId}`)
    
    return { success: true, messageId: session.messageId, text: completeText }
  }
  
  /**
   * Complete a streaming session
   * Finalizes the message and cleans up
   */
  async completeStreamingSession(
    sessionId: string,
    finalText?: string
  ): Promise<{ success: boolean, messageId: string, text: string }> {
    const session = this.activeSessions.get(sessionId)
    
    if (!session) {
      console.error(`[StreamingMessageManager] Session ${sessionId} not found`)
      return { success: false, messageId: '', text: '' }
    }
    
    // Build the final text
    let completeText = session.text
    if (finalText) {
      completeText = finalText
      session.text = completeText
      this.messageTextCache.set(session.messageId, completeText)
    }
    
    // Update the message to mark as complete
    const updateResult = await unifiedConversationService.updateMessage(
      session.messageId,
      {
        text: completeText,
        content: completeText,
        state: 'completed',
        isStreaming: false
      }
    )
    
    if (!updateResult) {
      console.error(`[StreamingMessageManager] Failed to complete message ${session.messageId}`)
      return { success: false, messageId: session.messageId, text: completeText }
    }
    
    // Mark as complete
    session.isComplete = true
    session.lastUpdatedAt = Date.now()
    
    // Update state machine
    messageStateMachine.transitionMessage(session.messageId, 'completed')
    
    // Clean up the session
    this.activeSessions.delete(sessionId)
    
    console.log(`[StreamingMessageManager] Completed streaming session ${sessionId}`)
    
    return { success: true, messageId: session.messageId, text: completeText }
  }
  
  /**
   * Error a streaming session
   * Marks the message as failed
   */
  async errorStreamingSession(
    sessionId: string,
    error: string
  ): Promise<{ success: boolean, messageId: string }> {
    const session = this.activeSessions.get(sessionId)
    
    if (!session) {
      console.error(`[StreamingMessageManager] Session ${sessionId} not found`)
      return { success: false, messageId: '' }
    }
    
    // Update the message to mark as error
    const updateResult = await unifiedConversationService.updateMessage(
      session.messageId,
      {
        state: 'error',
        isStreaming: false
      }
    )
    
    if (!updateResult) {
      console.error(`[StreamingMessageManager] Failed to error message ${session.messageId}`)
      return { success: false, messageId: session.messageId }
    }
    
    // Mark as error
    session.isError = true
    session.isComplete = true
    session.error = error
    session.lastUpdatedAt = Date.now()
    
    // Update state machine
    messageStateMachine.transitionMessage(session.messageId, 'error')
    
    // Clean up the session
    this.activeSessions.delete(sessionId)
    
    console.log(`[StreamingMessageManager] Errored streaming session ${sessionId}: ${error}`)
    
    return { success: true, messageId: session.messageId }
  }
  
  /**
   * Get the current text for a streaming message
   */
  getStreamingText(messageId: string): string {
    return this.messageTextCache.get(messageId) || ''
  }
  
  /**
   * Get an active streaming session
   */
  getStreamingSession(sessionId: string): StreamingSession | undefined {
    return this.activeSessions.get(sessionId)
  }
  
  /**
   * Get all active streaming sessions
   */
  getAllActiveSessions(): StreamingSession[] {
    return Array.from(this.activeSessions.values())
  }
  
  /**
   * Get active session for a conversation
   */
  getActiveSessionForConversation(conversationId: string): StreamingSession | undefined {
    return Array.from(this.activeSessions.values())
      .find(session => session.conversationId === conversationId && !session.isComplete)
  }
  
  /**
   * Check if a message is currently streaming
   */
  isMessageStreaming(messageId: string): boolean {
    return Array.from(this.activeSessions.values())
      .some(session => session.messageId === messageId && !session.isComplete)
  }
  
  /**
   * Get the session ID for a message
   */
  getSessionIdForMessage(messageId: string): string | undefined {
    return Array.from(this.activeSessions.values())
      .find(session => session.messageId === messageId)?.sessionId
  }
  
  /**
   * Cancel all active streaming sessions
   */
  async cancelAllSessions(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values())
    
    for (const session of sessions) {
      if (!session.isComplete) {
        await this.errorStreamingSession(session.sessionId, 'Cancelled by user')
      }
    }
    
    console.log(`[StreamingMessageManager] Cancelled ${sessions.length} active sessions`)
  }
  
  /**
   * Cancel streaming for a specific conversation
   */
  async cancelConversationStreaming(conversationId: string): Promise<void> {
    const sessions = Array.from(this.activeSessions.values())
      .filter(session => session.conversationId === conversationId && !session.isComplete)
    
    for (const session of sessions) {
      await this.errorStreamingSession(session.sessionId, 'Cancelled by user')
    }
    
    console.log(`[StreamingMessageManager] Cancelled streaming for conversation ${conversationId}`)
  }
  
  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): number {
    const now = Date.now()
    let removedCount = 0
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastUpdatedAt > maxAgeMs) {
        this.activeSessions.delete(sessionId)
        this.messageTextCache.delete(session.messageId)
        removedCount++
      }
    }
    
    console.log(`[StreamingMessageManager] Cleaned up ${removedCount} old sessions`)
    return removedCount
  }
  
  /**
   * Clean up all sessions
   */
  cleanupAll(): void {
    this.activeSessions.clear()
    this.messageTextCache.clear()
    console.log('[StreamingMessageManager] Cleaned up all sessions')
  }
  
  /**
   * Get statistics
   */
  getStats(): { activeSessions: number, cachedMessages: number } {
    return {
      activeSessions: this.activeSessions.size,
      cachedMessages: this.messageTextCache.size
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const streamingMessageManager = new StreamingMessageManager()
