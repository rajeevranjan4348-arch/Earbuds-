import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send,
  Plus,
  History,
  Trash2,
  Clock,
  MessageSquare,
  X,
  Search,
  Sparkles,
  Mic
} from 'lucide-react'
import { chatHistoryService, Message, ChatSession } from '../../services/chatHistoryService'
import MicrophoneInputButton from './MicrophoneInputButton'

export type { Message, ChatSession }

interface RightPanelProps {
  interimTranscript?: string
  isListening?: boolean
  onSendPrompt?: (text: string) => void
}

function formatSessionTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffDayCalc(diffHour))

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function diffDayCalc(hours: number): number {
  return Math.floor(hours / 24)
}

/**
 * Normalizes accidental duplicate adjacent tokens and sentences
 * caused by multiple listeners or duplicate stream chunk processing.
 */
function normalizeDuplicateTokens(text: string): string {
  if (!text) return ''
  const trimmed = text.trim()
  const len = trimmed.length

  if (len >= 6 && len % 2 === 0) {
    const half = len / 2
    if (trimmed.slice(0, half) === trimmed.slice(half)) {
      return trimmed.slice(0, half)
    }
  }

  const words = trimmed.split(/\s+/)
  if (words.length >= 4) {
    let duplicatePairs = 0
    for (let i = 0; i < words.length - 1; i += 2) {
      const cleanA = words[i].toLowerCase().replace(/[^a-z0-9]/g, '')
      const cleanB = words[i + 1].toLowerCase().replace(/[^a-z0-9]/g, '')
      if (cleanA && cleanA === cleanB) {
        duplicatePairs++
      }
    }
    if (duplicatePairs >= 2 && duplicatePairs * 2 >= words.length * 0.5) {
      const deduped: string[] = []
      for (let i = 0; i < words.length; i += 2) {
        deduped.push(words[i])
      }
      return deduped.join(' ')
    }
  }

  return trimmed
}

export default function RightPanel({
  interimTranscript = '',
  isListening = false,
  onSendPrompt
}: RightPanelProps) {
  // Session State backed by chatHistoryService
  const [sessions, setSessions] = useState<ChatSession[]>(() => chatHistoryService.getSessions())
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    chatHistoryService.getActiveSessionId()
  )

  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [activeStreamingId, setActiveStreamingId] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tracking refs to ensure idempotency and deduplication
  const activeRequestIdRef = useRef<string | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const seenChunksPerRequestRef = useRef<Map<string, Set<number>>>(new Map())
  const lastChunkRecordRef = useRef<Map<string, { text: string; time: number }>>(new Map())
  const lastSubmissionRef = useRef<{ text: string; time: number }>({ text: '', time: 0 })
  const lastSavedHashRef = useRef<string>('')

  // 1. Initial hydration of chat history from active session or memory
  useEffect(() => {
    let isMounted = true

    const allSessions = chatHistoryService.getSessions()
    const currentSavedSession = allSessions.find((s) => s.id === activeSessionId)
    if (currentSavedSession && currentSavedSession.messages.length > 0) {
      lastSavedHashRef.current = `${activeSessionId}_${currentSavedSession.messages.length}_${
        currentSavedSession.messages[currentSavedSession.messages.length - 1]?.text || ''
      }`
      setChatHistory(currentSavedSession.messages)
      for (const m of currentSavedSession.messages) {
        seenMessageIdsRef.current.add(m.id)
      }
      return
    }

    // Fallback: Check past history from window.iris
    const loadLegacyHistory = async () => {
      if ((window as any).iris?.getHistory) {
        try {
          const pastMemories = await (window as any).iris.getHistory()
          if (!isMounted || !Array.isArray(pastMemories) || pastMemories.length === 0) return

          const map = new Map<string, Message>()
          for (let i = 0; i < pastMemories.length; i++) {
            const m = pastMemories[i]
            const id =
              m.id || `hist_${m.role || 'sys'}_${i}_${m.text?.slice(0, 16).replace(/\s+/g, '')}`
            map.set(id, {
              id,
              requestId: m.requestId,
              role: (m.role || 'system').toLowerCase() as 'user' | 'model' | 'system',
              text: normalizeDuplicateTokens(m.text || ''),
              timestamp: m.timestamp
            })
            seenMessageIdsRef.current.add(id)
          }

          const legacyMessages = Array.from(map.values()).slice(-50)
          if (legacyMessages.length > 0) {
            setChatHistory(legacyMessages)
          }
        } catch (err) {
          console.error('[IRIS] Failed to load legacy history', err)
        }
      }
    }

    loadLegacyHistory()

    return () => {
      isMounted = false
    }
  }, [activeSessionId])

  // 2. Real-time transcript stream listeners
  useEffect(() => {
    let isMounted = true

    const handleTranscript = (data: {
      id?: string
      requestId?: string
      role: string
      text: string
      isFinal?: boolean
      chunkIndex?: number
      mode?: 'delta' | 'cumulative'
    }) => {
      if (!isMounted || !data) return

      const reqId = data.requestId || activeRequestIdRef.current || `req_${Date.now()}`
      const role = data.role as 'user' | 'model' | 'system'

      if (role === 'user') {
        const userMsgId = data.id || `msg_user_${reqId}`
        if (seenMessageIdsRef.current.has(userMsgId)) return

        seenMessageIdsRef.current.add(userMsgId)
        const cleanUserText = normalizeDuplicateTokens(data.text)

        setChatHistory((prev) => {
          if (
            prev.some((m) => m.id === userMsgId || (m.requestId === reqId && m.role === 'user'))
          ) {
            return prev
          }
          const userMsg: Message = {
            id: userMsgId,
            messageId: userMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'user',
            text: cleanUserText,
            content: cleanUserText,
            timestamp: (data as any).timestamp || Date.now(),
            inputType: (data as any).inputType || 'voice'
          }
          return [...prev, userMsg].slice(-50)
        })
      } else if (role === 'model') {
        const assistantMsgId = data.id || `msg_model_${reqId}`

        if (
          activeRequestIdRef.current &&
          activeRequestIdRef.current !== reqId &&
          data.requestId &&
          data.requestId !== activeRequestIdRef.current
        ) {
          activeRequestIdRef.current = reqId
        } else if (!activeRequestIdRef.current) {
          activeRequestIdRef.current = reqId
        }

        if (data.chunkIndex !== undefined) {
          let seenChunks = seenChunksPerRequestRef.current.get(reqId)
          if (!seenChunks) {
            seenChunks = new Set<number>()
            seenChunksPerRequestRef.current.set(reqId, seenChunks)
          }
          if (seenChunks.has(data.chunkIndex)) {
            return
          }
          seenChunks.add(data.chunkIndex)
        }

        const now = Date.now()
        const lastRecord = lastChunkRecordRef.current.get(reqId)
        if (
          lastRecord &&
          lastRecord.text === data.text &&
          now - lastRecord.time < 350 &&
          data.chunkIndex === undefined
        ) {
          return
        }
        lastChunkRecordRef.current.set(reqId, { text: data.text, time: now })

        setActiveStreamingId(assistantMsgId)
        seenMessageIdsRef.current.add(assistantMsgId)

        setChatHistory((prev) => {
          const existingIdx = prev.findIndex(
            (m) => m.id === assistantMsgId || (m.requestId === reqId && m.role === 'model')
          )

          if (existingIdx >= 0) {
            const current = prev[existingIdx]
            let nextText = current.text

            if (
              data.mode === 'cumulative' ||
              (data.text.length >= current.text.length && data.text.startsWith(current.text))
            ) {
              nextText = data.text
            } else {
              if (current.text.endsWith(data.text) && data.text.length > 2) {
                nextText = current.text
              } else {
                nextText = current.text + data.text
              }
            }

            const updated = [...prev]
            updated[existingIdx] = {
              ...current,
              text: nextText,
              content: nextText
            }
            return updated
          } else {
            const newAssistantMsg: Message = {
              id: assistantMsgId,
              messageId: assistantMsgId,
              conversationId: activeSessionId,
              requestId: reqId,
              role: 'model',
              text: data.text,
              content: data.text,
              timestamp: now,
              inputType: (data as any).inputType || 'voice'
            }
            return [...prev, newAssistantMsg].slice(-50)
          }
        })
      }
    }

    const handleTranscriptComplete = (data?: {
      id?: string
      requestId?: string
      role?: string
      text?: string
      status?: 'success' | 'failed'
    }) => {
      if (!isMounted) return

      const reqId = data?.requestId || activeRequestIdRef.current
      if (reqId && activeRequestIdRef.current && reqId !== activeRequestIdRef.current) {
        return
      }

      const assistantMsgId = data?.id || (reqId ? `msg_model_${reqId}` : null)

      if (assistantMsgId) {
        setChatHistory((prev) => {
          const idx = prev.findIndex(
            (m) => m.id === assistantMsgId || (m.requestId === reqId && m.role === 'model')
          )
          if (idx >= 0) {
            const raw = data?.text || prev[idx].text
            const cleaned = normalizeDuplicateTokens(raw.trim())
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              text: cleaned,
              content: cleaned,
              status: data?.status || 'success'
            }
            return updated
          }
          return prev
        })
      }

      setActiveStreamingId(null)
      activeRequestIdRef.current = null
    }

    let unsubTranscript: any
    let unsubComplete: any

    if ((window as any).iris) {
      unsubTranscript = (window as any).iris.onTranscript?.(handleTranscript)
      unsubComplete = (window as any).iris.onTranscriptComplete?.(handleTranscriptComplete)
    }

    return () => {
      isMounted = false
      if (typeof unsubTranscript === 'function') {
        unsubTranscript()
      } else if ((window as any).iris?.offTranscript) {
        ;(window as any).iris.offTranscript(handleTranscript)
      }

      if (typeof unsubComplete === 'function') {
        unsubComplete()
      } else if ((window as any).iris?.offTranscriptComplete) {
        ;(window as any).iris.offTranscriptComplete(handleTranscriptComplete)
      }
    }
  }, [])

  // 3. Auto-save chatHistory into sessions
  useEffect(() => {
    if (chatHistory.length === 0) return

    const currentHash = `${activeSessionId}_${chatHistory.length}_${
      chatHistory[chatHistory.length - 1]?.text || ''
    }`
    if (currentHash === lastSavedHashRef.current) return
    lastSavedHashRef.current = currentHash

    const userFirstMsg = chatHistory.find((m) => m.role === 'user')
    const titleSnippet = userFirstMsg ? userFirstMsg.text.slice(0, 36) : 'Conversation'

    setSessions((prevSessions) => {
      const existingIdx = prevSessions.findIndex((s) => s.id === activeSessionId)
      let nextSessions: ChatSession[]

      if (existingIdx >= 0) {
        if (prevSessions[existingIdx].messages === chatHistory) {
          return prevSessions
        }
        nextSessions = [...prevSessions]
        nextSessions[existingIdx] = {
          ...nextSessions[existingIdx],
          title:
            nextSessions[existingIdx].title === 'New Conversation'
              ? titleSnippet
              : nextSessions[existingIdx].title,
          updatedAt: Date.now(),
          messages: chatHistory
        }
      } else {
        const newSession: ChatSession = {
          id: activeSessionId,
          title: titleSnippet,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: chatHistory
        }
        nextSessions = [newSession, ...prevSessions]
      }

      chatHistoryService.saveSessions(nextSessions)
      return nextSessions
    })
  }, [chatHistory, activeSessionId])

  // 4. Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current && !showHistory) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, showHistory])

  // New Chat Handler
  const handleNewChat = () => {
    const newId = chatHistoryService.createNewSession()
    setActiveSessionId(newId)

    setChatHistory([])
    setActiveStreamingId(null)
    activeRequestIdRef.current = null
    seenMessageIdsRef.current.clear()
    seenChunksPerRequestRef.current.clear()
    lastChunkRecordRef.current.clear()
    setShowHistory(false)
    setInputVal('')

    if ((window as any).iris?.clearHistory) {
      try {
        ;(window as any).iris.clearHistory()
      } catch (_e) {}
    }
  }

  // External sync listeners (from IRISRoot sidebar or history actions)
  useEffect(() => {
    const handleExtNewChat = (e: any) => {
      const newId = e.detail || chatHistoryService.createNewSession()
      setActiveSessionId(newId)
      setChatHistory([])
      setActiveStreamingId(null)
      activeRequestIdRef.current = null
      seenMessageIdsRef.current.clear()
      seenChunksPerRequestRef.current.clear()
      lastChunkRecordRef.current.clear()
      setShowHistory(false)
    }
    const handleExtLoadSession = (e: any) => {
      if (e.detail) {
        handleSelectSession(e.detail)
      }
    }
    const handleExtToggleHistory = () => {
      setShowHistory((prev) => !prev)
    }
    const handleExtSessionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        const updated = e.detail as ChatSession[]
        setSessions((prev) => {
          if (prev.length === updated.length && prev[0]?.updatedAt === updated[0]?.updatedAt) {
            return prev
          }
          return updated
        })
      }
    }
    const handleExtActiveSessionChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setActiveSessionId(e.detail)
      }
    }

    window.addEventListener('iris:new-chat', handleExtNewChat)
    window.addEventListener('iris:load-session', handleExtLoadSession)
    window.addEventListener('iris:toggle-history', handleExtToggleHistory)
    window.addEventListener('iris:sessions-updated', handleExtSessionsUpdated)
    window.addEventListener('iris:active-session-changed', handleExtActiveSessionChanged)

    return () => {
      window.removeEventListener('iris:new-chat', handleExtNewChat)
      window.removeEventListener('iris:load-session', handleExtLoadSession)
      window.removeEventListener('iris:toggle-history', handleExtToggleHistory)
      window.removeEventListener('iris:sessions-updated', handleExtSessionsUpdated)
      window.removeEventListener('iris:active-session-changed', handleExtActiveSessionChanged)
    }
  }, [])

  // Restore past session
  const handleSelectSession = (session: ChatSession) => {
    chatHistoryService.setActiveSessionId(session.id)
    setActiveSessionId(session.id)

    setChatHistory(session.messages)
    seenMessageIdsRef.current.clear()
    for (const m of session.messages) {
      seenMessageIdsRef.current.add(m.id)
    }

    setActiveStreamingId(null)
    activeRequestIdRef.current = null
    setShowHistory(false)
  }

  // Delete specific session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = chatHistoryService.deleteSession(sessionId)
    setSessions(updated)

    if (sessionId === activeSessionId) {
      handleNewChat()
    }
  }

  // Clear all history
  const handleClearAllSessions = () => {
    if (window.confirm('Clear all conversation history?')) {
      chatHistoryService.clearAllSessions()
      setSessions([])
      handleNewChat()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputVal.trim()
    if (!trimmed || isSubmitting) return

    const now = Date.now()
    if (trimmed === lastSubmissionRef.current.text && now - lastSubmissionRef.current.time < 1200) {
      return
    }
    lastSubmissionRef.current = { text: trimmed, time: now }

    setIsSubmitting(true)
    setInputVal('')

    if (onSendPrompt) {
      onSendPrompt(trimmed)
    }

    setTimeout(() => {
      setIsSubmitting(false)
    }, 600)
  }

  // Filtered sessions for History View
  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions
    const query = historySearch.toLowerCase()
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.messages.some((m) => m.text.toLowerCase().includes(query))
    )
  }, [sessions, historySearch])

  return (
    <div className="h-full min-h-0 flex flex-col bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative">
      {/* Header with Conversation title, New Chat and History buttons */}
      <div className="px-4 py-3.5 sm:px-5 sm:py-3.5 border-b border-white/5 flex justify-between items-center shrink-0 bg-black/40">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white/90 tracking-wide">Conversation</h2>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-mono">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium">Live</span>
          </div>
        </div>

        {/* Buttons in place of the live area - icon buttons only without names */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleNewChat}
            title="Start New Chat"
            aria-label="New Chat"
            className="flex items-center justify-center p-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg transition-all cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.12)] active:scale-95"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            title={showHistory ? 'Return to conversation' : 'View chat history'}
            aria-label="History"
            className={`flex items-center justify-center gap-1 p-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer active:scale-95 ${
              showHistory
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border-white/10'
            }`}
          >
            <History size={14} />
            {sessions.length > 0 && (
              <span className="px-1.5 py-0.2 bg-white/10 text-emerald-400 rounded-full text-[10px] font-mono leading-none">
                {sessions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Area: Either Chat History View OR Active Messages */}
      {showHistory ? (
        /* History Overlay View */
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden bg-zinc-950/95 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Chat History
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">({sessions.length} saved)</span>
            </div>

            <button
              onClick={() => setShowHistory(false)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Close history"
            >
              <X size={15} />
            </button>
          </div>

          {/* Search Box */}
          {sessions.length > 0 && (
            <div className="mt-3 relative shrink-0">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40"
              />
            </div>
          )}

          {/* Sessions List */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-small">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500 space-y-3">
                <MessageSquare size={32} className="text-zinc-700" />
                <p className="text-xs">
                  {historySearch ? 'No chats match your search.' : 'No saved chat history yet.'}
                </p>
                <button
                  onClick={handleNewChat}
                  className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs flex items-center gap-1.5 hover:bg-emerald-500/25 transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Start New Conversation</span>
                </button>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.id === activeSessionId
                const lastMsg = session.messages[session.messages.length - 1]

                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col gap-1.5 relative ${
                      isActive
                        ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                        : 'bg-white/5 hover:bg-white/8 border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {session.title || 'Conversation'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {formatSessionTime(session.updatedAt || session.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                          title="Delete chat"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {lastMsg && (
                      <p className="text-[11px] text-zinc-400 line-clamp-1 italic font-light">
                        {lastMsg.role === 'user' ? 'You: ' : 'IRIS: '}
                        {lastMsg.text}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-0.5">
                      <span>{session.messages.length} messages</span>
                      {isActive && (
                        <span className="text-emerald-400 font-mono font-medium">Active</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer Actions */}
          {sessions.length > 0 && (
            <div className="pt-3 border-t border-white/5 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleClearAllSessions}
                className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Clear all history</span>
              </button>

              <button
                type="button"
                onClick={handleNewChat}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} />
                <span>New chat</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Conversation Chat Messages Stream */
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-4 scroll-smooth
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-white/10
            [&::-webkit-scrollbar-thumb]:rounded-full
            hover:[&::-webkit-scrollbar-thumb]:bg-emerald-500/40"
        >
          {chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-4 my-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <Sparkles size={22} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-zinc-200">New Conversation</h3>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Speak into your microphone or type a prompt below to communicate with IRIS.
                </p>
              </div>

              {/* Starter Suggestion Chips */}
              <div className="flex flex-col gap-1.5 w-full max-w-xs pt-2">
                {[
                  'What is IRIS and what can you do?',
                  'Search uploaded PDF documents for key insights',
                  'Search the web for latest AI breakthroughs',
                  'Generate an image of cybernetic neural core',
                  'Create architecture diagram of microservices',
                  'Scientific research on quantum entanglement',
                  'Search codebase for AICoreSphere'
                ].map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ x: 3, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setInputVal(prompt)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 rounded-xl transition-colors cursor-pointer truncate"
                  >
                    &gt; {prompt}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {chatHistory.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[85%] p-3 sm:p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-lg break-words overflow-wrap-anywhere ${
                    msg.role === 'user'
                      ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/25 rounded-br-md shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'bg-white/5 text-gray-200 border border-white/5 rounded-bl-md'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <span>{msg.text}</span>
                  ) : (
                    <div className="text-xs sm:text-sm leading-relaxed space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          img: ({ node, ...props }) => (
                            <img
                              {...props}
                              className="rounded-xl max-h-72 w-auto object-cover border border-white/10 my-2 shadow-lg"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          ),
                          a: ({ node, ...props }) => (
                            <a
                              {...props}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all"
                            />
                          ),
                          code: ({ node, inline, className, children, ...props }: any) => {
                            return (
                              <code
                                className={`${className || ''} bg-black/40 px-1.5 py-0.5 rounded text-[11px] font-mono text-emerald-300 border border-white/5`}
                                {...props}
                              >
                                {children}
                              </code>
                            )
                          },
                          pre: ({ node, children, ...props }: any) => {
                            return (
                              <pre
                                className="bg-black/60 p-2.5 rounded-xl border border-white/10 my-2 overflow-x-auto text-[11px] font-mono text-zinc-200"
                                {...props}
                              >
                                {children}
                              </pre>
                            )
                          }
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                  {msg.id === activeStreamingId && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 rounded-full animate-pulse align-middle"></span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {interimTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[90%] sm:max-w-[85%] p-2.5 sm:p-3 rounded-2xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-br-md text-xs leading-relaxed shadow-lg flex items-center gap-2 break-words">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span className="italic font-mono truncate">Listening: "{interimTranscript}"</span>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Input Form at bottom */}
      <form
        onSubmit={handleSubmit}
        className="p-2 sm:p-2.5 border-t border-white/5 bg-zinc-950/90 flex items-center gap-1.5 sm:gap-2 shrink-0 z-10"
      >
        <div className="relative flex-1 flex items-center">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={
              isListening ? 'Speak or type command...' : 'Type voice command or query...'
            }
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm sm:text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
        </div>

        {/* Dedicated Microphone Input Handler (Web Speech API & Gemini AI fallback) */}
        <MicrophoneInputButton
          size="md"
          autoExecute={true}
          onInterimText={(text) => {
            // Display live voice interim text if desired
          }}
          onCommandTriggered={(cmd) => {
            if (onSendPrompt) {
              onSendPrompt(cmd)
            }
          }}
        />

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          type="submit"
          disabled={!inputVal.trim() || isSubmitting}
          className={`p-2.5 sm:p-2 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer shrink-0 ${
            inputVal.trim() && !isSubmitting
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : 'bg-white/5 text-zinc-600 border-transparent cursor-not-allowed'
          }`}
          title="Send query"
        >
          <Send size={15} />
        </motion.button>
      </form>
    </div>
  )
}
