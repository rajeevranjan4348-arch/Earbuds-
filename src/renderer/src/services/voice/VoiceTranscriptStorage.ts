import { VoiceTurnMessage, VoicePersonalityId, SupportedLanguage } from './VoiceTypes'
import { getPersonality } from './personalities'
import { safeJsonStringify } from '../../lib/safeJson'

export interface VoiceInteractionSession {
  id: string
  startTime: number
  endTime?: number
  personality: VoicePersonalityId
  personalityName: string
  personalityColor: string
  language: SupportedLanguage
  title: string
  previewText: string
  messages: VoiceTurnMessage[]
  totalTurns: number
  createdAt: string
}

const STORAGE_KEY = 'iris_voice_transcript_history_v1'
const MAX_SESSIONS_STORED = 100

export class VoiceTranscriptStorageService {
  private activeSessionId: string | null = null
  private listeners: Set<(sessions: VoiceInteractionSession[]) => void> = new Set()

  constructor() {
    // Attempt auto-migration or cleanup on initialization
    this.ensureStorageInit()
  }

  private ensureStorageInit(): void {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
      }
    } catch (e) {
      console.warn('[VoiceTranscriptStorage] Storage init warning:', e)
    }
  }

  public getAllSessions(): VoiceInteractionSession[] {
    if (typeof window === 'undefined' || !window.localStorage) return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      }
      return []
    } catch (err) {
      console.error('[VoiceTranscriptStorage] Failed to parse sessions:', err)
      return []
    }
  }

  public getSession(id: string): VoiceInteractionSession | null {
    const all = this.getAllSessions()
    return all.find((s) => s.id === id) || null
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  public setActiveSessionId(id: string | null): void {
    this.activeSessionId = id
  }

  public startNewSession(config: {
    personality: VoicePersonalityId
    language: SupportedLanguage
  }): VoiceInteractionSession {
    const personality = getPersonality(config.personality)
    const newId = `vts_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = Date.now()

    const session: VoiceInteractionSession = {
      id: newId,
      startTime: now,
      personality: config.personality,
      personalityName: personality.name,
      personalityColor: personality.accentColor || '#10b981',
      language: config.language,
      title: `Voice Session with ${personality.name}`,
      previewText: 'Started voice interaction session',
      messages: [],
      totalTurns: 0,
      createdAt: new Date(now).toISOString()
    }

    this.activeSessionId = newId
    this.saveSession(session)
    return session
  }

  public recordTurn(
    sessionId: string | null,
    message: VoiceTurnMessage,
    config?: {
      personality?: VoicePersonalityId
      language?: SupportedLanguage
    }
  ): VoiceInteractionSession {
    let session: VoiceInteractionSession | null = null
    const all = this.getAllSessions()

    if (sessionId) {
      session = all.find((s) => s.id === sessionId) || null
    }

    if (!session) {
      // Create new session if no active session found
      const personalityId = config?.personality || 'jarvis'
      const personality = getPersonality(personalityId)
      const now = Date.now()
      const newId = sessionId || `vts_${now}_${Math.random().toString(36).substring(2, 7)}`

      session = {
        id: newId,
        startTime: now,
        personality: personalityId,
        personalityName: personality.name,
        personalityColor: personality.accentColor || '#10b981',
        language: config?.language || 'auto',
        title:
          message.role === 'user'
            ? this.generateTitle(message.text)
            : `Voice Session with ${personality.name}`,
        previewText: message.text.substring(0, 100),
        messages: [],
        totalTurns: 0,
        createdAt: new Date(now).toISOString()
      }
      this.activeSessionId = newId
    }

    // Append or deduplicate message
    const existingIndex = session.messages.findIndex((m) => m.id === message.id)
    if (existingIndex >= 0) {
      session.messages[existingIndex] = message
    } else {
      session.messages.push(message)
    }

    session.endTime = Date.now()
    session.totalTurns = session.messages.length

    // Update title based on first user question if still default
    if (
      message.role === 'user' &&
      (!session.title || session.title.startsWith('Voice Session with'))
    ) {
      session.title = this.generateTitle(message.text)
    }

    // Update preview with the latest message text
    session.previewText = message.text.slice(0, 120).replace(/\n+/g, ' ')

    this.saveSession(session)
    return session
  }

  public saveSession(session: VoiceInteractionSession): void {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      const all = this.getAllSessions()
      const index = all.findIndex((s) => s.id === session.id)

      if (index >= 0) {
        all[index] = session
      } else {
        all.unshift(session)
      }

      // Limit storage array to max stored sessions to prevent localStorage overflow
      const trimmed = all.slice(0, MAX_SESSIONS_STORED)
      localStorage.setItem(STORAGE_KEY, safeJsonStringify(trimmed))
      this.notifyListeners(trimmed)
    } catch (err) {
      console.error('[VoiceTranscriptStorage] Failed to save session:', err)
    }
  }

  public deleteSession(id: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      const all = this.getAllSessions().filter((s) => s.id !== id)
      localStorage.setItem(STORAGE_KEY, safeJsonStringify(all))
      if (this.activeSessionId === id) {
        this.activeSessionId = null
      }
      this.notifyListeners(all)
    } catch (err) {
      console.error('[VoiceTranscriptStorage] Failed to delete session:', err)
    }
  }

  public clearAll(): void {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
      this.activeSessionId = null
      this.notifyListeners([])
    } catch (err) {
      console.error('[VoiceTranscriptStorage] Failed to clear sessions:', err)
    }
  }

  public searchSessions(query: string): VoiceInteractionSession[] {
    const q = query.trim().toLowerCase()
    if (!q) return this.getAllSessions()
    return this.getAllSessions().filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q)
      const matchPersonality = s.personalityName.toLowerCase().includes(q)
      const matchPreview = s.previewText.toLowerCase().includes(q)
      const matchMessages = s.messages.some((m) => m.text.toLowerCase().includes(q))
      return matchTitle || matchPersonality || matchPreview || matchMessages
    })
  }

  public formatTranscriptAsPlainText(session: VoiceInteractionSession): string {
    const header = [
      `==================================================`,
      `IRIS VOICE INTERACTION TRANSCRIPT`,
      `==================================================`,
      `Session ID:    ${session.id}`,
      `Date & Time:   ${new Date(session.startTime).toLocaleString()}`,
      `Personality:   ${session.personalityName}`,
      `Language:      ${session.language}`,
      `Total Turns:   ${session.totalTurns}`,
      `Title:         ${session.title}`,
      `==================================================\n`
    ].join('\n')

    const turns = session.messages
      .map((m) => {
        const timeStr = m.timestamp
          ? new Date(m.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          : ''
        const speaker = m.role === 'user' ? 'USER' : session.personalityName.toUpperCase()
        return `[${timeStr}] ${speaker}:\n${m.text}\n`
      })
      .join('\n')

    return `${header}\n${turns}`
  }

  public formatTranscriptAsJson(session: VoiceInteractionSession): string {
    return safeJsonStringify(session, null, 2)
  }

  public subscribe(listener: (sessions: VoiceInteractionSession[]) => void): () => void {
    this.listeners.add(listener)
    // Immediately invoke with current state
    listener(this.getAllSessions())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(sessions: VoiceInteractionSession[]): void {
    for (const listener of this.listeners) {
      try {
        listener(sessions)
      } catch (err) {
        console.warn('[VoiceTranscriptStorage] Listener exception:', err)
      }
    }
  }

  private generateTitle(prompt: string): string {
    const cleaned = prompt.replace(/\s+/g, ' ').trim()
    if (!cleaned) return 'Voice Conversation'
    if (cleaned.length <= 48) return cleaned
    return `${cleaned.substring(0, 45)}...`
  }
}

export const voiceTranscriptStorage = new VoiceTranscriptStorageService()
