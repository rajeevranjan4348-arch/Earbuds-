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
}

const BASE_SESSIONS_STORAGE_KEY = 'iris_chat_sessions_v3_'
const BASE_ACTIVE_SESSION_KEY = 'iris_active_session_id_v3_'

class ChatHistoryService {
  private activeUserId: string

  constructor() {
    this.activeUserId = firebaseAuthService.getUserId()
    this.initAuthListener()
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

  private getStorageKey(userId?: string): string {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    return `${BASE_SESSIONS_STORAGE_KEY}${uid}`
  }

  private getActiveStorageKey(userId?: string): string {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    return `${BASE_ACTIVE_SESSION_KEY}${uid}`
  }

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

  public saveSessions(sessions: ChatSession[], userId?: string) {
    const uid = userId || this.activeUserId || firebaseAuthService.getUserId()
    const deduplicated = this.deduplicateSessions(sessions)
    try {
      const key = this.getStorageKey(uid)
      const prevRaw = localStorage.getItem(key)
      const nextRaw = JSON.stringify(deduplicated)
      if (prevRaw !== nextRaw) {
        localStorage.setItem(key, nextRaw)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('iris:sessions-updated', { detail: deduplicated }))
        }, 0)
      }
    } catch (_e) {}

    // Async background sync to Firestore with persistent offline cache
    this.syncToFirestore(uid, deduplicated).catch(() => {})
  }

  public getActiveSessionId(userId?: string): string {
    const key = this.getActiveStorageKey(userId)
    let saved = localStorage.getItem(key)
    if (saved) return saved

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

  public setActiveSessionId(id: string, userId?: string) {
    const key = this.getActiveStorageKey(userId)
    localStorage.setItem(key, id)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('iris:active-session-changed', { detail: id }))
    }, 0)
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
