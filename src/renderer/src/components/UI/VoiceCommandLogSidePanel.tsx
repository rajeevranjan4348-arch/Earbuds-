import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  Search,
  X,
  RotateCcw,
  Copy,
  Check,
  Volume2,
  Trash2,
  Download,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Compass,
  Film,
  Cpu,
  FolderTree,
  Eye,
  Play,
  Filter
} from 'lucide-react'
import { voiceCommandLogService, VoiceCommandLogEntry } from '../../services/voiceCommandLogService'

interface VoiceCommandLogSidePanelProps {
  isOpen?: boolean
  onClose?: () => void
  /** If embedded is true, renders inline without modal backdrop or fixed positioning */
  embedded?: boolean
  onExecuteCommand?: (command: string) => void
}

export const VoiceCommandLogSidePanel: React.FC<VoiceCommandLogSidePanelProps> = ({
  isOpen = true,
  onClose,
  embedded = false,
  onExecuteCommand
}) => {
  const [entries, setEntries] = useState<VoiceCommandLogEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = voiceCommandLogService.subscribe((list) => {
      setEntries(list)
    })
    return () => unsub()
  }, [])

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    let result = voiceCommandLogService.query({
      search: searchQuery,
      category: selectedCategory,
      status: selectedStatus
    })

    if (sortOrder === 'oldest') {
      result = [...result].reverse()
    }

    return result
  }, [entries, searchQuery, selectedCategory, selectedStatus, sortOrder])

  const handleCopyText = (text: string, id: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleSpeakText = (text: string, id: string) => {
    if (!text || typeof window === 'undefined') return

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      if (speakingId === id) {
        setSpeakingId(null)
        return
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0
      utterance.onend = () => setSpeakingId(null)
      utterance.onerror = () => setSpeakingId(null)

      setSpeakingId(id)
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleRerun = (command: string) => {
    if (onExecuteCommand) {
      onExecuteCommand(command)
    } else {
      window.dispatchEvent(
        new CustomEvent('iris:run-voice-command', {
          detail: { text: command }
        })
      )
    }
  }

  const handleExport = (format: 'markdown' | 'json') => {
    const content = voiceCommandLogService.exportLog(format)
    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/markdown'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iris_voice_command_log_${Date.now()}.${format === 'json' ? 'json' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getCategoryMeta = (category?: string) => {
    switch (category) {
      case 'YOUTUBE':
        return {
          label: 'YouTube Studio',
          icon: Film,
          color: '#ef4444' // Red
        }
      case 'NAVIGATION':
        return {
          label: 'Navigation',
          icon: Compass,
          color: '#10b981' // Emerald
        }
      case 'SYSTEM':
        return {
          label: 'System Telemetry',
          icon: Cpu,
          color: '#f59e0b' // Amber
        }
      case 'SEARCH':
        return {
          label: 'Web Search',
          icon: Search,
          color: '#06b6d4' // Cyan
        }
      case 'WORKSPACE':
        return {
          label: 'Workspace / Phone',
          icon: FolderTree,
          color: '#3b82f6' // Blue
        }
      case 'OPTICS':
        return {
          label: 'Optics / Vision',
          icon: Eye,
          color: '#a855f7' // Purple
        }
      default:
        return {
          label: 'AI Chat Task',
          icon: Sparkles,
          color: '#10b981'
        }
    }
  }

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const content = (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 select-none">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 shrink-0 bg-zinc-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-tight text-zinc-100 uppercase font-mono">
              Voice Command Ledger
            </h2>
            <div className="text-[11px] text-zinc-400">
              <span>{entries.length} interactions logged</span>
              <span aria-hidden="true" className="mx-1.5 text-zinc-600">
                ·
              </span>
              <span className="text-emerald-400 font-mono">Live Recording</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Export Dropdown */}
          <button
            type="button"
            onClick={() => handleExport('markdown')}
            title="Export interactions to Markdown"
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-colors text-xs flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10px] font-mono uppercase">Export</span>
          </button>

          {/* Clear Log */}
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Clear all voice command logs?')) {
                  voiceCommandLogService.clearAll()
                }
              }}
              title="Clear voice interaction history"
              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Close button if modal */}
          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 rounded-lg transition-colors ml-1"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="p-3 border-b border-white/5 space-y-2.5 bg-zinc-900/40 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search spoken commands, responses, actions..."
            className="w-full pl-8.5 pr-8 py-2 bg-zinc-900/80 border border-white/10 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs (Zero-pill compliant segmented control) */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'YOUTUBE', label: 'YouTube' },
            { id: 'NAVIGATION', label: 'Nav' },
            { id: 'SYSTEM', label: 'System' },
            { id: 'SEARCH', label: 'Search' },
            { id: 'WORKSPACE', label: 'Workspace' },
            { id: 'OPTICS', label: 'Optics' }
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 text-[11px] font-mono font-medium rounded-lg whitespace-nowrap transition-colors border ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}

          {/* Sort order toggle */}
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="ml-auto px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 bg-white/5 border border-white/5 rounded-lg whitespace-nowrap shrink-0 transition-colors"
            title={`Sort order: ${sortOrder}`}
          >
            {sortOrder === 'newest' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>
      </div>

      {/* 3. Interaction Log Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 scrollbar-thin scrollbar-thumb-zinc-800">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500 space-y-3">
            <Mic className="w-10 h-10 text-zinc-700 stroke-1" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-300">
                {searchQuery || selectedCategory !== 'ALL'
                  ? 'No interactions match your filter.'
                  : 'No voice command history recorded yet.'}
              </p>
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Speak a command like "Open YouTube Studio" or "Show system telemetry" to populate
                this ledger.
              </p>
            </div>
            {(searchQuery || selectedCategory !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('ALL')
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg text-xs border border-white/10 transition-colors"
              >
                Reset Search Filters
              </button>
            )}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const meta = getCategoryMeta(entry.category)
            const IconComp = meta.icon
            const isExpanded = expandedId === entry.id
            const isSpeaking = speakingId === entry.id

            return (
              <div
                key={entry.id}
                className="group relative bg-zinc-900/70 hover:bg-zinc-900 border border-white/5 hover:border-white/15 rounded-xl p-3 transition-all duration-150 shadow-sm"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <IconComp className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="font-semibold text-zinc-200">{meta.label}</span>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                    {entry.executionTimeMs && (
                      <>
                        <span aria-hidden="true" className="text-zinc-600">
                          ·
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                          {entry.executionTimeMs}ms
                        </span>
                      </>
                    )}
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {/* Re-run */}
                    <button
                      type="button"
                      onClick={() => handleRerun(entry.command)}
                      className="p-1 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                      title="Re-run command"
                    >
                      <Play className="w-3 h-3" />
                    </button>

                    {/* Speak Response */}
                    {entry.spokenResponse && (
                      <button
                        type="button"
                        onClick={() => handleSpeakText(entry.spokenResponse || '', entry.id)}
                        className={`p-1 rounded transition-colors ${
                          isSpeaking
                            ? 'text-emerald-400 bg-emerald-500/20'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                        }`}
                        title={isSpeaking ? 'Stop speaking' : 'Speak response aloud'}
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    )}

                    {/* Copy Command */}
                    <button
                      type="button"
                      onClick={() => handleCopyText(entry.command, `${entry.id}_cmd`)}
                      className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded transition-colors"
                      title="Copy voice prompt"
                    >
                      {copiedId === `${entry.id}_cmd` ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>

                    {/* Delete entry */}
                    <button
                      type="button"
                      onClick={() => voiceCommandLogService.deleteEntry(entry.id)}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove from log"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Spoken Voice Command Prompt */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <p className="text-xs font-semibold text-zinc-100 leading-snug">
                    "{entry.command}"
                  </p>
                </div>

                {/* AI Response Text */}
                {(entry.spokenResponse || entry.displayText) && (
                  <div className="pl-3.5 border-l border-white/10 py-0.5 mb-2 space-y-1">
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans select-text">
                      {entry.spokenResponse || entry.displayText}
                    </p>
                  </div>
                )}

                {/* Executed Action Line */}
                {entry.actionExecuted && (
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono bg-black/40 px-2 py-1 rounded-lg border border-white/5 mb-1.5">
                    <Terminal className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{entry.actionExecuted}</span>
                  </div>
                )}

                {/* Target Tab & Detail Toggle */}
                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    {entry.targetTab && (
                      <span className="font-mono text-zinc-400">
                        Target: <b className="text-zinc-300">{entry.targetTab}</b>
                      </span>
                    )}
                    <span className="font-mono text-zinc-500">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="flex items-center gap-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <span>{isExpanded ? 'Hide Raw' : 'Raw JSON'}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Collapsible JSON metadata */}
                {isExpanded && (
                  <pre className="mt-2 p-2 bg-black/80 rounded-lg text-[10px] font-mono text-zinc-400 overflow-x-auto border border-white/5 select-text">
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 4. Footer Summary Bar */}
      <div className="px-4 py-2 border-t border-white/10 bg-zinc-950/90 text-[11px] text-zinc-500 flex items-center justify-between font-mono shrink-0">
        <span>
          Showing {filteredEntries.length} of {entries.length}
        </span>
        <button
          type="button"
          onClick={() => voiceCommandLogService.resetToDefaultSeeds()}
          className="text-zinc-500 hover:text-zinc-300 underline transition-colors text-[10px]"
        >
          Restore sample tasks
        </button>
      </div>
    </div>
  )

  if (embedded) {
    return <div className="h-full w-full flex flex-col">{content}</div>
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
          {/* Backdrop Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs pointer-events-auto"
          />

          {/* Slide-out Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md h-full shadow-2xl border-l border-white/10 pointer-events-auto flex flex-col z-10"
          >
            {content}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default VoiceCommandLogSidePanel
