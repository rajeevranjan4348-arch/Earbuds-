import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  Radio,
  Sparkles,
  Zap,
  Volume2,
  Mic,
  MicOff,
  Sliders,
  Maximize2
} from 'lucide-react'

export type VisualizerMode = 'waves' | 'bars' | 'orb' | 'particles'

export interface RealtimeAudioVisualizerProps {
  stream?: MediaStream | null
  analyser?: AnalyserNode | null
  frequencyData?: Uint8Array | null
  audioLevel?: number
  isConnected?: boolean
  isListening?: boolean
  isSpeaking?: boolean
  isMuted?: boolean
  status?: string
  height?: number
  className?: string
  initialMode?: VisualizerMode
  showControls?: boolean
  showDecibels?: boolean
  accentColor?: string
  onModeChange?: (mode: VisualizerMode) => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  color: string
}

export const RealtimeAudioVisualizer: React.FC<RealtimeAudioVisualizerProps> = ({
  stream,
  analyser: propAnalyser,
  frequencyData: propFrequencyData,
  audioLevel = 0,
  isConnected = true,
  isListening = true,
  isSpeaking = false,
  isMuted = false,
  status = 'Active',
  height = 110,
  className = '',
  initialMode = 'waves',
  showControls = true,
  showDecibels = true,
  accentColor,
  onModeChange
}) => {
  const [mode, setMode] = useState<VisualizerMode>(initialMode)
  const [decibels, setDecibels] = useState<number>(-60)
  const [peakLevel, setPeakLevel] = useState<number>(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const [internalAnalyser, setInternalAnalyser] = useState<AnalyserNode | null>(null)
  const internalAudioCtxRef = useRef<AudioContext | null>(null)
  const internalSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const smoothedLvlRef = useRef<number>(0)
  const phaseRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  // Setup internal Web Audio Analyser if stream is provided directly
  useEffect(() => {
    if (!stream || propAnalyser) {
      setInternalAnalyser(null)
      return
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const source = ctx.createMediaStreamSource(stream)
      const analyserNode = ctx.createAnalyser()
      analyserNode.fftSize = 256
      analyserNode.smoothingTimeConstant = 0.8
      source.connect(analyserNode)

      internalAudioCtxRef.current = ctx
      internalSourceRef.current = source
      setInternalAnalyser(analyserNode)
    } catch (err) {
      console.warn('[RealtimeAudioVisualizer] Internal analyser setup notice:', err)
    }

    return () => {
      if (internalSourceRef.current) {
        try {
          internalSourceRef.current.disconnect()
        } catch (_e) {}
        internalSourceRef.current = null
      }
      if (internalAudioCtxRef.current && internalAudioCtxRef.current.state !== 'closed') {
        try {
          internalAudioCtxRef.current.close()
        } catch (_e) {}
        internalAudioCtxRef.current = null
      }
      setInternalAnalyser(null)
    }
  }, [stream, propAnalyser])

  const activeAnalyser = propAnalyser || internalAnalyser

  const handleModeSelect = useCallback(
    (newMode: VisualizerMode) => {
      setMode(newMode)
      onModeChange?.(newMode)
    },
    [onModeChange]
  )

  // Determine theme colors based on state
  const visualTheme = useMemo(() => {
    if (!isConnected) {
      return {
        primary: '#71717a',
        glow: 'rgba(113, 113, 122, 0.2)',
        label: 'OFFLINE',
        border: 'border-zinc-800'
      }
    }
    if (isMuted) {
      return {
        primary: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.35)',
        label: 'MUTED',
        border: 'border-red-500/30'
      }
    }
    if (isSpeaking) {
      return {
        primary: '#06b6d4',
        glow: 'rgba(6, 182, 212, 0.45)',
        label: 'SPEAKING',
        border: 'border-cyan-500/30'
      }
    }
    if (isListening) {
      return {
        primary: accentColor || '#00ff41',
        glow: accentColor ? `${accentColor}40` : 'rgba(0, 255, 65, 0.45)',
        label: 'LISTENING',
        border: 'border-emerald-500/30'
      }
    }
    return {
      primary: '#10b981',
      glow: 'rgba(16, 185, 129, 0.25)',
      label: 'STANDBY',
      border: 'border-white/10'
    }
  }, [isConnected, isMuted, isSpeaking, isListening, accentColor])

  // Canvas Real-Time Render Engine
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = (canvas.width = canvas.parentElement?.clientWidth || 400)
    let currentHeight = (canvas.height = height)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && canvas) {
          width = canvas.width = Math.floor(entry.contentRect.width) || 400
          currentHeight = canvas.height = height
        }
      }
    })

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement)
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const fftSize = activeAnalyser ? activeAnalyser.frequencyBinCount : 64
    const localFreqData = new Uint8Array(fftSize)
    const localTimeData = new Uint8Array(fftSize)

    // Pre-seed particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 36; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * currentHeight,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          radius: Math.random() * 2.5 + 1,
          alpha: Math.random() * 0.7 + 0.3,
          color: visualTheme.primary
        })
      }
    }

    let lastDecibelCalcTime = 0

    const render = () => {
      if (document.hidden) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      // 1. Gather audio telemetry
      let currentVol = audioLevel
      if (activeAnalyser && isConnected && !isMuted) {
        activeAnalyser.getByteFrequencyData(localFreqData)
        activeAnalyser.getByteTimeDomainData(localTimeData)

        let sum = 0
        for (let i = 0; i < localFreqData.length; i++) {
          sum += localFreqData[i]
        }
        currentVol = Math.max(currentVol, Math.min(1, sum / (localFreqData.length * 128)))
      } else if (propFrequencyData && propFrequencyData.length > 0) {
        localFreqData.set(propFrequencyData.subarray(0, fftSize))
      }

      // Smooth volume interpolation
      const targetVol = !isConnected
        ? 0
        : isSpeaking
        ? 0.4 + Math.sin(Date.now() * 0.007) * 0.2
        : isMuted
        ? 0
        : Math.max(0.02, currentVol * 1.8)

      smoothedLvlRef.current += (targetVol - smoothedLvlRef.current) * 0.2
      const lvl = smoothedLvlRef.current

      // Update decibels every 100ms
      const now = performance.now()
      if (now - lastDecibelCalcTime > 100) {
        lastDecibelCalcTime = now
        const computedDb = Math.round(lvl > 0.01 ? 20 * Math.log10(lvl) : -60)
        setDecibels(computedDb)
        setPeakLevel((prev) => Math.max(lvl, prev * 0.94))
      }

      const motionFactor = prefersReducedMotion ? 0.35 : 1.0
      phaseRef.current += (isSpeaking ? 0.1 : isListening ? 0.05 + lvl * 0.12 : 0.018) * motionFactor

      ctx.clearRect(0, 0, width, currentHeight)

      const centerY = currentHeight / 2
      const centerX = width / 2

      // ==========================================
      // MODE 1: CYBER WAVES (Harmonic Multi-Sine)
      // ==========================================
      if (mode === 'waves') {
        const waves = [
          {
            color: isSpeaking
              ? 'rgba(6, 182, 212, 0.9)'
              : isMuted
              ? 'rgba(239, 68, 68, 0.4)'
              : 'rgba(0, 255, 65, 0.95)',
            freq: 0.014,
            amp: (currentHeight * 0.36) * Math.max(0.12, lvl),
            speed: 1.0,
            width: 2.2
          },
          {
            color: isSpeaking
              ? 'rgba(34, 211, 238, 0.55)'
              : isMuted
              ? 'rgba(239, 68, 68, 0.25)'
              : 'rgba(52, 211, 153, 0.55)',
            freq: 0.022,
            amp: (currentHeight * 0.26) * Math.max(0.08, lvl * 0.85),
            speed: -0.75,
            width: 1.6
          },
          {
            color: isSpeaking
              ? 'rgba(147, 51, 234, 0.4)'
              : isMuted
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(6, 182, 212, 0.45)',
            freq: 0.008,
            amp: (currentHeight * 0.18) * Math.max(0.05, lvl * 0.6),
            speed: 1.4,
            width: 1.2
          }
        ]

        waves.forEach((w) => {
          ctx.beginPath()
          ctx.strokeStyle = w.color
          ctx.lineWidth = w.width
          ctx.shadowBlur = lvl > 0.15 ? 12 : 4
          ctx.shadowColor = w.color

          for (let x = 0; x <= width; x += 3) {
            const envelope = Math.sin((x / width) * Math.PI)
            const y =
              centerY +
              Math.sin(x * w.freq + phaseRef.current * w.speed) * w.amp * envelope +
              Math.cos(x * w.freq * 0.5 - phaseRef.current * 0.4) * (w.amp * 0.3) * envelope

            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        })

        // Draw centerline baseline
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.moveTo(0, centerY)
        ctx.lineTo(width, centerY)
        ctx.stroke()
      }

      // ==========================================
      // MODE 2: FREQUENCY BARS (Equalizer Spectrum)
      // ==========================================
      else if (mode === 'bars') {
        const barCount = Math.min(36, Math.floor(width / 11))
        const barWidth = Math.max(4, Math.floor((width - barCount * 3) / barCount))
        const step = Math.floor(localFreqData.length / barCount) || 1

        for (let i = 0; i < barCount; i++) {
          const freqVal = localFreqData[i * step] || 0
          const barHeightFactor = isConnected && !isMuted
            ? Math.max(0.06, (freqVal / 255) * 1.1 + lvl * 0.4)
            : 0.04
          const barHeight = Math.min(currentHeight * 0.85, barHeightFactor * currentHeight * 0.85)

          const x = i * (barWidth + 3) + 6
          const y = centerY - barHeight / 2

          // Gradient fill
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight)
          if (isSpeaking) {
            grad.addColorStop(0, '#38bdf8')
            grad.addColorStop(1, '#6366f1')
          } else if (isMuted) {
            grad.addColorStop(0, '#f87171')
            grad.addColorStop(1, '#991b1b')
          } else {
            grad.addColorStop(0, '#34d399')
            grad.addColorStop(1, '#00ff41')
          }

          ctx.fillStyle = grad
          ctx.shadowBlur = lvl > 0.1 ? 8 : 2
          ctx.shadowColor = visualTheme.primary

          // Rounded bar rect
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, 3)
          ctx.fill()

          // Peak cap
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.fillRect(x, Math.max(4, y - 3), barWidth, 1.5)
        }
      }

      // ==========================================
      // MODE 3: NEURAL ORB (Circular Radial Spectrum)
      // ==========================================
      else if (mode === 'orb') {
        const baseRadius = Math.min(currentHeight * 0.32, 38)
        const radius = baseRadius + lvl * 18
        const points = 32

        ctx.save()
        ctx.translate(centerX, centerY)
        ctx.rotate(phaseRef.current * 0.15)

        // Radial glow background
        const radGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius * 1.5)
        radGrad.addColorStop(0, visualTheme.glow)
        radGrad.addColorStop(1, 'transparent')
        ctx.fillStyle = radGrad
        ctx.beginPath()
        ctx.arc(0, 0, radius * 1.6, 0, Math.PI * 2)
        ctx.fill()

        // Outer fluctuating neural perimeter
        ctx.beginPath()
        ctx.strokeStyle = visualTheme.primary
        ctx.lineWidth = 2.2
        ctx.shadowBlur = 14
        ctx.shadowColor = visualTheme.primary

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2
          const freqSample = localFreqData[i % localFreqData.length] || 0
          const offset = (freqSample / 255) * 14 * Math.max(0.2, lvl)
          const r = radius + offset

          const px = Math.cos(angle) * r
          const py = Math.sin(angle) * r

          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.stroke()

        // Inner core
        ctx.beginPath()
        ctx.arc(0, 0, baseRadius * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = visualTheme.primary
        ctx.fill()

        ctx.restore()
      }

      // ==========================================
      // MODE 4: DYNAMIC PARTICLES (Voice Responsive Field)
      // ==========================================
      else if (mode === 'particles') {
        const particles = particlesRef.current
        const speedMultiplier = 1 + lvl * 3.5

        particles.forEach((p) => {
          p.x += p.vx * speedMultiplier
          p.y += p.vy * speedMultiplier

          if (p.x < 0) p.x = width
          if (p.x > width) p.x = 0
          if (p.y < 0) p.y = currentHeight
          if (p.y > currentHeight) p.y = 0

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius * (1 + lvl * 0.8), 0, Math.PI * 2)
          ctx.fillStyle = visualTheme.primary
          ctx.globalAlpha = Math.min(1, p.alpha * (0.4 + lvl * 0.9))
          ctx.shadowBlur = lvl > 0.15 ? 10 : 2
          ctx.shadowColor = visualTheme.primary
          ctx.fill()
        })
        ctx.globalAlpha = 1.0

        // Inter-particle connective neural webs
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x
            const dy = particles[i].y - particles[j].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 55) {
              ctx.beginPath()
              ctx.strokeStyle = visualTheme.primary
              ctx.globalAlpha = (1 - dist / 55) * 0.3 * (0.5 + lvl * 0.8)
              ctx.lineWidth = 0.8
              ctx.moveTo(particles[i].x, particles[i].y)
              ctx.lineTo(particles[j].x, particles[j].y)
              ctx.stroke()
            }
          }
        }
        ctx.globalAlpha = 1.0
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
      resizeObserver.disconnect()
    }
  }, [mode, visualTheme, activeAnalyser, propFrequencyData, audioLevel, isConnected, isListening, isSpeaking, isMuted, height])

  return (
    <div
      className={`relative w-full rounded-2xl bg-zinc-950/80 backdrop-blur-xl border ${visualTheme.border} p-3 shadow-2xl overflow-hidden flex flex-col justify-between ${className}`}
      style={{ minHeight: height + 36 }}
    >
      {/* Top Visualizer HUD Info Bar */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/5 text-[10px] font-mono select-none z-10">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] animate-pulse"
              style={{ color: visualTheme.primary, backgroundColor: visualTheme.primary }}
            />
            <span className="font-bold tracking-wider" style={{ color: visualTheme.primary }}>
              {visualTheme.label}
            </span>
          </div>

          <span className="text-zinc-600">|</span>
          <span className="text-zinc-400 font-medium">{status}</span>
        </div>

        {/* Right Metric Tags & Mode Switcher */}
        <div className="flex items-center gap-2">
          {showDecibels && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-900/90 border border-white/10 text-zinc-300">
              <Volume2 size={11} className="text-zinc-400" />
              <span>{decibels} dB</span>
              <span className="text-zinc-600 text-[9px]">
                (Pk: {Math.round(peakLevel * 100)}%)
              </span>
            </div>
          )}

          {showControls && (
            <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-white/10">
              {(['waves', 'bars', 'orb', 'particles'] as VisualizerMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeSelect(m)}
                  className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-mono transition-all cursor-pointer ${
                    mode === m
                      ? 'bg-zinc-800 text-white font-bold shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title={`Switch visualizer to ${m} mode`}
                >
                  {m === 'waves'
                    ? 'Wave'
                    : m === 'bars'
                    ? 'EQ'
                    : m === 'orb'
                    ? 'Orb'
                    : 'Dots'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Real-time WebGL / 2D Canvas Audio Reactor */}
      <div className="relative w-full flex-1 flex items-center justify-center my-1 min-h-[70px]">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ height }}
        />
      </div>

      {/* Bottom Sub-Telemetry Line */}
      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-1 border-t border-white/5 select-none z-10">
        <div className="flex items-center gap-2">
          <Activity size={10} className="text-zinc-400" />
          <span>Stream: 48 kHz / 24-bit PCM</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Engine: WebAudio + FFT Analyzer</span>
          <span className="text-emerald-400/80">● 60 FPS Low-Latency</span>
        </div>
      </div>
    </div>
  )
}

export default RealtimeAudioVisualizer
