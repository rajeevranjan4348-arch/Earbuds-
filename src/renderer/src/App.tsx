import React, { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from './hooks/useLenis'
import AmbientBackground from './components/AmbientBackground'
import CursorGlow from './components/CursorGlow'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Marquee from './components/Marquee'
import ChatDemo from './components/ChatDemo'
import Features from './components/Features'
import Stats from './components/Stats'
import Testimonials from './components/Testimonials'
import CTA from './components/CTA'
import Footer from './components/Footer'
import { VoiceChatModal } from './components/Voice/VoiceChatModal'
import IndexRoot from './IRISRoot'
import { Mem0Provider } from './context/Mem0Context'
import { X, ArrowLeft, Terminal, Radio } from 'lucide-react'

export default function App() {
  useLenis()

  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false)
  const [showOSWorkspace, setShowOSWorkspace] = useState(false)

  useEffect(() => {
    const handleOpenVoice = () => setIsVoiceModalOpen(true)
    const handleCloseVoice = () => setIsVoiceModalOpen(false)
    const handleOpenOS = () => setShowOSWorkspace(true)
    const handleCloseOS = () => setShowOSWorkspace(false)

    window.addEventListener('iris:open-voice-modal', handleOpenVoice)
    window.addEventListener('iris:close-voice-modal', handleCloseVoice)
    window.addEventListener('iris:open-os', handleOpenOS)
    window.addEventListener('iris:close-os', handleCloseOS)

    return () => {
      window.removeEventListener('iris:open-voice-modal', handleOpenVoice)
      window.removeEventListener('iris:close-voice-modal', handleCloseVoice)
      window.removeEventListener('iris:open-os', handleOpenOS)
      window.removeEventListener('iris:close-os', handleCloseOS)
    }
  }, [])

  return (
    <Mem0Provider>
      <div className="relative min-h-screen bg-[#07070c] text-white antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        <AmbientBackground />
        <CursorGlow />
        <Navbar onLaunchOS={() => setShowOSWorkspace(true)} />

        <main>
          <Hero
            onOpenVoice={() => setIsVoiceModalOpen(true)}
            onLaunchOS={() => setShowOSWorkspace(true)}
          />
          <Marquee />
          <ChatDemo />
          <Features />
          <Stats />
          <Testimonials />
          <CTA />
        </main>

        <Footer />

        {/* Real-time Voice Assistant Modal */}
        <VoiceChatModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
        />

        {/* Full OS Workspace View Overlay */}
        <AnimatePresence>
          {showOSWorkspace && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 bg-black/95 flex flex-col"
            >
              {/* OS Top Navigation Bar */}
              <div className="h-12 bg-zinc-950/90 border-b border-white/10 px-4 flex items-center justify-between z-10 shrink-0 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowOSWorkspace(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Showcase</span>
                  </button>
                  <div className="h-4 w-[1px] bg-white/10" />
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>IRIS NEURAL OPERATING SYSTEM</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-colors cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span>Voice Chat</span>
                  </button>
                  <button
                    onClick={() => setShowOSWorkspace(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Close OS Workspace"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* OS Main Content */}
              <div className="flex-1 overflow-hidden relative">
                <IndexRoot />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Mem0Provider>
  )
}
