import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  CheckCircle2,
  Compass,
  Sparkles,
  Search,
  Camera,
  FolderTree,
  Radio,
  X,
  Volume2,
  Cpu,
  Smartphone
} from 'lucide-react'
import { voiceToastService, VoiceCommandToastItem } from '../../services/voiceToastService'

interface ToastStateItem extends VoiceCommandToastItem {
  createdAt: number
  isPaused?: boolean
}

export const VoiceCommandToastHUD: React.FC = () => {
  const [toasts, setToasts] = useState<ToastStateItem[]>([])
  const timersRef = useRef<Map<string, { timerId: any; startTime: number; remaining: number }>>(
    new Map()
  )

  const removeToast = (id: string) => {
    const timerData = timersRef.current.get(id)
    if (timerData) {
      clearTimeout(timerData.timerId)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const startDismissTimer = (id: string, duration: number) => {
    const timerData = timersRef.current.get(id)
    if (timerData) {
      clearTimeout(timerData.timerId)
    }

    const timerId = setTimeout(() => {
      removeToast(id)
    }, duration)

    timersRef.current.set(id, {
      timerId,
      startTime: Date.now(),
      remaining: duration
    })
  }

  const handleMouseEnter = (id: string) => {
    const timerData = timersRef.current.get(id)
    if (timerData) {
      clearTimeout(timerData.timerId)
      const elapsed = Date.now() - timerData.startTime
      const remaining = Math.max(800, timerData.remaining - elapsed)
      timersRef.current.set(id, { ...timerData, remaining })
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isPaused: true } : t)))
    }
  }

  const handleMouseLeave = (id: string) => {
    const timerData = timersRef.current.get(id)
    if (timerData) {
      startDismissTimer(id, timerData.remaining)
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isPaused: false } : t)))
    }
  }

  useEffect(() => {
    // 1. Subscribe to VoiceToastService directly
    const unsubscribe = voiceToastService.subscribe((item) => {
      const newItem: ToastStateItem = {
        ...item,
        createdAt: Date.now(),
        isPaused: false
      }

      setToasts((prev) => {
        // Keep max 3 toasts to avoid clutter
        const updated = [newItem, ...prev.slice(0, 2)]
        return updated
      })

      startDismissTimer(item.id, item.durationMs || 3500)
    })

    // 2. Also listen for window DOM events for maximum decoupling
    const handleDomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<VoiceCommandToastItem>
      if (customEvent.detail && customEvent.detail.id) {
        const item = customEvent.detail
        // Avoid duplicate if already triggered by service
        setToasts((prev) => {
          if (prev.some((t) => t.id === item.id)) return prev
          startDismissTimer(item.id, item.durationMs || 3500)
          return [{ ...item, createdAt: Date.now(), isPaused: false }, ...prev.slice(0, 2)]
        })
      }
    }

    window.addEventListener('iris:voice-command-processed', handleDomEvent)

    return () => {
      unsubscribe()
      window.removeEventListener('iris:voice-command-processed', handleDomEvent)
      timersRef.current.forEach((t) => clearTimeout(t.timerId))
      timersRef.current.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  const getIntentMeta = (intent: string) => {
    const lower = intent.toLowerCase()
    if (lower.includes('nav') || lower.includes('tab')) {
      return {
        icon: Compass,
        accent: '#10b981', // Emerald
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.35)',
        label: 'Navigation'
      }
    }
    if (lower.includes('search') || lower.includes('web')) {
      return {
        icon: Search,
        accent: '#06b6d4', // Cyan
        badgeBg: 'rgba(6, 182, 212, 0.15)',
        badgeBorder: 'rgba(6, 182, 212, 0.35)',
        label: 'Web Search'
      }
    }
    if (lower.includes('vision') || lower.includes('camera') || lower.includes('optics')) {
      return {
        icon: Camera,
        accent: '#a855f7', // Purple
        badgeBg: 'rgba(168, 85, 247, 0.15)',
        badgeBorder: 'rgba(168, 85, 247, 0.35)',
        label: 'Optics'
      }
    }
    if (lower.includes('workspace') || lower.includes('doc') || lower.includes('file')) {
      return {
        icon: FolderTree,
        accent: '#3b82f6', // Blue
        badgeBg: 'rgba(59, 130, 246, 0.15)',
        badgeBorder: 'rgba(59, 130, 246, 0.35)',
        label: 'Workspace'
      }
    }
    if (lower.includes('phone') || lower.includes('android') || lower.includes('adb')) {
      return {
        icon: Smartphone,
        accent: '#22c55e', // Light Green
        badgeBg: 'rgba(34, 197, 94, 0.15)',
        badgeBorder: 'rgba(34, 197, 94, 0.35)',
        label: 'Mobile Sync'
      }
    }
    if (lower.includes('system') || lower.includes('telemetry') || lower.includes('orchestrat')) {
      return {
        icon: Cpu,
        accent: '#ec4899', // Pink
        badgeBg: 'rgba(236, 72, 153, 0.15)',
        badgeBorder: 'rgba(236, 72, 153, 0.35)',
        label: 'System Action'
      }
    }
    if (lower.includes('audio') || lower.includes('speak') || lower.includes('voice')) {
      return {
        icon: Volume2,
        accent: '#f59e0b', // Amber
        badgeBg: 'rgba(245, 158, 11, 0.15)',
        badgeBorder: 'rgba(245, 158, 11, 0.35)',
        label: 'Audio Control'
      }
    }

    return {
      icon: Sparkles,
      accent: '#00ff41', // Matrix Green
      badgeBg: 'rgba(0, 255, 65, 0.15)',
      badgeBorder: 'rgba(0, 255, 65, 0.35)',
      label: 'Voice Command'
    }
  }

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none max-w-md w-full px-4">
      <AnimatePresence mode="sync">
        {toasts.map((toast) => {
          const meta = getIntentMeta(toast.intent)
          const IconComp = meta.icon

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.94, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, scale: 0.95, filter: 'blur(3px)' }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => handleMouseEnter(toast.id)}
              onMouseLeave={() => handleMouseLeave(toast.id)}
              className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-zinc-950/95 border shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-200"
              style={{
                borderColor: meta.badgeBorder,
                boxShadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px ${meta.accent}20`
              }}
            >
              {/* Subtle Ambient Radial Glow */}
              <div
                className="absolute top-0 left-0 w-32 h-32 rounded-full blur-2xl pointer-events-none -translate-x-12 -translate-y-12 opacity-30"
                style={{ backgroundColor: meta.accent }}
              />

              <div className="relative p-3 sm:p-3.5 flex items-start gap-3">
                {/* Glowing Intent Icon Badge */}
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-xl border shrink-0 shadow-sm transition-transform duration-300"
                  style={{
                    backgroundColor: meta.badgeBg,
                    borderColor: meta.badgeBorder,
                    color: meta.accent
                  }}
                >
                  <IconComp className="w-4 h-4" />
                </div>

                {/* Body Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-[10px] font-mono font-bold tracking-wider uppercase px-1.5 py-0.2 rounded border flex items-center gap-1"
                      style={{
                        backgroundColor: meta.badgeBg,
                        borderColor: meta.badgeBorder,
                        color: meta.accent
                      }}
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {meta.label}
                    </span>

                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(toast.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>

                  {/* Command Text */}
                  <div className="text-xs font-semibold text-zinc-100 truncate flex items-center gap-1.5">
                    <Mic className="w-3 h-3 text-zinc-400 shrink-0" />
                    <span className="truncate italic">"{toast.command}"</span>
                  </div>

                  {/* Response / Action Taken Summary */}
                  {(toast.response || toast.actionExecuted) && (
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5 leading-snug font-sans">
                      {toast.response || toast.actionExecuted}
                    </p>
                  )}
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  title="Dismiss notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Animated Progress Timer Bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: toast.isPaused ? undefined : 0 }}
                transition={{
                  duration: (toast.durationMs || 3500) / 1000,
                  ease: 'linear'
                }}
                className="h-0.5 w-full origin-left opacity-60"
                style={{ backgroundColor: meta.accent }}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export default VoiceCommandToastHUD
