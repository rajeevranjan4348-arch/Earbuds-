import { useState, Suspense, lazy } from 'react'
import {
  RiLayoutGridLine,
  RiFolderOpenLine,
  RiPhoneLine,
  RiSettings4Line,
  RiImageLine
} from 'react-icons/ri'

import DashboardView from '../views/Dashboard'
import PhoneView from '../views/Phone'
import SettingsView from '../views/Settings'

const NotesView = lazy(() => import('../views/Notes'))
const GalleryView = lazy(() => import('../views/Gallery'))

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
  submitVoicePrompt
}: IrisProps) => {
  const [internalActiveTab, setInternalActiveTab] = useState('DASHBOARD')

  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab
  const setActiveTab = propSetActiveTab !== undefined ? propSetActiveTab : setInternalActiveTab

  const tabs = [
    { id: 'DASHBOARD', label: 'Command', icon: <RiLayoutGridLine size={16} /> },
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

        {/* Desktop Tabs */}
        <div className="hidden md:flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-white/5 backdrop-blur-md shadow-2xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase rounded-lg transition-all duration-200 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className={`${activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-600'}`}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 w-auto md:w-48 shrink-0">
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
              {isConnected ? (isSpeaking ? 'Speaking' : isMuted ? 'Muted' : 'Listening') : 'Offline'}
            </span>
          </div>
          <div
            className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${
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

      {/* Mobile Tabs Bar */}
      <div className="md:hidden flex items-center gap-1 px-2.5 py-1.5 bg-zinc-950/95 border-b border-white/5 overflow-x-auto no-scrollbar shrink-0 z-40">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`cursor-pointer shrink-0 px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === tab.id
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            <span className={`${activeTab === tab.id ? 'text-emerald-400' : 'text-zinc-600'}`}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-zinc-950 via-black to-black">
        <div className="relative h-full w-full p-2 sm:p-4 overflow-y-auto">
          <div className={`h-full w-full ${activeTab === 'DASHBOARD' ? 'block' : 'hidden'}`}>
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
          </div>

          <div className={`h-full w-full ${activeTab === 'PHONE' ? 'block' : 'hidden'}`}>
            <PhoneView glassPanel={glassPanel} />
          </div>

          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center font-mono text-zinc-500">
                Loading Module...
              </div>
            }
          >
            {activeTab === 'NOTES' && <NotesView glassPanel={glassPanel} />}
            {activeTab === 'GALLERY' && <GalleryView />}
            {activeTab === 'SETTINGS' && <SettingsView isSystemActive={isConnected} />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default IRIS
