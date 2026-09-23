import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiSearchLine,
  RiCloseLine,
  RiMicLine,
  RiMicFill,
  RiStarLine,
  RiStarFill,
  RiArrowRightLine,
  RiExternalLinkLine,
  RiCommandLine,
  RiAppsLine,
  RiCheckLine,
  RiHistoryLine
} from 'react-icons/ri'
import { Sparkles } from 'lucide-react'
import { AppItem, AppCategory } from './types'
import { appRegistry } from './AppRegistry'
import { LauncherSearch } from './LauncherSearch'
import { launchManager } from './LaunchManager'
import { voiceLauncher } from './VoiceLauncher'
import { AppIconRenderer } from './AppIconRenderer'

interface CommandPaletteProps {
  currentTab: string
  onNavigate?: (tab: string) => void
  onClose: () => void
  onErrorPrompt: (app: AppItem, errorMsg: string, fallbackUrl?: string) => void
}

const CATEGORY_TABS: Array<{ id: 'all' | AppCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'apps', label: 'Apps' },
  { id: 'tools', label: 'AI Tools' },
  { id: 'media', label: 'Media' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Social & Chat' },
  { id: 'settings', label: 'Settings' }
]

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  currentTab,
  onNavigate,
  onClose,
  onErrorPrompt
}) => {
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'all' | AppCategory>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<string>('')
  const [recentApps, setRecentApps] = useState<AppItem[]>([])
  const [favoriteApps, setFavoriteApps] = useState<AppItem[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load favorites & recents on open
  useEffect(() => {
    setRecentApps(appRegistry.getRecents(6))
    setFavoriteApps(appRegistry.getFavorites())
    inputRef.current?.focus()
  }, [])

  // Setup Voice Launcher callbacks
  useEffect(() => {
    voiceLauncher.setCallbacks({
      onStateChange: (state, message) => {
        setIsVoiceListening(state === 'listening')
        setVoiceStatus(message || '')
      },
      onTranscript: (transcript, isFinal) => {
        setQuery(transcript)
        if (isFinal) {
          setIsVoiceListening(false)
        }
      },
      onLaunchComplete: (result) => {
        if (result.success) {
          onClose()
        } else if (result.app) {
          onErrorPrompt(result.app, result.message, result.fallbackUrl)
        }
      }
    })

    return () => {
      voiceLauncher.stopListening()
    }
  }, [onClose, onErrorPrompt])

  // Context suggestions when search bar is empty
  const contextSuggestions = useMemo(() => {
    return LauncherSearch.getContextSuggestions(currentTab)
  }, [currentTab])

  // Search results
  const searchResults = useMemo(() => {
    return LauncherSearch.search({
      query,
      category: selectedCategory,
      currentTab,
      limit: 25
    })
  }, [query, selectedCategory, currentTab])

  // Clamp selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, selectedCategory])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    ) as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  // Execute an app launch
  const handleLaunch = async (app: AppItem) => {
    const res = await launchManager.launch(app)
    if (res.success) {
      onClose()
    } else if (res.status === 'CONFIRMATION_PENDING') {
      // Permission manager handles UI confirmation prompt
    } else {
      onErrorPrompt(app, res.message, res.fallbackUrl)
    }
  }

  // Toggle favorite star
  const handleToggleFavorite = (e: React.MouseEvent, app: AppItem) => {
    e.stopPropagation()
    appRegistry.toggleFavorite(app.id)
    setFavoriteApps(appRegistry.getFavorites())
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(searchResults.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        prev <= 0 ? Math.max(searchResults.length - 1, 0) : prev - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults[selectedIndex]) {
        handleLaunch(searchResults[selectedIndex])
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      // Cycle category tabs
      const currentIdx = CATEGORY_TABS.findIndex((c) => c.id === selectedCategory)
      const nextIdx = (currentIdx + 1) % CATEGORY_TABS.length
      setSelectedCategory(CATEGORY_TABS[nextIdx].id)
    }
  }

  // Toggle voice listening
  const handleVoiceToggle = () => {
    if (isVoiceListening) {
      voiceLauncher.stopListening()
      setIsVoiceListening(false)
    } else {
      voiceLauncher.startListening(currentTab)
    }
  }

  return (
    <div
      className="flex flex-col w-full max-h-[85vh] md:max-h-[750px] bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl overflow-hidden font-sans text-zinc-100 select-none"
      onKeyDown={handleKeyDown}
    >
      {/* Search Input Bar */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-zinc-900/60 relative">
        <RiSearchLine className="text-zinc-400 shrink-0 text-xl" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps, commands, tools, settings..."
          className="flex-1 bg-transparent text-sm md:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none tracking-wide"
        />

        {query && (
          <button
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Clear search"
          >
            <RiCloseLine size={18} />
          </button>
        )}

        {/* Voice Search Button with Animated Pulse Indicator */}
        <button
          onClick={handleVoiceToggle}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
            isVoiceListening
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
              : 'bg-zinc-800/80 hover:bg-emerald-500/15 border-white/10 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-300'
          }`}
          title="Voice Search (Speak an app name)"
        >
          {isVoiceListening ? (
            <>
              <RiMicFill size={14} className="text-rose-400 animate-bounce" />
              <span className="hidden sm:inline">Listening...</span>
            </>
          ) : (
            <>
              <RiMicLine size={14} />
              <span className="hidden sm:inline">Voice</span>
            </>
          )}
        </button>

        {/* Shortcut Esc Badge */}
        <kbd className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-zinc-800 border border-white/10 text-[10px] font-mono text-zinc-400 font-semibold">
          ESC
        </kbd>
      </div>

      {/* Voice Status Toast */}
      <AnimatePresence>
        {isVoiceListening && voiceStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300 text-xs font-mono flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{voiceStatus}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 bg-zinc-950/70 overflow-x-auto no-scrollbar shrink-0">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedCategory(tab.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium tracking-wide uppercase transition-all duration-150 cursor-pointer shrink-0 ${
              selectedCategory === tab.id
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 max-h-[500px] scroll-smooth focus:outline-none"
      >
        {/* State A: Empty Query -> Suggested, Favorites, Recents */}
        {!query && selectedCategory === 'all' && (
          <>
            {/* Context-Aware Suggestions (e.g. Chat Actions, Settings, YouTube Pipeline) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Sparkles size={12} />
                  {contextSuggestions.contextName}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  Page Context: {currentTab}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {contextSuggestions.items.map((app, idx) => (
                  <motion.div
                    key={app.id}
                    onClick={() => handleLaunch(app)}
                    whileHover={{ scale: 1.01, x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/90 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <AppIconRenderer iconId={app.icon} category={app.category} size={18} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-300 truncate">
                          {app.name}
                        </span>
                        {app.type === 'external' && (
                          <RiExternalLinkLine size={11} className="text-zinc-500" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate">{app.description}</p>
                    </div>

                    <RiArrowRightLine
                      size={14}
                      className="text-zinc-600 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Pinned Favorites */}
            {favoriteApps.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <RiStarFill size={12} />
                    Pinned Favorites
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {favoriteApps.length} apps
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {favoriteApps.map((app) => (
                    <motion.div
                      key={app.id}
                      onClick={() => handleLaunch(app)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex flex-col items-center text-center p-3 rounded-xl bg-zinc-900/30 hover:bg-zinc-900/80 border border-white/5 hover:border-amber-500/30 transition-all cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/5 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform shadow-md">
                        <AppIconRenderer iconId={app.icon} category={app.category} size={20} />
                      </div>
                      <span className="text-xs font-medium text-zinc-200 group-hover:text-amber-300 truncate w-full">
                        {app.name}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-0.5">
                        {app.category}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Apps */}
            {recentApps.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <RiHistoryLine size={12} />
                    Recently Launched
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {recentApps.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => handleLaunch(app)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 text-xs text-zinc-300 hover:text-white shrink-0 transition-colors cursor-pointer"
                    >
                      <AppIconRenderer iconId={app.icon} category={app.category} size={14} />
                      <span className="truncate max-w-[120px]">{app.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* State B: Filtered / Search Results List */}
        {(query || selectedCategory !== 'all') && (
          <div className="space-y-1">
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500 space-y-2">
                <RiAppsLine size={32} className="opacity-40" />
                <p className="text-sm font-medium">No applications or tools matched "{query}"</p>
                <p className="text-xs text-zinc-600">Try searching "YouTube", "GitHub", "Voice", or "Settings"</p>
              </div>
            ) : (
              searchResults.map((app, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <motion.div
                    key={app.id}
                    data-index={idx}
                    onClick={() => handleLaunch(app)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    whileHover={{ scale: 1.002 }}
                    whileTap={{ scale: 0.99 }}
                    className={`flex items-center gap-3.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 border-emerald-500/40 shadow-lg text-white'
                        : 'bg-zinc-950/40 hover:bg-zinc-900/60 border-white/5 text-zinc-300'
                    }`}
                  >
                    {/* App Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                          : 'bg-zinc-900/80 border-white/5'
                      }`}
                    >
                      <AppIconRenderer iconId={app.icon} category={app.category} size={18} />
                    </div>

                    {/* App Title & Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm font-semibold truncate text-zinc-100">
                          {app.name}
                        </span>

                        {/* Category Badge */}
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded tracking-wider uppercase font-semibold ${
                            app.destructive
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : app.type === 'internal'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : app.type === 'tool'
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : 'bg-zinc-800 text-zinc-400 border border-white/5'
                          }`}
                        >
                          {app.destructive ? 'CRITICAL' : app.category}
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {app.description}
                      </p>
                    </div>

                    {/* Favorite Star Button */}
                    <button
                      onClick={(e) => handleToggleFavorite(e, app)}
                      className="p-1.5 text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                      title={app.isFavorite ? 'Remove from favorites' : 'Pin to favorites'}
                    >
                      {app.isFavorite ? (
                        <RiStarFill size={15} className="text-amber-400" />
                      ) : (
                        <RiStarLine size={15} />
                      )}
                    </button>

                    {/* Launch Hint */}
                    {isSelected && (
                      <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 shrink-0">
                        <span>Launch</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-[9px] text-zinc-300">
                          ↵
                        </kbd>
                      </div>
                    )}
                  </motion.div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Footer Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-zinc-950/80 text-[11px] font-mono text-zinc-500">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[9px] text-zinc-400">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[9px] text-zinc-400">
              ↓
            </kbd>
            <span>Navigate</span>
          </div>

          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[9px] text-zinc-400">
              ↵
            </kbd>
            <span>Open</span>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[9px] text-zinc-400">
              TAB
            </kbd>
            <span>Filter</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span>{searchResults.length} available</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>
    </div>
  )
}
