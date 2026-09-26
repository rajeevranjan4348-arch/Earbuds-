/**
 * Unified Conversation Service
 * Provides a single shared conversation/history system for both Voice and Text Chat
 * 
 * CORE PRINCIPLE: Voice Chat and Text Chat use ONE shared conversation system.
 * - A conversation created in Text Chat must remain accessible from Voice Chat
 * - A conversation created in Voice Chat must appear normally in Chat History
 * - Both modes use the same conversationId and message storage
 * - Voice transcripts are saved as text messages with mode='voice' metadata
 */

import { chatHistoryService, Message as ChatMessage, ChatSession } from './chatHistoryService'
import { firebaseAuthService } from './firebaseAuth'
import { v4 as uuidv4 } from 'uuid'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Message Mode - distinguishes between voice and text input
 */
export type MessageMode = 'voice' | 'text'

/**
 * Conversation Mode - the current input mode
 */
export type ConversationMode = 'voice' | 'text'

/**
 * Message State - tracks the lifecycle of a message
 */
export type MessageState = 
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'generating'
  | 'speaking'
  | 'completed'
  | 'error'
  | 'interrupted'

/**
 * Unified Message Interface
 * Extends the existing Message interface with voice-specific metadata
 */
export interface UnifiedMessage extends ChatMessage {
  // Unique message identifier (prevents duplicates)
  messageId: string
  
  // Conversation this message belongs to
  conversationId: string
  
  // Input mode: voice or text
  mode: MessageMode
  
  // For voice messages: the transcript text
  transcript?: string
  
  // Audio metadata (optional - text is the canonical content)
  audioMetadata?: {
    audioUrl?: string
    duration?: number
    sampleRate?: number
    confidence?: number
    audioBlob?: Blob
  }
  
  // Links extracted from the message
  links?: string[]
  
  // Attachments
  attachments?: any[]
  
  // Tool calls / actions
  toolCalls?: any[]
  
  // Message state
  state?: MessageState
  
  // Timestamp when message was created
  timestamp: number
  
  // Whether this message is streaming
  isStreaming?: boolean
}

/**
 * Conversation Metadata
 */
export interface ConversationMetadata {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  userId: string
  lastMode: ConversationMode
  messageCount: number
  lastMessageId?: string
}

/**
 * Conversation with full message history
 */
export interface UnifiedConversation {
  metadata: ConversationMetadata
  messages: UnifiedMessage[]
}

/**
 * Options for creating a new conversation
 */
export interface CreateConversationOptions {
  title?: string
  initialMessage?: string
  mode?: MessageMode
}

/**
 * Options for adding a message
 */
export interface AddMessageOptions {
  mode: MessageMode
  text: string
  transcript?: string
  audioMetadata?: UnifiedMessage['audioMetadata']
  role?: 'user' | 'model' | 'assistant' | 'system'
  state?: MessageState
  isStreaming?: boolean
  links?: string[]
  attachments?: any[]
  toolCalls?: any[]
}

/**
 * Result of adding a message
 */
export interface AddMessageResult {
  success: boolean
  messageId: string
  conversationId: string
  message: UnifiedMessage
  error?: string
}

/**
 * Streaming chunk for progressive message updates
 */
export interface StreamingChunk {
  messageId: string
  conversationId: string
  text: string
  isComplete: boolean
  isError: boolean
}

// ============================================================================
// URL Detection and Normalization
// ============================================================================

/**
 * URL pattern for detection
 */
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  if (!text) return []
  
  const urls: string[] = []
  const matches = text.match(URL_PATTERN) || []
  
  for (const match of matches) {
    let url = match
    
    // Add https:// if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.startsWith('www.')) {
        url = 'https://' + url
      } else if (!url.includes('.')) {
        // Skip if it doesn't look like a URL
        continue
      } else {
        url = 'https://' + url
      }
    }
    
    // Normalize URL
    try {
      const parsed = new URL(url)
      url = parsed.toString()
    } catch (e) {
      // Keep original if URL parsing fails
    }
    
    if (!urls.includes(url)) {
      urls.push(url)
    }
  }
  
  return urls
}

/**
 * Normalize a URL to ensure it has a protocol
 */
export function normalizeUrl(url: string): string {
  if (!url) return url
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  if (url.startsWith('www.')) {
    return 'https://' + url
  }
  
  // Check if it looks like a domain
  if (/^[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}/.test(url)) {
    return 'https://' + url
  }
  
  return url
}

/**
 * Check if text contains URLs
 */
export function containsUrls(text: string): boolean {
  return URL_PATTERN.test(text)
}

// ============================================================================
// Conversation State Manager
// ============================================================================

/**
 * Manages the current conversation state
 * This is a singleton that maintains the current conversation context
 */
class ConversationStateManager {
  private static instance: ConversationStateManager
  
  private currentConversationId: string | null = null
  private currentMode: ConversationMode = 'text'
  private messageStates: Map<string, MessageState> = new Map()
  private streamingMessages: Map<string, boolean> = new Map()
  private messageIdCounter: Map<string, number> = new Map()
  
  private constructor() {}
  
  public static getInstance(): ConversationStateManager {
    if (!ConversationStateManager.instance) {
      ConversationStateManager.instance = new ConversationStateManager()
    }
    return ConversationStateManager.instance
  }
  
  /**
   * Get the current conversation ID
   */
  getCurrentConversationId(): string | null {
    return this.currentConversationId
  }
  
  /**
   * Set the current conversation ID
   */
  setCurrentConversationId(conversationId: string | null): void {
    this.currentConversationId = conversationId
  }
  
  /**
   * Get the current conversation mode
   */
  getCurrentMode(): ConversationMode {
    return this.currentMode
  }
  
  /**
   * Set the current conversation mode
   */
  setCurrentMode(mode: ConversationMode): void {
    this.currentMode = mode
  }
  
  /**
   * Get the message state
   */
  getMessageState(messageId: string): MessageState | undefined {
    return this.messageStates.get(messageId)
  }
  
  /**
   * Set the message state
   */
  setMessageState(messageId: string, state: MessageState): void {
    this.messageStates.set(messageId, state)
  }
  
  /**
   * Check if a message is streaming
   */
  isMessageStreaming(messageId: string): boolean {
    return this.streamingMessages.get(messageId) || false
  }
  
  /**
   * Set streaming state for a message
   */
  setMessageStreaming(messageId: string, isStreaming: boolean): void {
    this.streamingMessages.set(messageId, isStreaming)
  }
  
  /**
   * Generate a unique message ID for a conversation
   * Uses counter to ensure uniqueness even with same timestamp
   */
  generateMessageId(conversationId: string): string {
    const count = (this.messageIdCounter.get(conversationId) || 0) + 1
    this.messageIdCounter.set(conversationId, count)
    return `${conversationId}-${Date.now()}-${count}`
  }
  
  /**
   * Reset the manager
   */
  reset(): void {
    this.currentConversationId = null
    this.currentMode = 'text'
    this.messageStates.clear()
    this.streamingMessages.clear()
    this.messageIdCounter.clear()
  }
  
  /**
   * Get all active streaming messages
   */
  getActiveStreamingMessages(): string[] {
    return Array.from(this.streamingMessages.entries())
      .filter(([_, isStreaming]) => isStreaming)
      .map(([messageId]) => messageId)
  }
  
  /**
   * Stop all streaming
   */
  stopAllStreaming(): void {
    for (const messageId of this.streamingMessages.keys()) {
      this.streamingMessages.set(messageId, false)
    }
  }
}

// ============================================================================
// Unified Conversation Service
// ============================================================================

/**
 * Main service for managing unified conversations
 * Provides methods for creating, retrieving, and updating conversations
 * that work seamlessly across both Voice and Text Chat modes
 */
export class UnifiedConversationService {
  private static instance: UnifiedConversationService
  private stateManager: ConversationStateManager
  
  private constructor() {
    this.stateManager = ConversationStateManager.getInstance()
  }
  
  public static getInstance(): UnifiedConversationService {
    if (!UnifiedConversationService.instance) {
      UnifiedConversationService.instance = new UnifiedConversationService()
    }
    return UnifiedConversationService.instance
  }
  
  /**
   * Get the current user ID
   */
  private getCurrentUserId(): string {
    return firebaseAuthService.getUserId()
  }
  
  /**
   * Create a new conversation
   */
  async createConversation(options: CreateConversationOptions = {}): Promise<UnifiedConversation> {
    const userId = this.getCurrentUserId()
    const conversationId = uuidv4()
    const timestamp = Date.now()
    
    const title = options.title || 'New Conversation'
    const mode = options.mode || 'text'
    
    // Create conversation metadata
    const metadata: ConversationMetadata = {
      id: conversationId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      userId,
      lastMode: mode,
      messageCount: 0
    }
    
    // Create initial message if provided
    const messages: UnifiedMessage[] = []
    
    if (options.initialMessage) {
      const message = this.createUserMessage(
        conversationId,
        options.initialMessage,
        mode,
        'completed'
      )
      messages.push(message)
      metadata.messageCount = 1
      metadata.lastMessageId = message.messageId
    }
    
    // Create chat session for compatibility with existing system
    const session: ChatSession = {
      id: conversationId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: messages.map(this.convertToChatMessage),
      lastActive: timestamp
    }
    
    // Save to chat history service
    chatHistoryService.saveSession(session, userId)
    chatHistoryService.setActiveSessionId(conversationId, userId)
    
    // Set current conversation
    this.stateManager.setCurrentConversationId(conversationId)
    this.stateManager.setCurrentMode(mode)
    
    return {
      metadata,
      messages
    }
  }
  
  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<UnifiedConversation | null> {
    const userId = this.getCurrentUserId()
    const sessions = chatHistoryService.getSessions(userId)
    const session = sessions.find(s => s.id === conversationId)
    
    if (!session) {
      return null
    }
    
    // Convert to unified format
    const messages = session.messages.map(msg => this.convertToUnifiedMessage(msg, conversationId))
    
    const metadata: ConversationMetadata = {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt || session.createdAt,
      userId,
      lastMode: this.detectLastMode(session),
      messageCount: messages.length,
      lastMessageId: messages.length > 0 ? messages[messages.length - 1].messageId : undefined
    }
    
    return {
      metadata,
      messages
    }
  }
  
  /**
   * Get all conversations for the current user
   */
  async getAllConversations(): Promise<UnifiedConversation[]> {
    const userId = this.getCurrentUserId()
    const sessions = chatHistoryService.getSessions(userId)
    
    return sessions.map(session => {
      const messages = session.messages.map(msg => this.convertToUnifiedMessage(msg, session.id))
      
      const metadata: ConversationMetadata = {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt || session.createdAt,
        userId,
        lastMode: this.detectLastMode(session),
        messageCount: messages.length,
        lastMessageId: messages.length > 0 ? messages[messages.length - 1].messageId : undefined
      }
      
      return {
        metadata,
        messages
      }
    })
  }
  
  /**
   * Get the active conversation
   */
  async getActiveConversation(): Promise<UnifiedConversation | null> {
    const userId = this.getCurrentUserId()
    const activeSessionId = chatHistoryService.getActiveSessionId(userId)
    
    if (!activeSessionId) {
      return null
    }
    
    return this.getConversation(activeSessionId)
  }
  
  /**
   * Set the active conversation
   */
  async setActiveConversation(conversationId: string): Promise<void> {
    const userId = this.getCurrentUserId()
    chatHistoryService.setActiveSessionId(conversationId, userId)
    this.stateManager.setCurrentConversationId(conversationId)
  }
  
  /**
   * Add a message to the current conversation
   */
  async addMessage(options: AddMessageOptions): Promise<AddMessageResult> {
    const conversationId = this.stateManager.getCurrentConversationId()
    
    if (!conversationId) {
      // Create a new conversation if none exists
      const conversation = await this.createConversation()
      this.stateManager.setCurrentConversationId(conversation.metadata.id)
      return this.addMessageToConversation(conversation.metadata.id, options)
    }
    
    return this.addMessageToConversation(conversationId, options)
  }
  
  /**
   * Add a message to a specific conversation
   */
  private async addMessageToConversation(
    conversationId: string,
    options: AddMessageOptions
  ): Promise<AddMessageResult> {
    const userId = this.getCurrentUserId()
    const timestamp = Date.now()
    
    // Generate unique message ID
    const messageId = this.stateManager.generateMessageId(conversationId)
    
    // Create unified message
    const unifiedMessage: UnifiedMessage = {
      id: messageId,
      messageId,
      conversationId,
      role: options.role || 'user',
      text: options.text,
      content: options.text,
      mode: options.mode,
      transcript: options.transcript,
      timestamp,
      inputType: options.mode,
      status: options.state === 'error' ? 'failed' : 'success',
      audioMetadata: options.audioMetadata,
      links: options.links || extractUrls(options.text),
      attachments: options.attachments,
      toolCalls: options.toolCalls,
      state: options.state || 'completed',
      isStreaming: options.isStreaming
    }
    
    // Convert to chat message for compatibility
    const chatMessage = this.convertToChatMessage(unifiedMessage)
    
    try {
      // Get or create session
      let session = chatHistoryService.getSession(conversationId, userId)
      
      if (!session) {
        session = {
          id: conversationId,
          title: 'New Conversation',
          createdAt: timestamp,
          updatedAt: timestamp,
          messages: [],
          lastActive: timestamp
        }
      }
      
      // Add message to session
      session.messages.push(chatMessage)
      session.updatedAt = timestamp
      session.lastActive = timestamp
      
      // Save session
      chatHistoryService.saveSession(session, userId)
      
      // Update last mode
      this.stateManager.setCurrentMode(options.mode)
      
      return {
        success: true,
        messageId,
        conversationId,
        message: unifiedMessage
      }
    } catch (error) {
      console.error('[UnifiedConversationService] Failed to add message:', error)
      return {
        success: false,
        messageId: '',
        conversationId: '',
        message: {} as UnifiedMessage,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  /**
   * Update a message (for streaming)
   */
  async updateMessage(
    messageId: string,
    updates: Partial<UnifiedMessage>
  ): Promise<boolean> {
    const conversationId = this.stateManager.getCurrentConversationId()
    
    if (!conversationId) {
      return false
    }
    
    const userId = this.getCurrentUserId()
    const session = chatHistoryService.getSession(conversationId, userId)
    
    if (!session) {
      return false
    }
    
    try {
      // Find and update the message
      const messageIndex = session.messages.findIndex(m => m.id === messageId || m.messageId === messageId)
      
      if (messageIndex === -1) {
        return false
      }
      
      // Update the message
      const existingMessage = session.messages[messageIndex]
      const updatedMessage: ChatMessage = {
        ...existingMessage,
        ...updates,
        text: updates.text || existingMessage.text,
        content: updates.text || existingMessage.content,
        inputType: updates.mode || existingMessage.inputType,
        status: updates.state === 'error' ? 'failed' : existingMessage.status
      }
      
      session.messages[messageIndex] = updatedMessage
      session.updatedAt = Date.now()
      session.lastActive = Date.now()
      
      // Save session
      chatHistoryService.saveSession(session, userId)
      
      return true
    } catch (error) {
      console.error('[UnifiedConversationService] Failed to update message:', error)
      return false
    }
  }
  
  /**
   * Start a streaming response
   */
  async startStreamingResponse(
    initialText: string = ''
  ): Promise<AddMessageResult> {
    const conversationId = this.stateManager.getCurrentConversationId()
    
    if (!conversationId) {
      throw new Error('No active conversation')
    }
    
    // Create assistant message with streaming state
    const result = await this.addMessageToConversation(conversationId, {
      mode: this.stateManager.getCurrentMode(),
      text: initialText,
      role: 'assistant',
      state: 'generating',
      isStreaming: true
    })
    
    if (result.success) {
      this.stateManager.setMessageStreaming(result.messageId, true)
      this.stateManager.setMessageState(result.messageId, 'generating')
    }
    
    return result
  }
  
  /**
   * Append to a streaming message
   */
  async appendToStreamingMessage(
    messageId: string,
    text: string
  ): Promise<boolean> {
    const conversationId = this.stateManager.getCurrentConversationId()
    
    if (!conversationId) {
      return false
    }
    
    const userId = this.getCurrentUserId()
    const session = chatHistoryService.getSession(conversationId, userId)
    
    if (!session) {
      return false
    }
    
    const messageIndex = session.messages.findIndex(m => m.id === messageId || m.messageId === messageId)
    
    if (messageIndex === -1) {
      return false
    }
    
    try {
      const existingMessage = session.messages[messageIndex]
      const updatedText = existingMessage.text + text
      
      const updatedMessage: ChatMessage = {
        ...existingMessage,
        text: updatedText,
        content: updatedText
      }
      
      session.messages[messageIndex] = updatedMessage
      session.updatedAt = Date.now()
      session.lastActive = Date.now()
      
      chatHistoryService.saveSession(session, userId)
      
      return true
    } catch (error) {
      console.error('[UnifiedConversationService] Failed to append to streaming message:', error)
      return false
    }
  }
  
  /**
   * End a streaming response
   */
  async endStreamingResponse(
    messageId: string
  ): Promise<boolean> {
    const conversationId = this.stateManager.getCurrentConversationId()
    
    if (!conversationId) {
      return false
    }
    
    const userId = this.getCurrentUserId()
    const session = chatHistoryService.getSession(conversationId, userId)
    
    if (!session) {
      return false
    }
    
    try {
      const messageIndex = session.messages.findIndex(m => m.id === messageId || m.messageId === messageId)
      
      if (messageIndex === -1) {
        return false
      }
      
      const existingMessage = session.messages[messageIndex]
      
      // Extract links from final text
      const links = extractUrls(existingMessage.text)
      
      const updatedMessage: ChatMessage = {
        ...existingMessage,
        status: 'success',
        inputType: this.stateManager.getCurrentMode(),
        // Add links as metadata (existing schema doesn't have links field)
      }
      
      session.messages[messageIndex] = updatedMessage
      session.updatedAt = Date.now()
      session.lastActive = Date.now()
      
      chatHistoryService.saveSession(session, userId)
      
      this.stateManager.setMessageStreaming(messageId, false)
      this.stateManager.setMessageState(messageId, 'completed')
      
      return true
    } catch (error) {
      console.error('[UnifiedConversationService] Failed to end streaming message:', error)
      return false
    }
  }
  
  /**
   * Detect the last mode from a session's messages
   */
  private detectLastMode(session: ChatSession): ConversationMode {
    // Look for the most recent message with inputType
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const message = session.messages[i]
      if (message.inputType === 'voice') {
        return 'voice'
      }
      if (message.inputType === 'text') {
        return 'text'
      }
    }
    return 'text'
  }
  
  /**
   * Convert ChatMessage to UnifiedMessage
   */
  private convertToUnifiedMessage(
    message: ChatMessage,
    conversationId: string
  ): UnifiedMessage {
    return {
      ...message,
      messageId: message.messageId || message.id,
      conversationId,
      mode: (message.inputType as MessageMode) || 'text',
      transcript: message.content || message.text,
      timestamp: message.timestamp || Date.now(),
      links: extractUrls(message.text),
      state: this.mapStatusToState(message.status),
      isStreaming: message.status === 'streaming'
    }
  }
  
  /**
   * Convert UnifiedMessage to ChatMessage
   */
  private convertToChatMessage(message: UnifiedMessage): ChatMessage {
    return {
      id: message.id,
      messageId: message.messageId,
      conversationId: message.conversationId,
      role: message.role,
      text: message.text,
      content: message.transcript || message.text,
      timestamp: message.timestamp,
      inputType: message.mode,
      status: message.status || (message.state === 'error' ? 'failed' : 'success'),
      provider: message.provider,
      audioMetadata: message.audioMetadata,
      requestId: message.requestId
    }
  }
  
  /**
   * Map status to state
   */
  private mapStatusToState(status?: string): MessageState {
    switch (status) {
      case 'streaming': return 'generating'
      case 'failed': return 'error'
      default: return 'completed'
    }
  }
  
  /**
   * Create a user message
   */
  private createUserMessage(
    conversationId: string,
    text: string,
    mode: MessageMode,
    state: MessageState = 'completed'
  ): UnifiedMessage {
    return {
      id: uuidv4(),
      messageId: this.stateManager.generateMessageId(conversationId),
      conversationId,
      role: 'user',
      text,
      content: text,
      mode,
      transcript: text,
      timestamp: Date.now(),
      inputType: mode,
      status: state === 'error' ? 'failed' : 'success',
      links: extractUrls(text),
      state,
      isStreaming: false
    }
  }
  
  /**
   * Get the current conversation mode
   */
  getCurrentMode(): ConversationMode {
    return this.stateManager.getCurrentMode()
  }
  
  /**
   * Set the current conversation mode
   */
  setCurrentMode(mode: ConversationMode): void {
    this.stateManager.setCurrentMode(mode)
  }
  
  /**
   * Get the current conversation ID
   */
  getCurrentConversationId(): string | null {
    return this.stateManager.getCurrentConversationId()
  }
  
  /**
   * Set the current conversation ID
   */
  setCurrentConversationId(conversationId: string | null): void {
    this.stateManager.setCurrentConversationId(conversationId)
  }
  
  /**
   * Switch to voice mode
   */
  switchToVoiceMode(): void {
    this.stateManager.setCurrentMode('voice')
  }
  
  /**
   * Switch to text mode
   */
  switchToTextMode(): void {
    this.stateManager.setCurrentMode('text')
  }
  
  /**
   * Check if in voice mode
   */
  isVoiceMode(): boolean {
    return this.stateManager.getCurrentMode() === 'voice'
  }
  
  /**
   * Check if in text mode
   */
  isTextMode(): boolean {
    return this.stateManager.getCurrentMode() === 'text'
  }
  
  /**
   * Get message state
   */
  getMessageState(messageId: string): MessageState | undefined {
    return this.stateManager.getMessageState(messageId)
  }
  
  /**
   * Set message state
   */
  setMessageState(messageId: string, state: MessageState): void {
    this.stateManager.setMessageState(messageId, state)
  }
  
  /**
   * Reset the service
   */
  reset(): void {
    this.stateManager.reset()
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stateManager.stopAllStreaming()
    this.stateManager.reset()
  }
}

// ============================================================================
// Exports
// ============================================================================

export const unifiedConversationService = new UnifiedConversationService()

export {
  ConversationStateManager,
  extractUrls,
  normalizeUrl,
  containsUrls
}
