import { firebaseAuthService } from './firebaseAuth'
import { firestore } from '../lib/firebase'
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore'

export interface Message {
  id: string
  messageId?: string
  conversationId?: string
  requestId?: string
  role: 'user' | 'model' | 'assistant' | 'system'
  text: string
  content?: string
  timestamp?: number
  inputType?: 'voice' | 'text'
  status?: 'success' | 'failed' | 'streaming'
  audioMetadata?: {
    duration?: number
    sampleRate?: number
    confidence?: number
  }
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  lastActive?: number
  draft?: string
}

const BASE_SESSIONS_STORAGE_KEY = 'iris_chat_sessions_v3_'
const BASE_ACTIVE_SESSION_KEY = 'iris_active_session_id_v3_'
const BASE_DRAFTS_STORAGE_KEY = 'iris_chat_drafts_v3_'
const ACTIVE_SESSION_CACHE_KEY = 'iris_active_chat_session_cache_v3'

class ChatHistoryService {
  private activeUserId: string

  constructor() {
    this.activeUserId = firebaseAuthService.getUserId()
    this.initAuthListener()
    this.ensureInitialActiveSession()
  }

  private initAuthListener() {
    firebaseAuthService.onAuthStateChanged((user) => {
      if (user && user.uid && user.uid !== this.activeUserId) {
        this.activeUserId = user.uid
        const sessions = this.getSessions(user.uid)
        window.dispatchEvent(new CustomEvent('iris:sessions-updated', { detail: sessions }))
        this.syncFromFirestore(user.uid).catch(() => {})
      }
    })
    // Initial sync
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.syncFromFirestore(this.activeUserId).catch(() => {})
      }, 100)
    }
  }

  private ensureInitialActiveSession() {
    if (typeof window === 'undefined') return
    try {
      const activeId = this.getActiveSessionId()
      const sessions = this.getSessions()
      const existing = sessions.find((s) => s.id === activeId)
      if (!existing) {
        // If no matching session exists, create or link first
        if (sessions.length > 0) {
          this.setActiveSessionId(sessions[0].id)
        } else {
          // Initialize fresh active session cached locally
          const initialSession: ChatSession = {
            id: activeId,
            title: 'New Conversation',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
          }
          this.saveSessions([initialSession])
        }
      }
    } catch (_e) {}
  }

  private getStorageKey(userId?: string): string {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    return `${BASE_SESSIONS_STORAGE_KEY}${uid}`
  }

  private getActiveStorageKey(userId?: string): string {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    return `${BASE_ACTIVE_SESSION_KEY}${uid}`
  }

  private getDraftsStorageKey(userId?: string): string {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    return `${BASE_DRAFTS_STORAGE_KEY}${uid}`
  }

  /**
   * Returns all stored sessions for the user from local storage
   */
  public getSessions(userId?: string): ChatSession[] {
    try {
      const key = this.getStorageKey(userId)
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          return this.deduplicateSessions(parsed)
        }
      }
    } catch (_e) {}
    return []
  }

  /**
   * Saves sessions list to local storage and notifies listeners
   */
  public saveSessions(sessions: ChatSession[], userId?: string) {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const deduplicated = this.deduplicateSessions(sessions)
    try {
      const key = this.getStorageKey(uid)
      const prevRaw = localStorage.getItem(key)
      const nextRaw = JSON.stringify(deduplicated)
      if (prevRaw !== nextRaw) {
        localStorage.setItem(key, nextRaw)
        // Also cache the currently active session for instant startup hydration
        const activeId = this.getActiveSessionId(uid)
        const activeSession = deduplicated.find((s) => s.id === activeId)
        if (activeSession) {
          localStorage.setItem(ACTIVE_SESSION_CACHE_KEY, JSON.stringify(activeSession))
        }
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('iris:sessions-updated', { detail: deduplicated }))
        }, 0)
      }
    } catch (_e) {}

    // Async background sync to Firestore with persistent offline cache
    this.syncToFirestore(uid, deduplicated).catch(() => {})
  }

  /**
   * Retrieves the active session ID from local storage
   */
  public getActiveSessionId(userId?: string): string {
    const key = this.getActiveStorageKey(userId)
    let saved = localStorage.getItem(key)
    if (saved && saved.trim()) return saved.trim()

    // If user has existing sessions, default to the most recent session
    const existing = this.getSessions(userId)
    if (existing.length > 0 && existing[0]?.id) {
      saved = existing[0].id
      localStorage.setItem(key, saved)
      return saved
    }

    saved = `session_${Date.now()}`
    localStorage.setItem(key, saved)
    return saved
  }

  /**
   * Retrieves the active session object with full message history from local storage
   */
  public getActiveSession(userId?: string): ChatSession | null {
    const activeId = this.getActiveSessionId(userId)
    const sessions = this.getSessions(userId)
    const found = sessions.find((s) => s.id === activeId)
    if (found) return found

    // Fallback: Check instant active session cache
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.id === activeId) return parsed
      }
    } catch (_e) {}

    return null
  }

  /**
   * Sets the active session ID in local storage and broadcasts changes
   */
  public setActiveSessionId(id: string, userId?: string) {
    const key = this.getActiveStorageKey(userId)
    localStorage.setItem(key, id)

    // Cache active session snapshot
    const sessions = this.getSessions(userId)
    const activeSession = sessions.find((s) => s.id === id)
    if (activeSession) {
      localStorage.setItem(ACTIVE_SESSION_CACHE_KEY, JSON.stringify(activeSession))
    }

    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('iris:active-session-changed', { detail: id }))
    }, 0)
  }

  /**
   * Appends or updates a message in the active session directly in local storage
   */
  public appendMessageToActiveSession(message: Message, userId?: string): ChatSession {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const activeId = this.getActiveSessionId(uid)
    const sessions = this.getSessions(uid)
    const existingIdx = sessions.findIndex((s) => s.id === activeId)

    const now = Date.now()
    let updatedSession: ChatSession

    if (existingIdx >= 0) {
      const current = sessions[existingIdx]
      const msgIdx = current.messages.findIndex((m) => m.id === message.id)
      let nextMsgs: Message[]

      if (msgIdx >= 0) {
        nextMsgs = [...current.messages]
        nextMsgs[msgIdx] = { ...nextMsgs[msgIdx], ...message }
      } else {
        nextMsgs = [...current.messages, message].slice(-60)
      }

      const userFirstMsg = nextMsgs.find((m) => m.role === 'user')
      const derivedTitle =
        current.title === 'New Conversation' && userFirstMsg
          ? userFirstMsg.text.slice(0, 36)
          : current.title

      updatedSession = {
        ...current,
        title: derivedTitle,
        updatedAt: now,
        lastActive: now,
        messages: nextMsgs
      }
      sessions[existingIdx] = updatedSession
    } else {
      const userFirstMsg = message.role === 'user' ? message.text.slice(0, 36) : 'New Conversation'
      updatedSession = {
        id: activeId,
        title: userFirstMsg,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
        messages: [message]
      }
      sessions.unshift(updatedSession)
    }

    this.saveSessions(sessions, uid)
    return updatedSession
  }

  /**
   * Updates an existing message in the active session
   */
  public updateMessageInActiveSession(
    messageId: string,
    updates: Partial<Message>,
    userId?: string
  ): ChatSession | null {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const activeId = this.getActiveSessionId(uid)
    const sessions = this.getSessions(uid)
    const existingIdx = sessions.findIndex((s) => s.id === activeId)

    if (existingIdx < 0) return null

    const current = sessions[existingIdx]
    const msgIdx = current.messages.findIndex((m) => m.id === messageId)
    if (msgIdx < 0) return null

    const nextMsgs = [...current.messages]
    nextMsgs[msgIdx] = { ...nextMsgs[msgIdx], ...updates }

    const updatedSession: ChatSession = {
      ...current,
      updatedAt: Date.now(),
      lastActive: Date.now(),
      messages: nextMsgs
    }

    sessions[existingIdx] = updatedSession
    this.saveSessions(sessions, uid)
    return updatedSession
  }

  /**
   * Formats the recent multi-turn messages from the active session into conversational context
   * for passing to AI / LLM requests to preserve conversation context.
   */
  public getConversationHistoryForContext(
    sessionId?: string,
    maxTurns: number = 8,
    userId?: string
  ): Array<{ role: 'user' | 'model'; text: string }> {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const targetSessionId = sessionId || this.getActiveSessionId(uid)
    const sessions = this.getSessions(uid)
    const targetSession = sessions.find((s) => s.id === targetSessionId)

    if (!targetSession || !Array.isArray(targetSession.messages) || targetSession.messages.length === 0) {
      return []
    }

    // Filter out pure system messages and empty text, take last N turns
    const validMessages = targetSession.messages
      .filter((m) => m && m.text && m.text.trim() && (m.role === 'user' || m.role === 'model' || m.role === 'assistant'))
      .map((m) => ({
        role: (m.role === 'assistant' ? 'model' : m.role) as 'user' | 'model',
        text: m.text.trim()
      }))

    return validMessages.slice(-maxTurns)
  }

  /**
   * Local Storage caching for user input drafts per session
   */
  public saveDraft(sessionId: string, draftText: string, userId?: string) {
    if (!sessionId) return
    try {
      const key = this.getDraftsStorageKey(userId)
      const raw = localStorage.getItem(key)
      const drafts: Record<string, string> = raw ? JSON.parse(raw) : {}
      if (draftText && draftText.trim()) {
        drafts[sessionId] = draftText
      } else {
        delete drafts[sessionId]
      }
      localStorage.setItem(key, JSON.stringify(drafts))
    } catch (_e) {}
  }

  public getDraft(sessionId: string, userId?: string): string {
    if (!sessionId) return ''
    try {
      const key = this.getDraftsStorageKey(userId)
      const raw = localStorage.getItem(key)
      if (raw) {
        const drafts = JSON.parse(raw)
        return drafts[sessionId] || ''
      }
    } catch (_e) {}
    return ''
  }

  public clearDraft(sessionId: string, userId?: string) {
    this.saveDraft(sessionId, '', userId)
  }

  public createNewSession(userId?: string): string {
    const newId = `session_${Date.now()}`
    this.setActiveSessionId(newId, userId)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('iris:new-chat', { detail: newId }))
    }, 0)
    return newId
  }

  public deleteSession(id: string, userId?: string): ChatSession[] {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const sessions = this.getSessions(uid).filter((s) => s.id !== id)
    this.saveSessions(sessions, uid)
    this.clearDraft(id, uid)

    // Delete from Firestore
    try {
      const sessionDocRef = doc(firestore, 'users', uid, 'chatSessions', id)
      deleteDoc(sessionDocRef).catch(() => {})
    } catch (_e) {}

    if (this.getActiveSessionId(uid) === id) {
      this.createNewSession(uid)
    }
    return sessions
  }

  public clearAllSessions(userId?: string) {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const currentSessions = this.getSessions(uid)
    this.saveSessions([], uid)
    try {
      localStorage.removeItem(this.getDraftsStorageKey(uid))
      localStorage.removeItem(ACTIVE_SESSION_CACHE_KEY)
    } catch (_e) {}
    this.createNewSession(uid)

    // Clear Firestore documents for this user
    try {
      currentSessions.forEach((s) => {
        const sessionDocRef = doc(firestore, 'users', uid, 'chatSessions', s.id)
        deleteDoc(sessionDocRef).catch(() => {})
      })
    } catch (_e) {}
  }

  private deduplicateSessions(sessions: ChatSession[]): ChatSession[] {
    const seen = new Set<string>()
    const result: ChatSession[] = []
    for (const session of sessions) {
      if (session && session.id && !seen.has(session.id)) {
        seen.add(session.id)
        // Deduplicate messages within session
        const msgSeen = new Set<string>()
        const cleanMessages: Message[] = []
        for (const msg of session.messages || []) {
          if (msg && msg.id && !msgSeen.has(msg.id)) {
            msgSeen.add(msg.id)
            cleanMessages.push(msg)
          }
        }
        result.push({
          ...session,
          messages: cleanMessages
        })
      }
    }
    return result
  }

  private async syncToFirestore(userId: string, sessions: ChatSession[]) {
    if (!userId || typeof window === 'undefined') return
    try {
      for (const session of sessions) {
        const sessionDocRef = doc(firestore, 'users', userId, 'chatSessions', session.id)
        await setDoc(
          sessionDocRef,
          {
            id: session.id,
            userId,
            title: session.title || 'Conversation',
            createdAt: session.createdAt || Date.now(),
            updatedAt: session.updatedAt || Date.now(),
            messages: session.messages || []
          },
          { merge: true }
        )
      }
    } catch (_e) {
      // Offline writes are queued automatically in Firestore cache
    }
  }

  public async syncFromFirestore(userId: string): Promise<ChatSession[]> {
    if (!userId || typeof window === 'undefined') return this.getSessions(userId)
    try {
      const q = query(
        collection(firestore, 'users', userId, 'chatSessions'),
        orderBy('updatedAt', 'desc')
      )
      const querySnapshot = await getDocs(q)
      if (!querySnapshot.empty) {
        const firestoreSessions: ChatSession[] = []
        querySnapshot.forEach((d) => {
          const data = d.data()
          if (data && data.id && Array.isArray(data.messages)) {
            firestoreSessions.push({
              id: data.id,
              title: data.title || 'Conversation',
              createdAt: data.createdAt || Date.now(),
              updatedAt: data.updatedAt || Date.now(),
              messages: data.messages
            })
          }
        })

        if (firestoreSessions.length > 0) {
          const localSessions = this.getSessions(userId)
          const mergedMap = new Map<string, ChatSession>()
          firestoreSessions.forEach((s) => mergedMap.set(s.id, s))
          localSessions.forEach((s) => {
            if (!mergedMap.has(s.id) || s.updatedAt > (mergedMap.get(s.id)?.updatedAt || 0)) {
              mergedMap.set(s.id, s)
            }
          })
          const merged = Array.from(mergedMap.values())
          const key = this.getStorageKey(userId)
          localStorage.setItem(key, JSON.stringify(merged))
          window.dispatchEvent(new CustomEvent('iris:sessions-updated', { detail: merged }))
          return merged
        }
      }
    } catch (_e) {
      // Offline fallback: rely on local persistent cache
    }
    return this.getSessions(userId)
  }
}

export const chatHistoryService = new ChatHistoryService()

