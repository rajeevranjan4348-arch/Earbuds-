import React from 'react'
import { Zap, Heart, Shield, Terminal, Globe, Github, Sparkles } from 'lucide-react'

export const Footer: React.FC = () => {
  return (
    <footer className="relative border-t border-white/[0.08] bg-[#050508] py-12 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo and Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-wide">IRIS AI OPERATING LAYER</span>
              <p className="text-[11px] text-zinc-500">
                Autonomous multi-agent desktop environment & voice intelligence.
              </p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex items-center gap-6 text-xs text-zinc-400">
            <a href="#features" className="hover:text-emerald-400 transition-colors">
              Features
            </a>
            <a href="#demo" className="hover:text-emerald-400 transition-colors">
              Live Demo
            </a>
            <a href="#stats" className="hover:text-emerald-400 transition-colors">
              Architecture
            </a>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))}
              className="hover:text-emerald-400 transition-colors cursor-pointer"
            >
              Voice Mode
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('iris:open-os'))}
              className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer font-medium"
            >
              Launch OS
            </button>
          </div>

          {/* Copyright */}
          <div className="text-[11px] text-zinc-600 flex items-center gap-1 font-mono">
            <span>© {new Date().getFullYear()} IRIS • Crafted for Hands-Free Authority</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
