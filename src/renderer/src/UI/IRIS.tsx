import { useState, useEffect, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiLayoutGridLine,
  RiFolderOpenLine,
  RiPhoneLine,
  RiSettings4Line,
  RiImageLine,
  RiGoogleFill,
  RiCompass3Line,
  RiChat3Line
} from 'react-icons/ri'
import { Maximize2 } from 'lucide-react'
import { shortcutService, formatKeyCombo } from '../services/shortcutService'

import DashboardView from '../views/Dashboard'
import PhoneView from '../views/Phone'
import SettingsView from '../views/Settings'
import RightPanel from '../components/UI/RightPanel'
import DocumentStatusOverlay from '../components/UI/DocumentStatusOverlay'
import VoiceCommandLogSidePanel from '../components/UI/VoiceCommandLogSidePanel'
import { ModuleViewSkeleton } from '../components/UI/SkeletonLoader'

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
  frequencyData?: Uint8Array | null
  voiceStatus?: string
  statusMessage?: string
  submitVoicePrompt?: (text: string) => void
  stopSpeaking?: () => void
  isDocOverlayOpen?: boolean
  setIsDocOverlayOpen?: (open: boolean) => void
  isCoreUiMinimal?: boolean
  setIsCoreUiMinimal?: (val: boolean | ((prev: boolean) => boolean)) => void
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
  frequencyData,
  voiceStatus,
  statusMessage,
  submitVoicePrompt,
  stopSpeaking,
  isDocOverlayOpen: propIsDocOverlayOpen,
  setIsDocOverlayOpen: propSetIsDocOverlayOpen,
  isCoreUiMinimal: propIsCoreUiMinimal,
  setIsCoreUiMinimal: propSetIsCoreUiMinimal
}: IrisProps) => {
  const [internalActiveTab, setInternalActiveTab] = useState('DASHBOARD')
  const [internalDocOverlayOpen, setInternalDocOverlayOpen] = useState(false)
  const [internalMinimal, setInternalMinimal] = useState(false)

  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setInternalActiveTab
  const isDocOverlayOpen =
    propIsDocOverlayOpen !== undefined ? propIsDocOverlayOpen : internalDocOverlayOpen
  const setIsDocOverlayOpen =
    propSetIsDocOverlayOpen !== undefined ? propSetIsDocOverlayOpen : setInternalDocOverlayOpen
  const isCoreUiMinimal = propIsCoreUiMinimal !== undefined ? propIsCoreUiMinimal : internalMinimal
  const setIsCoreUiMinimal =
    propSetIsCoreUiMinimal !== undefined ? propSetIsCoreUiMinimal : setInternalMinimal

  const [coreUiShortcutDisplay, setCoreUiShortcutDisplay] = useState('Ctrl+\\')
  const [isVoiceLogOpen, setIsVoiceLogOpen] = useState(false)

  useEffect(() => {
    const handleOpenLog = () => setIsVoiceLogOpen(true)
    const handleToggleLog = () => setIsVoiceLogOpen((prev) => !prev)

    window.addEventListener('iris:open-voice-log', handleOpenLog)
    window.addEventListener('iris:toggle-voice-log', handleToggleLog)

    return () => {
      window.removeEventListener('iris:open-voice-log', handleOpenLog)
      window.removeEventListener('iris:toggle-voice-log', handleToggleLog)
    }
  }, [])

  useEffect(() => {
    const unsub = shortcutService.subscribe((list) => {
      const matchCore = list.find((s) => s.id === 'TOGGLE_CORE_UI')
      if (matchCore) {
        setCoreUiShortcutDisplay(formatKeyCombo(matchCore).join('+'))
      }
    })
    return () => unsub()
  }, [])

  const tabs = [
    { id: 'DASHBOARD', label: 'Command', icon: <RiLayoutGridLine size={16} /> },
    { id: 'CHAT', label: 'Chat', icon: <RiChat3Line size={16} /> },
    { id: 'WORKSPACE', label: 'Workspace', icon: <RiGoogleFill size={16} /> },
    { id: 'MAPS', label: 'Maps', icon: <RiCompass3Line size={16} /> },
    { id: 'NOTES', label: 'Notes', icon: <RiFolderOpenLine size={16} /> },
    { id: 'GALLERY', label: 'Gallery', icon: <RiImageLine size={16} /> },
    { id: 'PHONE', label: 'Mobile', icon: <RiPhoneLine size={16} /> },
    { id: 'SETTINGS', label: 'Settings', icon: <RiSettings4Line size={16} /> }
  ]

  return (
    <div className="flex flex-col h-full w-full max-w-full bg-black text-zinc-100 font-sans overflow-hidden select-none relative">
      {/* Floating Minimal HUD Mode Pill with Restore Trigger */}
      <AnimatePresence>
        {isCoreUiMinimal && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-3 right-3 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/90 backdrop-blur-xl border border-emerald-500/40 text-zinc-300 text-xs shadow-2xl"
          >
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] font-bold text-emerald-300 tracking-wider">
              Minimalist HUD
            </span>
            <button
              onClick={() => setIsCoreUiMinimal(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-[10px] border border-white/10 transition-colors cursor-pointer"
              title={`Restore full navigation chrome (${coreUiShortcutDisplay})`}
            >
              <Maximize2 size={11} className="text-emerald-400" />
              <span>Restore UI ({coreUiShortcutDisplay})</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation Bar (Collapsible in Minimal HUD mode) */}
      <AnimatePresence>
        {!isCoreUiMinimal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="h-14 md:h-16 w-full flex items-center justify-between px-3 md:px-6 bg-black border-b border-white/5 z-50 shrink-0 overflow-hidden"
          >
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
            <div className="hidden md:flex items-center gap-1.5 bg-zinc-950/80 p-1 rounded-xl border border-white/5 backdrop-blur-md shadow-2xl relative">
              {/* Command Center Mode Switcher */}
              <div className="flex items-center gap-1 mr-1 border-r border-white/10 pr-1.5">
                <motion.button
                  onClick={() => setActiveTab('DASHBOARD')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  className={`relative cursor-pointer px-3 py-1.5 text-[11px] font-mono font-bold tracking-wider uppercase rounded-lg flex items-center gap-1.5 border transition-all ${
                    activeTab === 'DASHBOARD'
                      ? 'border-emerald-500/70 bg-emerald-950/60 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                      : 'border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-900/30 text-emerald-400/90 hover:text-emerald-300'
                  }`}
                  title="Command Center"
                >
                  <RiLayoutGridLine size={14} className="text-emerald-400" />
                  <span>COMMAND</span>
                </motion.button>
              </div>

              {tabs
                .filter((tab) => tab.id !== 'DASHBOARD')
                .map((tab) => (
                  <motion.button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className={`relative cursor-pointer px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-lg flex items-center gap-2 transition-colors duration-200 ${
                      activeTab === tab.id
                        ? 'text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-200'
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Tabs Bar with Animated Sliding Pill */}
      <AnimatePresence>
        {!isCoreUiMinimal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden flex items-center gap-1 px-2.5 py-1.5 bg-zinc-950/95 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-40"
          >
            <motion.button
              onClick={() => setActiveTab('DASHBOARD')}
              whileTap={{ scale: 0.95 }}
              className={`relative cursor-pointer shrink-0 px-2.5 py-1.5 text-[10px] font-mono font-bold tracking-wider uppercase rounded-lg flex items-center gap-1 border transition-all ${
                activeTab === 'DASHBOARD'
                  ? 'border-emerald-500/70 bg-emerald-950/60 text-emerald-400'
                  : 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400/90'
              }`}
            >
              <RiLayoutGridLine size={12} className="text-emerald-400" />
              <span>COMMAND</span>
            </motion.button>
            {tabs
              .filter((tab) => tab.id !== 'DASHBOARD')
              .map((tab) => (
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
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-zinc-950 via-black to-black scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent flex flex-col">
        <div className="relative flex-1 min-h-full h-full w-full p-1 sm:p-3 lg:p-4 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.995 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-full h-full w-full flex flex-col"
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
                  frequencyData={frequencyData}
                  voiceStatus={voiceStatus}
                  statusMessage={statusMessage}
                  submitVoicePrompt={submitVoicePrompt}
                  stopSpeaking={stopSpeaking}
                />
              )}

              {activeTab === 'CHAT' && (
                <div className="h-full w-full max-w-4xl mx-auto flex flex-col p-1 sm:p-2">
                  <RightPanel
                    interimTranscript={interimTranscript}
                    isListening={isListening}
                    micLevel={micLevel}
                    onSendPrompt={submitVoicePrompt}
                  />
                </div>
              )}

              {activeTab === 'PHONE' && <PhoneView glassPanel={glassPanel} />}

              <Suspense fallback={<ModuleViewSkeleton title="Synchronizing Module Weights" />}>
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

      {/* Voice Command & Task Ledger Slide-Panel */}
      <VoiceCommandLogSidePanel
        isOpen={isVoiceLogOpen}
        onClose={() => setIsVoiceLogOpen(false)}
        onExecuteCommand={(cmd) => {
          if (submitVoicePrompt) {
            submitVoicePrompt(cmd)
          } else {
            window.dispatchEvent(
              new CustomEvent('iris:run-voice-command', {
                detail: { text: cmd }
              })
            )
          }
        }}
      />
    </div>
  )
}

export default IRIS
