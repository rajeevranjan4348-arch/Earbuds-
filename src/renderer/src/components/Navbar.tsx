import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Radio,
  ArrowRight,
  Menu,
  X,
  Layers,
  Zap,
  Github,
  ShieldCheck
} from 'lucide-react'

interface NavbarProps {
  onLaunchOS?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onLaunchOS }) => {
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Interactive Demo', href: '#demo' },
    { label: 'Architecture', href: '#stats' },
    { label: 'Testimonials', href: '#testimonials' }
  ]

  const handleLaunch = () => {
    if (onLaunchOS) {
      onLaunchOS()
    } else {
      window.dispatchEvent(new CustomEvent('iris:open-os'))
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-[#07070c]/80 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.5)] py-3.5'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <a href="#" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 p-[1px] shadow-[0_0_20px_rgba(16,185,129,0.35)]">
            <div className="w-full h-full bg-[#090a10] rounded-[11px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform duration-200" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5 font-sans">
              IRIS <span className="text-emerald-400 font-mono text-xs uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">OS</span>
            </span>
            <span className="text-[10px] text-zinc-400 -mt-0.5 tracking-wider font-mono">
              VOICE OPERATING LAYER
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] px-4 py-1.5 rounded-full backdrop-blur-md">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors rounded-full hover:bg-white/[0.05]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Action CTA */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))}
            className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-emerald-400 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Voice Mode</span>
          </button>

          <button
            onClick={handleLaunch}
            className="relative group overflow-hidden rounded-xl p-[1px] font-semibold text-xs transition-all duration-300 hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] cursor-pointer"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-xl transition-all duration-300 group-hover:opacity-100" />
            <span className="relative flex items-center gap-2 px-4 py-2 rounded-[11px] bg-[#07070c] text-white transition-colors duration-200 group-hover:bg-opacity-90">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Launch Interface</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={handleLaunch}
            className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-semibold rounded-lg"
          >
            Launch
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#0a0a12]/95 border-b border-white/10 px-6 py-5 space-y-4 backdrop-blur-2xl"
          >
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block text-sm font-medium text-zinc-300 hover:text-emerald-400 py-1"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 text-zinc-200 text-xs font-medium"
              >
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Open Voice Mode</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false)
                  handleLaunch()
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold"
              >
                <span>Launch IRIS OS Workspace</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

export default Navbar
