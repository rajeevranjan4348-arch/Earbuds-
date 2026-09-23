import React from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Mic,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  Bot,
  Zap,
  Play
} from 'lucide-react'

interface HeroProps {
  onOpenVoice?: () => void
  onLaunchOS?: () => void
}

export const Hero: React.FC<HeroProps> = ({ onOpenVoice, onLaunchOS }) => {
  const handleVoice = () => {
    if (onOpenVoice) {
      onOpenVoice()
    } else {
      window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))
    }
  }

  const handleOS = () => {
    if (onLaunchOS) {
      onLaunchOS()
    } else {
      window.dispatchEvent(new CustomEvent('iris:open-os'))
    }
  }

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        {/* Top Status Pill */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.1] backdrop-blur-lg mb-8 shadow-inner shadow-white/5"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-mono text-zinc-300">
            IRIS v1.7 • Multi-Agent Voice Operating Layer
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Live
          </span>
        </motion.div>

        {/* Master Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.1]"
        >
          Not another chatbot. <br />
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Your Voice Operating Layer.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-base sm:text-lg lg:text-xl text-zinc-400 max-w-2xl leading-relaxed"
        >
          Give hands-free authority to autonomous multi-agent pipelines. Speak naturally to control
          your workspace, research scientific literature, manage media channels, and execute complex workflows.
        </motion.p>

        {/* Interactive Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4 w-full max-w-md"
        >
          <button
            onClick={handleVoice}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-semibold text-sm shadow-[0_0_35px_rgba(16,185,129,0.35)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Mic className="w-4 h-4 text-black" />
            <span>Start Voice Conversation</span>
          </button>

          <button
            onClick={handleOS}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] text-white font-medium text-sm border border-white/[0.1] hover:border-white/[0.2] transition-all cursor-pointer"
          >
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Open OS Workspace</span>
            <ArrowRight className="w-4 h-4 text-zinc-400" />
          </button>
        </motion.div>

        {/* Feature Pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-400"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.05]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero Data Leakage & Local Guardrails</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.05]">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sub-200ms Neural Streaming</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.05]">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span>Autonomous Tool Execution</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default Hero
