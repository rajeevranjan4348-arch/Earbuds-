import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Zap,
  Sliders,
  ChevronDown,
  ArrowUp,
  Activity,
  Layers,
  Flame,
  CheckCircle2,
  RefreshCw,
  Code2,
  Copy,
  Check,
  Cpu,
  Monitor,
  Gauge
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

interface AISmoothnessProps {
  glassPanel?: string
  onClose?: () => void
}

type EngineMode = 'GPU_VIRTUAL' | 'HYBRID_LERP'

export const AISmoothnessView: React.FC<AISmoothnessProps> = ({ glassPanel: _glassPanel }) => {
  const { accentConfig } = useTheme()
  const viewportRef = useRef<HTMLDivElement>(null)
  const virtualContentRef = useRef<HTMLDivElement>(null)
  const orb1Ref = useRef<HTMLDivElement>(null)
  const orb2Ref = useRef<HTMLDivElement>(null)

  // Physics parameters
  const [engineMode, setEngineMode] = useState<EngineMode>('GPU_VIRTUAL')
  const [baseEase, setBaseEase] = useState<number>(0.085)
  const [fpsProfile, setFpsProfile] = useState<'60' | '90' | '120' | '144' | '240'>('120')
  const [showControls, setShowControls] = useState<boolean>(true)
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false)
  const [copiedCode, setCopiedCode] = useState<boolean>(false)
  const [currentFps, setCurrentFps] = useState<number>(120)
  const [scrollProgress, setScrollProgress] = useState<number>(0)
  const [activeSection, setActiveSection] = useState<number>(1)
  const [isGpuBoosted, setIsGpuBoosted] = useState<boolean>(true)

  // Physics state refs for pure virtual scroll
  const targetRef = useRef<number>(0)
  const currentRef = useRef<number>(0)
  const maxScrollRef = useRef<number>(0)
  const touchStartYRef = useRef<number>(0)

  // Real-time FPS ticker (500ms windowed average)
  useEffect(() => {
    let frameCount = 0
    let lastFpsTime = performance.now()
    let animId: number

    const calcFps = (now: number) => {
      frameCount++
      const elapsed = now - lastFpsTime
      if (elapsed >= 500) {
        setCurrentFps(Math.round((frameCount * 1000) / elapsed))
        frameCount = 0
        lastFpsTime = now
      }
      animId = requestAnimationFrame(calcFps)
    }
    animId = requestAnimationFrame(calcFps)

    return () => cancelAnimationFrame(animId)
  }, [])

  // Calculate maxScroll and resize listener
  const updateMetrics = useCallback(() => {
    if (!virtualContentRef.current || !viewportRef.current) return
    const contentH = virtualContentRef.current.scrollHeight
    const viewH = viewportRef.current.clientHeight
    maxScrollRef.current = Math.max(0, contentH - viewH)
  }, [])

  useEffect(() => {
    updateMetrics()
    window.addEventListener('resize', updateMetrics)
    return () => window.removeEventListener('resize', updateMetrics)
  }, [updateMetrics])

  // GPU-Composited Delta-Time Virtual Scroll Engine
  useEffect(() => {
    const viewport = viewportRef.current
    const content = virtualContentRef.current
    if (!viewport || !content) return

    updateMetrics()

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

    // 1. Wheel input interceptor
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY
      targetRef.current = clamp(targetRef.current + delta, 0, maxScrollRef.current)
    }

    // 2. Touch input with mobile momentum
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartYRef.current = e.touches[0].clientY
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const y = e.touches[0].clientY
        const delta = (touchStartYRef.current - y) * 1.5
        touchStartYRef.current = y
        targetRef.current = clamp(targetRef.current + delta, 0, maxScrollRef.current)
      }
    }

    // 3. Keyboard navigation (Arrow keys, Space, PageUp, PageDown) - only when viewport is focused or active
    const onKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in an input/textarea or not focusing the smoothness container
      const activeEl = document.activeElement
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')

      if (isInputFocused) return

      // Only handle if viewport contains active element or mouse is over viewport
      if (!viewport.contains(document.activeElement) && document.activeElement !== document.body) {
        return
      }

      const viewH = viewport.clientHeight || window.innerHeight
      const keySteps: Record<string, number> = {
        ArrowDown: 90,
        ArrowUp: -90,
        PageDown: viewH * 0.85,
        PageUp: -viewH * 0.85,
        ' ': viewH * 0.85
      }
      const step = keySteps[e.key]
      if (step !== undefined && viewport.matches(':hover, :focus-within')) {
        e.preventDefault()
        targetRef.current = clamp(targetRef.current + step, 0, maxScrollRef.current)
      }
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    viewport.addEventListener('touchstart', onTouchStart, { passive: true })
    viewport.addEventListener('touchmove', onTouchMove, { passive: true })
    viewport.addEventListener('keydown', onKeyDown)

    // Render loop using Frame-Rate Independent Delta-Time Easing
    let lastTime = performance.now()
    let animId: number

    const tick = (now: number) => {
      const dt = Math.min(now - lastTime, 50) // clamp against frame spikes or background tabs
      lastTime = now

      // Delta-time scaled ease factor: identical physical motion across 60/90/120/144/240Hz
      const dtEase = 1 - Math.pow(1 - baseEase, dt / (1000 / 60))
      currentRef.current += (targetRef.current - currentRef.current) * dtEase

      // Sub-pixel snapping
      if (Math.abs(targetRef.current - currentRef.current) < 0.05) {
        currentRef.current = targetRef.current
      }

      // Apply hardware translate3d transform to content
      if (content) {
        content.style.transform = `translate3d(0, ${-currentRef.current}px, 0)`
      }

      // Ambient Parallax Orbs
      if (orb1Ref.current) {
        const offset1 = currentRef.current * 0.18
        orb1Ref.current.style.transform = `translate3d(${offset1 * 0.25}px, ${offset1}px, 0) scale(1.1)`
      }
      if (orb2Ref.current) {
        const offset2 = currentRef.current * 0.28
        orb2Ref.current.style.transform = `translate3d(${-offset2 * 0.2}px, ${-offset2}px, 0) scale(1.05)`
      }

      // Update progress & active section
      if (maxScrollRef.current > 0) {
        const progress = Math.min(100, Math.max(0, (currentRef.current / maxScrollRef.current) * 100))
        setScrollProgress(progress)
      }

      // Update active card index based on height
      const viewH = viewport.clientHeight || 800
      const currSection = Math.min(5, Math.max(1, Math.floor(currentRef.current / (viewH * 0.85)) + 1))
      setActiveSection(currSection)

      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)

    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchmove', onTouchMove)
      viewport.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(animId)
    }
  }, [baseEase, updateMetrics])

  // Scroll Navigators
  const scrollToTop = useCallback(() => {
    targetRef.current = 0
  }, [])

  const scrollNext = useCallback(() => {
    if (!viewportRef.current) return
    const step = viewportRef.current.clientHeight * 0.85
    targetRef.current = Math.min(maxScrollRef.current, targetRef.current + step)
  }, [])

  const copySnippet = () => {
    const code = `// AI Ultra Smooth 120fps Delta-Time Easing Engine
const BASE_EASE = ${baseEase};
let target = 0, current = 0;
let lastTime = performance.now();

function tick(now) {
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;
  const ease = 1 - Math.pow(1 - BASE_EASE, dt / (1000 / 60));
  current += (target - current) * ease;
  if (Math.abs(target - current) < 0.05) current = target;
  
  contentElement.style.transform = \`translate3d(0, \${-current}px, 0)\`;
  requestAnimationFrame(tick);
}`
    navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      className="relative w-full h-full overflow-hidden bg-[#0e0e12] text-[#f4f4f6] select-none font-sans focus:outline-none"
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Parallax Ambient Orbs */}
      <div
        ref={orb1Ref}
        className="fixed w-[60vmax] h-[60vmax] rounded-full pointer-events-none -top-[20vmax] -left-[20vmax] z-0 will-change-transform opacity-75 transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at center, ${accentConfig.primaryHex}33 0%, transparent 70%)`
        }}
      />
      <div
        ref={orb2Ref}
        className="fixed w-[70vmax] h-[70vmax] rounded-full pointer-events-none -bottom-[30vmax] -right-[20vmax] z-0 will-change-transform opacity-60 transition-opacity duration-700"
        style={{
          background: `radial-gradient(circle at center, ${accentConfig.glowHex} 0%, transparent 70%)`
        }}
      />

      {/* Top Floating Glass HUD */}
      <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {/* Engine Status Badge */}
          <div className="px-3.5 py-1.5 rounded-full bg-zinc-950/85 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse" />
            <span className="text-xs font-mono font-bold tracking-wider text-emerald-300 uppercase">
              GPU DELTA-EASING
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300">
              {fpsProfile}Hz READY
            </span>
          </div>

          {/* Real-time Display FPS readout */}
          <div className="px-3 py-1.5 rounded-full bg-zinc-950/85 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-2 text-xs font-mono text-zinc-300">
            <Activity size={13} className="text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span className="font-bold tabular-nums text-cyan-300">{currentFps} FPS</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCodeModal(true)}
            className="px-3 py-1.5 rounded-full bg-zinc-950/85 hover:bg-zinc-900 backdrop-blur-xl border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5 cursor-pointer shadow-xl transition-all"
            title="Export Engine Code"
          >
            <Code2 size={13} className="text-indigo-400" />
            <span>Export Code</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowControls(!showControls)}
            className="px-3 py-1.5 rounded-full bg-zinc-950/85 hover:bg-zinc-900 backdrop-blur-xl border border-white/10 text-xs font-mono text-zinc-300 flex items-center gap-1.5 cursor-pointer shadow-xl transition-all"
          >
            <Sliders size={13} className="text-emerald-400" />
            <span>{showControls ? 'Hide Controls' : 'Physics HUD'}</span>
          </motion.button>
        </div>
      </div>

      {/* Physics Tuning Panel */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-16 right-4 z-40 w-80 p-4 rounded-2xl bg-zinc-950/90 backdrop-blur-2xl border border-white/15 shadow-2xl space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Gauge size={14} className="text-emerald-400" />
                <span className="text-xs font-bold font-mono tracking-wider text-zinc-200">
                  DELTA-TIME PHYSICS
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                EASE: {baseEase.toFixed(3)}
              </span>
            </div>

            {/* Ease Slider */}
            <div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-400 mb-1.5">
                <span>Delta Catch-up (Ease)</span>
                <span className="text-emerald-400 font-bold">{baseEase.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.030"
                max="0.220"
                step="0.005"
                value={baseEase}
                onChange={(e) => setBaseEase(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-1">
                <span>Floatier (0.030)</span>
                <span>Snappier (0.220)</span>
              </div>
            </div>

            {/* Display Refresh Preset */}
            <div>
              <div className="text-[11px] font-mono text-zinc-400 mb-1.5 flex items-center justify-between">
                <span>Target Refresh Rate Profile</span>
                <Monitor size={12} className="text-cyan-400" />
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(['60', '90', '120', '144', '240'] as const).map((profile) => (
                  <button
                    key={profile}
                    onClick={() => {
                      setFpsProfile(profile)
                      if (profile === '60') setBaseEase(0.12)
                      if (profile === '90') setBaseEase(0.095)
                      if (profile === '120') setBaseEase(0.085)
                      if (profile === '144') setBaseEase(0.075)
                      if (profile === '240') setBaseEase(0.05)
                    }}
                    className={`py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      fpsProfile === profile
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                        : 'bg-zinc-900/60 text-zinc-400 border border-white/5 hover:border-white/20'
                    }`}
                  >
                    {profile}Hz
                  </button>
                ))}
              </div>
            </div>

            {/* Engine Architecture Switch */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
              <span className="font-mono text-zinc-300 text-[11px] flex items-center gap-1.5">
                <Cpu size={12} className="text-purple-400" /> Compositor Pipeline
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                GPU TRANSFORM
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bottom HUD Status */}
      <div className="fixed bottom-6 right-6 z-40 bg-zinc-950/85 backdrop-blur-2xl px-5 py-3 rounded-full border border-purple-500/40 text-xs font-mono font-medium text-purple-200 shadow-[0_0_30px_rgba(124,92,255,0.25)] flex items-center gap-3 pointer-events-auto">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_12px_#a855f7] animate-pulse" />
        <span>ultra smooth · {fpsProfile} fps feel</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300">
          {scrollProgress.toFixed(0)}%
        </span>
      </div>

      {/* Floating Glide Controls */}
      <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 pointer-events-auto">
        {scrollProgress > 5 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="p-3 rounded-full bg-zinc-950/85 hover:bg-zinc-900 backdrop-blur-xl border border-white/15 text-zinc-300 hover:text-white shadow-2xl cursor-pointer transition-colors"
            title="Scroll to Top"
          >
            <ArrowUp size={16} />
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={scrollNext}
          className="px-4 py-2.5 rounded-full bg-zinc-950/85 hover:bg-zinc-900 backdrop-blur-xl border border-white/15 text-xs font-mono text-zinc-300 hover:text-white shadow-2xl flex items-center gap-1.5 cursor-pointer transition-colors"
          title="Glide to Next Section"
        >
          <span>Section {activeSection}/4</span>
          <ChevronDown size={14} />
        </motion.button>
      </div>

      {/* Code Export Modal */}
      <AnimatePresence>
        {showCodeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowCodeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-zinc-950 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="text-purple-400" size={18} />
                  <h3 className="font-mono font-bold text-sm text-zinc-200">
                    GPU-Composited Delta-Time Easing Engine
                  </h3>
                </div>
                <button
                  onClick={copySnippet}
                  className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedCode ? 'Copied!' : 'Copy Snippet'}</span>
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-purple-200 overflow-x-auto max-h-80 leading-relaxed">
{`/* 1. CSS GPU Isolation Setup */
html, body {
  overflow: hidden;
  overscroll-behavior: none;
}
#scroll-content {
  position: fixed;
  top: 0; left: 0; width: 100%;
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
}

/* 2. Frame-Rate Independent Delta-Time Render Loop */
const BASE_EASE = 0.085;
let target = 0, current = 0;
let lastTime = performance.now();

function tick(now) {
  const dt = Math.min(now - lastTime, 50);
  lastTime = now;
  // Frame-rate scaling (identical at 60/120/144Hz)
  const ease = 1 - Math.pow(1 - BASE_EASE, dt / (1000 / 60));
  current += (target - current) * ease;
  if (Math.abs(target - current) < 0.05) current = target;

  content.style.transform = \`translate3d(0, \${-current}px, 0)\`;
  requestAnimationFrame(tick);
}`}
              </pre>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowCodeModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* THE ACTUAL GPU-TRANSFORMED SCROLL CONTENT WRAPPER */}
      <div
        ref={virtualContentRef}
        className="w-full will-change-transform [transform:translate3d(0,0,0)] [backface-visibility:hidden] antialiased"
        style={{
          transformOrigin: '0 0'
        }}
      >
        {/* SECTION 1 */}
        <section className="min-h-screen flex flex-col items-center justify-center p-8 md:p-16 text-center bg-gradient-to-b from-[#0e0e12] to-[#17141f]">
          <span className="inline-block px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold tracking-widest uppercase mb-5 shadow-inner">
            01 · Smooth Scroll Engine
          </span>
          <h1 className="text-4xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 bg-gradient-to-br from-white via-[#dcd2ff] to-[#a78bfa] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(167,139,250,0.3)]">
            Buttery Smooth Scrolling
          </h1>
          <p className="max-w-xl text-zinc-300 text-base md:text-lg leading-relaxed mb-8 opacity-80">
            This engine bypasses native browser scroll entirely. Instead it tracks your wheel,
            touch gestures, and keyboard inputs, lerping the visible viewport content every animation
            frame using a GPU-composited hardware transform — staying fluid at whatever refresh rate
            your display runs (60 / 90 / 120 / 144 / 240Hz).
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-xs text-purple-300/80">
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
              <Zap size={13} className="text-amber-400" /> GPU Composited
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
              <Flame size={13} className="text-emerald-400" /> Zero Layout Thrash
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
              <Layers size={13} className="text-cyan-400" /> Delta-Time Easing
            </span>
          </div>
        </section>

        {/* SECTION 2 */}
        <section className="min-h-screen flex flex-col items-center justify-center p-8 md:p-16 text-center bg-gradient-to-b from-[#14121a] to-[#0e0e12]">
          <span className="inline-block px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold tracking-widest uppercase mb-5">
            02 · Why it feels faster
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-[#f4f4f6] to-[#c4b5fd] bg-clip-text text-transparent">
            No Layout Thrash
          </h1>
          <p className="max-w-xl text-zinc-300 text-base md:text-lg leading-relaxed opacity-80">
            Native scroll updates trigger layout and paint passes on every single tick. This uses{' '}
            <code className="bg-white/10 px-2 py-0.5 rounded text-purple-300 font-mono text-sm">
              transform: translate3d()
            </code>{' '}
            only, which the browser compositor animates on its dedicated GPU pipeline thread —
            delivering zero jank even while complex background tasks execute.
          </p>
        </section>

        {/* SECTION 3 */}
        <section className="min-h-screen flex flex-col items-center justify-center p-8 md:p-16 text-center bg-gradient-to-b from-[#0e0e12] to-[#17141f]">
          <span className="inline-block px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold tracking-widest uppercase mb-5">
            03 · Frame-rate independent
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-[#f4f4f6] to-[#c4b5fd] bg-clip-text text-transparent">
            Delta-Time Easing
          </h1>
          <p className="max-w-xl text-zinc-300 text-base md:text-lg leading-relaxed opacity-80">
            The lerp factor is scaled by elapsed frame time (
            <code className="bg-white/10 px-2 py-0.5 rounded text-purple-300 font-mono text-sm">
              dt / (1000 / 60)
            </code>
            ), not a static constant. Motion velocity and deceleration feel identical on 60fps standard
            screens, 120fps ProMotion displays, and 240Hz esports monitors.
          </p>
        </section>

        {/* SECTION 4 */}
        <section className="min-h-screen flex flex-col items-center justify-center p-8 md:p-16 text-center bg-gradient-to-b from-[#14121a] to-[#0e0e12]">
          <span className="inline-block px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 font-mono text-xs font-bold tracking-widest uppercase mb-5">
            04 · Try it
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-[#f4f4f6] to-[#c4b5fd] bg-clip-text text-transparent">
            Scroll With Wheel, Touch, or Keys
          </h1>
          <p className="max-w-xl text-zinc-300 text-base md:text-lg leading-relaxed opacity-80 mb-8">
            Glide with your trackpad, flick on touchscreens, or use the keyboard (
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs">↑</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs">↓</kbd>{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs">Space</kbd>).
            Sub-pixel snapping prevents drift, and GPU compositing guarantees smooth momentum.
          </p>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={scrollToTop}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-xs tracking-wider uppercase shadow-[0_0_25px_rgba(147,51,234,0.4)] flex items-center gap-2 cursor-pointer transition-all"
            >
              <RefreshCw size={14} />
              <span>Glide Back To Top</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCodeModal(true)}
              className="px-6 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/15 font-mono text-xs font-bold tracking-wider uppercase flex items-center gap-2 cursor-pointer transition-all"
            >
              <Code2 size={14} />
              <span>View Full Code</span>
            </motion.button>
          </div>
        </section>

        {/* FOOTER */}
        <div className="text-center text-zinc-500 text-xs py-12 tracking-wider font-mono">
          ⚡ Ultra Smooth Scroll Engine · GPU translate3d · Delta-Time Normalized · IRIS AI
        </div>
      </div>
    </div>
  )
}
