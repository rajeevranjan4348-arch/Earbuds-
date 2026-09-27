import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiMicLine,
  RiMicFill,
  RiMicOffLine,
  RiSparklingFill,
  RiVolumeMuteLine,
  RiVolumeUpLine,
  RiStopCircleLine,
  RiSettings4Line,
  RiAppsLine,
  RiImageLine,
  RiCloseLine,
  RiCheckLine,
  RiArrowRightLine
} from 'react-icons/ri'
import { soundEffects } from '../../services/soundEffectsService'
import { appControlService } from '../../services/appControlService'

interface GlobalVoiceCommandHUDProps {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isMuted: boolean
  interimTranscript: string
  lastFinalTranscript: string
  micLevel: number
  statusMessage: string
  toggleConnection: () => void
  toggleMute: () => void
  stopSpeaking?: () => void
  submitVoicePrompt?: (text: string) => void
  onOpenAppController?: () => void
}

export const GlobalVoiceCommandHUD: React.FC<GlobalVoiceCommandHUDProps> = ({
  isConnected,
  isListening,
  isSpeaking,
  isMuted,
  interimTranscript,
  lastFinalTranscript,
  micLevel,
  statusMessage,
  toggleConnection,
  toggleMute,
  stopSpeaking,
  submitVoicePrompt,
  onOpenAppController
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [lastExecutedCmd, setLastExecutedCmd] = useState<string | null>(null)

  // Level percentage (0-100)
  const levelPercent = Math.min(100, Math.round(micLevel * 100))

  useEffect(() => {
    if (lastFinalTranscript) {
      setLastExecutedCmd(lastFinalTranscript)
      const timer = setTimeout(() => setLastExecutedCmd(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [lastFinalTranscript])

  const handleCommandClick = (cmd: string) => {
    soundEffects.play('pop')
    if (submitVoicePrompt) {
      submitVoicePrompt(cmd)
    } else {
      window.dispatchEvent(
        new CustomEvent('iris:run-voice-command', {
          detail: { text: cmd }
        })
      )
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center pointer-events-auto select-none max-w-[94vw] sm:max-w-xl">
      {/* Real-time Interim / Final Transcript Speech Bubble */}
      <AnimatePresence>
        {(interimTranscript || lastExecutedCmd) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="mb-2 px-4 py-2 rounded-2xl bg-zinc-950/95 border border-emerald-500/40 text-zinc-100 shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur-xl flex items-center gap-2.5 font-mono text-xs max-w-full truncate"
          >
            <RiSparklingFill size={14} className="text-emerald-400 shrink-0 animate-spin" />
            <span className="text-zinc-400 font-bold uppercase text-[10px]">Heard:</span>
            <span className="text-emerald-300 font-semibold truncate">
              "{interimTranscript || lastExecutedCmd}"
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main HUD Bar */}
      <motion.div
        layout
        className={`flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-zinc-950/90 border backdrop-blur-2xl shadow-2xl transition-all duration-300 ${
          isSpeaking
            ? 'border-cyan-500/60 shadow-[0_0_25px_rgba(6,182,212,0.3)]'
            : isListening
              ? 'border-emerald-500/60 shadow-[0_0_25px_rgba(16,185,129,0.3)]'
              : 'border-white/10 hover:border-white/20'
        }`}
      >
        {/* Master Microphone Button */}
        <button
          onClick={toggleConnection}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
            !isConnected
              ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10'
              : isSpeaking
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                : isMuted
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                  : 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)]'
          }`}
          title={isConnected ? 'Disconnect Microphone' : 'Connect Microphone & Listen for Commands'}
        >
          {isConnected ? (
            isMuted ? (
              <RiMicOffLine size={16} />
            ) : (
              <RiMicFill size={16} className={isListening ? 'animate-pulse' : ''} />
            )
          ) : (
            <RiMicLine size={16} />
          )}

          <span className="hidden sm:inline">
            {!isConnected
              ? 'Listen Voice'
              : isSpeaking
                ? 'IRIS Speaking'
                : isMuted
                  ? 'Mic Muted'
                  : 'Listening...'}
          </span>
        </button>

        {/* Real-time Visualizer Waves when connected */}
        {isConnected && !isMuted && (
          <div className="flex items-center gap-0.5 px-2 py-1">
            <span
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(6, (levelPercent / 100) * 22)}px` }}
            />
            <span
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(8, (levelPercent / 100) * 28)}px` }}
            />
            <span
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(12, (levelPercent / 100) * 32)}px` }}
            />
            <span
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(8, (levelPercent / 100) * 24)}px` }}
            />
            <span
              className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              style={{ height: `${Math.max(6, (levelPercent / 100) * 18)}px` }}
            />
          </div>
        )}

        {/* Mute Toggle Button */}
        {isConnected && (
          <button
            onClick={toggleMute}
            className={`p-2 rounded-xl transition cursor-pointer border ${
              isMuted
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/10'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <RiVolumeMuteLine size={15} /> : <RiVolumeUpLine size={15} />}
          </button>
        )}

        {/* Stop Speaking Button */}
        {isSpeaking && stopSpeaking && (
          <button
            onClick={stopSpeaking}
            className="p-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 transition cursor-pointer"
            title="Stop IRIS speaking"
          >
            <RiStopCircleLine size={15} />
          </button>
        )}

        {/* Quick Action Suggestions (Open Settings, Generate Asset, Apps) */}
        <div className="hidden md:flex items-center gap-1.5 pl-1 pr-1 border-l border-white/10">
          <button
            onClick={() => handleCommandClick('Open Settings')}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-emerald-300 border border-white/10 font-mono text-[11px] flex items-center gap-1 transition cursor-pointer"
            title="Voice task: 'Open Settings'"
          >
            <RiSettings4Line size={13} className="text-zinc-400" />
            <span>Open Settings</span>
          </button>

          <button
            onClick={() => handleCommandClick('Generate Asset cyberpunk robot')}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-purple-300 border border-white/10 font-mono text-[11px] flex items-center gap-1 transition cursor-pointer"
            title="Voice task: 'Generate Asset'"
          >
            <RiImageLine size={13} className="text-purple-400" />
            <span>Generate Asset</span>
          </button>

          {onOpenAppController && (
            <button
              onClick={onOpenAppController}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 font-mono text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Open Apps Controller"
            >
              <RiAppsLine size={13} />
              <span>All Apps</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default GlobalVoiceCommandHUD
