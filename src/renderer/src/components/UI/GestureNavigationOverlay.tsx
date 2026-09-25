import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Hand,
  Camera,
  CameraOff,
  Minimize2,
  Maximize2,
  HelpCircle,
  Volume2,
  VolumeX,
  Play,
  Check,
  Zap,
  Sliders,
  AlertTriangle,
  RefreshCw,
  X
} from 'lucide-react'
import {
  gestureRecognitionService,
  CameraStatus,
  HandLandmarks,
  GestureEvent,
  GestureType,
  GESTURE_DEFINITIONS,
  ACTION_DESCRIPTIONS
} from '../../services/gestureRecognitionService'
import GestureGuideModal from './GestureGuideModal'

interface GestureNavigationOverlayProps {
  onOpenSettings?: () => void
}

export const GestureNavigationOverlay: React.FC<GestureNavigationOverlayProps> = ({
  onOpenSettings
}) => {
  const [config, setConfig] = useState(gestureRecognitionService.getConfig())
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(
    gestureRecognitionService.getCameraStatus()
  )
  const [landmarks, setLandmarks] = useState<HandLandmarks | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [activeGestureToast, setActiveGestureToast] = useState<GestureEvent | null>(null)
  const [cooldownPercent, setCooldownPercent] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Subscribe to gesture recognition service
  useEffect(() => {
    const unsubConfig = gestureRecognitionService.subscribeConfig((c) => setConfig(c))
    const unsubState = gestureRecognitionService.subscribeState((lm, status) => {
      setLandmarks(lm)
      setCameraStatus(status)
    })
    const unsubGesture = gestureRecognitionService.subscribeGesture((event) => {
      setActiveGestureToast(event)
      setCooldownPercent(100)
      setTimeout(() => setActiveGestureToast(null), 2200)
    })

    // Cooldown decay ticker
    const timer = setInterval(() => {
      setCooldownPercent((prev) => Math.max(0, prev - 12))
    }, 50)

    // Auto-start camera if enabled
    if (config.enabled && cameraStatus === 'idle') {
      gestureRecognitionService.startCamera()
    }

    return () => {
      unsubConfig()
      unsubState()
      unsubGesture()
      clearInterval(timer)
    }
  }, [config.enabled])

  // Attach stream to video element when expanded
  useEffect(() => {
    if (videoRef.current) {
      const stream = gestureRecognitionService.getMediaStream()
      if (stream && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    }
  }, [isExpanded, cameraStatus])

  // Render optical tracking overlay on canvas
  useEffect(() => {
    if (!isExpanded || !canvasRef.current || !landmarks) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!landmarks.isHandPresent) return

    const { minX, minY, maxX, maxY } = landmarks.boundingBox
    const w = (maxX - minX) * canvas.width
    const h = (maxY - minY) * canvas.height
    const x = minX * canvas.width
    const y = minY * canvas.height

    // Draw bounding box with rounded corners
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.fill()
    ctx.stroke()

    // Draw centroid crosshair
    const cx = landmarks.centroid.x * canvas.width
    const cy = landmarks.centroid.y * canvas.height

    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(cx - 10, cy)
    ctx.lineTo(cx + 10, cy)
    ctx.moveTo(cx, cy - 10)
    ctx.lineTo(cx, cy + 10)
    ctx.stroke()

    // Velocity trajectory arrow
    if (Math.abs(landmarks.velocity.x) > 0.3 || Math.abs(landmarks.velocity.y) > 0.3) {
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + landmarks.velocity.x * 25, cy + landmarks.velocity.y * 25)
      ctx.stroke()
    }
  }, [landmarks, isExpanded])

  const toggleService = () => {
    gestureRecognitionService.updateConfig({ enabled: !config.enabled })
  }

  const toggleSound = () => {
    gestureRecognitionService.updateConfig({ soundFeedback: !config.soundFeedback })
  }

  const simulateGesture = (gesture: GestureType) => {
    gestureRecognitionService.triggerGesture(gesture, 1.0)
  }

  if (!config.enabled && !isExpanded) {
    return (
      <button
        onClick={toggleService}
        className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-emerald-500/40 text-zinc-400 hover:text-emerald-400 text-xs font-mono shadow-xl backdrop-blur-md transition-all cursor-pointer"
        title="Enable Hands-Free Camera Gesture Navigation"
      >
        <CameraOff size={14} />
        <span>Enable Gestures</span>
      </button>
    )
  }

  return (
    <>
      {/* Floating Gesture Live Action Banner Toast */}
      <AnimatePresence>
        {activeGestureToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-zinc-950/95 border border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.25)] backdrop-blur-xl font-mono text-zinc-100"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-xl select-none">
              {activeGestureToast.definition.emoji}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  {activeGestureToast.definition.name}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {Math.round(activeGestureToast.confidence * 100)}% Match
                </span>
              </div>
              <span className="text-[11px] text-zinc-300">
                → {ACTION_DESCRIPTIONS[activeGestureToast.action]}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Gesture Navigation Widget */}
      <div className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-30 flex flex-col items-start gap-2 font-sans select-none pointer-events-auto">
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-72 sm:w-80 rounded-2xl bg-zinc-950/95 border border-emerald-500/30 shadow-2xl backdrop-blur-2xl overflow-hidden text-zinc-200 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-zinc-900/70">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Hand size={13} />
                  </div>
                  <span className="text-xs font-mono font-bold tracking-wider text-white">
                    Gesture Optics PiP
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={toggleSound}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      config.soundFeedback
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-zinc-900 border-white/5 text-zinc-500'
                    }`}
                    title={config.soundFeedback ? 'Sound Feedback Enabled' : 'Sound Muted'}
                  >
                    {config.soundFeedback ? <Volume2 size={12} /> : <VolumeX size={12} />}
                  </button>
                  <button
                    onClick={() => setIsGuideOpen(true)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                    title="Open Gesture Guide"
                  >
                    <HelpCircle size={12} />
                  </button>
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
                    title="Minimize HUD"
                  >
                    <Minimize2 size={12} />
                  </button>
                </div>
              </div>

              {/* Video Camera Viewport */}
              <div className="relative aspect-[4/3] w-full bg-black overflow-hidden flex items-center justify-center">
                {cameraStatus === 'active' || cameraStatus === 'simulated' ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100 opacity-80"
                    />
                    <canvas
                      ref={canvasRef}
                      width={320}
                      height={240}
                      className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
                    />

                    {/* HUD Target Crosshairs */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-24 h-24 border border-white/10 rounded-xl" />
                    </div>

                    {/* Hand Tracking Status Chip */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          landmarks?.isHandPresent ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                        }`}
                      />
                      <span className="text-zinc-300">
                        {landmarks?.isHandPresent
                          ? `Hand Tracked (${landmarks.fingerCount} peaks)`
                          : 'Awaiting Hand...'}
                      </span>
                    </div>

                    {cameraStatus === 'simulated' && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-[9px] font-mono text-cyan-300">
                        SIMULATED FEED
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                    <AlertTriangle size={24} className="text-amber-400" />
                    <span className="text-xs font-mono text-zinc-300">
                      {cameraStatus === 'denied'
                        ? 'Camera Permission Denied'
                        : 'Webcam Optical Feed Offline'}
                    </span>
                    <button
                      onClick={() => gestureRecognitionService.startCamera()}
                      className="mt-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={11} /> Retry Connection
                    </button>
                  </div>
                )}

                {/* Cooldown bar */}
                {cooldownPercent > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500/20">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${cooldownPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Hands-Free Simulator Controls for instant testing */}
              <div className="p-3 bg-zinc-900/60 border-t border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>Interactive Gesture Sandbox</span>
                  <span className="text-emerald-400/80">Click to Simulate</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => simulateGesture('SWIPE_LEFT')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 border border-white/5 hover:border-emerald-500/30 text-[10px] font-mono text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer"
                    title="Simulate Swipe Left → Next Tab"
                  >
                    <span>👉</span>
                    <span className="text-[9px] mt-0.5">Next Tab</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('SWIPE_RIGHT')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 border border-white/5 hover:border-emerald-500/30 text-[10px] font-mono text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer"
                    title="Simulate Swipe Right → Prev Tab"
                  >
                    <span>👈</span>
                    <span className="text-[9px] mt-0.5">Prev Tab</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('OPEN_PALM')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 border border-white/5 hover:border-emerald-500/30 text-[10px] font-mono text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer"
                    title="Simulate Palm → Quick Actions"
                  >
                    <span>✋</span>
                    <span className="text-[9px] mt-0.5">Actions</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('CLOSED_FIST')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/20 border border-white/5 hover:border-red-500/30 text-[10px] font-mono text-zinc-300 hover:text-red-300 transition-colors cursor-pointer"
                    title="Simulate Fist → Halt Speech / Mute"
                  >
                    <span>✊</span>
                    <span className="text-[9px] mt-0.5">Halt</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('VICTORY')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-cyan-500/20 border border-white/5 hover:border-cyan-500/30 text-[10px] font-mono text-zinc-300 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Simulate Peace → Toggle Minimal HUD"
                  >
                    <span>✌️</span>
                    <span className="text-[9px] mt-0.5">Min HUD</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('THUMBS_UP')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 border border-white/5 hover:border-emerald-500/30 text-[10px] font-mono text-zinc-300 hover:text-emerald-300 transition-colors cursor-pointer"
                    title="Simulate Thumbs Up → Return to Dashboard"
                  >
                    <span>👍</span>
                    <span className="text-[9px] mt-0.5">Home</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('POINT_UP')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-amber-500/20 border border-white/5 hover:border-amber-500/30 text-[10px] font-mono text-zinc-300 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Simulate Pointing → Toggle Mic"
                  >
                    <span>☝️</span>
                    <span className="text-[9px] mt-0.5">Voice Mic</span>
                  </button>
                  <button
                    onClick={() => simulateGesture('PINCH')}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-zinc-900 hover:bg-purple-500/20 border border-white/5 hover:border-purple-500/30 text-[10px] font-mono text-zinc-300 hover:text-purple-300 transition-colors cursor-pointer"
                    title="Simulate Pinch → Toggle PDF Knowledge"
                  >
                    <span>🤏</span>
                    <span className="text-[9px] mt-0.5">PDF Docs</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compact Floating Status Pill Trigger */}
        <motion.div
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 p-1.5 pl-3 rounded-full bg-zinc-950/90 border border-emerald-500/40 shadow-2xl backdrop-blur-xl text-zinc-200 text-xs font-mono"
        >
          <div
            className={`w-2 h-2 rounded-full ${
              landmarks?.isHandPresent
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-ping'
                : cameraStatus === 'active'
                  ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                  : 'bg-yellow-500'
            }`}
          />

          <span className="text-[11px] font-semibold text-emerald-300 tracking-wider">
            {landmarks?.isHandPresent ? 'Hand Active' : 'Hands-Free Nav'}
          </span>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-[10px] transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse PiP Viewport' : 'Open Gesture Camera PiP'}
          >
            {isExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            <span>{isExpanded ? 'Hide' : 'Optics'}</span>
          </button>
        </motion.div>
      </div>

      {/* Visual Gesture Guide Modal */}
      <GestureGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  )
}

export default GestureNavigationOverlay
