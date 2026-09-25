import React, { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Mic, MicOff, Volume2, Radio, Sliders, Sparkles, Zap, Gauge } from 'lucide-react'

export type WaveformMode = 'oscilloscope' | 'frequency_bars' | 'radial_pulse' | 'neural_flux'

export interface ActiveVoiceWaveformVisualizerProps {
  /** Real-time microphone audio level (0.0 to 1.0) */
  audioLevel: number
  /** Raw FFT frequency bin data (0-255 Uint8Array) */
  frequencyData?: Uint8Array | null
  /** Live MediaStream if available for direct Web Audio processing */
  stream?: MediaStream | null
  /** Is microphone currently listening */
  isListening?: boolean
  /** Is AI vocal engine actively speaking */
  isSpeaking?: boolean
  /** Is microphone currently muted */
  isMuted?: boolean
  /** Real-time speech transcript from recognition engine */
  transcript?: string
  /** Status string (e.g., 'Listening', 'Speaking', 'Processing') */
  status?: string
  /** Component height in pixels */
  height?: number
  /** Custom primary accent color (defaults to cyber green #00ff41) */
  accentColor?: string
  /** Optional container class name */
  className?: string
  /** Show expanded audio sensitivity controls & decibel telemetry */
  showTelemetry?: boolean
  /** Allow mode switching */
  allowModeSwitch?: boolean
  /** Minimalist floating pill style */
  variant?: 'card' | 'floating' | 'inline'
  /** Callback when user clicks to toggle mute */
  onToggleMute?: () => void
  /** Callback when user adjusts sensitivity multiplier */
  onSensitivityChange?: (multiplier: number) => void
}

export const ActiveVoiceWaveformVisualizer: React.FC<ActiveVoiceWaveformVisualizerProps> = ({
  audioLevel = 0,
  frequencyData,
  stream,
  isListening = true,
  isSpeaking = false,
  isMuted = false,
  transcript = '',
  height = 100,
  accentColor = '#00ff41',
  className = '',
  showTelemetry = true,
  allowModeSwitch = true,
  variant = 'card',
  onToggleMute,
  onSensitivityChange
}) => {
  const [mode, setMode] = useState<WaveformMode>('oscilloscope')
  const [sensitivityMultiplier, setSensitivityMultiplier] = useState<number>(1.5)
  const [autoGain, setAutoGain] = useState<boolean>(true)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [decibels, setDecibels] = useState<number>(-60)
  const [vadConfidence, setVadConfidence] = useState<number>(0)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _status = status
  const [dominantFreq, setDominantFreq] = useState<number>(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const phaseRef = useRef<number>(0)
  const smoothedLevelRef = useRef<number>(0)
  const peakDecibelRef = useRef<number>(-60)

  // Web Audio Analyser fallback if direct stream is provided
  const internalAudioCtxRef = useRef<AudioContext | null>(null)
  const internalAnalyserRef = useRef<AnalyserNode | null>(null)
  const localFreqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  // Setup Web Audio node if stream is passed directly
  useEffect(() => {
    if (!stream) return undefined
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return undefined

      const ctx = new AudioCtx()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)

      internalAudioCtxRef.current = ctx
      internalAnalyserRef.current = analyser
      localFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount)

      return () => {
        try {
          source.disconnect()
          analyser.disconnect()
          if (ctx.state !== 'closed') ctx.close()
        } catch (_e) {}
      }
    } catch (_e) {
      // AudioContext fallback
      return undefined
    }
  }, [stream])

  // Handle sensitivity change
  const handleSensitivity = (val: number) => {
    setSensitivityMultiplier(val)
    onSensitivityChange?.(val)
  }

  // Real-time Canvas Rendering Loop
  useEffect(() => {
    let active = true

    const render = () => {
      if (!active) return

      const canvas = canvasRef.current
      if (!canvas) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animFrameRef.current = requestAnimationFrame(render)
        return
      }

      // Handle HiDPI displays
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const h = height

      if (canvas.width !== width * dpr || canvas.height !== h * dpr) {
        canvas.width = width * dpr
        canvas.height = h * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, h)

      // Get latest frequency data
      let freqArray = frequencyData
      if (!freqArray && internalAnalyserRef.current && localFreqDataRef.current) {
        internalAnalyserRef.current.getByteFrequencyData(localFreqDataRef.current)
        freqArray = localFreqDataRef.current
      }

      // Calculate effective sensitivity & level
      const rawLevel = isMuted ? 0 : isSpeaking ? 0.65 : audioLevel
      const gain = autoGain ? Math.max(1.0, 1.0 + (1 - rawLevel) * 0.8) : sensitivityMultiplier
      const effectiveLevel = Math.min(1.0, rawLevel * gain)

      // Smooth interpolation for fluid organic feel
      smoothedLevelRef.current += (effectiveLevel - smoothedLevelRef.current) * 0.22
      const level = smoothedLevelRef.current

      // Calculate Decibels (dBFS)
      const currentDb = level > 0.001 ? Math.round(20 * Math.log10(level)) : -60
      setDecibels(currentDb)
      if (currentDb > peakDecibelRef.current) {
        peakDecibelRef.current = currentDb
      } else {
        peakDecibelRef.current = Math.max(-60, peakDecibelRef.current - 0.5)
      }

      // Voice Activity Detection Confidence
      const confidence = isMuted ? 0 : Math.min(100, Math.round(level * 140))
      setVadConfidence(confidence)

      // Dominant Frequency Peak
      if (freqArray && freqArray.length > 0) {
        let maxVal = 0
        let maxIdx = 0
        for (let i = 2; i < Math.min(64, freqArray.length); i++) {
          if (freqArray[i] > maxVal) {
            maxVal = freqArray[i]
            maxIdx = i
          }
        }
        const nyquist = 24000
        const binHz = nyquist / freqArray.length
        setDominantFreq(Math.round(maxIdx * binHz))
      }

      phaseRef.current += 0.04 + level * 0.08
      const phase = phaseRef.current

      // Active Color Scheme
      const primaryColor = isSpeaking ? '#22d3ee' : isMuted ? '#ef4444' : accentColor
      const secondaryColor = isSpeaking ? '#818cf8' : '#10b981'

      // ==========================================
      // MODE 1: OSCILLOSCOPE MULTI-BAND SINE WAVE
      // ==========================================
      if (mode === 'oscilloscope') {
        const centerY = h / 2
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _numWaves = 4
        const waveConfigs = [
          { freq: 0.015, amp: 0.85, speed: 1.0, alpha: 0.95, width: 2.5, color: primaryColor },
          { freq: 0.022, amp: 0.6, speed: -1.2, alpha: 0.7, width: 1.8, color: secondaryColor },
          { freq: 0.035, amp: 0.4, speed: 1.5, alpha: 0.45, width: 1.2, color: '#38bdf8' },
          { freq: 0.01, amp: 0.25, speed: -0.7, alpha: 0.3, width: 1.0, color: '#a855f7' }
        ]

        // Center baseline grid line
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.moveTo(0, centerY)
        ctx.lineTo(width, centerY)
        ctx.stroke()
        ctx.setLineDash([])

        // Ambient center glow when audio is hot
        if (level > 0.05) {
          const glowGrad = ctx.createRadialGradient(
            width / 2,
            centerY,
            5,
            width / 2,
            centerY,
            width * 0.45
          )
          glowGrad.addColorStop(0, `${primaryColor}22`)
          glowGrad.addColorStop(1, 'transparent')
          ctx.fillStyle = glowGrad
          ctx.fillRect(0, 0, width, h)
        }

        // Draw multi-layered organic waves
        waveConfigs.forEach((cfg) => {
          ctx.beginPath()
          ctx.lineWidth = cfg.width
          ctx.strokeStyle = cfg.color
          ctx.globalAlpha = cfg.alpha

          // Dynamic Amplitude modulation based on audio sensitivity
          const baseAmp = h * 0.38 * (0.08 + level * 0.92) * cfg.amp

          for (let x = 0; x <= width; x += 3) {
            // Envelope tapering at left and right edges for smooth visual boundary
            const edgeDist = Math.sin((x / width) * Math.PI)
            const envelope = Math.pow(edgeDist, 1.4)

            // Frequency data injection if available
            let freqFactor = 1.0
            if (freqArray && freqArray.length > 0) {
              const binIndex = Math.floor((x / width) * (freqArray.length / 3))
              freqFactor = 0.7 + (freqArray[binIndex] / 255) * 0.6
            }

            const y =
              centerY +
              Math.sin(x * cfg.freq + phase * cfg.speed) * baseAmp * envelope * freqFactor +
              Math.cos(x * cfg.freq * 0.5 - phase * 0.5) * (baseAmp * 0.25) * envelope

            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }

          ctx.stroke()
        })

        // Draw dynamic audio sensitivity pulse dots along the main wave
        if (level > 0.12) {
          const numDots = 5
          ctx.globalAlpha = 0.9
          for (let i = 0; i < numDots; i++) {
            const dotX = width * (0.2 + (i / (numDots - 1)) * 0.6)
            const edgeDist = Math.sin((dotX / width) * Math.PI)
            const dotY =
              centerY +
              Math.sin(dotX * 0.015 + phase) * (h * 0.38) * (0.08 + level * 0.92) * 0.85 * edgeDist

            ctx.beginPath()
            ctx.arc(dotX, dotY, 2 + level * 3, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.shadowColor = primaryColor
            ctx.shadowBlur = 12
            ctx.fill()
            ctx.shadowBlur = 0
          }
        }
      }

      // ==========================================
      // MODE 2: FREQUENCY SPECTRUM EQUALIZER BARS
      // ==========================================
      else if (mode === 'frequency_bars') {
        const numBars = Math.min(48, Math.floor(width / 9))
        const barWidth = (width / numBars) * 0.68
        const gap = (width / numBars) * 0.32
        const maxBarHeight = h * 0.82

        for (let i = 0; i < numBars; i++) {
          const x = i * (barWidth + gap) + gap / 2

          // Frequency bin mapping
          let binVal = 0
          if (freqArray && freqArray.length > 0) {
            const binIdx = Math.floor((i / numBars) * (freqArray.length * 0.65))
            binVal = freqArray[binIdx] / 255
          } else {
            const freqHarmonic = Math.sin(i * 0.28 + phase * 1.5) * 0.5 + 0.5
            binVal = level * freqHarmonic
          }

          const barHeight = Math.max(3, binVal * maxBarHeight * (0.2 + level * 0.8))
          const y = h - barHeight - 4

          // Gradient color per bar
          const barGrad = ctx.createLinearGradient(x, y, x, h)
          if (binVal > 0.8) {
            barGrad.addColorStop(0, '#f43f5e')
            barGrad.addColorStop(0.5, '#fbbf24')
            barGrad.addColorStop(1, primaryColor)
          } else if (binVal > 0.45) {
            barGrad.addColorStop(0, '#38bdf8')
            barGrad.addColorStop(1, primaryColor)
          } else {
            barGrad.addColorStop(0, primaryColor)
            barGrad.addColorStop(1, 'rgba(0, 255, 65, 0.15)')
          }

          ctx.fillStyle = barGrad
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0])
          ctx.fill()

          // Floating peak cap
          if (barHeight > 8) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x, Math.max(2, y - 2), barWidth, 1.5)
          }
        }
      }

      // ==========================================
      // MODE 3: RADIAL PULSE RINGS
      // ==========================================
      else if (mode === 'radial_pulse') {
        const centerX = width / 2
        const centerY = h / 2
        const maxRadius = Math.min(centerX, centerY) * 0.9

        const ringCount = 5
        for (let i = 0; i < ringCount; i++) {
          const offset = (phase * 0.6 + i / ringCount) % 1
          const radius = offset * maxRadius
          const ringAlpha = (1 - offset) * (0.15 + level * 0.85)

          ctx.beginPath()
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
          ctx.strokeStyle = primaryColor
          ctx.lineWidth = 1.5 + level * 2
          ctx.globalAlpha = ringAlpha
          ctx.stroke()
        }

        // Center glowing nucleus
        const coreRadius = 6 + level * 14
        const nucleusGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          2,
          centerX,
          centerY,
          coreRadius
        )
        nucleusGrad.addColorStop(0, '#ffffff')
        nucleusGrad.addColorStop(0.4, primaryColor)
        nucleusGrad.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2)
        ctx.fillStyle = nucleusGrad
        ctx.globalAlpha = 0.95
        ctx.fill()
      }

      // ==========================================
      // MODE 4: NEURAL FLUX (CHROMATIC FLUID WAVES)
      // ==========================================
      else if (mode === 'neural_flux') {
        const centerY = h / 2
        const steps = 60

        // Draw 3 color channels (R, G, B) with phase shift for chromatic aberration
        const channels = [
          { color: 'rgba(239, 68, 68, 0.45)', phaseShift: 0.15 },
          { color: 'rgba(34, 197, 94, 0.75)', phaseShift: 0.0 },
          { color: 'rgba(56, 189, 248, 0.6)', phaseShift: -0.15 }
        ]

        channels.forEach((ch) => {
          ctx.beginPath()
          ctx.strokeStyle = ch.color
          ctx.lineWidth = 2.0

          for (let i = 0; i <= steps; i++) {
            const x = (i / steps) * width
            const t = (i / steps) * Math.PI * 2
            const noise =
              Math.sin(t * 3 + phase * 2 + ch.phaseShift) * 0.4 +
              Math.cos(t * 6 - phase) * 0.2 +
              Math.sin(t * 9 + phase * 1.5) * 0.1

            const y = centerY + noise * (h * 0.4) * (0.15 + level * 0.85)

            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }

          ctx.stroke()
        })
      }

      ctx.restore()
      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      active = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [
    mode,
    audioLevel,
    frequencyData,
    isListening,
    isSpeaking,
    isMuted,
    height,
    accentColor,
    autoGain,
    sensitivityMultiplier
  ])

  // Decibel meter status color
  const decibelColor = useMemo(() => {
    if (decibels > -12) return 'text-rose-400 bg-rose-950/60 border-rose-500/40'
    if (decibels > -28) return 'text-amber-400 bg-amber-950/60 border-amber-500/40'
    if (decibels > -48) return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40'
    return 'text-zinc-500 bg-zinc-900/60 border-zinc-700/40'
  }, [decibels])

  return (
    <div
      className={`w-full relative select-none font-mono ${
        variant === 'card'
          ? 'bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)]'
          : variant === 'floating'
            ? 'bg-black/90 backdrop-blur-3xl border border-emerald-500/30 rounded-2xl p-2.5 shadow-[0_15px_40px_rgba(0,0,0,0.9),0_0_20px_rgba(0,255,65,0.15)]'
            : 'bg-transparent'
      } ${className}`}
    >
      {/* Top Telemetry & Control Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 mb-2 text-xs">
        <div className="flex items-center gap-2">
          {/* Status Indicator Icon */}
          <div className="flex items-center gap-1.5">
            {isSpeaking ? (
              <span className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider animate-pulse">
                <Volume2 size={13} />
                <span>AI VOCAL SYNTHESIS</span>
              </span>
            ) : isMuted ? (
              <span className="flex items-center gap-1.5 text-rose-400 font-bold tracking-wider">
                <MicOff size={13} />
                <span>INPUT MUTED</span>
              </span>
            ) : isListening ? (
              <span className="flex items-center gap-1.5 text-[#00ff41] font-bold tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff41] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff41]"></span>
                </span>
                <span>LIVE VOICE INPUT</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <Activity size={13} />
                <span>VOICE STANDBY</span>
              </span>
            )}
          </div>

          {/* VAD Confidence Tag */}
          {!isMuted && isListening && (
            <span
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${
                vadConfidence > 40
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                  : 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
              }`}
            >
              <Zap
                size={10}
                className={
                  vadConfidence > 40 ? 'text-emerald-400 fill-emerald-400' : 'text-zinc-500'
                }
              />
              <span>VAD {vadConfidence}%</span>
            </span>
          )}
        </div>

        {/* Right Tools & Mode Switcher */}
        <div className="flex items-center gap-1.5">
          {/* Mode Selector Tabs */}
          {allowModeSwitch && (
            <div className="flex items-center bg-black/50 p-0.5 rounded-xl border border-white/5">
              {(
                [
                  { id: 'oscilloscope', label: 'Wave', icon: <Activity size={11} /> },
                  { id: 'frequency_bars', label: 'FFT', icon: <Gauge size={11} /> },
                  { id: 'radial_pulse', label: 'Radial', icon: <Radio size={11} /> },
                  { id: 'neural_flux', label: 'Flux', icon: <Sparkles size={11} /> }
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`cursor-pointer px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-all ${
                    mode === m.id
                      ? 'bg-zinc-800 text-white font-bold shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title={`${m.label} visualizer mode`}
                >
                  {m.icon}
                  <span className="hidden md:inline">{m.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Settings Trigger */}
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`cursor-pointer p-1 rounded-lg border text-zinc-400 hover:text-white transition-all ${
              showSettings ? 'bg-zinc-800 border-white/20 text-white' : 'bg-black/40 border-white/5'
            }`}
            title="Audio Sensitivity Settings"
          >
            <Sliders size={12} />
          </button>

          {/* Mute Toggle Button */}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className={`cursor-pointer p-1 rounded-lg border transition-all ${
                isMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border-white/10'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Audio Sensitivity Calibration Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-white/10 pb-2.5 mb-2.5"
          >
            <div className="bg-black/60 rounded-2xl p-2.5 border border-white/5 flex flex-col gap-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                  <Gauge size={12} className="text-emerald-400" />
                  <span>Microphone Sensitivity Gain</span>
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoGain}
                      onChange={(e) => setAutoGain(e.target.checked)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-0 cursor-pointer"
                    />
                    <span>Auto-Gain (AGC)</span>
                  </label>
                  <span className="font-bold text-emerald-400">{sensitivityMultiplier}x</span>
                </div>
              </div>

              {!autoGain && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.5}
                    max={3.0}
                    step={0.1}
                    value={sensitivityMultiplier}
                    onChange={(e) => handleSensitivity(parseFloat(e.target.value))}
                    className="w-full accent-[#00ff41] bg-zinc-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="flex items-center gap-1 text-[9px] text-zinc-500 font-mono">
                    <button
                      type="button"
                      onClick={() => handleSensitivity(1.0)}
                      className="cursor-pointer px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    >
                      1.0x
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSensitivity(2.0)}
                      className="cursor-pointer px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    >
                      2.0x
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Real-time Waveform Canvas Container */}
      <div className="w-full relative overflow-hidden rounded-2xl bg-black/60 border border-white/5">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          className="block w-full"
        />

        {/* Live Audio Sensitivity HUD Badges Overlay */}
        {showTelemetry && !isMuted && isListening && (
          <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
            {/* Decibels VU Meter */}
            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${decibelColor}`}>
              {decibels > -60 ? `${decibels} dBFS` : 'SILENCE'}
            </span>

            {/* Dominant Pitch / Frequency */}
            {dominantFreq > 0 && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-lg border border-white/10 bg-black/60 text-cyan-400 text-[10px]">
                {dominantFreq} Hz
              </span>
            )}
          </div>
        )}

        {/* Live Voice Peak Threshold Warning */}
        {decibels > -6 && !isMuted && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <span className="px-2 py-0.5 rounded-lg border border-rose-500/50 bg-rose-950/90 text-rose-300 text-[10px] font-bold animate-pulse">
              PEAK PEAKING
            </span>
          </div>
        )}
      </div>

      {/* Real-time Interim Speech Transcript Floating Banner */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-emerald-500/30 text-xs text-zinc-200 flex items-center gap-2 shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-zinc-400 font-mono text-[10px] uppercase">Transcript:</span>
          <span className="text-white font-sans truncate italic">"{transcript}"</span>
        </motion.div>
      )}
    </div>
  )
}

export default ActiveVoiceWaveformVisualizer
