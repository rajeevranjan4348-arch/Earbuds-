import { VoiceTurnMessage, VoicePersonalityId, SupportedLanguage } from './VoiceTypes'
import { getPersonality } from './personalities'
import { safeJsonStringify } from '../../lib/safeJson'
import { chatHistoryService, Message as UnifiedMessage, ChatSession as UnifiedChatSession } from '../chatHistoryService'

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

const LEGACY_STORAGE_KEY = 'iris_voice_transcript_history_v1'

export class VoiceTranscriptStorageService {
  private activeSessionId: string | null = null
  private listeners: Set<(sessions: VoiceInteractionSession[]) => void> = new Set()

  constructor() {
    this.initSyncAndMigration()
  }

  /**
   * Initializes listeners to unified chat history updates and migrates legacy voice storage
   */
  private initSyncAndMigration(): void {
    if (typeof window === 'undefined') return

    // Auto-migrate legacy isolated voice transcripts into unified chatHistoryService
    try {
      const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (rawLegacy) {
        const legacySessions = JSON.parse(rawLegacy)
        if (Array.isArray(legacySessions) && legacySessions.length > 0) {
          const currentUnified = chatHistoryService.getSessions()
          for (const leg of legacySessions) {
            if (leg && leg.id && !currentUnified.some((s) => s.id === leg.id)) {
              const mappedMessages: UnifiedMessage[] = (leg.messages || []).map((m: any) => ({
                id: m.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                conversationId: leg.id,
                role: m.role === 'assistant' ? 'assistant' : 'user',
                mode: 'voice' as const,
                inputType: 'voice' as const,
                text: m.text || '',
                transcript: m.text || '',
                content: m.text || '',
                timestamp: m.timestamp || leg.startTime || Date.now(),
                status: 'success' as const
              }))

              const newSession: UnifiedChatSession = {
                id: leg.id,
                title: leg.title || 'Voice Conversation',
                createdAt: leg.startTime || Date.now(),
                updatedAt: leg.endTime || leg.startTime || Date.now(),
                lastMode: 'voice',
                messages: mappedMessages
              }
              currentUnified.push(newSession)
            }
          }
          chatHistoryService.saveSessions(currentUnified)
          // Clean legacy key once migrated
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        }
      }
    } catch (e) {
      console.warn('[VoiceTranscriptStorage] Legacy migration notice:', e)
    }

    // Listen to unified session update broadcasts across app
    window.addEventListener('iris:sessions-updated', () => {
      this.notifyListeners(this.getAllSessions())
    })

    window.addEventListener('iris:active-session-changed', (e: any) => {
      if (e?.detail) {
        this.activeSessionId = e.detail
      }
    })
  }

  /**
   * Returns all unified sessions as VoiceInteractionSessions, preserving unified history
   */
  public getAllSessions(): VoiceInteractionSession[] {
    try {
      const unifiedSessions = chatHistoryService.getSessions()
      const personality = getPersonality('jarvis')

      return unifiedSessions.map((cs) => {
        const voiceMessages: VoiceTurnMessage[] = (cs.messages || []).map((m) => ({
          id: m.id,
          role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
          text: m.text || m.content || m.transcript || '',
          timestamp: m.timestamp || cs.createdAt,
          language: 'auto',
          metadata: {
            inputMode: m.mode || (m.inputType === 'voice' ? 'voice' : 'text'),
            wakeWord: 'Hey JARVIS',
            voiceMode: 'jarvis',
            timestamp: new Date(m.timestamp || cs.createdAt).toISOString()
          }
        }))

        const lastMsg = cs.messages && cs.messages.length > 0 ? cs.messages[cs.messages.length - 1] : null
        const preview = lastMsg ? (lastMsg.text || lastMsg.transcript || '').slice(0, 100) : 'Conversation started'

        return {
          id: cs.id,
          startTime: cs.createdAt,
          endTime: cs.updatedAt,
          personality: 'jarvis',
          personalityName: personality.name,
          personalityColor: personality.accentColor || '#10b981',
          language: 'auto',
          title: cs.title || 'Conversation',
          previewText: preview,
          messages: voiceMessages,
          totalTurns: voiceMessages.length,
          createdAt: new Date(cs.createdAt).toISOString()
        }
      })
    } catch (err) {
      console.error('[VoiceTranscriptStorage] Failed to read unified sessions:', err)
      return []
    }
  }

  public getSession(id: string): VoiceInteractionSession | null {
    const all = this.getAllSessions()
    return all.find((s) => s.id === id) || null
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId || chatHistoryService.getActiveSessionId()
  }

  public setActiveSessionId(id: string | null): void {
    this.activeSessionId = id
    if (id) {
      chatHistoryService.setActiveSessionId(id)
    }
  }

  public startNewSession(config?: {
    personality?: VoicePersonalityId
    language?: SupportedLanguage
  }): VoiceInteractionSession {
    const personality = getPersonality(config?.personality || 'jarvis')
    const newSessionId = chatHistoryService.createNewSession()
    this.activeSessionId = newSessionId

    const newSession: VoiceInteractionSession = {
      id: newSessionId,
      startTime: Date.now(),
      personality: config?.personality || 'jarvis',
      personalityName: personality.name,
      personalityColor: personality.accentColor || '#10b981',
      language: config?.language || 'auto',
      title: `Voice Session with ${personality.name}`,
      previewText: 'Started voice interaction session',
      messages: [],
      totalTurns: 0,
      createdAt: new Date().toISOString()
    }

    this.notifyListeners(this.getAllSessions())
    return newSession
  }

  public recordTurn(
    sessionId: string | null,
    message: VoiceTurnMessage,
    _config?: {
      personality?: VoicePersonalityId
      language?: SupportedLanguage
    }
  ): VoiceInteractionSession {
    const targetSessionId = sessionId || this.activeSessionId || chatHistoryService.getActiveSessionId()

    // Persist to unified chat history
    const unifiedMsg: UnifiedMessage = {
      id: message.id,
      messageId: message.id,
      conversationId: targetSessionId,
      role: message.role === 'user' ? 'user' : 'assistant',
      mode: 'voice',
      inputType: 'voice',
      text: message.text,
      transcript: message.text,
      content: message.text,
      timestamp: message.timestamp || Date.now(),
      status: 'success',
      audioState: message.role === 'user' ? 'transcribed' : 'none'
    }

    chatHistoryService.addMessage(targetSessionId, unifiedMsg)
    const updated = this.getSession(targetSessionId)
    this.notifyListeners(this.getAllSessions())

    if (updated) return updated

    return {
      id: targetSessionId,
      startTime: Date.now(),
      personality: 'jarvis',
      personalityName: 'JARVIS',
      personalityColor: '#10b981',
      language: 'auto',
      title: this.generateTitle(message.text),
      previewText: message.text.slice(0, 100),
      messages: [message],
      totalTurns: 1,
      createdAt: new Date().toISOString()
    }
  }

  public saveSession(_session: VoiceInteractionSession): void {
    // Already unified via chatHistoryService
    this.notifyListeners(this.getAllSessions())
  }

  public deleteSession(id: string): void {
    chatHistoryService.deleteSession(id)
    if (this.activeSessionId === id) {
      this.activeSessionId = chatHistoryService.getActiveSessionId()
    }
    this.notifyListeners(this.getAllSessions())
  }

  public clearAll(): void {
    chatHistoryService.clearAllSessions()
    this.activeSessionId = chatHistoryService.getActiveSessionId()
    this.notifyListeners(this.getAllSessions())
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
