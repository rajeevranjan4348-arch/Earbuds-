import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio,
  Sliders,
  Volume2,
  VolumeX,
  Play,
  Plus,
  X,
  Sparkles,
  Check,
  AlertCircle,
  BarChart3,
  Clock,
  Trash2,
  History
} from 'lucide-react'
import { useWakeWordManager } from '../../hooks/useWakeWordManager'

interface WakeWordSettingsModuleProps {
  className?: string
  compact?: boolean
}

export const WakeWordSettingsModule: React.FC<WakeWordSettingsModuleProps> = ({
  className = ''
}) => {
  const {
    config,
    enabled,
    isListening,
    isSupported,
    lastEvent,
    customWakeWord,
    wakePhrases,
    logHistory,
    frequencyStats,
    setEnabled,
    setCustomWakeWord,
    addWakePhrase,
    removeWakePhrase,
    setSensitivity,
    setSoundFeedback,
    setAutoExecute,
    clearLogs,
    playTestChime
  } = useWakeWordManager()

  const [newPhraseInput, setNewPhraseInput] = useState('')
  const [editingPrimary, setEditingPrimary] = useState(customWakeWord)
  const [isSavedPrimary, setIsSavedPrimary] = useState(false)
  const [testedChime, setTestedChime] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  const handleSavePrimary = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPrimary.trim()) return
    setCustomWakeWord(editingPrimary.trim())
    setIsSavedPrimary(true)
    setTimeout(() => setIsSavedPrimary(false), 1800)
  }

  const handleAddPhrase = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPhraseInput.trim()) return
    addWakePhrase(newPhraseInput.trim())
    setNewPhraseInput('')
  }

  const handleTestChime = () => {
    playTestChime()
    setTestedChime(true)
    setTimeout(() => setTestedChime(false), 1500)
  }

  // Helper sensitivity descriptions to prevent false positives
  const getSensitivityGuide = (val: number) => {
    if (val < 0.4) {
      return 'Strict mode: Requires multi-word exact phrase match. High immunity to background false positives.'
    }
    if (val < 0.75) {
      return 'Balanced mode: Standard threshold optimized for home or office environment.'
    }
    return 'Relaxed mode: Accepts single-word triggers and phonetic variations. Recommended for noisy rooms.'
  }

  return (
    <div
      className={`rounded-3xl bg-zinc-950/90 border border-white/10 p-4 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] font-mono text-zinc-200 backdrop-blur-2xl ${className}`}
    >
      {/* Module Title & Ambient Listener Status Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(0,255,65,0.15)]">
            <Radio size={18} className={enabled && isListening ? 'animate-pulse' : ''} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-white tracking-wide">
                Ambient Wake Word Manager
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  enabled && isListening
                    ? 'bg-[#00ff41]/20 text-[#00ff41] border-[#00ff41]/30 animate-pulse'
                    : enabled
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}
              >
                {enabled && isListening ? 'Listening Active' : enabled ? 'Standby' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Continuous 100% client-side Web Speech API voice activation engine
            </p>
          </div>
        </div>

        {/* Master Power Switch Toggle */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-12 h-6.5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5.5 after:w-5.5 after:transition-all peer-checked:bg-[#00ff41]"></div>
        </label>
      </div>

      {!isSupported && (
        <div className="mb-4 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex items-center gap-2.5 text-xs text-amber-300">
          <AlertCircle size={16} className="shrink-0 text-amber-400" />
          <span>Web Speech API is not natively supported on this browser engine.</span>
        </div>
      )}

      {/* Primary Custom Wake Word Editor */}
      <div className="mb-5 bg-black/60 rounded-2xl p-4 border border-white/5 space-y-3">
        <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
          Primary Custom Wake Word
        </label>
        <form onSubmit={handleSavePrimary} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={editingPrimary}
              onChange={(e) => setEditingPrimary(e.target.value)}
              placeholder="e.g. Iris, Jarvis, Computer..."
              disabled={!enabled}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={!enabled || !editingPrimary.trim()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-black font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isSavedPrimary ? <Check size={14} /> : <Sparkles size={14} />}
            <span>{isSavedPrimary ? 'Saved!' : 'Set Wake Word'}</span>
          </button>
        </form>
        <p className="text-[11px] text-zinc-500 font-sans">
          Saying <strong className="text-emerald-400 font-mono">"{customWakeWord}"</strong> aloud into the microphone will instantly wake the AI.
        </p>
      </div>

      {/* Recognized Trigger Phrases List */}
      <div className="mb-5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            All Recognized Wake Phrases
          </span>
          <span className="text-[10px] text-zinc-500">
            {wakePhrases.length} phrase{wakePhrases.length !== 1 ? 's' : ''} active
          </span>
        </div>

        <div className="flex flex-wrap gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 min-h-[48px]">
          {wakePhrases.map((phrase) => (
            <span
              key={phrase}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold transition-all ${
                enabled
                  ? 'bg-zinc-900/90 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(0,255,65,0.08)]'
                  : 'bg-black/40 text-zinc-500 border-zinc-800'
              }`}
            >
              <span>"{phrase}"</span>
              {wakePhrases.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeWakePhrase(phrase)}
                  disabled={!enabled}
                  className="hover:text-red-400 transition-colors cursor-pointer"
                  title={`Remove "${phrase}"`}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Add Secondary Phrase Input */}
        <form onSubmit={handleAddPhrase} className="flex gap-2">
          <input
            type="text"
            value={newPhraseInput}
            onChange={(e) => setNewPhraseInput(e.target.value)}
            placeholder="Add alias phrase (e.g., 'Hey Iris', 'OK Iris')..."
            disabled={!enabled}
            className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!enabled || !newPhraseInput.trim()}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
          >
            <Plus size={13} />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* Phonetic Sensitivity Calibration Slider with Threshold False Positive Protection */}
      <div className="mb-5 bg-black/50 rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-300 font-bold flex items-center gap-1.5">
            <Sliders size={14} className="text-emerald-400" />
            <span>Phonetic Detection Sensitivity</span>
          </span>
          <span className="text-emerald-400 font-bold font-mono">
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
          disabled={!enabled}
          className="w-full accent-[#00ff41] bg-zinc-800 h-1.5 rounded-lg cursor-pointer disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-zinc-500 font-sans">
          <span>Strict (0.2)</span>
          <span>Balanced (0.75)</span>
          <span>Relaxed (1.0)</span>
        </div>
        <p className="text-[11px] text-emerald-400/90 font-sans bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/20">
          💡 {getSensitivityGuide(config.sensitivity)}
        </p>
      </div>

      {/* Acoustic Feedback & Auto Execution Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-5">
        {/* Acoustic Chime Toggle */}
        <button
          type="button"
          onClick={() => setSoundFeedback(!config.soundFeedback)}
          disabled={!enabled}
          className={`cursor-pointer px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-all disabled:opacity-40 ${
            config.soundFeedback
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-black/40 border-zinc-800 text-zinc-500'
          }`}
        >
          <span className="flex items-center gap-2">
            {config.soundFeedback ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>Acoustic Wake Chime</span>
          </span>
          <span className="text-[10px] font-bold">{config.soundFeedback ? 'ON' : 'OFF'}</span>
        </button>

        {/* Test Chime Trigger */}
        <button
          type="button"
          onClick={handleTestChime}
          disabled={!enabled}
          className="cursor-pointer px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all"
        >
          <Play size={13} className={testedChime ? 'text-[#00ff41]' : 'text-emerald-400'} />
          <span>{testedChime ? 'Chime Synthesized!' : 'Test Wake Sound'}</span>
        </button>
      </div>

      {/* Interaction Frequency Analytics & Timestamps Log Section */}
      <div className="border-t border-white/10 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-emerald-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Interaction Frequency Analytics
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <History size={12} />
            <span>{showLogs ? 'Hide Timeline Logs' : `View Logs (${logHistory.length})`}</span>
          </button>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-black/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Today</span>
            <span className="text-lg font-bold text-[#00ff41]">{frequencyStats.todayCount}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">7-Day Total</span>
            <span className="text-lg font-bold text-emerald-300">{frequencyStats.weekCount}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Avg / Day</span>
            <span className="text-lg font-bold text-cyan-300">{frequencyStats.avgDailyCount}</span>
          </div>
          <div className="p-3 rounded-2xl bg-black/60 border border-white/5 space-y-1 truncate">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Top Wake Word</span>
            <span className="text-sm font-bold text-zinc-100 truncate block">"{frequencyStats.mostCommonPhrase}"</span>
          </div>
        </div>

        {/* Detailed Timestamps Interaction History Log List */}
        <AnimatePresence>
          {showLogs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 pt-2"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Recorded Wake Activation Timestamps</span>
                {logHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={clearLogs}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>Clear Log History</span>
                  </button>
                )}
              </div>

              <div className="max-h-52 overflow-y-auto space-y-2 p-2 rounded-2xl bg-black/80 border border-white/5 custom-scrollbar">
                {logHistory.length === 0 ? (
                  <div className="text-center py-6 text-zinc-600 text-xs italic">
                    No wake word interactions recorded yet. Say "{customWakeWord}" to trigger!
                  </div>
                ) : (
                  logHistory.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-white/5 text-xs text-zinc-300 font-mono"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Clock size={12} className="text-emerald-400 shrink-0" />
                        <span className="font-bold text-emerald-300">"{log.phrase}"</span>
                        {log.commandTail && (
                          <span className="text-zinc-400 truncate">({log.commandTail})</span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0 pl-2">
                        {new Date(log.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Live Detection Pulse Bar */}
      <AnimatePresence>
        {lastEvent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-3 border-t border-white/10 text-xs flex items-center justify-between text-emerald-400"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles size={13} className="animate-spin text-emerald-400" />
              <span>
                Last Detected Wake: <strong>"{lastEvent.phrase}"</strong>
              </span>
              {lastEvent.commandTail && (
                <span className="text-zinc-300 truncate">({lastEvent.commandTail})</span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500">
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

export default WakeWordSettingsModule
