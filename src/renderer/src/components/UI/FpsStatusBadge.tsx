import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Sparkles, Sliders, Cpu, Check, Activity } from 'lucide-react'
import { smoothScrollEngine, FpsTelemetry } from '../../services/smoothScrollEngine'

interface FpsStatusBadgeProps {
  onOpenSmoothnessView?: () => void
}

export const FpsStatusBadge: React.FC<FpsStatusBadgeProps> = ({ onOpenSmoothnessView }) => {
  const [telemetry, setTelemetry] = useState<FpsTelemetry>(() => smoothScrollEngine.getTelemetry())
  const [showPopover, setShowPopover] = useState(false)

  useEffect(() => {
    const unsub = smoothScrollEngine.subscribe((t) => {
      setTelemetry(t)
    })
    return () => unsub()
  }, [])

  const isHighRefresh = telemetry.fps >= 90
  const fpsColor =
    telemetry.fps >= 110
      ? 'text-[#00ff41] border-[#00ff41]/40 bg-[#00ff41]/10'
      : telemetry.fps >= 85
        ? 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30'
        : telemetry.fps >= 55
          ? 'text-emerald-400 border-emerald-500/30 bg-zinc-900/80'
          : 'text-amber-400 border-amber-500/30 bg-amber-950/20'

  return (
    <div className="relative font-mono">
      {/* Interactive 120 FPS Trigger Pill */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowPopover(!showPopover)}
        className={`cursor-pointer px-2.5 py-1 rounded-xl border flex items-center gap-1.5 text-[10px] font-bold tracking-wider transition-all shadow-sm ${fpsColor}`}
        title="120 FPS Ultra-Smooth High-Refresh Engine Status"
      >
        <Zap
          size={11}
          className={`${
            isHighRefresh ? 'text-[#00ff41] fill-[#00ff41] animate-pulse' : 'text-zinc-400'
          }`}
        />
        <span>{telemetry.fps} FPS</span>
        {isHighRefresh && (
          <span className="hidden lg:inline text-[9px] font-mono text-[#00ff41]/80 uppercase">
            120Hz
          </span>
        )}
      </motion.button>

      {/* Popover Card */}
      <AnimatePresence>
        {showPopover && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full mt-2 w-64 p-3 rounded-2xl bg-zinc-950/95 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-50 flex flex-col gap-2.5 text-xs text-zinc-200"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5 font-bold text-white">
                <Sparkles size={13} className="text-[#00ff41]" />
                <span>120 FPS Smooth Engine</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${fpsColor}`}>
                {telemetry.fps} Hz
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-black/50 p-2 rounded-xl border border-white/5 flex flex-col">
                <span className="text-[9px] text-zinc-500 uppercase">Frame Interval</span>
                <span className="font-bold text-emerald-400">{telemetry.frameDeltaMs} ms</span>
              </div>
              <div className="bg-black/50 p-2 rounded-xl border border-white/5 flex flex-col">
                <span className="text-[9px] text-zinc-500 uppercase">GPU Compositing</span>
                <span className="font-bold text-cyan-400">
                  {telemetry.gpuActive ? 'Active' : 'Standby'}
                </span>
              </div>
            </div>

            {/* GPU Boost Toggle */}
            <button
              type="button"
              onClick={() => smoothScrollEngine.setGpuBoosted(!telemetry.gpuActive)}
              className="cursor-pointer flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-[11px] transition-colors"
            >
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Cpu size={12} className="text-[#00ff41]" />
                <span>Hardware Acceleration</span>
              </span>
              <span
                className={`text-[10px] font-bold ${
                  telemetry.gpuActive ? 'text-[#00ff41]' : 'text-zinc-500'
                }`}
              >
                {telemetry.gpuActive ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Launch Full Interactive 120 FPS Sandbox View */}
            {onOpenSmoothnessView && (
              <button
                type="button"
                onClick={() => {
                  setShowPopover(false)
                  onOpenSmoothnessView()
                }}
                className="cursor-pointer w-full mt-1 py-1.5 rounded-xl bg-[#00ff41] hover:bg-[#33ff66] text-black font-bold text-[11px] tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(0,255,65,0.3)] transition-all"
              >
                <Sliders size={12} />
                <span>Open 120fps Sandbox</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default FpsStatusBadge
