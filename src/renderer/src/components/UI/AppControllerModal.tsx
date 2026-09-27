import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiAppsLine,
  RiCloseLine,
  RiSearchLine,
  RiMicLine,
  RiMicFill,
  RiRefreshLine,
  RiPlayFill,
  RiStopLine,
  RiVolumeMuteLine,
  RiVolumeUpLine,
  RiCpuLine,
  RiHardDrive2Line,
  RiTimeLine,
  RiStarLine,
  RiStarFill,
  RiExternalLinkLine,
  RiSparklingFill,
  RiTerminalBoxLine,
  RiLayoutGridLine,
  RiCommandLine,
  RiArrowRightLine,
  RiCheckLine,
  RiAlertLine
} from 'react-icons/ri'
import { appControlService } from '../../services/appControlService'
import { RunningAppRecord, AppItem, AppCategory } from '../../launcher/types'
import { AppIconRenderer } from '../../launcher/AppIconRenderer'
import { soundEffects } from '../../services/soundEffectsService'
import { voiceService } from '../../services/voiceService'

interface AppControllerModalProps {
  isOpen: boolean
  onClose: () => void
  currentTab?: string
  onNavigate?: (tab: string) => void
}

type ControllerTab = 'running' | 'catalog' | 'macros' | 'voice'

const CATEGORY_FILTERS: Array<{ id: 'all' | AppCategory; label: string }> = [
  { id: 'all', label: 'All Categories' },
  { id: 'apps', label: 'Iris Core' },
  { id: 'developer', label: 'Developer & Code' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Chat & Social' },
  { id: 'media', label: 'Media & Optics' },
  { id: 'tools', label: 'Tools & Utilities' },
  { id: 'settings', label: 'Settings' }
]

export const AppControllerModal: React.FC<AppControllerModalProps> = ({
  isOpen,
  onClose,
  currentTab = 'DASHBOARD',
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<ControllerTab>('running')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | AppCategory>('all')
  const [runningApps, setRunningApps] = useState<RunningAppRecord[]>([])
  const [allApps, setAllApps] = useState<AppItem[]>([])
  const [activeAppId, setActiveAppId] = useState<string | null>(null)
  const [isVoiceListening, setIsVoiceListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [statusNotification, setStatusNotification] = useState<string | null>(null)
  const [actionDropdownAppId, setActionDropdownAppId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Subscribe to AppControlService
  useEffect(() => {
    const unsub = appControlService.subscribe((apps, currentActive) => {
      setRunningApps(apps)
      setActiveAppId(currentActive)
    })
    setAllApps(appControlService.getAllApps())
    return () => unsub()
  }, [])

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  // Global Escape & Shortcut Listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Filtered catalog
  const filteredCatalog = useMemo(() => {
    let list = allApps
    if (categoryFilter !== 'all') {
      list = list.filter((a) => a.category === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.toLowerCase().includes(q)) ||
          a.aliases.some((al) => al.toLowerCase().includes(q))
      )
    }
    return list
  }, [allApps, categoryFilter, searchQuery])

  // Filtered running apps
  const filteredRunning = useMemo(() => {
    if (!searchQuery.trim()) return runningApps
    const q = searchQuery.toLowerCase().trim()
    return runningApps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.target.toLowerCase().includes(q)
    )
  }, [runningApps, searchQuery])

  // Show status banner notification helper
  const notifyAction = (msg: string) => {
    setStatusNotification(msg)
    setTimeout(() => setStatusNotification(null), 3000)
  }

  // Handlers
  const handleOpenApp = async (appIdOrName: string) => {
    const res = await appControlService.openApp(appIdOrName)
    if (res.success) {
      notifyAction(res.message)
      if (res.app?.type === 'internal') {
        onClose()
      }
    }
  }

  const handleCloseApp = async (appId: string) => {
    const res = await appControlService.closeApp(appId)
    notifyAction(res.message)
  }

  const handleCloseAll = async () => {
    const res = await appControlService.closeAllApps()
    notifyAction(res.message)
  }

  const handleRestartApp = async (appId: string) => {
    const res = await appControlService.restartApp(appId)
    notifyAction(res.message)
  }

  const handleToggleMute = (appId: string) => {
    const isMuted = appControlService.toggleMuteApp(appId)
    notifyAction(isMuted ? 'Muted app audio.' : 'Unmuted app audio.')
  }

  const handleExecuteAction = async (appId: string, actionId: string, payload?: any) => {
    setActionDropdownAppId(null)
    const res = await appControlService.executeAppAction(appId, actionId, payload)
    notifyAction(res.message)
  }

  const handleVoiceToggle = async () => {
    if (isVoiceListening) {
      voiceService.stopRecognition()
      setIsVoiceListening(false)
      setVoiceTranscript('')
    } else {
      setIsVoiceListening(true)
      soundEffects.play('activate')
      voiceService.setHandlers({
        onInterimTranscript: (text) => setVoiceTranscript(text),
        onFinalTranscript: async (text) => {
          setIsVoiceListening(false)
          setVoiceTranscript('')
          setSearchQuery(text)
          // Run command
          await appControlService.openApp(text)
        }
      })
      voiceService.startRecognition()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 28, stiffness: 420 }}
          className="relative w-full max-w-5xl h-[88vh] max-h-[820px] flex flex-col bg-zinc-950 border border-emerald-500/30 rounded-2xl shadow-[0_0_60px_rgba(16,185,129,0.15)] text-zinc-100 font-sans overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar Header */}
          <div className="flex flex-col border-b border-white/10 bg-zinc-900/60 shrink-0">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <RiAppsLine size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black tracking-wider uppercase font-mono text-zinc-100">
                      Universal App Controller
                    </h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                      {runningApps.length} ACTIVE
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono hidden sm:block">
                    Open, manage, monitor, and remote-control all applications & tools
                  </p>
                </div>
              </div>

              {/* Action Buttons Right */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCloseAll}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 font-mono text-xs transition-colors cursor-pointer"
                  title="Close all background applications"
                >
                  <RiStopLine size={14} className="text-rose-400" />
                  <span>Close All</span>
                </button>

                <button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  title="Close controller (Esc)"
                >
                  <RiCloseLine size={20} />
                </button>
              </div>
            </div>

            {/* Live Search & Command Bar */}
            <div className="px-4 sm:px-6 pb-3 pt-1">
              <div className="relative flex items-center bg-black/60 border border-white/15 rounded-xl px-3.5 py-2.5 focus-within:border-emerald-500/60 shadow-inner transition-colors">
                <RiSearchLine size={18} className="text-zinc-400 shrink-0 mr-2.5" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isVoiceListening
                      ? voiceTranscript || 'Listening for app command...'
                      : 'Search apps, controls, or say "Open Coder", "Close Notes", "Generate Asset"...'
                  }
                  className="flex-1 bg-transparent border-none outline-none text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 font-mono"
                />

                {/* Voice Input Button */}
                <button
                  onClick={handleVoiceToggle}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    isVoiceListening
                      ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse'
                      : 'bg-zinc-800/80 hover:bg-zinc-700 border-white/10 text-zinc-300'
                  }`}
                  title="Speak app command (e.g. 'Open Settings', 'Close All')"
                >
                  {isVoiceListening ? <RiMicFill size={16} /> : <RiMicLine size={16} />}
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center px-4 sm:px-6 gap-2 overflow-x-auto no-scrollbar pb-2">
              <button
                onClick={() => setActiveTab('running')}
                className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                  activeTab === 'running'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Running Apps ({runningApps.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('catalog')}
                className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'catalog'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <RiAppsLine size={14} />
                <span>All Apps Catalog ({allApps.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('macros')}
                className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'macros'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <RiCommandLine size={14} />
                <span>Quick Controls & Remote</span>
              </button>

              <button
                onClick={() => setActiveTab('voice')}
                className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  activeTab === 'voice'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <RiMicLine size={14} />
                <span>Voice Command Cheatsheet</span>
              </button>
            </div>
          </div>

          {/* Action Notification Banner */}
          <AnimatePresence>
            {statusNotification && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-950/80 border-b border-emerald-500/30 px-4 py-2 flex items-center gap-2 text-emerald-300 text-xs font-mono shrink-0"
              >
                <RiCheckLine size={15} />
                <span>{statusNotification}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab Content Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-zinc-800">
            {/* 1. RUNNING APPS TAB */}
            {activeTab === 'running' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-400">
                      Active Application Processes
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      ({filteredRunning.length} running)
                    </span>
                  </div>

                  <button
                    onClick={handleCloseAll}
                    className="sm:hidden text-xs text-rose-400 font-mono underline"
                  >
                    Close All
                  </button>
                </div>

                {filteredRunning.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 font-mono text-xs">
                    No active applications matching query.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredRunning.map((app) => {
                      const isActive = app.id === activeAppId || app.status === 'active'
                      const isDropdownOpen = actionDropdownAppId === app.id

                      return (
                        <div
                          key={app.id}
                          className={`relative p-4 rounded-xl border transition-all ${
                            isActive
                              ? 'bg-zinc-900/90 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                              : 'bg-zinc-900/50 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center">
                                <AppIconRenderer iconId={app.icon} category={app.category} size={22} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-bold text-zinc-100 font-mono">
                                    {app.name}
                                  </h3>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${
                                      isActive
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                  >
                                    {app.status}
                                  </span>
                                  {app.isMuted && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-mono">
                                      MUTED
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-zinc-400">
                                  <span className="flex items-center gap-1">
                                    <RiCpuLine size={12} className="text-cyan-400" />
                                    {app.cpuPercent}%
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <RiHardDrive2Line size={12} className="text-indigo-400" />
                                    {app.memoryMb} MB
                                  </span>
                                  <span className="text-zinc-500">PID: {app.pid}</span>
                                </div>
                              </div>
                            </div>

                            {/* Close Button */}
                            <button
                              onClick={() => handleCloseApp(app.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                              title={`Close ${app.name}`}
                            >
                              <RiStopLine size={16} />
                            </button>
                          </div>

                          {/* Control Actions Row */}
                          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-white/5">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOpenApp(app.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                              >
                                <RiPlayFill size={13} />
                                <span>Switch</span>
                              </button>

                              <button
                                onClick={() => handleRestartApp(app.id)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition cursor-pointer"
                                title="Restart application"
                              >
                                <RiRefreshLine size={14} />
                              </button>

                              <button
                                onClick={() => handleToggleMute(app.id)}
                                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                  app.isMuted
                                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10'
                                }`}
                                title={app.isMuted ? 'Unmute app' : 'Mute app'}
                              >
                                {app.isMuted ? <RiVolumeMuteLine size={14} /> : <RiVolumeUpLine size={14} />}
                              </button>
                            </div>

                            {/* Contextual App Actions Dropdown Trigger */}
                            {app.availableActions && app.availableActions.length > 0 && (
                              <div className="relative">
                                <button
                                  onClick={() =>
                                    setActionDropdownAppId(isDropdownOpen ? null : app.id)
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-mono text-[11px] border border-white/10 flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Actions</span>
                                  <RiArrowRightLine
                                    size={12}
                                    className={`transition-transform ${isDropdownOpen ? 'rotate-90' : ''}`}
                                  />
                                </button>

                                {/* Dropdown Menu */}
                                <AnimatePresence>
                                  {isDropdownOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                      className="absolute right-0 bottom-full mb-2 w-48 bg-zinc-950 border border-emerald-500/30 rounded-xl p-1 shadow-2xl z-30 space-y-1 font-mono text-xs"
                                    >
                                      {app.availableActions.map((act) => (
                                        <button
                                          key={act.id}
                                          onClick={() => handleExecuteAction(app.id, act.id)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/20 hover:text-emerald-300 text-zinc-200 transition flex items-center justify-between"
                                        >
                                          <span>{act.label}</span>
                                          <RiPlayFill size={11} className="text-zinc-500" />
                                        </button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2. ALL APPS CATALOG TAB */}
            {activeTab === 'catalog' && (
              <div className="space-y-4">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {CATEGORY_FILTERS.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3 py-1 rounded-full text-xs font-mono transition cursor-pointer shrink-0 ${
                        categoryFilter === cat.id
                          ? 'bg-emerald-500 text-black font-bold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Grid of Apps */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCatalog.map((app) => (
                    <div
                      key={app.id}
                      className="p-3.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-white/10 hover:border-emerald-500/40 transition group flex flex-col justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center shrink-0 group-hover:border-emerald-500/40 transition">
                          <AppIconRenderer iconId={app.icon} category={app.category} size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-zinc-100 font-mono truncate">
                              {app.name}
                            </h4>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono uppercase">
                              {app.type}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
                            {app.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-white/5">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                          {app.category}
                        </span>

                        <button
                          onClick={() => handleOpenApp(app.id)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-black font-mono text-[11px] font-bold border border-emerald-500/40 transition cursor-pointer flex items-center gap-1"
                        >
                          <span>Open</span>
                          <RiArrowRightLine size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. QUICK CONTROLS & REMOTE MACROS TAB */}
            {activeTab === 'macros' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wider">
                    Universal Execution Macros
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Execute cross-application tasks with one click without manually switching views
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <MacroCard
                    title="Coder: Run Active Code"
                    description="Trigger live script compilation and execute inside embedded terminal"
                    icon={<RiTerminalBoxLine size={20} className="text-emerald-400" />}
                    onClick={() => handleExecuteAction('coder', 'run_code')}
                  />

                  <MacroCard
                    title="Gallery: Generate Asset"
                    description="Dispatch FLUX/Imagen AI to create a new cyberpunk neural visual asset"
                    icon={<RiSparklingFill size={20} className="text-purple-400" />}
                    onClick={() => handleExecuteAction('gallery', 'generate_asset')}
                  />

                  <MacroCard
                    title="Notes: New Quick Memo"
                    description="Open markdown editor and initialize auto-saving scratchpad note"
                    icon={<RiCommandLine size={20} className="text-yellow-400" />}
                    onClick={() => handleExecuteAction('notes', 'new_note')}
                  />

                  <MacroCard
                    title="Workspace: Sync Google Drive"
                    description="Synchronize Google Workspace gateway and re-index team cloud files"
                    icon={<RiRefreshLine size={20} className="text-blue-400" />}
                    onClick={() => handleExecuteAction('workspace', 'sync_drive')}
                  />

                  <MacroCard
                    title="Maps: Acquire GPS Fix"
                    description="Query device telemetry and recenter satellite map on live coordinates"
                    icon={<RiTimeLine size={20} className="text-amber-400" />}
                    onClick={() => handleExecuteAction('maps', 'locate_me')}
                  />

                  <MacroCard
                    title="System: Telemetry Health Check"
                    description="Perform real-time CPU, RAM, temperature, and hardware health audit"
                    icon={<RiCpuLine size={20} className="text-cyan-400" />}
                    onClick={() => handleExecuteAction('dashboard', 'telemetry')}
                  />

                  <MacroCard
                    title="System: Close All Apps"
                    description="Bulk terminate non-essential running processes and return to command HUD"
                    icon={<RiStopLine size={20} className="text-rose-400" />}
                    onClick={handleCloseAll}
                  />

                  <MacroCard
                    title="Settings: Toggle Contrast Theme"
                    description="Switch between high-contrast dark cyberpunk mode and light mode"
                    icon={<RiRefreshLine size={20} className="text-teal-400" />}
                    onClick={() => handleExecuteAction('settings', 'toggle_theme')}
                  />
                </div>
              </div>
            )}

            {/* 4. VOICE COMMAND CHEATSHEET TAB */}
            {activeTab === 'voice' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wider">
                    Spoken App Commands & Triggers
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Speak any of the following natural commands into your microphone to control apps instantly
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <VoiceCommandCard
                    phrase="Open Settings"
                    action="Switches directly to IRIS system preferences & API configuration"
                    onTest={() => handleOpenApp('settings')}
                  />

                  <VoiceCommandCard
                    phrase="Generate Asset [prompt]"
                    action="Calls FLUX AI to generate a visual asset and saves to Gallery"
                    onTest={() => handleExecuteAction('gallery', 'generate_asset')}
                  />

                  <VoiceCommandCard
                    phrase="Open Coder"
                    action="Launches Monaco code editor with live multi-tab web preview"
                    onTest={() => handleOpenApp('coder')}
                  />

                  <VoiceCommandCard
                    phrase="Close Notes"
                    action="Terminates Notes process and returns to previous active workspace"
                    onTest={() => handleCloseApp('notes')}
                  />

                  <VoiceCommandCard
                    phrase="Close all apps"
                    action="Terminates all running applications and resets to Dashboard"
                    onTest={handleCloseAll}
                  />

                  <VoiceCommandCard
                    phrase="Show running apps"
                    action="Reports live telemetry, CPU load, and active processes"
                    onTest={() => setActiveTab('running')}
                  />

                  <VoiceCommandCard
                    phrase="Open Workspace"
                    action="Accesses Google Workspace gateway (Drive, Docs, Gmail)"
                    onTest={() => handleOpenApp('workspace')}
                  />

                  <VoiceCommandCard
                    phrase="Open Maps"
                    action="Switches to Google Maps interactive satellite view"
                    onTest={() => handleOpenApp('maps')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Status Bar */}
          <div className="h-10 bg-zinc-950 border-t border-white/10 px-4 sm:px-6 flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0">
            <div className="flex items-center gap-3">
              <span>IRIS Operating Layer</span>
              <span>•</span>
              <span>{runningApps.length} apps active</span>
              <span>•</span>
              <span>Ctrl+Space / Alt+A</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-bold">Controller Ready</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function MacroCard({
  title,
  description,
  icon,
  onClick
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 hover:border-emerald-500/50 transition cursor-pointer group flex flex-col justify-between"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-black/60 border border-white/10 group-hover:border-emerald-500/40 transition shrink-0">
          {icon}
        </div>
        <div>
          <h4 className="text-xs font-bold text-zinc-100 font-mono group-hover:text-emerald-300 transition">
            {title}
          </h4>
          <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-end text-emerald-400 text-xs font-mono font-bold">
        <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
          Execute <RiArrowRightLine size={12} />
        </span>
      </div>
    </div>
  )
}

function VoiceCommandCard({
  phrase,
  action,
  onTest
}: {
  phrase: string
  action: string
  onTest: () => void
}) {
  return (
    <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-white/10 flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <RiMicLine size={14} className="text-emerald-400" />
          <code className="text-xs text-emerald-300 font-mono font-bold bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
            "{phrase}"
          </code>
        </div>
        <p className="text-[11px] text-zinc-400 font-mono mt-1">{action}</p>
      </div>
      <button
        onClick={onTest}
        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-emerald-500 text-zinc-300 hover:text-black font-mono text-[10px] font-bold border border-white/10 transition cursor-pointer shrink-0"
      >
        Test
      </button>
    </div>
  )
}

export default AppControllerModal
