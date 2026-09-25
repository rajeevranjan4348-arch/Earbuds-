import { useState, useMemo } from 'react'
import { X, Search, Trash2, Clock, Plus, MessageSquare } from 'lucide-react'
import { ChatSession } from '../services/chatHistoryService'

interface HistoryNavigationSectionProps {
  isOpen: boolean
  onClose: () => void
  sessions: ChatSession[]
  activeSessionId: string
  onSelectSession: (session: ChatSession) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
  onClearAll: () => void
}

function formatSessionTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

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

export default function HistoryNavigationSection({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onClearAll
}: HistoryNavigationSectionProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.text.toLowerCase().includes(q))
    )
  }, [sessions, searchQuery])

  if (!isOpen) return null

  return (
    <aside
      className="w-80 sm:w-88 h-full bg-zinc-950/95 backdrop-blur-2xl border-r border-white/10 z-40 flex flex-col shrink-0 select-none shadow-2xl animate-in slide-in-from-left-4 duration-200"
      aria-label="History Navigation Section"
    >
      {/* Header */}
      <div className="h-14 sm:h-16 px-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-100">
            Interaction Logs
          </span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-zinc-400 font-mono">
            {sessions.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          title="Close History"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-white/5 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past logs..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 scrollbar-small">
        {filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500 space-y-3">
            <MessageSquare size={32} className="text-zinc-800" />
            <p className="text-xs">
              {searchQuery
                ? 'No interaction logs match your search.'
                : 'No past interaction logs recorded yet.'}
            </p>
            <button
              type="button"
              onClick={onNewChat}
              className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/20 transition-all cursor-pointer"
              title="Start New Chat"
              aria-label="Start New Chat"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId
            const lastMsg = session.messages[session.messages.length - 1]

            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col gap-1.5 relative ${
                  isActive
                    ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
                    : 'bg-white/5 hover:bg-white/8 border-white/5 hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    <span className="text-xs font-medium text-zinc-100 truncate">
                      {session.title || 'Interaction Session'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatSessionTime(session.updatedAt || session.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSession(session.id)
                      }}
                      className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                      title="Delete log"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {lastMsg && (
                  <p className="text-[11px] text-zinc-400 line-clamp-2 italic font-light">
                    {lastMsg.role === 'user' ? 'User: ' : 'IRIS: '}
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

      {/* Footer */}
      {sessions.length > 0 && (
        <div className="p-3 border-t border-white/10 flex items-center justify-between shrink-0 bg-black/30">
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Clear all interaction logs"
          >
            <Trash2 size={13} />
            <span>Clear Logs</span>
          </button>

          <button
            type="button"
            onClick={onNewChat}
            className="p-1.5 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-lg transition-all cursor-pointer"
            title="New Chat"
            aria-label="New Chat"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </aside>
  )
}
