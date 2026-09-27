import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Mic, Radio } from 'lucide-react'
import { WakeWordEventDetail } from '../../services/wakeWordService'

export const WakeWordDetectionOverlay: React.FC = () => {
  const [activeEvent, setActiveEvent] = useState<WakeWordEventDetail | null>(null)

  useEffect(() => {
    const handleWakeWord = (e: any) => {
      const detail = e.detail as WakeWordEventDetail
      if (detail) {
        setActiveEvent(detail)
        const timer = setTimeout(() => {
          setActiveEvent(null)
        }, 3200)
        return () => clearTimeout(timer)
      }
    }

    window.addEventListener('iris:wake-word-detected', handleWakeWord)
    return () => {
      window.removeEventListener('iris:wake-word-detected', handleWakeWord)
    }
  }, [])

  if (!activeEvent) return null

  return (
    <AnimatePresence>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none select-none px-4 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="relative overflow-hidden rounded-2xl bg-zinc-950/95 border border-[#00ff41]/50 p-4 shadow-[0_10px_40px_rgba(0,255,65,0.25)] backdrop-blur-2xl font-mono text-white"
        >
          {/* Animated Glow Backing */}
          <div className="absolute -inset-1 bg-gradient-to-r from-[#00ff41]/20 via-emerald-500/20 to-cyan-500/20 blur-xl opacity-70 animate-pulse pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3.5">
            {/* Pulsing Acoustic Visualizer Icon Ring */}
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-[#00ff41]/10 border border-[#00ff41]/40 text-[#00ff41] shrink-0">
              <span className="absolute inset-0 rounded-xl bg-[#00ff41]/20 animate-ping opacity-40" />
              <Mic size={22} className="animate-pulse" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#00ff41] uppercase tracking-wider">
                  <Sparkles size={13} className="animate-spin" />
                  <span>Wake Word Detected</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00ff41]/20 border border-[#00ff41]/30 text-[#00ff41] font-bold">
                  Listening Active
                </span>
              </div>

              <div className="text-sm font-bold text-white truncate mt-0.5">
                "{activeEvent.phrase}"
              </div>

              <div className="text-[11px] text-zinc-400 truncate mt-0.5 font-sans flex items-center gap-1">
                <Radio size={11} className="text-[#00ff41] animate-pulse" />
                <span>
                  {activeEvent.commandTail ? (
                    <>
                      Command: <strong className="text-emerald-300 font-mono">"{activeEvent.commandTail}"</strong>
                    </>
                  ) : (
                    'System listening for your voice command...'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Progress Pulse Indicator */}
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 3.2, ease: 'linear' }}
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#00ff41] via-emerald-400 to-cyan-400"
          />
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default WakeWordDetectionOverlay
