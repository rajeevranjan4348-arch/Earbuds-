import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Loader2, Sparkles } from 'lucide-react'
import { microphoneHandler, MicState } from '../../services/microphoneHandler'

interface MicrophoneInputButtonProps {
  onTranscript?: (text: string) => void
  onCommandTriggered?: (command: string) => void
  onInterimText?: (text: string) => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
  autoExecute?: boolean
}

export const MicrophoneInputButton: React.FC<MicrophoneInputButtonProps> = ({
  onTranscript,
  onCommandTriggered,
  onInterimText,
  className = '',
  size = 'md',
  autoExecute = true
}) => {
  const [micState, setMicState] = useState<MicState>(microphoneHandler.getState())
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [statusMessage, setStatusMessage] = useState<string>(microphoneHandler.getStatusMessage())
  const isHoldingRef = useRef(false)

  const callbacksRef = useRef({
    onTranscript,
    onCommandTriggered,
    onInterimText
  })

  useEffect(() => {
    callbacksRef.current = {
      onTranscript,
      onCommandTriggered,
      onInterimText
    }
  })

  useEffect(() => {
    microphoneHandler.configure({
      autoExecute,
      onStateChange: (state, message) => {
        setMicState(state)
        if (message) setStatusMessage(message)
      },
      onAudioLevel: (level) => {
        setAudioLevel(level)
      },
      onInterimTranscript: (text) => {
        callbacksRef.current.onInterimText?.(text)
      },
      onFinalTranscript: (text) => {
        callbacksRef.current.onTranscript?.(text)
      },
      onCommandTriggered: (cmd) => {
        callbacksRef.current.onCommandTriggered?.(cmd)
      }
    })
  }, [autoExecute])

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await microphoneHandler.toggleListening()
  }

  // Push-to-talk press & hold support
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isHoldingRef.current = true
    // If not currently listening, start push-to-talk
    if (micState === 'idle') {
      await microphoneHandler.startPushToTalk()
    }
  }

  const handleMouseUp = () => {
    if (isHoldingRef.current) {
      microphoneHandler.stopPushToTalk()
    }
    isHoldingRef.current = false
  }

  const handleTouchStart = async (e: React.TouchEvent) => {
    isHoldingRef.current = true
    if (micState === 'idle') {
      await microphoneHandler.startPushToTalk()
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    handleMouseUp()
  }

  const isListening =
    micState === 'listening' ||
    micState === 'recording-ai' ||
    micState === 'streaming-live'
  const isProcessing = micState === 'transcribing' || micState === 'processing'
  const isDenied = micState === 'denied'

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  }

  const buttonPaddings = {
    sm: 'p-1.5 min-w-8 min-h-8',
    md: 'p-2 sm:p-2.5 min-w-9 min-h-9 sm:min-w-10 sm:min-h-10',
    lg: 'p-3 min-w-12 min-h-12'
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Dynamic Audio Reactivity Wave Rings when Listening */}
      <AnimatePresence>
        {isListening && (
          <>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{
                scale: 1 + audioLevel * 0.9,
                opacity: 0.35 + audioLevel * 0.45
              }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 20 }}
              className="absolute inset-0 rounded-xl bg-emerald-500/30 blur-sm pointer-events-none"
            />
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              className="absolute -inset-1 rounded-2xl border border-emerald-400/40 pointer-events-none"
            />
          </>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`relative flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer select-none z-10 ${buttonPaddings[size]} ${
          isListening
            ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)] font-bold'
            : isProcessing
              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse'
              : isDenied
                ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-white/5 text-zinc-400 border-white/10 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-white/10'
        } ${className}`}
        title={
          isListening
            ? 'Listening... Click to stop or hold to speak'
            : isProcessing
              ? statusMessage
              : isDenied
                ? 'Microphone permission denied. Allow mic in browser settings.'
                : 'Click to speak voice command for IRIS'
        }
      >
        {isProcessing ? (
          <Loader2 size={iconSizes[size]} className="animate-spin text-cyan-400" />
        ) : isDenied ? (
          <MicOff size={iconSizes[size]} />
        ) : isListening ? (
          <div className="flex items-center justify-center relative">
            <Mic size={iconSizes[size]} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-black animate-ping" />
          </div>
        ) : (
          <Mic size={iconSizes[size]} />
        )}
      </motion.button>
    </div>
  )
}

export default MicrophoneInputButton
