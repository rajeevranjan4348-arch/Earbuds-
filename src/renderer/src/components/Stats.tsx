import React from 'react'
import { motion } from 'framer-motion'
import { Zap, Clock, ShieldCheck, Cpu } from 'lucide-react'

export const Stats: React.FC = () => {
  const stats = [
    {
      value: '< 180ms',
      label: 'End-to-End Voice Latency',
      subtext: 'From spoken syllable to audio packet delivery',
      icon: Clock
    },
    {
      value: '99.8%',
      label: 'Voice Wake Word Accuracy',
      subtext: 'Acoustic background noise suppression',
      icon: Zap
    },
    {
      value: '100%',
      label: 'Local Privacy Guard',
      subtext: 'Zero raw tokens uploaded without sanitization',
      icon: ShieldCheck
    },
    {
      value: '12+',
      label: 'Autonomous Agent Roles',
      subtext: 'Coding, Research, Media, Spatial & Ops',
      icon: Cpu
    }
  ]

  return (
    <section id="stats" className="relative py-20 z-10 border-y border-white/[0.06] bg-black/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, idx) => {
            const Icon = stat.icon
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col items-center text-center p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-mono">
                  {stat.value}
                </span>
                <span className="mt-2 text-sm font-semibold text-zinc-200">{stat.label}</span>
                <span className="mt-1 text-xs text-zinc-500">{stat.subtext}</span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Stats
