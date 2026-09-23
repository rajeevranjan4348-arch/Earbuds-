import React from 'react'
import { motion } from 'framer-motion'
import {
  Mic,
  Cpu,
  Database,
  FileText,
  Compass,
  Radio,
  Sparkles,
  ShieldCheck,
  Bot,
  Terminal,
  Activity,
  Workflow
} from 'lucide-react'

export const Features: React.FC = () => {
  const featureList = [
    {
      icon: Mic,
      title: 'Real-Time Voice First Architecture',
      description:
        'Continuous speech recognition with millisecond wake word detection, instant barge-in interruption, and streaming neural text-to-speech.',
      badge: 'Sub-200ms Latency',
      gradient: 'from-emerald-500/20 to-teal-500/5'
    },
    {
      icon: Workflow,
      title: 'Autonomous Multi-Agent Harness',
      description:
        'Specialized agents collaborate across coding, scientific research, YouTube content strategy, system orchestration, and executive workflows.',
      badge: 'Dynamic Routing',
      gradient: 'from-cyan-500/20 to-blue-500/5'
    },
    {
      icon: Database,
      title: 'Mem0 Long-Term Vector Memory',
      description:
        'Maintains cross-session recall of preferences, previous tasks, architectural decisions, and contextual documents with semantic indexing.',
      badge: 'Persistent Context',
      gradient: 'from-indigo-500/20 to-purple-500/5'
    },
    {
      icon: FileText,
      title: 'High-Fidelity PDF RAG Engine',
      description:
        'Ingest research papers, corporate documents, and books with instant chunking, semantic vector search, and precise page citations.',
      badge: 'Academic Citations',
      gradient: 'from-amber-500/20 to-orange-500/5'
    },
    {
      icon: Compass,
      title: 'Spatial Telemetry & Live Maps',
      description:
        'Hardware GPS and IP telemetry integration for spatial awareness, local weather forecasts, route navigation, and geo-grounding.',
      badge: 'Spatial Grounding',
      gradient: 'from-emerald-500/20 to-green-500/5'
    },
    {
      icon: ShieldCheck,
      title: 'Zero-Leakage Privacy Guard',
      description:
        'Local regex sanitization and strict PII anonymization before LLM dispatch. Credentials and tokens remain strictly on your local device.',
      badge: 'Enterprise Security',
      gradient: 'from-rose-500/20 to-pink-500/5'
    }
  ]

  return (
    <section id="features" className="relative py-24 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
            Core Capabilities
          </span>
          <h2 className="mt-2 text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Engineered for Autonomous Authority
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Every layer of IRIS is optimized for zero-friction desktop control, multimodal reasoning,
            and continuous background intelligence.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {featureList.map((feat, idx) => {
            const Icon = feat.icon
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="group relative rounded-3xl bg-[#0b0c14] border border-white/[0.08] hover:border-emerald-500/40 p-8 transition-all duration-300 hover:shadow-[0_15px_40px_rgba(16,185,129,0.15)] flex flex-col justify-between overflow-hidden"
              >
                {/* Background ambient corner glow */}
                <div
                  className={`absolute -top-20 -right-20 w-44 h-44 rounded-full bg-gradient-to-br ${feat.gradient} blur-3xl group-hover:scale-150 transition-transform duration-500 pointer-events-none`}
                />

                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.06]">
                      {feat.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2.5 group-hover:text-emerald-300 transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-white/[0.05] flex items-center justify-between text-xs text-zinc-500 group-hover:text-emerald-400 transition-colors">
                  <span className="font-mono text-[11px]">System Ready</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default Features
