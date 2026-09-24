import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Zap,
  Activity,
  AlertCircle,
  Square,
  CornerDownLeft
} from 'lucide-react'
import { RealtimeAudioVisualizer, VisualizerMode } from './RealtimeAudioVisualizer'
import { ActiveVoiceWaveformVisualizer, WaveformMode } from './ActiveVoiceWaveformVisualizer'

interface VoiceListeningWaveProps {
  isConnected: boolean
  isListening: boolean
  isSpeaking: boolean
  isMuted: boolean
  micLevel: number
  frequencyData?: Uint8Array | null
  stream?: MediaStream | null
  analyser?: AnalyserNode | null
  interimTranscript: string
  lastFinalTranscript: string
  voiceStatus: string
  statusMessage: string
  onToggleConnect: () => void
  onToggleMic: () => void
  onStopSpeaking?: () => void
  onSubmitPrompt?: (text: string) => void
}

export const VoiceListeningWave: React.FC<VoiceListeningWaveProps> = ({
  isConnected,
  isListening,
  isSpeaking,
  isMuted,
  micLevel,
  frequencyData,
  stream,
  analyser,
  interimTranscript,
  lastFinalTranscript,
  voiceStatus,
  statusMessage,
  onToggleConnect,
  onToggleMic,
  onStopSpeaking,
  onSubmitPrompt
}) => {
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('waves')
  const [manualText, setManualText] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualText.trim()) return
    onSubmitPrompt?.(manualText.trim())
    setManualText('')
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-2 z-20 px-2 sm:px-4">
      {/* Permission Denied Warning */}
      {voiceStatus === 'denied' && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full px-3.5 py-2.5 bg-red-950/90 border border-red-500/40 rounded-2xl flex items-center gap-3 text-xs text-red-200 backdrop-blur-xl shadow-lg"
        >
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Microphone Permission Blocked</p>
            <p className="text-[11px] text-red-300/80">
              Please click the lock icon in your browser address bar and enable Microphone access.
            </p>
          </div>
        </motion.div>
      )}

      {/* Main Glass Audio Waveform Display Capsule */}
      <div className="w-full relative bg-zinc-950/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col gap-2.5 overflow-hidden">
        {/* Top Status & Mode Bar */}
        <div className="flex items-center justify-between text-[11px] font-mono border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            {isSpeaking ? (
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider animate-pulse">
                <Volume2 size={13} />
                <span>IRIS VOCAL SYNTHESIS</span>
              </span>
            ) : isMuted ? (
              <span className="flex items-center gap-1.5 text-red-400 font-bold tracking-wider">
                <MicOff size={13} />
                <span>MICROPHONE MUTED</span>
              </span>
            ) : isListening ? (
              <span className="flex items-center gap-2 text-[#00ff41] font-bold tracking-wider">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff41] opacity-80"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00ff41]"></span>
                </span>
                <span>LISTENING TO YOUR VOICE</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500 font-mono tracking-wider">
                <Activity size={13} />
                <span>VOICE CORE STANDBY</span>
              </span>
            )}
          </div>

          {/* Equalizer Audio Level & Status Indicators */}
          <div className="flex items-center gap-2">
            {isConnected && !isMuted && (
              <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full border border-white/5">
                <span className="text-zinc-500 text-[9px]">VAD</span>
                <div className="flex items-end gap-0.5 h-3">
                  {[0.6, 1.4, 0.9, 1.6, 1.1, 1.3, 0.8].map((scale, i) => {
                    const h = isSpeaking
                      ? 8
                      : Math.max(2, Math.min(12, micLevel * 20 * scale))
                    return (
                      <span
                        key={i}
                        className={`w-0.5 rounded-full transition-all duration-75 ${
                          isSpeaking
                            ? 'bg-cyan-400'
                            : micLevel > 0.08
                              ? 'bg-[#00ff41]'
                              : 'bg-zinc-600'
                        }`}
                        style={{ height: `${h}px` }}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {isConnected && (
              <button
                type="button"
                onClick={onToggleMic}
                className={`cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono transition-all ${
                  isMuted
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40'
                    : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/10'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff size={11} className="text-red-400" /> : <Mic size={11} className="text-emerald-400" />}
                <span>{isMuted ? 'UNMUTE' : 'MUTE'}</span>
              </button>
            )}

            {isSpeaking && onStopSpeaking && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onStopSpeaking}
                className="cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-bold"
                title="Interrupt and stop speaking"
              >
                <Square size={9} className="fill-current" />
                <span>STOP</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Real-Time Audio Sensitivity Waveform Visualizer Canvas */}
        <div className="relative w-full overflow-hidden rounded-2xl">
          {isConnected ? (
            <ActiveVoiceWaveformVisualizer
              stream={stream}
              frequencyData={frequencyData}
              audioLevel={micLevel}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isMuted={isMuted}
              status={voiceStatus}
              height={95}
              showTelemetry={true}
              allowModeSwitch={true}
              variant="inline"
              onToggleMute={onToggleMic}
            />
          ) : (
            <div className="w-full h-16 bg-black/50 rounded-2xl flex items-center justify-between px-4 border border-white/5">
              <div className="flex flex-col">
                <span className="text-xs font-mono font-bold text-zinc-300">Voice Core Standby</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Microphone & Voice interface offline
                </span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 20px rgba(0,255,65,0.4)' }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleConnect}
                className="cursor-pointer px-3.5 py-1.5 rounded-full bg-[#00ff41] hover:bg-[#33ff66] text-black font-mono font-bold text-[11px] tracking-wider uppercase flex items-center gap-1.5 shadow-[0_0_15px_rgba(0,255,65,0.25)] transition-all"
              >
                <Mic size={13} className="stroke-[2.5]" />
                <span>Activate</span>
              </motion.button>
            </div>
          )}

          {/* Wake Word Glow Pill */}
          {isConnected && isListening && !isMuted && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00ff41]/10 border border-[#00ff41]/20 text-[9px] font-mono text-[#00ff41] z-20 pointer-events-none">
              <Sparkles size={10} />
              <span>Wake: "Hey IRIS"</span>
            </div>
          )}
        </div>

        {/* Real-time Transcription Readout */}
        <div className="min-h-[36px] px-3 py-2 rounded-xl bg-black/40 border border-white/5 flex items-center">
          {interimTranscript ? (
            <div className="flex items-center gap-2 text-xs font-mono text-[#00ff41] break-all">
              <span className="text-zinc-500 font-bold">&gt;</span>
              <span className="text-white font-medium">"{interimTranscript}"</span>
              <span className="inline-block w-1.5 h-3.5 bg-[#00ff41] animate-pulse" />
            </div>
          ) : lastFinalTranscript && !isSpeaking ? (
            <div className="text-[11px] font-mono text-zinc-400 truncate flex items-center gap-1.5">
              <span className="text-emerald-500/70">&gt; Command:</span>
              <span className="text-zinc-200">"{lastFinalTranscript}"</span>
            </div>
          ) : isSpeaking ? (
            <div className="text-[11px] font-mono text-cyan-300/90 italic flex items-center gap-2">
              <Volume2 size={12} className="animate-pulse text-cyan-400" />
              <span>Transmitting vocal response and telemetry...</span>
            </div>
          ) : isMuted ? (
            <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <MicOff size={12} className="text-red-400" />
              <span>Microphone muted. Tap mic to speak.</span>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 italic truncate flex items-center gap-1.5">
              <Zap size={12} className="text-[#00ff41] shrink-0" />
              <span>
                {statusMessage ||
                  'Speak naturally into your microphone — IRIS is actively listening...'}
              </span>
            </div>
          )}
        </div>

        {/* Inline Manual Fallback Input / Instant Command Line */}
        <form onSubmit={handleManualSubmit} className="relative flex items-center w-full">
          <input
            type="text"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Type a voice command or ask IRIS anything..."
            className={`w-full bg-black/50 border text-xs font-mono text-zinc-200 rounded-xl px-3.5 py-2 pl-8 pr-9 outline-none transition-all placeholder:text-zinc-600 ${
              isInputFocused
                ? 'border-[#00ff41]/50 shadow-[0_0_15px_rgba(0,255,65,0.15)] bg-black/80'
                : 'border-white/10 hover:border-white/20'
            }`}
          />
          <Mic
            size={13}
            className={`absolute left-2.5 transition-colors ${
              isListening ? 'text-[#00ff41]' : 'text-zinc-500'
            }`}
          />
          {manualText && (
            <button
              type="submit"
              className="absolute right-2.5 p-1 rounded-md bg-[#00ff41]/20 hover:bg-[#00ff41]/30 text-[#00ff41] cursor-pointer transition-colors"
              title="Submit command"
            >
              <CornerDownLeft size={11} />
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export default VoiceListeningWave
