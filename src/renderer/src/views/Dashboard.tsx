import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Monitor,
  X,
  Volume2,
  AlertCircle,
  Radio,
  MessageSquare,
  Activity
} from 'lucide-react'
import RightPanel from '@renderer/components/UI/RightPanel'
import LeftPanels from '@renderer/components/UI/LeftPanels'
import AICore from '@renderer/components/UI/AICoreSphere'
import { LiveLocationCard } from '@renderer/components/UI/LiveLocationCard'
import { VoiceListeningWave } from '@renderer/components/UI/VoiceListeningWave'

interface DashboardProps {
  isConnected: boolean
  toggleConnection: () => void
  isSpeaking: boolean
  isMuted: boolean
  handleMicToggle: () => void
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
}

export default function Dashboard({
  isConnected,
  toggleConnection,
  isSpeaking,
  isMuted,
  handleMicToggle,
  visionMode: propVisionMode,
  setVisionMode: propSetVisionMode,
  isListening = false,
  interimTranscript = '',
  lastFinalTranscript = '',
  micLevel = 0,
  frequencyData = null,
  voiceStatus = 'idle',
  statusMessage = '',
  submitVoicePrompt,
  stopSpeaking
}: DashboardProps) {
  const [internalVisionMode, setInternalVisionMode] = useState<'off' | 'camera' | 'screen'>('off')
  const [showVisionMenu, setShowVisionMenu] = useState(false)
  const [mobileSection, setMobileSection] = useState<'core' | 'chat' | 'telemetry'>('core')

  const visionMode = propVisionMode !== undefined ? propVisionMode : internalVisionMode
  const setVisionMode = propSetVisionMode !== undefined ? propSetVisionMode : setInternalVisionMode

  const changeVisionMode = (mode: 'off' | 'camera' | 'screen') => {
    setVisionMode(mode)
    setShowVisionMenu(false)
  }

  return (
    <div className="h-full w-full bg-transparent flex flex-col relative selection:bg-[#00ff41]/30 min-h-0 flex-1 overflow-hidden">
      <div className="absolute top-[10%] left-[-5%] w-[40vw] h-[40vw] bg-[#00ff41] rounded-full mix-blend-screen blur-[180px] opacity-[0.03] pointer-events-none z-0"></div>
      <div className="absolute bottom-[10%] right-[-5%] w-[30vw] h-[30vw] bg-[#00ff41] rounded-full mix-blend-screen blur-[150px] opacity-[0.03] pointer-events-none z-0"></div>

      {/* Mobile Sub-Panel Switcher (< lg) */}
      <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-md border-b border-white/5 z-30 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-white/10 w-full justify-around relative">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setMobileSection('core')}
            className={`relative flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'core' ? 'text-[#00ff41]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {mobileSection === 'core' && (
              <motion.div
                layoutId="mobileActiveTab"
                className="absolute inset-0 bg-[#00ff41]/20 border border-[#00ff41]/30 rounded-lg shadow-[0_0_12px_rgba(0,255,65,0.2)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <Radio size={12} className="relative z-10" />
            <span className="relative z-10">AI CORE</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setMobileSection('chat')}
            className={`relative flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'chat' ? 'text-[#00ff41]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {mobileSection === 'chat' && (
              <motion.div
                layoutId="mobileActiveTab"
                className="absolute inset-0 bg-[#00ff41]/20 border border-[#00ff41]/30 rounded-lg shadow-[0_0_12px_rgba(0,255,65,0.2)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <MessageSquare size={12} className="relative z-10" />
            <span className="relative z-10">CHAT</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setMobileSection('telemetry')}
            className={`relative flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-colors cursor-pointer ${
              mobileSection === 'telemetry' ? 'text-[#00ff41]' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {mobileSection === 'telemetry' && (
              <motion.div
                layoutId="mobileActiveTab"
                className="absolute inset-0 bg-[#00ff41]/20 border border-[#00ff41]/30 rounded-lg shadow-[0_0_12px_rgba(0,255,65,0.2)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <Activity size={12} className="relative z-10" />
            <span className="relative z-10">SYSTEM</span>
          </motion.button>
        </div>
      </div>

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-6 p-2 sm:p-4 lg:p-6 relative z-10 h-full overflow-hidden">
        {/* Left Panels (Telemetry / Optics Feed / Live Location) */}
        <div
          className={`${
            mobileSection === 'telemetry' ? 'flex' : 'hidden'
          } lg:flex col-span-12 lg:col-span-3 flex-col gap-3 lg:gap-4 z-10 min-h-0 overflow-y-auto max-h-full pb-16 lg:pb-0 scrollbar-small`}
        >
          <LiveLocationCard />
          <LeftPanels status={isConnected ? 'ACTIVE' : 'STANDBY'} visionMode={visionMode} />
        </div>

        {/* Center Panel (AICore + Voice HUD + Control Capsule) */}
        <div
          className={`${
            mobileSection === 'core' ? 'flex' : 'hidden'
          } lg:flex col-span-12 lg:col-span-6 relative flex-col justify-end items-center pb-2 lg:pb-4 min-h-[460px] sm:min-h-[520px] lg:min-h-0 h-full flex-1 w-full`}
        >
          <AICore
            isConnected={isConnected}
            isSpeaking={isSpeaking}
            isListening={isListening}
            micLevel={micLevel}
            onClick={() => {
              toggleConnection()
            }}
          />

          {/* Spacer to push controls to bottom while keeping 3D Orb visible in center */}
          <div className="w-full flex-1 pointer-events-none min-h-[140px] sm:min-h-[200px]" />

          {/* Real-time Voice Listening Wave & Speech Recognition Feedback */}
          <div className="w-full max-w-xl mb-2 lg:mb-3 flex flex-col items-center gap-2 z-20 px-1 sm:px-0 relative pointer-events-auto">
            <VoiceListeningWave
              isConnected={isConnected}
              isListening={isListening}
              isSpeaking={isSpeaking}
              isMuted={isMuted}
              micLevel={micLevel}
              frequencyData={frequencyData}
              interimTranscript={interimTranscript}
              lastFinalTranscript={lastFinalTranscript}
              voiceStatus={voiceStatus}
              statusMessage={statusMessage}
              onToggleConnect={toggleConnection}
              onToggleMic={handleMicToggle}
              onStopSpeaking={stopSpeaking}
              onSubmitPrompt={submitVoicePrompt}
            />
          </div>

          {/* Control Capsule */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex items-center gap-1.5 sm:gap-2 bg-black/60 backdrop-blur-2xl border border-white/10 p-1 sm:p-1.5 rounded-4xl shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)] z-20 shrink-0"
          >
            <div className="relative flex items-center justify-center">
              <AnimatePresence>
                {showVisionMenu && isConnected && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                    className="absolute bottom-[calc(100%+12px)] flex flex-col gap-1 p-1.5 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,255,65,0.15)] z-50 origin-bottom min-w-35"
                  >
                    <div className="px-3 py-1.5 border-b border-white/5 mb-1">
                      <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
                        Optics Feed
                      </span>
                    </div>
                    <motion.button
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => changeVisionMode('camera')}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase cursor-pointer ${visionMode === 'camera' ? 'bg-[#00ff41]/15 text-[#00ff41]' : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-100'}`}
                    >
                      <Camera size={14} /> Lens
                    </motion.button>
                    <motion.button
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => changeVisionMode('screen')}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase cursor-pointer ${visionMode === 'screen' ? 'bg-cyan-500/15 text-cyan-400' : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-100'}`}
                    >
                      <Monitor size={14} /> Display
                    </motion.button>
                    <motion.button
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => changeVisionMode('off')}
                      className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase hover:bg-red-500/10 text-zinc-500 hover:text-red-400 cursor-pointer"
                    >
                      <X size={14} /> Offline
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => isConnected && setShowVisionMenu(!showVisionMenu)}
                disabled={!isConnected}
                className={`group cursor-pointer w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full transition-all duration-300 border ${
                  !isConnected
                    ? 'opacity-30 cursor-not-allowed bg-zinc-900 border-transparent text-zinc-600'
                    : visionMode === 'camera'
                      ? 'bg-[#00ff41]/10 text-[#00ff41] border-[#00ff41]/30 shadow-[0_0_20px_rgba(0,255,65,0.15)]'
                      : visionMode === 'screen'
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                        : 'bg-zinc-800/50 text-zinc-400 border-white/5 hover:border-white/20 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
                title={isConnected ? 'Optics feed switcher' : 'Connect first to enable vision'}
              >
                {visionMode === 'screen' ? (
                  <Monitor
                    size={16}
                    strokeWidth={1.5}
                    className="group-hover:scale-110 transition-transform sm:w-[18px] sm:h-[18px]"
                  />
                ) : (
                  <Camera
                    size={16}
                    strokeWidth={1.5}
                    className="group-hover:scale-110 transition-transform sm:w-[18px] sm:h-[18px]"
                  />
                )}
              </motion.button>
            </div>

            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={toggleConnection}
              className={`flex items-center gap-2 sm:gap-3 cursor-pointer pr-3.5 sm:pr-5 pl-1 sm:pl-1.5 py-1 sm:py-1.5 rounded-full border transition-all duration-300 ${
                isConnected
                  ? 'bg-zinc-900/50 border-[#00ff41]/20 hover:border-[#00ff41]/40 hover:bg-zinc-900/80 shadow-[inset_0_0_20px_rgba(0,255,65,0.05)]'
                  : 'bg-zinc-900/50 border-white/5 hover:border-white/20 hover:bg-zinc-900/80'
              }`}
              title={isConnected ? 'Disconnect IRIS' : 'Connect IRIS Voice Core'}
            >
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-lg ${
                  isConnected
                    ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:bg-red-400'
                    : 'bg-[#00ff41] text-black shadow-[0_0_20px_rgba(0,255,65,0.3)] hover:bg-[#33ff66] hover:shadow-[0_0_25px_rgba(0,255,65,0.5)]'
                }`}
              >
                {isConnected ? (
                  <PhoneOff size={16} strokeWidth={2.5} className="sm:w-[18px] sm:h-[18px]" />
                ) : (
                  <Phone size={16} strokeWidth={2.5} className="sm:w-[18px] sm:h-[18px]" />
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-widest text-zinc-300 uppercase">
                {isConnected ? 'Terminate' : 'Initialize'}
              </span>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                toggleConnection()
              }}
              className={`group w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full border transition-all duration-300 cursor-pointer ${
                !isConnected
                  ? 'bg-zinc-900/80 text-zinc-400 border-white/10 hover:border-[#00ff41]/40 hover:text-[#00ff41] hover:bg-zinc-900'
                  : 'bg-red-500/10 text-red-400 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:bg-red-500/20'
              }`}
              title={
                !isConnected
                  ? 'Click to start voice listening'
                  : 'Click to stop voice listening'
              }
            >
              {isConnected ? (
                <MicOff
                  size={16}
                  strokeWidth={1.5}
                  className="group-hover:scale-110 transition-transform sm:w-[18px] sm:h-[18px]"
                />
              ) : (
                <Mic
                  size={16}
                  strokeWidth={1.5}
                  className="group-hover:scale-110 transition-transform drop-shadow-[0_0_5px_rgba(0,255,65,0.5)] sm:w-[18px] sm:h-[18px]"
                />
              )}
            </motion.button>
          </motion.div>
        </div>

        {/* Right Panel (Conversation Chat) */}
        <div
          className={`${
            mobileSection === 'chat' ? 'flex' : 'hidden'
          } lg:flex col-span-12 lg:col-span-3 h-full flex-col z-10 min-h-0 w-full`}
        >
          <RightPanel
            interimTranscript={interimTranscript}
            isListening={isListening}
            micLevel={micLevel}
            onSendPrompt={submitVoicePrompt}
          />
        </div>
      </main>
    </div>
  )
}
