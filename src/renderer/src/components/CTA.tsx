import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Mic, Terminal, ArrowRight, ShieldCheck } from 'lucide-react'

export const CTA: React.FC = () => {
  return (
    <section className="relative py-24 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-[#0e101a] to-[#080910] border border-white/[0.1] p-8 sm:p-14 text-center shadow-[0_20px_80px_rgba(16,185,129,0.15)]">
          {/* Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative z-10 flex flex-col items-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-6">
              <Sparkles className="w-6 h-6" />
            </div>

            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight max-w-2xl leading-tight">
              Ready to Upgrade Your Digital Workflow?
            </h2>

            <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-xl">
              Step into the future of autonomous desktop computing. Experience seamless voice
              command execution, multimodal reasoning, and persistent memory today.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))}
                className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                <Mic className="w-4 h-4 text-black" />
                <span>Try Voice Interaction</span>
              </button>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('iris:open-os'))}
                className="flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-white font-medium text-sm transition-all cursor-pointer"
              >
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Launch Full OS</span>
                <ArrowRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            <div className="mt-8 flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Free to use • Open architecture • Local privacy guard</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default CTA
