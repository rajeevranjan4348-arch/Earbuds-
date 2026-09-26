import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Sparkles,
  Radio,
  Settings,
  ChevronDown,
  X
} from 'lucide-react'
import {
  geminiLiveVoiceClient,
  LiveVoiceState,
  VoiceOption
} from '../../services/geminiLiveVoiceClient'

interface GeminiLiveVoiceBarProps {
  onClose?: () => void
  onTranscriptReceived?: (role: 'user' | 'assistant', text: string) => void
}

export const GeminiLiveVoiceBar: React.FC<GeminiLiveVoiceBarProps> = ({
  onClose,
  onTranscriptReceived
}) => {
  const [liveState, setLiveState] = useState<LiveVoiceState>(geminiLiveVoiceClient.getState())
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(geminiLiveVoiceClient.getVoice())
  const [isMuted, setIsMuted] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [showVoiceSelect, setShowVoiceSelect] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState<string>('')

  useEffect(() => {
    const unsubState = geminiLiveVoiceClient.subscribe((state, payload) => {
      setLiveState(state)
      if (payload?.text) {
        setLiveTranscript(payload.text)
        if (onTranscriptReceived) {
          onTranscriptReceived(payload.role || 'assistant', payload.text)
        }
      }
    })

    const unsubLevel = geminiLiveVoiceClient.onAudioLevel((lvl) => {
      setAudioLevel(lvl)
    })

    return () => {
      unsubState()
      unsubLevel()
    }
  }, [onTranscriptReceived])

  const handleStartSession = async () => {
    try {
      await geminiLiveVoiceClient.startLiveSession()
    } catch (e) {
      console.warn('Could not start live voice session:', e)
    }
  }

  const handleEndSession = () => {
    geminiLiveVoiceClient.endLiveSession()
    if (onClose) onClose()
  }

  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    geminiLiveVoiceClient.setMuted(next)
  }

  const handleSelectVoice = (v: VoiceOption) => {
    setSelectedVoice(v)
    geminiLiveVoiceClient.setVoice(v)
    setShowVoiceSelect(false)
  }

  const isActive = liveState === 'listening' || liveState === 'speaking' || liveState === 'processing'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="w-full p-2.5 rounded-2xl bg-zinc-950/95 border border-emerald-500/30 backdrop-blur-xl shadow-2xl flex flex-col gap-2 relative overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isActive ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isActive ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white">
            <Sparkles size={13} className="text-emerald-400" />
            <span>Gemini Live Voice</span>
          </div>

          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase">
            {liveState}
          </span>
        </div>

        {/* Voice Selector & Actions */}
        <div className="flex items-center gap-1.5 relative">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowVoiceSelect(!showVoiceSelect)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-mono border border-white/10 cursor-pointer"
            >
              <span>{selectedVoice}</span>
              <ChevronDown size={10} />
            </button>

            {showVoiceSelect && (
              <div className="absolute right-0 top-full mt-1 w-28 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-0.5">
                {(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as VoiceOption[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleSelectVoice(v)}
                    className={`px-2 py-1 text-left text-xs font-mono rounded-lg transition-colors cursor-pointer ${
                      selectedVoice === v
                        ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isMuted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
          </button>

          <button
            type="button"
            onClick={handleEndSession}
            className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 transition-colors cursor-pointer"
            title="End Gemini Live Voice session"
          >
            <PhoneOff size={12} />
          </button>
        </div>
      </div>

      {/* Audio Wave Visualizer & Live Transcript */}
      <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-xl bg-black/50 border border-white/5">
        <div className="flex-1 text-[11px] font-mono text-zinc-300 truncate">
          {liveTranscript ? (
            <span className="italic text-emerald-200">"{liveTranscript}"</span>
          ) : liveState === 'listening' ? (
            <span className="text-zinc-400 animate-pulse">Listening... speak naturally</span>
          ) : liveState === 'speaking' ? (
            <span className="text-emerald-300 font-medium">Gemini is speaking...</span>
          ) : (
            <span className="text-zinc-500">Establishing bidirectional Live voice stream...</span>
          )}
        </div>

        {/* Real-time Decibel Bars */}
        <div className="flex items-end gap-1 h-4 px-2 py-0.5 bg-black/60 rounded-full border border-emerald-500/20 shrink-0">
          {[0.6, 1.2, 0.8, 1.5, 1.0, 1.3, 0.7, 1.1].map((factor, idx) => {
            const level = Math.max(0.15, audioLevel || 0.2)
            const barH = Math.max(3, Math.min(14, level * 20 * factor))
            return (
              <span
                key={idx}
                className="w-1 rounded-full bg-emerald-400 transition-all duration-75"
                style={{ height: `${barH}px` }}
              />
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

export default GeminiLiveVoiceBar
