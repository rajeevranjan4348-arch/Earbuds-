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
  RefreshCw
} from 'lucide-react'
import {
  voiceSessionManager,
  VoiceSessionState,
  VoicePersonalityId,
  SupportedLanguage,
  VoiceTurnMessage,
  SensitiveActionPayload,
  VOICE_PERSONALITIES,
  getPersonality
} from '../../services/voice'

export interface VoiceChatModalProps {
  isOpen: boolean
  onClose: () => void
  onTranscriptMessage?: (role: 'user' | 'assistant', text: string) => void
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({ isOpen, onClose, onTranscriptMessage }) => {
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle')
  const [micLevel, setMicLevel] = useState<number>(0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [interimText, setInterimText] = useState<string>('')
  const [history, setHistory] = useState<VoiceTurnMessage[]>([])
  const [activePersonality, setActivePersonality] = useState<VoicePersonalityId>('jarvis')
  const [language, setLanguage] = useState<SupportedLanguage>('auto')
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<SensitiveActionPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [manualInput, setManualInput] = useState<string>('')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const smoothedLvlRef = useRef<number>(0)
  const phaseRef = useRef<number>(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Synchronize state with VoiceSessionManager
  useEffect(() => {
    if (!isOpen) {
      voiceSessionManager.stopSession()
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

    const unsubscribe = voiceSessionManager.subscribe((state, payload) => {
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

    return () => {
      unsubscribe()
      voiceSessionManager.stopSession()
    }
  }, [isOpen])

  // Scroll transcript log automatically
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history, interimText])

  // ==========================================
  // 60 - 120 FPS FLUID AUDIO WAVE CANVAS
  // ==========================================
  useEffect(() => {
    if (!isOpen) return

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
        const amp = (height * 0.38) * lvl * (1 - w * 0.22)
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
  }, [isOpen, sessionState, micLevel, isMuted, activePersonality])

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
          className="relative w-full max-w-2xl bg-zinc-950/95 border border-white/10 rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Top Bar */}
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
                    Voice Chat Mode
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
                  {sessionState === 'listening'
                    ? isMuted
                      ? 'Microphone muted — unmute to speak'
                      : 'Listening... (speak naturally, pause to send)'
                    : sessionState === 'thinking'
                    ? 'Processing response...'
                    : sessionState === 'speaking'
                    ? 'Speaking (tap stop or interrupt by speaking anytime)'
                    : sessionState === 'interrupted'
                    ? 'Interrupted — listening...'
                    : sessionState === 'error'
                    ? errorMessage || 'Connection error'
                    : 'Standby'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Close Voice Mode"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
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

            {/* Language & Wake Word Controls */}
            <div className="flex items-center gap-3">
              {/* Language Selector */}
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={language}
                  onChange={(e) => voiceSessionManager.setLanguage(e.target.value as SupportedLanguage)}
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
            </div>
          </div>

          {/* Central Animated Fluid Waveform & Orb Visualizer */}
          <div className="relative py-8 px-6 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900/30 via-black to-zinc-950 border-b border-white/5 overflow-hidden">
            {/* Pulsing Neural Orb */}
            <div className="relative flex items-center justify-center w-36 h-36">
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
                className="relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  backgroundColor: `${personality.accentColor}18`,
                  borderColor: `${personality.accentColor}50`,
                  borderWidth: '1.5px',
                  boxShadow: `0 0 45px ${personality.accentColor}35`
                }}
              >
                {sessionState === 'speaking' ? (
                  <Volume2
                    className="w-9 h-9 animate-pulse"
                    style={{ color: personality.accentColor }}
                  />
                ) : sessionState === 'thinking' ? (
                  <Zap className="w-9 h-9 text-amber-400 animate-spin" />
                ) : isMuted ? (
                  <MicOff className="w-9 h-9 text-zinc-500" />
                ) : (
                  <Mic
                    className="w-9 h-9"
                    style={{ color: personality.accentColor }}
                  />
                )}
              </div>
            </div>

            {/* 60-120fps Fluid Harmonic Audio Wave Canvas */}
            <div className="w-full max-w-lg mt-4 h-28 relative flex items-center justify-center">
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
                  <span className="text-zinc-500 mr-2">You:</span>
                  "{interimText}"
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
                className="px-6 py-3 bg-red-500/15 border-b border-red-500/30 flex items-center justify-between text-xs"
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
                className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between text-xs"
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
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => voiceSessionManager.confirmPendingAction()}
                    className="px-3 py-1 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors"
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
            className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[170px] max-h-[240px] bg-black/30"
          >
            {history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs gap-1.5 py-6">
                <Sparkles className="w-4 h-4 text-zinc-600 mb-1" />
                <span>Tap speak or say "Hey JARVIS" to begin hands-free voice chat.</span>
                <span className="text-[11px] text-zinc-600">
                  Real-time streaming speech recognition with instant barge-in interruption.
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
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1 px-1 font-mono">
                    {msg.role === 'user' ? 'You' : personality.name}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
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
              <span>Private & Local Processing</span>
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
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
export default VoiceChatModal
