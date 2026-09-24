import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Volume2,
  Square,
  Sparkles,
  Radio,
  X,
  ShieldCheck,
  Zap,
  Globe,
  AlertTriangle,
  RotateCcw,
  Send,
  RefreshCw,
  History,
  Copy,
  Check,
  Download,
  Trash2,
  Search,
  ArrowLeft,
  Play,
  FileText,
  FileJson,
  Plus,
  MessageSquare,
  Clock,
  ChevronRight,
  Terminal
} from 'lucide-react'
import VoiceCommandLogSidePanel from '../UI/VoiceCommandLogSidePanel'
import {
  voiceSessionManager,
  VoiceSessionState,
  VoicePersonalityId,
  SupportedLanguage,
  VoiceTurnMessage,
  SensitiveActionPayload,
  VOICE_PERSONALITIES,
  getPersonality,
  voiceTranscriptStorage,
  VoiceInteractionSession
} from '../../services/voice'

export interface VoiceChatModalProps {
  isOpen: boolean
  onClose: () => void
  onTranscriptMessage?: (role: 'user' | 'assistant', text: string) => void
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({
  isOpen,
  onClose,
  onTranscriptMessage
}) => {
  // Modal View Mode: 'live' | 'review' | 'commands'
  const [activeTab, setActiveTab] = useState<'live' | 'review' | 'commands'>('live')

  // Live Session States
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle')
  const [micLevel, setMicLevel] = useState<number>(0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [interimText, setInterimText] = useState<string>('')
  const [history, setHistory] = useState<VoiceTurnMessage[]>([])
  const [activePersonality, setActivePersonality] = useState<VoicePersonalityId>('jarvis')
  const [language, setLanguage] = useState<SupportedLanguage>('auto')
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<SensitiveActionPayload | null>(
    null
  )
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [manualInput, setManualInput] = useState<string>('')

  // Transcript History Review States
  const [savedSessions, setSavedSessions] = useState<VoiceInteractionSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('')
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const smoothedLvlRef = useRef<number>(0)
  const phaseRef = useRef<number>(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Synchronize state with VoiceSessionManager & VoiceTranscriptStorage
  useEffect(() => {
    if (!isOpen) {
      voiceSessionManager.stopSession()
      setActiveTab('live')
      return
    }

    setErrorMessage('')
    setSessionState(voiceSessionManager.getState())
    setHistory(voiceSessionManager.getHistory())
    setIsMuted(voiceSessionManager.isMuted())
    setActivePersonality(voiceSessionManager.getConfig().personality)
    setLanguage(voiceSessionManager.getConfig().language)
    setWakeWordEnabled(voiceSessionManager.getConfig().wakeWordEnabled)

    // Automatically start voice session on opening modal
    voiceSessionManager.startSession()

    // Subscribe to voice session state
    const unsubscribeSession = voiceSessionManager.subscribe((state, payload) => {
      setSessionState(state)

      if (payload?.type === 'audio_level') {
        setMicLevel(payload.level)
      } else if (payload?.type === 'interim_transcript') {
        setInterimText(payload.text)
      } else if (payload?.type === 'transcript_updated') {
        setHistory([...payload.history])
        setInterimText('')
        if (payload?.message && onTranscriptMessage) {
          onTranscriptMessage(payload.message.role, payload.message.text)
        }
      } else if (payload?.type === 'mute_change') {
        setIsMuted(payload.isMuted)
      } else if (payload?.type === 'personality_change') {
        setActivePersonality(payload.personality.id)
      } else if (payload?.type === 'language_change') {
        setLanguage(payload.language)
      } else if (payload?.type === 'wake_word_change') {
        setWakeWordEnabled(payload.enabled)
      } else if (payload?.type === 'confirmation_required') {
        setPendingConfirmation(payload)
      } else if (payload?.type === 'confirmation_resolved') {
        setPendingConfirmation(null)
      } else if (payload?.type === 'state_change' && payload.error) {
        setErrorMessage(payload.error)
      }
    })

    // Subscribe to persistent saved transcript sessions
    const unsubscribeStorage = voiceTranscriptStorage.subscribe((sessions) => {
      setSavedSessions(sessions)
      if (!selectedSessionId && sessions.length > 0) {
        setSelectedSessionId(sessions[0].id)
      }
    })

    return () => {
      unsubscribeSession()
      unsubscribeStorage()
      voiceSessionManager.stopSession()
    }
  }, [isOpen])

  // Scroll transcript log automatically in live mode
  useEffect(() => {
    if (activeTab === 'live' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history, interimText, activeTab])

  // ==========================================
  // 60 - 120 FPS FLUID AUDIO WAVE CANVAS
  // ==========================================
  useEffect(() => {
    if (!isOpen || activeTab !== 'live') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = (canvas.width = canvas.parentElement?.clientWidth || 360)
    let height = (canvas.height = 140)

    const handleResize = () => {
      if (canvas && canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth
        height = canvas.height = 140
      }
    }
    window.addEventListener('resize', handleResize)

    const render = () => {
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, width, height)

      // Target level based on active state
      let targetLevel = 0.05
      if (sessionState === 'speaking') {
        targetLevel = 0.5 + Math.sin(Date.now() * 0.009) * 0.35
      } else if (sessionState === 'listening' && !isMuted) {
        targetLevel = Math.max(0.08, Math.min(1.0, micLevel * 2.5))
      } else if (sessionState === 'thinking') {
        targetLevel = 0.25 + Math.sin(Date.now() * 0.005) * 0.15
      }

      smoothedLvlRef.current += (targetLevel - smoothedLvlRef.current) * 0.16
      const lvl = smoothedLvlRef.current

      phaseRef.current +=
        sessionState === 'speaking' ? 0.08 : sessionState === 'listening' ? 0.04 + lvl * 0.06 : 0.02

      const personality = getPersonality(activePersonality)
      const themeColor = personality.accentColor || '#10b981'

      // Draw multi-harmonic wave lines
      const waveCount = 3
      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath()
        const alpha = 0.25 + (w / waveCount) * 0.55
        ctx.strokeStyle = `${themeColor}${Math.floor(alpha * 255)
          .toString(16)
          .padStart(2, '0')}`
        ctx.lineWidth = w === waveCount - 1 ? 2.5 : 1.5
        ctx.shadowBlur = w === waveCount - 1 ? 12 : 4
        ctx.shadowColor = themeColor

        const midY = height / 2
        const freq = 0.015 + w * 0.008
        const amp = height * 0.38 * lvl * (1 - w * 0.22)
        const phaseOffset = phaseRef.current + w * 1.2

        for (let x = 0; x < width; x += 3) {
          // Window envelope to pinch waves at edges
          const envelope = Math.sin((x / width) * Math.PI)
          const y = midY + Math.sin(x * freq + phaseOffset) * amp * envelope

          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [isOpen, sessionState, micLevel, isMuted, activePersonality, activeTab])

  // ==========================================
  // TRANSCRIPT HISTORY ACTIONS
  // ==========================================
  const filteredSessions = historySearchQuery.trim()
    ? voiceTranscriptStorage.searchSessions(historySearchQuery)
    : savedSessions

  const selectedSession =
    savedSessions.find((s) => s.id === selectedSessionId) || filteredSessions[0] || null

  const handleCopyTranscript = (session: VoiceInteractionSession) => {
    const text = voiceTranscriptStorage.formatTranscriptAsPlainText(session)
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  const handleExportTxt = (session: VoiceInteractionSession) => {
    const text = voiceTranscriptStorage.formatTranscriptAsPlainText(session)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iris-voice-transcript-${session.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportJson = (session: VoiceInteractionSession) => {
    const json = voiceTranscriptStorage.formatTranscriptAsJson(session)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iris-voice-transcript-${session.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDeleteSession = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    voiceTranscriptStorage.deleteSession(id)
    if (selectedSessionId === id) {
      const remaining = savedSessions.filter((s) => s.id !== id)
      setSelectedSessionId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  const handleClearAllHistory = () => {
    voiceTranscriptStorage.clearAll()
    setShowClearConfirm(false)
    setSelectedSessionId(null)
  }

  const handleLoadSessionIntoLive = (session: VoiceInteractionSession) => {
    voiceSessionManager.loadHistoricalSession(session.messages, session.id)
    setActiveTab('live')
  }

  const handleStartNewLiveSession = () => {
    voiceSessionManager.clearCurrentSessionHistory()
    voiceSessionManager.startSession()
    setActiveTab('live')
  }

  const handlePlayTurnAudio = (text: string, msgId: string) => {
    if (playingMessageId === msgId) {
      voiceSessionManager.stopSpeaking()
      setPlayingMessageId(null)
      return
    }
    setPlayingMessageId(msgId)
    voiceSessionManager.audioManager.tts.speakFullResponse(text)
    setTimeout(
      () => {
        setPlayingMessageId(null)
      },
      Math.max(2000, text.length * 70)
    )
  }

  if (!isOpen) return null

  const personality = getPersonality(activePersonality)

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-3xl bg-zinc-950/95 border border-white/10 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Top Navigation Bar */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/40">
            <div className="flex items-center gap-3">
              <div
                className="relative flex items-center justify-center w-9 h-9 rounded-2xl border transition-colors duration-300"
                style={{
                  backgroundColor: `${personality.accentColor}15`,
                  borderColor: `${personality.accentColor}40`
                }}
              >
                <Radio
                  className="w-4 h-4 animate-pulse"
                  style={{ color: personality.accentColor }}
                />
                <span
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-ping"
                  style={{ backgroundColor: personality.accentColor }}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white tracking-wide">
                    {activeTab === 'live' ? 'Voice Chat Mode' : 'Transcript History & Review'}
                  </h3>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold"
                    style={{
                      backgroundColor: `${personality.accentColor}20`,
                      color: personality.accentColor,
                      borderColor: `${personality.accentColor}40`
                    }}
                  >
                    {personality.name}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {activeTab === 'live'
                    ? sessionState === 'listening'
                      ? isMuted
                        ? 'Microphone muted — unmute to speak'
                        : 'Listening... (speak naturally, pause to send)'
                      : sessionState === 'thinking'
                        ? 'Processing response...'
                        : sessionState === 'speaking'
                          ? 'Speaking (tap stop or interrupt anytime)'
                          : sessionState === 'interrupted'
                            ? 'Interrupted — listening...'
                            : sessionState === 'error'
                              ? errorMessage || 'Connection error'
                              : 'Standby'
                    : `Saved interactions: ${savedSessions.length} sessions stored locally`}
                </p>
              </div>
            </div>

            {/* View Switcher Tabs & Close Button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 text-xs">
                <button
                  onClick={() => setActiveTab('live')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    activeTab === 'live'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Live</span>
                </button>
                <button
                  onClick={() => setActiveTab('review')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    activeTab === 'review'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Transcripts</span>
                  {savedSessions.length > 0 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {savedSessions.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('commands')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                    activeTab === 'commands'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Commands Log</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Close Voice Mode"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ========================================== */}
          {/* TAB 1: LIVE VOICE CONVERSATION MODE        */}
          {/* ========================================== */}
          {activeTab === 'live' && (
            <>
              {/* Personality & Language Config Bar */}
              <div className="px-6 py-2.5 bg-zinc-900/50 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Personality Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-500 font-medium text-[11px]">Personality:</span>
                  {(Object.keys(VOICE_PERSONALITIES) as VoicePersonalityId[]).map((pId) => {
                    const item = VOICE_PERSONALITIES[pId]
                    const isSelected = activePersonality === pId
                    return (
                      <button
                        key={pId}
                        onClick={() => voiceSessionManager.setPersonality(pId)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'text-white border shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200 border border-transparent hover:bg-white/5'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: `${item.accentColor}25`,
                                borderColor: `${item.accentColor}60`
                              }
                            : {}
                        }
                        title={item.title}
                      >
                        {item.name}
                      </button>
                    )
                  })}
                </div>

                {/* Language, Wake Word Controls & New Session */}
                <div className="flex items-center gap-3">
                  {/* Language Selector */}
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-zinc-500" />
                    <select
                      value={language}
                      onChange={(e) =>
                        voiceSessionManager.setLanguage(e.target.value as SupportedLanguage)
                      }
                      className="bg-zinc-950 border border-white/10 text-zinc-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="auto">Auto-Detect</option>
                      <option value="en-US">English (US)</option>
                      <option value="en-IN">Hinglish / EN (IN)</option>
                      <option value="hi-IN">Hindi (हिंदी)</option>
                    </select>
                  </div>

                  {/* Wake Word Toggle Switch */}
                  <label
                    className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200 select-none"
                    title="Continuous client-side Wake Word ('Hey JARVIS'). Zero audio uploaded."
                  >
                    <input
                      type="checkbox"
                      checked={wakeWordEnabled}
                      onChange={(e) => voiceSessionManager.setWakeWordEnabled(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                        wakeWordEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform duration-200 ${
                          wakeWordEnabled ? 'translate-x-3' : 'translate-x-0'
                        }`}
                      />
                    </div>
                    <span>"Hey JARVIS"</span>
                  </label>

                  {/* Quick New Session Button */}
                  <button
                    onClick={handleStartNewLiveSession}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors cursor-pointer"
                    title="Start fresh conversation"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Session</span>
                  </button>
                </div>
              </div>

              {/* Central Animated Fluid Waveform & Orb Visualizer */}
              <div className="relative py-6 px-6 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/30 via-black to-zinc-950 border-b border-white/5 overflow-hidden">
                {/* Pulsing Neural Orb */}
                <div className="relative flex items-center justify-center w-32 h-32">
                  {/* Harmonic Glow Rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full border transition-all duration-300"
                    style={{ borderColor: `${personality.accentColor}30` }}
                    animate={{
                      scale: [1, 1 + micLevel * 0.5, 1],
                      opacity: [0.2, 0.6, 0.2]
                    }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute -inset-4 rounded-full border transition-all duration-300"
                    style={{ borderColor: `${personality.accentColor}15` }}
                    animate={{
                      scale: [1, 1 + micLevel * 0.75, 1],
                      opacity: [0.1, 0.35, 0.1]
                    }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                  />

                  {/* Core Orb Center */}
                  <div
                    className="relative w-22 h-22 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      backgroundColor: `${personality.accentColor}18`,
                      borderColor: `${personality.accentColor}50`,
                      borderWidth: '1.5px',
                      boxShadow: `0 0 45px ${personality.accentColor}35`
                    }}
                  >
                    {sessionState === 'speaking' ? (
                      <Volume2
                        className="w-8 h-8 animate-pulse"
                        style={{ color: personality.accentColor }}
                      />
                    ) : sessionState === 'thinking' ? (
                      <Zap className="w-8 h-8 text-amber-400 animate-spin" />
                    ) : isMuted ? (
                      <MicOff className="w-8 h-8 text-zinc-500" />
                    ) : (
                      <Mic className="w-8 h-8" style={{ color: personality.accentColor }} />
                    )}
                  </div>
                </div>

                {/* 60-120fps Fluid Harmonic Audio Wave Canvas */}
                <div className="w-full max-w-lg mt-3 h-20 relative flex items-center justify-center">
                  <canvas ref={canvasRef} className="w-full h-full block" />
                </div>

                {/* Real-time Streaming Transcription Preview */}
                <AnimatePresence>
                  {interimText && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-2 px-5 py-2 rounded-full bg-zinc-900/90 border border-white/10 text-xs text-zinc-100 max-w-md text-center shadow-lg truncate"
                    >
                      <span className="text-zinc-500 mr-2">You:</span>"{interimText}"
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error Banner with Retry Button */}
              <AnimatePresence>
                {(sessionState === 'error' || errorMessage) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-6 py-2.5 bg-red-500/15 border-b border-red-500/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 text-red-200">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{errorMessage || 'Voice connection issue. Check mic access.'}</span>
                    </div>
                    <button
                      onClick={() => {
                        setErrorMessage('')
                        voiceSessionManager.startSession()
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sensitive Action Confirmation Safety Banner */}
              <AnimatePresence>
                {pendingConfirmation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-semibold">{pendingConfirmation.title}:</span>{' '}
                        {pendingConfirmation.description}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => voiceSessionManager.cancelPendingAction()}
                        className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => voiceSessionManager.confirmPendingAction()}
                        className="px-3 py-1 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Conversation Transcript Stream Log */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[160px] max-h-[220px] bg-black/30"
              >
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs gap-1.5 py-4">
                    <Sparkles className="w-4 h-4 text-zinc-600 mb-1" />
                    <span>Tap speak or say "Hey JARVIS" to begin hands-free voice chat.</span>
                    <span className="text-[11px] text-zinc-600">
                      All spoken interactions are automatically archived in local storage for
                      review.
                    </span>
                  </div>
                ) : (
                  history.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">
                          {msg.role === 'user' ? 'You' : personality.name}
                        </span>
                        {msg.timestamp && (
                          <span className="text-[9px] text-zinc-600 font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-zinc-800/80 text-zinc-100 border border-white/10'
                            : 'text-zinc-200 border shadow-md'
                        }`}
                        style={
                          msg.role === 'assistant'
                            ? {
                                backgroundColor: `${personality.accentColor}12`,
                                borderColor: `${personality.accentColor}30`
                              }
                            : {}
                        }
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Fallback Text Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!manualInput.trim()) return
                  voiceSessionManager.submitManualPrompt(manualInput.trim())
                  setManualInput('')
                }}
                className="px-6 py-2 bg-zinc-950/80 border-t border-white/5 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Type a message or command..."
                  className="flex-1 bg-zinc-900/90 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
                  title="Send text prompt"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {/* Controls Footer */}
              <div className="p-4 sm:p-5 border-t border-white/10 bg-black/50 flex items-center justify-between">
                {/* Privacy & Status Tag */}
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Private & Local Storage Archival</span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Restart / Reconnect Button */}
                  {sessionState === 'idle' && (
                    <button
                      onClick={() => voiceSessionManager.startSession()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition-colors cursor-pointer"
                      title="Start listening"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Start Listening</span>
                    </button>
                  )}

                  {/* Stop Speaking / Interrupt Button */}
                  {sessionState === 'speaking' && (
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      onClick={() => voiceSessionManager.stopSpeaking()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors cursor-pointer"
                      title="Stop AI speech immediately"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop Speaking</span>
                    </motion.button>
                  )}

                  {/* Mute Button */}
                  <button
                    onClick={() => voiceSessionManager.toggleMute()}
                    className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                      isMuted
                        ? 'bg-red-500/20 border-red-500/40 text-red-300'
                        : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  {/* Review Transcripts Button */}
                  <button
                    onClick={() => setActiveTab('review')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                    title="Review saved transcripts"
                  >
                    <History className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Review Logs ({savedSessions.length})</span>
                  </button>

                  {/* End Voice Chat */}
                  <button
                    onClick={() => {
                      voiceSessionManager.stopSession()
                      onClose()
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>End Voice Chat</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ========================================== */}
          {/* TAB 2: TRANSCRIPT HISTORY & REVIEW PANEL   */}
          {/* ========================================== */}
          {activeTab === 'review' && (
            <div className="flex flex-col flex-1 min-h-[460px] max-h-[580px] overflow-hidden">
              {/* History Search & Action Header */}
              <div className="px-6 py-3 bg-zinc-900/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Search past transcripts, questions, topics..."
                    className="w-full bg-zinc-950/80 border border-white/10 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  {historySearchQuery && (
                    <button
                      onClick={() => setHistorySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2">
                  {showClearConfirm ? (
                    <div className="flex items-center gap-2 bg-red-950/60 border border-red-500/40 rounded-xl px-2 py-1 text-xs">
                      <span className="text-red-300 text-[11px]">Clear all records?</span>
                      <button
                        onClick={handleClearAllHistory}
                        className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] cursor-pointer"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-[11px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={savedSessions.length === 0}
                      onClick={() => setShowClearConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors cursor-pointer"
                      title="Clear all stored transcripts"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab('live')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-lg shadow-emerald-950"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Live Voice</span>
                  </button>
                </div>
              </div>

              {/* Main Split View: Session List vs Transcript Details */}
              {savedSessions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-500 gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-300">
                      No voice transcript records yet
                    </h4>
                    <p className="text-xs text-zinc-500 max-w-sm mt-1">
                      Start speaking in Live Voice mode to automatically generate and store
                      reviewable voice transcripts.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('live')}
                    className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    Start Voice Session
                  </button>
                </div>
              ) : (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
                  {/* Left Column: List of Sessions */}
                  <div className="md:col-span-5 border-r border-white/5 overflow-y-auto max-h-[480px] p-3 space-y-2 bg-black/20">
                    {filteredSessions.length === 0 ? (
                      <div className="p-6 text-center text-zinc-500 text-xs">
                        No voice sessions matching "{historySearchQuery}"
                      </div>
                    ) : (
                      filteredSessions.map((s) => {
                        const isSelected = selectedSession?.id === s.id
                        const sessionDate = new Date(s.startTime)
                        const formattedDate = sessionDate.toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric'
                        })
                        const formattedTime = sessionDate.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })

                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelectedSessionId(s.id)}
                            className={`group relative p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-zinc-900/90 border-white/20 shadow-md ring-1 ring-emerald-500/30'
                                : 'bg-zinc-950/40 hover:bg-zinc-900/50 border-white/5 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: s.personalityColor || '#10b981' }}
                                />
                                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                                  {s.personalityName}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {formattedDate} {formattedTime}
                                </span>
                                <button
                                  onClick={(e) => handleDeleteSession(s.id, e)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded-md transition-all cursor-pointer"
                                  title="Delete this session"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <h5 className="text-xs font-medium text-zinc-200 line-clamp-1 mb-1">
                              {s.title || 'Voice Conversation'}
                            </h5>

                            <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                              {s.previewText || 'No transcript messages.'}
                            </p>

                            <div className="mt-2.5 flex items-center justify-between text-[10px] text-zinc-500">
                              <span className="flex items-center gap-1 font-mono">
                                <MessageSquare className="w-3 h-3 text-zinc-600" />
                                {s.totalTurns} {s.totalTurns === 1 ? 'turn' : 'turns'}
                              </span>
                              <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Right Column: Selected Session Detail & Transcript View */}
                  <div className="md:col-span-7 flex flex-col overflow-hidden bg-black/40">
                    {selectedSession ? (
                      <>
                        {/* Detail Header & Action Buttons */}
                        <div className="px-5 py-3.5 border-b border-white/5 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <h4 className="text-xs font-semibold text-white truncate max-w-[280px]">
                                {selectedSession.title}
                              </h4>
                              <span
                                className="text-[9px] font-mono px-1.5 py-0.2 rounded-full border font-bold"
                                style={{
                                  backgroundColor: `${selectedSession.personalityColor}15`,
                                  color: selectedSession.personalityColor,
                                  borderColor: `${selectedSession.personalityColor}40`
                                }}
                              >
                                {selectedSession.personalityName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                              <Clock className="w-3 h-3 text-zinc-600" />
                              <span>{new Date(selectedSession.startTime).toLocaleString()}</span>
                              <span>•</span>
                              <span>{selectedSession.totalTurns} turns</span>
                            </div>
                          </div>

                          {/* Action Buttons: Copy, TXT, JSON, Load */}
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleCopyTranscript(selectedSession)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
                              title="Copy full transcript"
                            >
                              {copySuccess ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 text-[11px]">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-zinc-400" />
                                  <span className="text-[11px]">Copy</span>
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleExportTxt(selectedSession)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
                              title="Download as Plain Text file"
                            >
                              <Download className="w-3 h-3 text-zinc-400" />
                              <span className="text-[11px]">TXT</span>
                            </button>

                            <button
                              onClick={() => handleExportJson(selectedSession)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
                              title="Download as JSON file"
                            >
                              <FileJson className="w-3 h-3 text-zinc-400" />
                              <span className="text-[11px]">JSON</span>
                            </button>

                            <button
                              onClick={() => handleLoadSessionIntoLive(selectedSession)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium transition-colors cursor-pointer"
                              title="Load transcript and resume speaking"
                            >
                              <Mic className="w-3 h-3" />
                              <span className="text-[11px]">Resume</span>
                            </button>
                          </div>
                        </div>

                        {/* Transcript Turn Bubble Stream */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 max-h-[420px]">
                          {selectedSession.messages.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-500 text-xs py-8">
                              No messages recorded in this session.
                            </div>
                          ) : (
                            selectedSession.messages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${
                                  msg.role === 'user' ? 'items-end' : 'items-start'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1 px-1">
                                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-mono">
                                    {msg.role === 'user' ? 'You' : selectedSession.personalityName}
                                  </span>
                                  {msg.timestamp && (
                                    <span className="text-[9px] text-zinc-600 font-mono">
                                      {new Date(msg.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                      })}
                                    </span>
                                  )}
                                  {msg.role === 'assistant' && (
                                    <button
                                      onClick={() => handlePlayTurnAudio(msg.text, msg.id)}
                                      className="p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
                                      title="Read out loud"
                                    >
                                      {playingMessageId === msg.id ? (
                                        <Square className="w-3 h-3 text-amber-400 animate-pulse" />
                                      ) : (
                                        <Play className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>

                                <div
                                  className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                                    msg.role === 'user'
                                      ? 'bg-zinc-800/80 text-zinc-100 border border-white/10'
                                      : 'text-zinc-200 border shadow-md'
                                  }`}
                                  style={
                                    msg.role === 'assistant'
                                      ? {
                                          backgroundColor: `${selectedSession.personalityColor}12`,
                                          borderColor: `${selectedSession.personalityColor}30`
                                        }
                                      : {}
                                  }
                                >
                                  {msg.text}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
                        Select a voice session on the left to review its transcript.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History Footer Bar */}
              <div className="p-3.5 border-t border-white/10 bg-black/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Transcripts stored securely in local browser storage (offline available)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('live')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Close Review</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 3: VOICE COMMANDS & TASK LOG LEDGER    */}
          {/* ========================================== */}
          {activeTab === 'commands' && (
            <div className="flex-1 min-h-[500px] flex flex-col overflow-hidden bg-zinc-950">
              <VoiceCommandLogSidePanel
                embedded
                onExecuteCommand={(cmd) => {
                  voiceSessionManager.sendTextMessage(cmd)
                  setActiveTab('live')
                }}
              />
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default VoiceChatModal
