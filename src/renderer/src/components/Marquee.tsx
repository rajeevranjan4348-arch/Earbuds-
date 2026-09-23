import React from 'react'
import { motion } from 'framer-motion'
import {
  Zap,
  Cpu,
  Brain,
  Terminal,
  Layers,
  Radio,
  Sparkles,
  Database,
  Shield,
  Search,
  Bot,
  Compass
} from 'lucide-react'

export const Marquee: React.FC = () => {
  const items = [
    { label: 'Gemini 3.8 Multimodal Live', icon: Zap },
    { label: 'Autonomous Agent Harness', icon: Bot },
    { label: 'Mem0 Long-Term Vector Memory', icon: Database },
    { label: 'Web Speech & Instant Barge-In', icon: Radio },
    { label: 'Scientific Literature Synthesis', icon: Brain },
    { label: 'Google Workspace Intelligence', icon: Compass },
    { label: 'Zero-Leakage Privacy Guard', icon: Shield },
    { label: 'Real-Time Web Grounding', icon: Search }
  ]

  return (
    <div className="relative w-full py-6 border-y border-white/[0.06] bg-black/40 backdrop-blur-md overflow-hidden z-10 select-none">
      {/* Edge gradient fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#07070c] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#07070c] to-transparent z-10 pointer-events-none" />

      <div className="flex w-max">
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="flex items-center gap-8 shrink-0 pr-8"
        >
          {[...items, ...items].map((item, idx) => {
            const Icon = item.icon
            return (
              <div
                key={idx}
                className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-emerald-500/30 hover:bg-white/[0.05] transition-all"
              >
                <Icon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-medium text-zinc-300 tracking-wide">
                  {item.label}
                </span>
              </div>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}

export default Marquee
