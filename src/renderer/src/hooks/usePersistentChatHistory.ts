/**
 * usePersistentChatHistory Hook
 * Provides bidirectional chat history & user context persistence across application sessions.
 * Seamlessly integrates local storage caching, Firestore cloud synchronization,
 * and Mem0 long-term memory for context-aware conversational continuity.
 * Now integrated with unified conversation service for shared voice/text history.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { chatHistoryService, Message, ChatSession } from '../services/chatHistoryService'
import { useMem0 } from '../context/Mem0Context'
import { firebaseAuthService } from '../services/firebaseAuth'
import { unifiedConversationService, UnifiedMessage, MessageMode, MessageState } from '../services/unifiedConversationService'
import { extractUrls, normalizeUrl } from '../services/linkNormalizationService'

export interface UsePersistentChatHistoryOptions {
  autoExtractMem0?: boolean
  maxContextTurns?: number
  defaultSessionTitle?: string
}

export function usePersistentChatHistory(options: UsePersistentChatHistoryOptions = {}) {
  const {
    autoExtractMem0 = true,
    maxContextTurns = 10,
    defaultSessionTitle = 'New Conversation'
  } = options

  // Access Mem0 Long-Term Memory Context
  const mem0 = useMem0()

  const [activeUserId, setActiveUserId] = useState<string>(() => firebaseAuthService.getUserId())
  const [sessions, setSessions] = useState<ChatSession[]>(() => chatHistoryService.getSessions())
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    chatHistoryService.getActiveSessionId()
  )
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [draft, setDraft] = useState<string>('')

  // Derive current active session and messages
  const activeSession = useMemo<ChatSession | null>(() => {
    const found = sessions.find((s) => s.id === activeSessionId)
    if (found) return found
    const cached = chatHistoryService.getActiveSession(activeUserId)
    return cached
  }, [sessions, activeSessionId, activeUserId])

  const messages = useMemo<Message[]>(() => {
    return activeSession?.messages || []
  }, [activeSession])

  // Refresh sessions from storage & service
  const refreshSessions = useCallback(() => {
    const currentUid = firebaseAuthService.getUserId()
    setActiveUserId(currentUid)
    const storedSessions = chatHistoryService.getSessions(currentUid)
    setSessions(storedSessions)

    const activeId = chatHistoryService.getActiveSessionId(currentUid)
    setActiveSessionId(activeId)

    const currentDraft = chatHistoryService.getDraft(activeId, currentUid)
    setDraft(currentDraft)
  }, [])

  // Subscribe to storage and custom window events
  useEffect(() => {
    refreshSessions()

    const handleSessionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setSessions(e.detail)
      } else {
        refreshSessions()
      }
    }

    const handleActiveSessionChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setActiveSessionId(e.detail)
        const currentUid = firebaseAuthService.getUserId()
        const currentDraft = chatHistoryService.getDraft(e.detail, currentUid)
        setDraft(currentDraft)
      }
    }

    const handleNewChat = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setActiveSessionId(e.detail)
        setDraft('')
      }
    }

    window.addEventListener('iris:sessions-updated', handleSessionsUpdated)
    window.addEventListener('iris:active-session-changed', handleActiveSessionChanged)
    window.addEventListener('iris:new-chat', handleNewChat)

    const unsubAuth = firebaseAuthService.subscribe((user) => {
      if (user?.uid) {
        setActiveUserId(user.uid)
        refreshSessions()
      }
    })

    return () => {
      window.removeEventListener('iris:sessions-updated', handleSessionsUpdated)
      window.removeEventListener('iris:active-session-changed', handleActiveSessionChanged)
      window.removeEventListener('iris:new-chat', handleNewChat)
      unsubAuth()
    }
  }, [refreshSessions])

  /**
   * Appends or updates a message in the active session and automatically
   * records context into Mem0 when an interaction turn finishes.
   * Now also saves to unified conversation service for shared voice/text history.
   */
  const appendMessage = useCallback(
    async (
      msgData: Omit<Message, 'id'> & { id?: string },
      options?: { persistToMem0?: boolean }
    ): Promise<Message> => {
      const msg: Message = {
        id: msgData.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        messageId: msgData.messageId || msgData.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        conversationId: msgData.conversationId || activeSessionId || `session_${Date.now()}`,
        timestamp: msgData.timestamp || Date.now(),
        mode: msgData.mode || msgData.inputType,
        ...msgData
      }

      // 1. Update persistent local storage session
      const updated = chatHistoryService.appendMessageToActiveSession(msg, activeUserId)
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === updated.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [updated, ...prev]
      })

      // 2. Also save to unified conversation service
      try {
        const mode: MessageMode = msg.mode === 'voice' ? 'voice' : 'text'
        const state: MessageState = msg.status === 'failed' ? 'error' : 'completed'
        await unifiedConversationService.addMessage({
          mode,
          text: msg.text,
          role: msg.role as 'user' | 'model' | 'assistant' | 'system',
          state,
          links: extractUrls(msg.text)
        })
      } catch (unifiedErr: any) {
        console.warn('[usePersistentChatHistory] Failed to save to unified conversation:', unifiedErr)
      }

      // 3. Automatically record interaction context to Mem0 for conversational continuity
      const shouldExtract = options?.persistToMem0 ?? autoExtractMem0
      if (shouldExtract && msg.role === 'model' && msg.text && msg.text.trim()) {
        const lastUserMsg = updated.messages.filter((m) => m.role === 'user').slice(-1)[0]
        if (lastUserMsg && lastUserMsg.text) {
          try {
            await mem0.recordInteraction(lastUserMsg.text, msg.text)
          } catch (err) {
            console.warn('[usePersistentChatHistory] Mem0 context extraction notice:', err)
          }
        }
      }

      return msg
    },
    [activeUserId, activeSessionId, autoExtractMem0, mem0]
  )

  /**
   * Updates an existing message in the active session (e.g. streaming chunks or retry state)
   * Also updates unified conversation service
   */
  const updateMessage = useCallback(
    (messageId: string, updates: Partial<Message>): boolean => {
      const updated = chatHistoryService.updateMessageInActiveSession(
        messageId,
        updates,
        activeUserId
      )
      if (updated) {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === updated.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          return prev
        })
        
        // Also update unified conversation
        try {
          const msgToUpdate = updated.messages.find(m => m.id === messageId || m.messageId === messageId)
          if (msgToUpdate) {
            const mode: MessageMode = msgToUpdate.mode === 'voice' ? 'voice' : 'text'
            const state: MessageState = msgToUpdate.status === 'failed' ? 'error' : 'completed'
            unifiedConversationService.updateMessage(messageId, {
              text: msgToUpdate.text,
              state,
              links: extractUrls(msgToUpdate.text)
            }).catch(() => {})
          }
        } catch (unifiedErr: any) {
          console.warn('[usePersistentChatHistory] Failed to update unified conversation:', unifiedErr)
        }
        
        return true
      }
      return false
    },
    [activeUserId]
  )

  /**
   * Switch active session
   */
  const switchSession = useCallback(
    (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionId) return
      chatHistoryService.setActiveSessionId(sessionId, activeUserId)
      setActiveSessionId(sessionId)
      const currentDraft = chatHistoryService.getDraft(sessionId, activeUserId)
      setDraft(currentDraft)
    },
    [activeSessionId, activeUserId]
  )

  /**
   * Create a new conversation session
   */
  const createNewSession = useCallback(
    (title: string = defaultSessionTitle): string => {
      const newId = chatHistoryService.createNewSession(activeUserId)
      if (title && title !== defaultSessionTitle) {
        const stored = chatHistoryService.getSessions(activeUserId)
        const current = stored.find((s) => s.id === newId)
        if (current) {
          current.title = title
          chatHistoryService.saveSessions(stored, activeUserId)
        }
      }
      setActiveSessionId(newId)
      setDraft('')
      refreshSessions()
      return newId
    },
    [activeUserId, defaultSessionTitle, refreshSessions]
  )

  /**
   * Delete a conversation session
   */
  const deleteSession = useCallback(
    (sessionId: string) => {
      const updatedSessions = chatHistoryService.deleteSession(sessionId, activeUserId)
      setSessions(updatedSessions)
      const nextActiveId = chatHistoryService.getActiveSessionId(activeUserId)
      setActiveSessionId(nextActiveId)
    },
    [activeUserId]
  )

  /**
   * Clear all sessions and wipe local conversation cache
   */
  const clearAllHistory = useCallback(() => {
    chatHistoryService.clearAllSessions(activeUserId)
    refreshSessions()
  }, [activeUserId, refreshSessions])

  /**
   * Draft handling per session
   */
  const saveDraft = useCallback(
    (text: string) => {
      setDraft(text)
      chatHistoryService.saveDraft(activeSessionId, text, activeUserId)
    },
    [activeSessionId, activeUserId]
  )

  const clearDraft = useCallback(() => {
    setDraft('')
    chatHistoryService.clearDraft(activeSessionId, activeUserId)
  }, [activeSessionId, activeUserId])

  /**
   * Gets conversation turns for LLM prompt context
   */
  const getContextHistory = useCallback(
    (maxTurns: number = maxContextTurns) => {
      return chatHistoryService.getConversationHistoryForContext(
        activeSessionId,
        maxTurns,
        activeUserId
      )
    },
    [activeSessionId, maxContextTurns, activeUserId]
  )

  /**
   * Synthesizes both Mem0 persistent memories and recent conversation turns
   * to enrich LLM prompts with complete conversational continuity.
   * Now includes unified conversation context.
   */
  const buildEnrichedPrompt = useCallback(
    async (
      userPrompt: string,
      baseSystemInstruction?: string
    ): Promise<{
      systemInstruction: string
      conversationTurns: Array<{ role: 'user' | 'model'; text: string }>
      memoriesUsed: number
    }> => {
      // 1. Get recent session turns
      const turns = getContextHistory(maxContextTurns)

      // 2. Also get unified conversation context
      let unifiedTurns: Array<{ role: 'user' | 'model'; text: string }> = []
      try {
        const activeConv = await unifiedConversationService.getActiveConversation()
        if (activeConv) {
          unifiedTurns = activeConv.messages
            .filter(m => m.role === 'user' || m.role === 'model' || m.role === 'assistant')
            .map(m => ({
              role: (m.role === 'assistant' ? 'model' : m.role) as 'user' | 'model',
              text: m.text
            }))
            .slice(-maxContextTurns)
        }
      } catch (unifiedErr: any) {
        console.warn('[usePersistentChatHistory] Failed to get unified conversation context:', unifiedErr)
      }

      // 3. Retrieve Mem0 context & user preferences
      const mem0Result = await mem0.enrichPrompt(userPrompt, baseSystemInstruction)

      // Combine turns from both sources
      const allTurns = [...turns, ...unifiedTurns]

      return {
        systemInstruction: mem0Result.systemInstruction,
        conversationTurns: allTurns,
        memoriesUsed: mem0Result.memoryCount
      }
    },
    [getContextHistory, maxContextTurns, mem0]
  )

  /**
   * Export all chat sessions as JSON string
   */
  const exportHistoryJson = useCallback((): string => {
    return JSON.stringify(
      {
        exportedAt: Date.now(),
        userId: activeUserId,
        sessions
      },
      null,
      2
    )
  }, [activeUserId, sessions])

  /**
   * Import chat sessions from JSON string
   */
  const importHistoryJson = useCallback(
    (jsonStr: string): boolean => {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed && Array.isArray(parsed.sessions)) {
          const merged = [...sessions, ...parsed.sessions]
          chatHistoryService.saveSessions(merged, activeUserId)
          refreshSessions()
          return true
        }
      } catch (err) {
        console.warn('[usePersistentChatHistory] Import error:', err)
      }
      return false
    },
    [activeUserId, sessions, refreshSessions]
  )

  return {
    // Current Active State
    activeSessionId,
    activeSession,
    messages,
    sessions,
    draft,
    isLoading,
    activeUserId,

    // Mem0 Integration
    mem0,
    memories: mem0.memories,
    mem0Stats: mem0.stats,

    // Operations
    appendMessage,
    updateMessage,
    switchSession,
    createNewSession,
    deleteSession,
    clearAllHistory,
    saveDraft,
    clearDraft,
    getContextHistory,
    buildEnrichedPrompt,
    exportHistoryJson,
    importHistoryJson,
    refreshSessions
  }
}

export default usePersistentChatHistory
