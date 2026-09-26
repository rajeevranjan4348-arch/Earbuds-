/**
 * Message State Machine
 * Manages the lifecycle of messages in voice and text conversations
 * Ensures reliable state transitions and prevents duplicate messages
 */

import { unifiedConversationService, MessageState, MessageMode } from './unifiedConversationService'

// ============================================================================
// State Definitions
// ============================================================================

/**
 * All possible message states
 */
export type MessageStateType = MessageState | 'none'

/**
 * Valid state transitions
 * Maps from current state to allowed next states
 */
const VALID_TRANSITIONS: Record<MessageStateType, MessageStateType[]> = {
  'none': ['idle', 'listening', 'error'],
  'idle': ['listening', 'thinking', 'generating', 'speaking', 'error'],
  'listening': ['transcribing', 'thinking', 'idle', 'error'],
  'transcribing': ['thinking', 'idle', 'error'],
  'thinking': ['generating', 'speaking', 'idle', 'error'],
  'generating': ['speaking', 'completed', 'interrupted', 'error'],
  'speaking': ['completed', 'interrupted', 'idle', 'error'],
  'completed': ['idle', 'listening', 'error'],
  'interrupted': ['idle', 'listening', 'error'],
  'error': ['idle', 'listening', 'error']
}

/**
 * Terminal states (cannot transition out except to idle or error)
 */
const TERMINAL_STATES: MessageStateType[] = ['completed', 'interrupted', 'error']

// ============================================================================
// Message Metadata
// ============================================================================

/**
 * Message metadata for tracking state and preventing duplicates
 */
export interface MessageMetadata {
  messageId: string
  conversationId: string
  state: MessageStateType
  mode: MessageMode
  timestamp: number
  retryCount: number
  isDuplicate: boolean
}

// ============================================================================
// Message State Machine
// ============================================================================

/**
 * Message State Machine
 * Manages state transitions and prevents duplicate messages
 */
export class MessageStateMachine {
  private static instance: MessageStateMachine
  
  private messageMetadata: Map<string, MessageMetadata> = new Map()
  private stateHistory: Map<string, MessageStateType[]> = new Map()
  private duplicateCheck: Set<string> = new Set()
  
  private constructor() {}
  
  public static getInstance(): MessageStateMachine {
    if (!MessageStateMachine.instance) {
      MessageStateMachine.instance = new MessageStateMachine()
    }
    return MessageStateMachine.instance
  }
  
  /**
   * Initialize a message with its initial state
   */
  initializeMessage(
    messageId: string,
    conversationId: string,
    initialState: MessageStateType = 'idle',
    mode: MessageMode = 'text'
  ): MessageMetadata {
    const metadata: MessageMetadata = {
      messageId,
      conversationId,
      state: initialState,
      mode,
      timestamp: Date.now(),
      retryCount: 0,
      isDuplicate: false
    }
    
    this.messageMetadata.set(messageId, metadata)
    this.stateHistory.set(messageId, [initialState])
    
    console.log(`[MessageStateMachine] Initialized message ${messageId} with state ${initialState}`)
    
    return metadata
  }
  
  /**
   * Transition a message to a new state
   * Validates the transition and updates state
   */
  transitionMessage(
    messageId: string,
    newState: MessageStateType
  ): { success: boolean, message: string, from: MessageStateType, to: MessageStateType } {
    const metadata = this.messageMetadata.get(messageId)
    
    if (!metadata) {
      return {
        success: false,
        message: `Message ${messageId} not found`,
        from: 'none',
        to: newState
      }
    }
    
    const currentState = metadata.state
    
    // Check if transition is valid
    const validTransitions = VALID_TRANSITIONS[currentState] || []
    
    if (!validTransitions.includes(newState)) {
      return {
        success: false,
        message: `Invalid transition from ${currentState} to ${newState}`,
        from: currentState,
        to: newState
      }
    }
    
    // Update state
    metadata.state = newState
    metadata.timestamp = Date.now()
    
    // Record state history
    const history = this.stateHistory.get(messageId) || []
    history.push(newState)
    this.stateHistory.set(messageId, history)
    
    console.log(`[MessageStateMachine] Transitioned ${messageId} from ${currentState} to ${newState}`)
    
    return {
      success: true,
      message: `Transitioned from ${currentState} to ${newState}`,
      from: currentState,
      to: newState
    }
  }
  
  /**
   * Get the current state of a message
   */
  getMessageState(messageId: string): MessageStateType {
    const metadata = this.messageMetadata.get(messageId)
    return metadata?.state || 'none'
  }
  
  /**
   * Get message metadata
   */
  getMessageMetadata(messageId: string): MessageMetadata | undefined {
    return this.messageMetadata.get(messageId)
  }
  
  /**
   * Get state history for a message
   */
  getStateHistory(messageId: string): MessageStateType[] {
    return this.stateHistory.get(messageId) || []
  }
  
  /**
   * Check if a message ID has been processed (for duplicate prevention)
   */
  isDuplicateMessage(messageId: string): boolean {
    return this.duplicateCheck.has(messageId)
  }
  
  /**
   * Mark a message as processed (for duplicate prevention)
   */
  markMessageAsProcessed(messageId: string): void {
    this.duplicateCheck.add(messageId)
    console.log(`[MessageStateMachine] Marked ${messageId} as processed`)
  }
  
  /**
   * Check if a message can transition to a new state
   */
  canTransition(messageId: string, newState: MessageStateType): boolean {
    const currentState = this.getMessageState(messageId)
    const validTransitions = VALID_TRANSITIONS[currentState] || []
    return validTransitions.includes(newState)
  }
  
  /**
   * Check if a state is terminal
   */
  isTerminalState(state: MessageStateType): boolean {
    return TERMINAL_STATES.includes(state)
  }
  
  /**
   * Check if current state is terminal
   */
  isMessageTerminal(messageId: string): boolean {
    const state = this.getMessageState(messageId)
    return this.isTerminalState(state)
  }
  
  /**
   * Reset a message to idle state
   */
  resetMessage(messageId: string): boolean {
    const metadata = this.messageMetadata.get(messageId)
    
    if (!metadata) {
      return false
    }
    
    metadata.state = 'idle'
    metadata.timestamp = Date.now()
    metadata.retryCount = 0
    
    const history = this.stateHistory.get(messageId) || []
    history.push('idle')
    this.stateHistory.set(messageId, history)
    
    console.log(`[MessageStateMachine] Reset message ${messageId} to idle`)
    
    return true
  }
  
  /**
   * Increment retry count for a message
   */
  incrementRetry(messageId: string): number {
    const metadata = this.messageMetadata.get(messageId)
    
    if (!metadata) {
      return 0
    }
    
    metadata.retryCount++
    return metadata.retryCount
  }
  
  /**
   * Get retry count for a message
   */
  getRetryCount(messageId: string): number {
    const metadata = this.messageMetadata.get(messageId)
    return metadata?.retryCount || 0
  }
  
  /**
   * Mark a message as a duplicate
   */
  markAsDuplicate(messageId: string): void {
    const metadata = this.messageMetadata.get(messageId)
    
    if (metadata) {
      metadata.isDuplicate = true
      console.log(`[MessageStateMachine] Marked ${messageId} as duplicate`)
    }
  }
  
  /**
   * Check if a message is marked as duplicate
   */
  isMarkedAsDuplicate(messageId: string): boolean {
    const metadata = this.messageMetadata.get(messageId)
    return metadata?.isDuplicate || false
  }
  
  /**
   * Clean up old message metadata
   */
  cleanupOldMessages(maxAgeMs: number = 3600000): number {
    const now = Date.now()
    let removedCount = 0
    
    for (const [messageId, metadata] of this.messageMetadata.entries()) {
      if (now - metadata.timestamp > maxAgeMs) {
        this.messageMetadata.delete(messageId)
        this.stateHistory.delete(messageId)
        removedCount++
      }
    }
    
    console.log(`[MessageStateMachine] Cleaned up ${removedCount} old messages`)
    return removedCount
  }
  
  /**
   * Clean up all metadata
   */
  cleanupAll(): void {
    this.messageMetadata.clear()
    this.stateHistory.clear()
    this.duplicateCheck.clear()
    console.log('[MessageStateMachine] Cleaned up all metadata')
  }
  
  /**
   * Get all messages in a specific state
   */
  getMessagesInState(state: MessageStateType): string[] {
    return Array.from(this.messageMetadata.entries())
      .filter(([_, metadata]) => metadata.state === state)
      .map(([messageId]) => messageId)
  }
  
  /**
   * Get all messages in terminal states
   */
  getTerminalMessages(): string[] {
    return Array.from(this.messageMetadata.entries())
      .filter(([_, metadata]) => this.isTerminalState(metadata.state))
      .map(([messageId]) => messageId)
  }
  
  /**
   * Get all messages that are not terminal
   */
  getActiveMessages(): string[] {
    return Array.from(this.messageMetadata.entries())
      .filter(([_, metadata]) => !this.isTerminalState(metadata.state))
      .map(([messageId]) => messageId)
  }
}

// ============================================================================
// State Transition Helpers
// ============================================================================

/**
 * Create a state transition helper for a specific message
 */
export class MessageStateHelper {
  private messageId: string
  private stateMachine: MessageStateMachine
  
  constructor(messageId: string) {
    this.messageId = messageId
    this.stateMachine = MessageStateMachine.getInstance()
  }
  
  /**
   * Initialize the message
   */
  initialize(conversationId: string, mode: MessageMode = 'text'): void {
    this.stateMachine.initializeMessage(this.messageId, conversationId, 'idle', mode)
  }
  
  /**
   * Transition to a new state
   */
  transitionTo(newState: MessageStateType): boolean {
    const result = this.stateMachine.transitionMessage(this.messageId, newState)
    return result.success
  }
  
  /**
   * Get current state
   */
  getState(): MessageStateType {
    return this.stateMachine.getMessageState(this.messageId)
  }
  
  /**
   * Check if can transition to state
   */
  canTransitionTo(newState: MessageStateType): boolean {
    return this.stateMachine.canTransition(this.messageId, newState)
  }
  
  /**
   * Check if terminal
   */
  isTerminal(): boolean {
    return this.stateMachine.isMessageTerminal(this.messageId)
  }
  
  /**
   * Mark as processed
   */
  markAsProcessed(): void {
    this.stateMachine.markMessageAsProcessed(this.messageId)
  }
  
  /**
   * Check if duplicate
   */
  isDuplicate(): boolean {
    return this.stateMachine.isDuplicateMessage(this.messageId)
  }
}

// ============================================================================
// Conversation State Machine
// ============================================================================

/**
 * Conversation-level state machine
 * Manages the overall conversation state
 */
export class ConversationStateMachine {
  private static instance: ConversationStateMachine
  
  private conversationStates: Map<string, ConversationState> = new Map()
  
  private constructor() {}
  
  public static getInstance(): ConversationStateMachine {
    if (!ConversationStateMachine.instance) {
      ConversationStateMachine.instance = new ConversationStateMachine()
    }
    return ConversationStateMachine.instance
  }
  
  /**
   * Set conversation state
   */
  setConversationState(conversationId: string, state: ConversationState): void {
    this.conversationStates.set(conversationId, state)
    console.log(`[ConversationStateMachine] Set conversation ${conversationId} to ${state}`)
  }
  
  /**
   * Get conversation state
   */
  getConversationState(conversationId: string): ConversationState {
    return this.conversationStates.get(conversationId) || 'idle'
  }
  
  /**
   * Clean up old conversation states
   */
  cleanupOldConversations(maxAgeMs: number = 3600000): number {
    const now = Date.now()
    let removedCount = 0
    
    for (const [conversationId, state] of this.conversationStates.entries()) {
      // For simplicity, we don't track timestamps for conversation states
      // This is a placeholder for future implementation
      if (Math.random() < 0.01) { // Random cleanup for demo
        this.conversationStates.delete(conversationId)
        removedCount++
      }
    }
    
    return removedCount
  }
  
  /**
   * Clean up all
   */
  cleanupAll(): void {
    this.conversationStates.clear()
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Conversation-level states
 */
export type ConversationState = 
  | 'idle'
  | 'text_input'
  | 'voice_input'
  | 'processing'
  | 'generating'
  | 'speaking'
  | 'completed'
  | 'error'

// ============================================================================
// Exports
// ============================================================================

export const messageStateMachine = new MessageStateMachine()
export const conversationStateMachine = new ConversationStateMachine()

export {
  VALID_TRANSITIONS,
  TERMINAL_STATES
}
