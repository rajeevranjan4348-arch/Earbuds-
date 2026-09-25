import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiFlashlightFill,
  RiCloseLine,
  RiLineChartLine,
  RiFileEditLine,
  RiImageLine,
  RiLayoutGridLine,
  RiStickyNoteLine,
  RiCompass3Line,
  RiArrowRightUpLine,
  RiCheckLine,
  RiFileCopyLine,
  RiSendPlaneFill,
  RiRefreshLine,
  RiPlayCircleLine,
  RiFolderOpenLine
} from 'react-icons/ri'
import {
  Sparkles,
  TrendingUp,
  Images,
  PenTool,
  LayoutDashboard,
  Copy,
  Check,
  ArrowRight
} from 'lucide-react'
import { shortcutService, formatKeyCombo } from '../../services/shortcutService'

interface QuickActionsMenuProps {
  activeTab?: string
  setActiveTab?: (tab: string) => void
  onOpenKnowledgeBase?: () => void
  onNavigate?: (tab: string) => void
  onSubmitPrompt?: (prompt: string) => void
  onOpenKnowledge?: () => void
}

interface TrendItem {
  id: string
  title: string
  niche: string
  opportunityScore: number
  searchDemand: number
  competitionScore: number
  selectionReason: string
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  activeTab,
  setActiveTab,
  onOpenKnowledgeBase,
  onNavigate,
  onSubmitPrompt,
  onOpenKnowledge
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<'none' | 'trend' | 'script'>('none')
  const [quickMenuCombo, setQuickMenuCombo] = useState<string>('Ctrl+K')

  // Trend modal state
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [isLoadingTrends, setIsLoadingTrends] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<'SHORTS' | 'MINI' | 'STANDARD'>('STANDARD')

  // Script modal state
  const [scriptTopic, setScriptTopic] = useState('')
  const [scriptFormat, setScriptFormat] = useState<'SHORTS' | 'MINI' | 'STANDARD' | 'LONG_FORM'>(
    'SHORTS'
  )
  const [scriptTone, setScriptTone] = useState('Authoritative & Engaging')
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [generatedScript, setGeneratedScript] = useState<string | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)
  const [scriptStatus, setScriptStatus] = useState<string | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)

  // Register configurable hotkey with shortcutService
  useEffect(() => {
    const unregister = shortcutService.registerActionHandler('TOGGLE_QUICK_MENU', () => {
      setIsOpen((prev) => !prev)
    })

    const unsub = shortcutService.subscribe((list) => {
      const match = list.find((s) => s.id === 'TOGGLE_QUICK_MENU')
      if (match) {
        setQuickMenuCombo(formatKeyCombo(match).join('+'))
      }
    })

    return () => {
      unregister()
      unsub()
    }
  }, [])

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeModal !== 'none') {
          setActiveModal('none')
        } else if (isOpen) {
          setIsOpen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, activeModal])

  // Click outside to close menu when no modal is active
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeModal !== 'none') return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, activeModal])

  // Action: Navigate to Gallery
  const handleViewGallery = () => {
    setActiveTab?.('GALLERY')
    setIsOpen(false)
  }

  // Action: Navigate to YouTube Trends
  const handleNavigateToTrends = () => {
    setActiveTab?.('YOUTUBE')
    window.dispatchEvent(new CustomEvent('iris-youtube-subtab', { detail: 'TRENDS' }))
    setIsOpen(false)
    setActiveModal('none')
  }

  // Action: Open Trend Analysis modal
  const handleOpenTrendModal = async () => {
    setActiveModal('trend')
    setIsOpen(false)
    if (trends.length === 0) {
      await fetchTrends()
    }
  }

  const fetchTrends = async () => {
    setIsLoadingTrends(true)
    try {
      const res = await fetch('/api/youtube/trends?count=4').then((r) => r.json())
      if (res.success && Array.isArray(res.trends)) {
        setTrends(res.trends)
      }
    } catch (err) {
      console.error('Failed to load trends in QuickActions:', err)
    } finally {
      setIsLoadingTrends(false)
    }
  }

  // Action: Open Script Writer modal
  const handleOpenScriptModal = (initialTopic?: string) => {
    if (initialTopic) {
      setScriptTopic(initialTopic)
    }
    setActiveModal('script')
    setIsOpen(false)
  }

  // Action: Generate script using backend AI
  const handleGenerateScript = async () => {
    if (!scriptTopic.trim() || isGeneratingScript) return
    setIsGeneratingScript(true)
    setGeneratedScript(null)
    setScriptStatus('Consulting Gemini neural scriptwriter...')

    try {
      const prompt = `You are a world-class YouTube producer and scriptwriter for IRIS AI.
Generate a high-converting, viral, and structurally complete 7-part video script on:
Topic: "${scriptTopic.trim()}"
Format: ${scriptFormat} (${scriptFormat === 'SHORTS' ? '60-second fast hook' : 'Full production'})
Tone: ${scriptTone}

Provide the script structured with:
1. [HOOK (0-15s)]: Intense curiosity or pattern interrupt
2. [CONTEXT & STAKES]: Why this matters right now
3. [CORE BREAKTHROUGH]: The primary insight/mechanism
4. [PRACTICAL BREAKDOWN]: Mental models or concrete applications
5. [TRANSITION]: Natural pivot to climax
6. [CONCLUSION]: High-value takeaway
7. [CALL TO ACTION (CTA)]: Engaging prompt to comment & follow

Keep the formatting clean with bold cues and visual stage notes [Visual: ...].`

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId: 'default_user' })
      }).then((r) => r.json())

      if (res && res.text) {
        setGeneratedScript(res.text)
        setScriptStatus('Script generated successfully.')
      } else {
        setScriptStatus('Failed to generate script. Check network or API key.')
      }
    } catch (err: any) {
      console.error('Script generation error:', err)
      setScriptStatus(`Generation error: ${err?.message || 'Network exception'}`)
    } finally {
      setIsGeneratingScript(false)
    }
  }

  // Copy script to clipboard
  const handleCopyScript = () => {
    if (!generatedScript) return
    navigator.clipboard.writeText(generatedScript)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  // Send Script to YouTube Production Pipeline Job
  const handleSendToPipeline = async () => {
    if (!scriptTopic.trim()) return
    try {
      setScriptStatus('Dispatching video production job to YouTube Studio pipeline...')
      const res = await fetch('/api/youtube/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scriptTopic,
          format: scriptFormat,
          autoExecute: true
        })
      }).then((r) => r.json())

      if (res.success) {
        setScriptStatus('Job queued! Redirecting to YouTube Studio...')
        setTimeout(() => {
          setActiveTab?.('YOUTUBE')
          window.dispatchEvent(new CustomEvent('iris-youtube-subtab', { detail: 'PIPELINE' }))
          setActiveModal('none')
        }, 1200)
      }
    } catch (err) {
      console.error('Failed to create YouTube job from QuickActions:', err)
      setScriptStatus('Failed to queue job.')
    }
  }

  // Quick Action buttons configuration
  const quickActions = [
    {
      id: 'analyze-trend',
      label: 'Analyze Trend',
      tag: 'YouTube AI',
      description: 'Discover viral opportunities & score demand',
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      color: 'emerald',
      onClick: handleOpenTrendModal,
      secondaryAction: {
        label: 'Jump to Studio',
        onClick: handleNavigateToTrends
      }
    },
    {
      id: 'write-script',
      label: 'Write Script',
      tag: '7-Part Model',
      description: 'Draft high-CTR video scripts with hook & CTA',
      icon: <PenTool className="w-4 h-4 text-cyan-400" />,
      color: 'cyan',
      onClick: () => handleOpenScriptModal(),
      secondaryAction: {
        label: 'Instant Modal',
        onClick: () => handleOpenScriptModal()
      }
    },
    {
      id: 'view-gallery',
      label: 'View Gallery',
      tag: 'Assets',
      description: 'Browse thumbnails, FLUX renders & video media',
      icon: <Images className="w-4 h-4 text-purple-400" />,
      color: 'purple',
      onClick: handleViewGallery
    },
    {
      id: 'dashboard',
      label: 'Command Center',
      tag: 'Voice Core',
      description: 'Return to neural orb & voice interface',
      icon: <LayoutDashboard className="w-4 h-4 text-zinc-300" />,
      color: 'zinc',
      onClick: () => {
        setActiveTab?.('DASHBOARD')
        setIsOpen(false)
      }
    },
    {
      id: 'notes',
      label: 'Capture Note',
      tag: 'Scratchpad',
      description: 'Open notes and research scratchpad',
      icon: <RiStickyNoteLine className="w-4 h-4 text-amber-400" />,
      color: 'amber',
      onClick: () => {
        setActiveTab?.('NOTES')
        setIsOpen(false)
      }
    }
  ]

  return (
    <>
      {/* Floating Action Menu Container */}
      <div
        ref={menuRef}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end pointer-events-auto"
      >
        {/* Floating Menu Popout */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className="mb-3 w-80 sm:w-96 bg-zinc-950/95 backdrop-blur-2xl border border-emerald-500/30 rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(16,185,129,0.15)] text-zinc-100 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <RiFlashlightFill size={14} />
                  </div>
                  <div>
                    <h3 className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-100">
                      Quick Actions
                    </h3>
                    <span className="text-[10px] font-mono text-emerald-400/80 tracking-wide">
                      IRIS Fast Dispatch
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[9px] font-mono text-zinc-400">
                    {quickMenuCombo}
                  </span>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <RiCloseLine size={16} />
                  </button>
                </div>
              </div>

              {/* Action List */}
              <div className="space-y-1.5">
                {quickActions.map((action) => (
                  <div
                    key={action.id}
                    onClick={action.onClick}
                    className="group flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center shrink-0 group-hover:border-emerald-500/40 transition-colors">
                        {action.icon}
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                            {action.label}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-white/5 text-zinc-400 border border-white/10">
                            {action.tag}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                          {action.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <div className="w-6 h-6 rounded-md bg-white/5 group-hover:bg-emerald-500/20 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 transition-colors">
                        <ArrowRight size={13} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span>
                  Active: <b className="text-emerald-400">{activeTab}</b>
                </span>
                <button
                  onClick={handleNavigateToTrends}
                  className="hover:text-emerald-300 text-zinc-400 transition-colors flex items-center gap-1"
                >
                  <span>Open Studio</span>
                  <RiArrowRightUpLine size={12} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Trigger Pill */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-full shadow-2xl backdrop-blur-xl border transition-all cursor-pointer ${
            isOpen
              ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)]'
              : 'bg-zinc-950/90 hover:bg-zinc-900 border-emerald-500/30 text-zinc-100 hover:border-emerald-500/60 shadow-[0_4px_20px_rgba(0,0,0,0.6)]'
          }`}
          title="Quick Actions Menu (Ctrl+K / Cmd+K)"
        >
          <div className="relative flex items-center justify-center">
            {isOpen ? (
              <RiCloseLine size={18} />
            ) : (
              <>
                <RiFlashlightFill
                  size={16}
                  className="text-emerald-400 group-hover:text-emerald-300 animate-pulse"
                />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </>
            )}
          </div>
          <span className="text-xs font-mono font-bold tracking-wider uppercase">
            Quick Actions
          </span>
        </motion.button>
      </div>

      {/* ========================================================================= */}
      {/* 1. Modal: ANALYZE TREND */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {activeModal === 'trend' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl bg-zinc-950 border border-emerald-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-2">
                      <span>Analyze Trending Opportunities</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        GEMINI 3.8 DISCOVERY
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      Real-time validation against search demand, competition density, and audience
                      affinity.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal('none')}
                  className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <RiCloseLine size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-zinc-400">
                    Top Verified Topics
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchTrends}
                      disabled={isLoadingTrends}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
                    >
                      <RiRefreshLine size={13} className={isLoadingTrends ? 'animate-spin' : ''} />
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={handleNavigateToTrends}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-1 transition-colors"
                    >
                      <span>Full Studio Matrix</span>
                      <RiArrowRightUpLine size={13} />
                    </button>
                  </div>
                </div>

                {isLoadingTrends ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3 font-mono text-xs text-zinc-400">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    <span>Scanning search demand vectors & creator gaps...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {trends.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 bg-zinc-900/60 border border-white/5 hover:border-emerald-500/40 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {item.niche}
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              Opportunity: {item.opportunityScore}/100
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-zinc-100 line-clamp-2">
                            {item.title}
                          </h4>
                          <p className="text-[11px] font-mono text-zinc-400 line-clamp-2">
                            {item.selectionReason}
                          </p>
                          <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400 pt-1">
                            <span>
                              Demand: <b className="text-zinc-200">{item.searchDemand}%</b>
                            </span>
                            <span>
                              Competition: <b className="text-zinc-200">{item.competitionScore}%</b>
                            </span>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleOpenScriptModal(item.title)}
                            className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                            title="Generate script for this topic"
                          >
                            <PenTool size={12} />
                            <span>Script It</span>
                          </button>
                          <button
                            onClick={handleNavigateToTrends}
                            className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                          >
                            <RiPlayCircleLine size={14} />
                            <span>Produce</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-zinc-900/80 border-t border-white/10 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Autonomous Trend Engine Ready</span>
                <button
                  onClick={handleNavigateToTrends}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span>Open Full YouTube Studio</span>
                  <RiArrowRightUpLine size={13} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 2. Modal: WRITE SCRIPT */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {activeModal === 'script' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-3xl bg-zinc-950 border border-cyan-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <PenTool size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-mono font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-2">
                      <span>Neural Scriptwriter</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        7-PART ARCHITECTURE
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      Generates hook, problem context, main breakthrough, pacing, and tailored CTA.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal('none')}
                  className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  <RiCloseLine size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1">
                {/* Inputs */}
                <div className="space-y-3 bg-zinc-900/50 p-3.5 rounded-xl border border-white/5">
                  <div>
                    <label className="block text-xs font-mono font-bold uppercase text-zinc-300 mb-1.5">
                      Video Topic or Core Premise
                    </label>
                    <input
                      type="text"
                      value={scriptTopic}
                      onChange={(e) => setScriptTopic(e.target.value)}
                      placeholder="e.g. How Autonomous AI Agents Will Replace Traditional Apps in 2026"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/10 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400 font-mono placeholder:text-zinc-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                        Format / Duration
                      </label>
                      <select
                        value={scriptFormat}
                        onChange={(e) => setScriptFormat(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="SHORTS">Shorts (60 Seconds - High Pacing)</option>
                        <option value="MINI">Mini (1-3 Minutes - Explainer)</option>
                        <option value="STANDARD">Standard (5-10 Minutes - Full Deep Dive)</option>
                        <option value="LONG_FORM">Long-form (15+ Minutes - Masterclass)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                        Tone & Perspective
                      </label>
                      <select
                        value={scriptTone}
                        onChange={(e) => setScriptTone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-black border border-white/10 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="Authoritative & Engaging">Authoritative & Engaging</option>
                        <option value="Curious & Investigative">Curious & Investigative</option>
                        <option value="Direct & Tactical">Direct & Tactical</option>
                        <option value="Cinematic & Visionary">Cinematic & Visionary</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={handleGenerateScript}
                      disabled={isGeneratingScript || !scriptTopic.trim()}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-mono text-xs font-bold uppercase tracking-wider rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Sparkles size={14} className={isGeneratingScript ? 'animate-spin' : ''} />
                      <span>
                        {isGeneratingScript ? 'Generating Script...' : 'Draft Script with Gemini'}
                      </span>
                    </button>

                    {scriptStatus && (
                      <span className="text-[11px] font-mono text-zinc-400">{scriptStatus}</span>
                    )}
                  </div>
                </div>

                {/* Generated Output */}
                {generatedScript && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase text-cyan-400 flex items-center gap-1.5">
                        <RiCheckLine />
                        <span>Generated 7-Section Production Script</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyScript}
                          className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                        >
                          {copiedScript ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                          <span>{copiedScript ? 'Copied' : 'Copy Script'}</span>
                        </button>
                        <button
                          onClick={handleSendToPipeline}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
                        >
                          <RiPlayCircleLine size={13} />
                          <span>Queue Production Job</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-zinc-900/90 border border-white/10 rounded-xl max-h-80 overflow-y-auto text-xs text-zinc-200 font-mono whitespace-pre-wrap leading-relaxed select-text">
                      {generatedScript}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-zinc-900/80 border-t border-white/10 flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Script ready for production & teleprompter</span>
                <button
                  onClick={() => {
                    setActiveTab?.('NOTES')
                    setActiveModal('none')
                  }}
                  className="hover:text-zinc-200 text-zinc-400 transition-colors flex items-center gap-1"
                >
                  <span>Open in Notes</span>
                  <RiFolderOpenLine size={13} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

export default QuickActionsMenu
