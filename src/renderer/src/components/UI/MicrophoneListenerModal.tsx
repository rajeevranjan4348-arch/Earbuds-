import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiMicLine,
  RiMicOffLine,
  RiVolumeUpLine,
  RiCpuLine,
  RiTerminalBoxLine,
  RiCheckLine,
  RiCloseLine,
  RiRefreshLine,
  RiTranslate,
  RiSparklingLine,
  RiShieldCheckLine,
  RiInformationLine
} from 'react-icons/ri'
import {
  microphoneListenerService,
  MicListenerState,
  MicListenerMetrics
} from '../../services/microphoneListenerService'
import { SupportedLanguage } from '../../services/voice/VoiceTypes'

interface MicrophoneListenerModalProps {
  isOpen: boolean
  onClose: () => void
}

export const MicrophoneListenerModal: React.FC<MicrophoneListenerModalProps> = ({
  isOpen,
  onClose
}) => {
  const [listenerState, setListenerState] = useState<MicListenerState>(() =>
    microphoneListenerService.getState()
  )
  const [metrics, setMetrics] = useState<MicListenerMetrics>(() =>
    microphoneListenerService.getMetrics()
  )

  useEffect(() => {
    const unsub = microphoneListenerService.subscribe((s, m) => {
      setListenerState(s)
      setMetrics(m)
    })
    return () => unsub()
  }, [])

  if (!isOpen) return null

  const isListening = listenerState.status === 'listening'
  const isProcessing = listenerState.status === 'processing'
  const isSpeaking = listenerState.status === 'speaking'

  const handleToggle = async () => {
    await microphoneListenerService.toggleListening()
  }

  const handleLanguageChange = (lang: SupportedLanguage) => {
    microphoneListenerService.setLanguage(lang)
  }

  const levelPercent = Math.min(100, Math.round(metrics.level * 100))

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-zinc-950/95 border border-red-500/30 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.15)] text-zinc-100 font-mono overflow-hidden"
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 border-b border-white/10 bg-zinc-900/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <RiMicLine size={22} className={isListening ? 'animate-pulse' : ''} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-zinc-100">
                    Microphone Listener & Neural OS Router
                  </h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                      isListening
                        ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                        : isProcessing
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : isSpeaking
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-zinc-800 text-zinc-400 border-white/10'
                    }`}
                  >
                    {isListening
                      ? 'Listening Active'
                      : isProcessing
                        ? 'Routing Command...'
                        : isSpeaking
                          ? 'Iris Speaking...'
                          : 'Idle / Off'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Captures local audio speech, transcribes in real-time & routes commands to Iris Neural OS
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="Close"
            >
              <RiCloseLine size={18} />
            </button>
          </div>

          {/* Visualizer & Wave Area */}
          <div className="p-5 bg-zinc-950 border-b border-white/5 flex flex-col items-center justify-center gap-4 shrink-0">
            {/* Audio Waveform Animation Bars */}
            <div className="flex items-center justify-center gap-1.5 h-16 w-full max-w-xs">
              {[0.4, 0.7, 1.0, 0.6, 0.9, 1.2, 0.8, 0.5, 1.1, 0.7].map((scale, i) => {
                const barHeight = isListening ? Math.max(12, Math.min(60, levelPercent * scale * 1.2)) : 8
                return (
                  <motion.div
                    key={i}
                    animate={{ height: `${barHeight}px` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={`w-2.5 rounded-full transition-colors ${
                      isListening
                        ? 'bg-gradient-to-t from-red-600 via-rose-400 to-amber-300 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                        : 'bg-zinc-800'
                    }`}
                  />
                )
              })}
            </div>

            {/* Audio Meter Bar */}
            <div className="w-full max-w-md space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                <div className="flex items-center gap-1.5">
                  <RiVolumeUpLine size={12} className="text-red-400" />
                  <span>Microphone Input Level</span>
                </div>
                <span>{levelPercent}% RMS</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-900 border border-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 rounded-full"
                  animate={{ width: `${levelPercent}%` }}
                  transition={{ ease: 'easeOut', duration: 0.1 }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleToggle}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 cursor-pointer ${
                  isListening
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-black shadow-emerald-500/20'
                }`}
              >
                {isListening ? (
                  <>
                    <RiMicOffLine size={16} />
                    <span>Stop Listener</span>
                  </>
                ) : (
                  <>
                    <RiMicLine size={16} />
                    <span>Start Microphone Listener</span>
                  </>
                )}
              </button>

              {/* Language Selector */}
              <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 p-1 rounded-xl">
                {[
                  { id: 'auto', label: 'Auto' },
                  { id: 'en-IN', label: 'English/Hinglish' },
                  { id: 'hi-IN', label: 'Hindi' }
                ].map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => handleLanguageChange(lang.id as SupportedLanguage)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                      listenerState.language === lang.id
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Transcripts & Router Log */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4">
            {/* Live Streaming Speech Transcript */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-300">
                <div className="flex items-center gap-2">
                  <RiTranslate className="text-cyan-400" />
                  <span>Real-Time Speech-to-Text Transcript</span>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Confidence: {listenerState.confidence}%
                </span>
              </div>

              <div className="p-3 bg-zinc-950 border border-white/5 rounded-lg min-h-[60px] text-xs font-mono leading-relaxed">
                {listenerState.interimTranscript ? (
                  <span className="text-cyan-300 italic animate-pulse">
                    {listenerState.interimTranscript} •••
                  </span>
                ) : listenerState.finalTranscript ? (
                  <span className="text-zinc-100 font-bold">
                    "{listenerState.finalTranscript}"
                  </span>
                ) : (
                  <span className="text-zinc-600 italic">
                    {isListening
                      ? 'Listening for vocal input... Speak clearly into microphone.'
                      : 'Click "Start Microphone Listener" to capture commands.'}
                  </span>
                )}
              </div>
            </div>

            {/* Neural OS Command Routing Log */}
            {listenerState.lastRoutedCommand && (
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <div className="flex items-center gap-2">
                    <RiCpuLine size={16} />
                    <span>Iris Neural OS Command Routing</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Handled Successfully
                  </span>
                </div>

                <div className="p-3 bg-zinc-950 border border-white/5 rounded-lg space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Action Executed:</span>
                    <span className="text-emerald-300 font-bold">{listenerState.lastRoutedCommand.actionExecuted || 'COMMAND_ROUTED'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Intent Category:</span>
                    <span className="text-cyan-400">{listenerState.lastRoutedCommand.intent}</span>
                  </div>
                  <div className="text-[11px] text-zinc-300 pt-1 border-t border-white/5 leading-relaxed">
                    Response: {listenerState.lastRoutedCommand.spokenResponse || listenerState.lastRoutedCommand.response}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {listenerState.errorMessage && (
              <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-red-200 text-xs font-mono">
                Error: {listenerState.errorMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 sm:p-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
              <RiShieldCheckLine className="text-red-400" />
              <span>Speech recognition processed locally with direct Neural OS event routing.</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer text-xs"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default MicrophoneListenerModal
