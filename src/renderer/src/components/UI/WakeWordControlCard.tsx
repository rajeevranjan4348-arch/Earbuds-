import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  Sliders,
  CheckCircle2,
  Radio,
  Play,
  Shield,
  Clock
} from 'lucide-react'
import { useWakeWord } from '../../hooks/useWakeWord'

interface WakeWordControlCardProps {
  compact?: boolean
  className?: string
}

export const WakeWordControlCard: React.FC<WakeWordControlCardProps> = ({
  compact = false,
  className = ''
}) => {
  const {
    config,
    isListening,
    lastEvent,
    setEnabled,
    setSensitivity,
    setSoundFeedback,
    setAutoExecute,
    playTestChime
  } = useWakeWord()

  const [tested, setTested] = useState(false)

  const handleTestChime = () => {
    playTestChime()
    setTested(true)
    setTimeout(() => setTested(false), 1500)
  }

  return (
    <div
      className={`rounded-3xl bg-zinc-950/90 border border-white/10 p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] font-mono text-zinc-200 backdrop-blur-2xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Radio size={16} className={config.enabled ? 'animate-pulse' : ''} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-white flex items-center gap-2">
              <span>Hands-Free Wake Word</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30">
                100% On-Device
              </span>
            </span>
            <span className="text-[11px] text-zinc-400 font-sans">
              Say <strong className="text-emerald-400 font-mono">"Hey IRIS"</strong> or{' '}
              <strong className="text-emerald-400 font-mono">"OK IRIS"</strong> to trigger anytime
            </span>
          </div>
        </div>

        {/* Master Toggle */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff41]"></div>
        </label>
      </div>

      {/* Phrases Pill Grid */}
      <div className="mb-4">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider block mb-2">
          Recognized Trigger Phrases
        </span>
        <div className="flex flex-wrap gap-1.5">
          {config.wakePhrases.map((phrase) => (
            <span
              key={phrase}
              className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-all ${
                config.enabled
                  ? 'bg-zinc-900/90 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(0,255,65,0.08)]'
                  : 'bg-black/40 text-zinc-500 border-zinc-800'
              }`}
            >
              "{phrase}"
            </span>
          ))}
        </div>
      </div>

      {/* Sensitivity Calibration Slider */}
      <div className="bg-black/50 rounded-2xl p-3.5 border border-white/5 flex flex-col gap-2.5 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-300 font-bold flex items-center gap-1.5">
            <Sliders size={13} className="text-emerald-400" />
            <span>Phonetic Sensitivity</span>
          </span>
          <span className="text-emerald-400 font-bold">
            {Math.round(config.sensitivity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.2}
          max={1.0}
          step={0.05}
          value={config.sensitivity}
          onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          disabled={!config.enabled}
          className="w-full accent-[#00ff41] bg-zinc-800 h-1.5 rounded-lg cursor-pointer disabled:opacity-40"
        />
        <div className="flex justify-between text-[9px] text-zinc-500">
          <span>Strict Precision</span>
          <span>Balanced</span>
          <span>Relaxed / Noisy Rooms</span>
        </div>
      </div>

      {/* Toggles and Sound Feedback */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        {/* Sound Feedback Button */}
        <button
          type="button"
          onClick={() => setSoundFeedback(!config.soundFeedback)}
          className={`cursor-pointer px-3 py-2 rounded-xl border flex items-center justify-between transition-all ${
            config.soundFeedback
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-black/40 border-zinc-800 text-zinc-500'
          }`}
        >
          <span className="flex items-center gap-2">
            {config.soundFeedback ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>Acoustic Wake Chime</span>
          </span>
          <span className="text-[10px] font-bold">{config.soundFeedback ? 'ON' : 'OFF'}</span>
        </button>

        {/* Test Chime Trigger */}
        <button
          type="button"
          onClick={handleTestChime}
          className="cursor-pointer px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all"
        >
          <Play size={12} className={tested ? 'text-[#00ff41]' : 'text-emerald-400'} />
          <span>{tested ? 'Chime Played!' : 'Test Wake Sound'}</span>
        </button>
      </div>

      {/* Live Detection Notification Box */}
      <AnimatePresence>
        {lastEvent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3.5 pt-3 border-t border-white/10 text-[11px] flex items-center justify-between text-emerald-400"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles size={12} className="animate-spin" />
              <span>
                Last Wake: <strong>"{lastEvent.phrase}"</strong>
              </span>
              {lastEvent.commandTail && (
                <span className="text-zinc-300 truncate">({lastEvent.commandTail})</span>
              )}
            </div>
            <span className="text-[9px] text-zinc-500">
              {new Date(lastEvent.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default WakeWordControlCard
