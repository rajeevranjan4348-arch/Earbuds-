import { useState, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiLayoutGridLine,
  RiFolderOpenLine,
  RiPhoneLine,
  RiSettings4Line,
  RiImageLine,
  RiGoogleFill,
  RiCompass3Line,
  RiYoutubeFill
} from 'react-icons/ri'
import { FileText, Database } from 'lucide-react'

import DashboardView from '../views/Dashboard'
import PhoneView from '../views/Phone'
import SettingsView from '../views/Settings'
import DocumentStatusOverlay from '../components/UI/DocumentStatusOverlay'

const NotesView = lazy(() => import('../views/Notes'))
const GalleryView = lazy(() => import('../views/Gallery'))
const GoogleWorkspaceView = lazy(() => import('../views/GoogleWorkspaceView'))
const GoogleMapsView = lazy(() => import('../views/GoogleMapsView'))
const YouTubeStudioView = lazy(() => import('../views/YouTubeStudioView'))

interface IrisProps {
  isConnected: boolean
  toggleConnection: () => void
  isSpeaking: boolean
  isMuted: boolean
  handleMicToggle: () => void
  activeTab?: string
  setActiveTab?: (tab: string) => void
  visionMode?: 'off' | 'camera' | 'screen'
  setVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  isListening?: boolean
  interimTranscript?: string
  lastFinalTranscript?: string
  micLevel?: number
  voiceStatus?: string
  statusMessage?: string
  submitVoicePrompt?: (text: string) => void
  isDocOverlayOpen?: boolean
  setIsDocOverlayOpen?: (open: boolean) => void
}

const glassPanel = 'bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl'

const IRIS = ({
  isConnected,
  toggleConnection,
  isSpeaking,
  isMuted,
  handleMicToggle,
  activeTab: propActiveTab,
  setActiveTab: propSetActiveTab,
  visionMode,
  setVisionMode,
  isListening,
  interimTranscript,
  lastFinalTranscript,
  micLevel,
  voiceStatus,
  statusMessage,
  submitVoicePrompt,
  isDocOverlayOpen: propIsDocOverlayOpen,
  setIsDocOverlayOpen: propSetIsDocOverlayOpen
}: IrisProps) => {
  const [internalActiveTab, setInternalActiveTab] = useState('DASHBOARD')
  const [internalDocOverlayOpen, setInternalDocOverlayOpen] = useState(false)

  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setInternalActiveTab
  const isDocOverlayOpen = propIsDocOverlayOpen !== undefined ? propIsDocOverlayOpen : internalDocOverlayOpen
  const setIsDocOverlayOpen = propSetIsDocOverlayOpen !== undefined ? propSetIsDocOverlayOpen : setInternalDocOverlayOpen

  const tabs = [
    { id: 'DASHBOARD', label: 'Command', icon: <RiLayoutGridLine size={16} /> },
    { id: 'YOUTUBE', label: 'YouTube', icon: <RiYoutubeFill size={16} /> },
    { id: 'WORKSPACE', label: 'Workspace', icon: <RiGoogleFill size={16} /> },
    { id: 'MAPS', label: 'Maps', icon: <RiCompass3Line size={16} /> },
    { id: 'NOTES', label: 'Notes', icon: <RiFolderOpenLine size={16} /> },
    { id: 'GALLERY', label: 'Gallery', icon: <RiImageLine size={16} /> },
    { id: 'PHONE', label: 'Mobile', icon: <RiPhoneLine size={16} /> },
    { id: 'SETTINGS', label: 'Settings', icon: <RiSettings4Line size={16} /> }
  ]

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-black text-zinc-100 font-sans overflow-hidden select-none relative">
      <div className="h-14 md:h-16 w-full flex items-center justify-between px-3 md:px-6 bg-black border-b border-white/5 z-50 shrink-0">
        <div
          onClick={() => setActiveTab('DASHBOARD')}
          className="flex items-center gap-2 md:gap-3 w-auto md:w-48 cursor-pointer shrink-0"
        >
          <img src="/Logo.png" alt="IRIS Logo" className="w-10 h-10 md:w-14 md:h-14" />

          <div className="flex flex-col leading-none">
            <span className="font-black tracking-widest text-[12px] md:text-[14px] text-zinc-100 uppercase -ml-1 md:-ml-1.5">
              IRIS AI
            </span>
          </div>
        </div>

        {/* Desktop Tabs with Animated Sliding Pill */}
        <div className="hidden md:flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-white/5 backdrop-blur-md shadow-2xl relative">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`relative cursor-pointer px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-lg flex items-center gap-2 transition-colors duration-200 ${
                activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabBadge"
                  className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/30 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10">{tab.icon}</span>
              <span className="relative z-10">{tab.label}</span>
            </motion.button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 w-auto shrink-0">
          {/* Document Knowledge & PDF Status Trigger Button */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsDocOverlayOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 text-zinc-300 hover:text-emerald-300 text-[11px] font-mono font-bold tracking-wider uppercase transition-colors cursor-pointer"
            title="Open PDF Ingestion Status Dashboard"
          >
            <Database size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">PDF Knowledge</span>
          </motion.button>

          <div className="flex flex-col items-end leading-none">
            <span className="text-[9px] md:text-[10px] font-mono tracking-widest uppercase text-zinc-400">
              Voice Core
            </span>
            <span
              className={`text-[8px] md:text-[9px] font-mono tracking-widest uppercase mt-0.5 md:mt-1 ${
                isConnected
                  ? isSpeaking
                    ? 'text-cyan-400 font-bold'
                    : isMuted
                      ? 'text-yellow-400 font-bold'
                      : 'text-emerald-500 font-bold'
                  : 'text-red-500'
              }`}
            >
              {isConnected
                ? isSpeaking
                  ? 'Speaking'
                  : isMuted
                    ? 'Muted'
                    : 'Listening'
                : 'Offline'}
            </span>
          </div>
          <div
            className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] transition-all duration-300 ${
              isConnected
                ? isSpeaking
                  ? 'bg-cyan-400 text-cyan-400 animate-ping'
                  : isMuted
                    ? 'bg-yellow-400 text-yellow-400'
                    : 'bg-emerald-500 text-emerald-500'
                : 'bg-red-500 text-red-500'
            }`}
          />
        </div>
      </div>

      {/* Mobile Tabs Bar with Animated Sliding Pill */}
      <div className="md:hidden flex items-center gap-1 px-2.5 py-1.5 bg-zinc-950/95 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-40">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            whileTap={{ scale: 0.95 }}
            className={`relative cursor-pointer shrink-0 px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-lg flex items-center gap-1.5 transition-colors duration-200 ${
              activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTabBadgeMobile"
                className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/30 rounded-lg shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">{tab.icon}</span>
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-zinc-950 via-black to-black">
        <div className="relative h-full w-full p-2 sm:p-4 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.995 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              {activeTab === 'DASHBOARD' && (
                <DashboardView
                  isConnected={isConnected}
                  toggleConnection={toggleConnection}
                  isSpeaking={isSpeaking}
                  isMuted={isMuted}
                  handleMicToggle={handleMicToggle}
                  visionMode={visionMode}
                  setVisionMode={setVisionMode}
                  isListening={isListening}
                  interimTranscript={interimTranscript}
                  lastFinalTranscript={lastFinalTranscript}
                  micLevel={micLevel}
                  voiceStatus={voiceStatus}
                  statusMessage={statusMessage}
                  submitVoicePrompt={submitVoicePrompt}
                />
              )}

              {activeTab === 'PHONE' && <PhoneView glassPanel={glassPanel} />}

              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center font-mono text-zinc-500 text-xs tracking-wider animate-pulse">
                    Synchronizing Module Neural Weights...
                  </div>
                }
              >
                {activeTab === 'YOUTUBE' && <YouTubeStudioView glassPanel={glassPanel} />}
                {activeTab === 'WORKSPACE' && <GoogleWorkspaceView glassPanel={glassPanel} />}
                {activeTab === 'MAPS' && <GoogleMapsView glassPanel={glassPanel} />}
                {activeTab === 'NOTES' && <NotesView glassPanel={glassPanel} />}
                {activeTab === 'GALLERY' && <GalleryView />}
                {activeTab === 'SETTINGS' && <SettingsView isSystemActive={isConnected} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* PDF Document Knowledge & Lifecycle Ingestion Status Overlay */}
      <DocumentStatusOverlay
        isOpen={isDocOverlayOpen}
        onClose={() => setIsDocOverlayOpen(false)}
        onOpen={() => setIsDocOverlayOpen(true)}
      />
    </div>
  )
}

export default IRIS
