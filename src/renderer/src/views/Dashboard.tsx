import { useState } from 'react'
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
  voiceStatus?: string
  statusMessage?: string
  submitVoicePrompt?: (text: string) => void
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
  voiceStatus = 'idle',
  statusMessage = '',
  submitVoicePrompt
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

  const quickVoicePrompts = [
    { label: 'System Stats', prompt: 'System telemetry status' },
    { label: 'Open Notes', prompt: 'Open notes' },
    { label: 'Take Note', prompt: 'Take note: Review system telemetry today' },
    { label: 'Turn on Lens', prompt: 'Turn on camera' },
    { label: 'What is IRIS?', prompt: 'What is IRIS and what can you do?' }
  ]

  return (
    <div className="h-full w-full bg-transparent flex flex-col relative selection:bg-[#00ff41]/30 overflow-hidden">
      <div className="absolute top-[10%] left-[-5%] w-[40vw] h-[40vw] bg-[#00ff41] rounded-full mix-blend-screen blur-[180px] opacity-[0.03] pointer-events-none z-0"></div>
      <div className="absolute bottom-[10%] right-[-5%] w-[30vw] h-[30vw] bg-[#00ff41] rounded-full mix-blend-screen blur-[150px] opacity-[0.03] pointer-events-none z-0"></div>

      {/* Mobile Sub-Panel Switcher (< lg) */}
      <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-md border-b border-white/5 z-30 shrink-0">
        <div className="flex items-center gap-1 bg-zinc-950/80 p-1 rounded-xl border border-white/10 w-full justify-around">
          <button
            onClick={() => setMobileSection('core')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer ${
              mobileSection === 'core'
                ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 shadow-[0_0_12px_rgba(0,255,65,0.2)]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Radio size={12} />
            <span>AI CORE</span>
          </button>
          <button
            onClick={() => setMobileSection('chat')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer ${
              mobileSection === 'chat'
                ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 shadow-[0_0_12px_rgba(0,255,65,0.2)]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MessageSquare size={12} />
            <span>CHAT</span>
          </button>
          <button
            onClick={() => setMobileSection('telemetry')}
            className={`flex items-center justify-center gap-1.5 flex-1 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer ${
              mobileSection === 'telemetry'
                ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/30 shadow-[0_0_12px_rgba(0,255,65,0.2)]'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Activity size={12} />
            <span>SYSTEM</span>
          </button>
        </div>
      </div>

      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-6 p-2.5 sm:p-4 lg:p-6 relative z-10 overflow-hidden">
        {/* Left Panels (Telemetry / Optics Feed) */}
        <div
          className={`${
            mobileSection === 'telemetry' ? 'flex' : 'hidden'
          } lg:flex col-span-12 lg:col-span-3 flex-col gap-4 lg:gap-6 z-10 min-h-0 overflow-y-auto max-h-full pb-16 lg:pb-0 scrollbar-small`}
        >
          <LeftPanels status={isConnected ? 'ACTIVE' : 'STANDBY'} visionMode={visionMode} />
        </div>

        {/* Center Panel (AICore + Voice HUD + Control Capsule) */}
        <div
          className={`${
            mobileSection === 'core' ? 'flex' : 'hidden'
          } lg:flex col-span-12 lg:col-span-6 relative flex-col justify-end items-center pb-3 lg:pb-6 min-h-0 h-full`}
        >
          <AICore isConnected={isConnected} isSpeaking={isSpeaking} />

          {/* Real-time Voice HUD & Speech Recognition Feedback */}
          <div className="w-full max-w-lg mb-2.5 lg:mb-3 flex flex-col items-center gap-2 z-20 px-2 sm:px-0">
            {voiceStatus === 'denied' && (
              <div className="w-full px-3 py-2 bg-red-950/80 border border-red-500/30 rounded-xl flex items-center gap-2 text-[11px] text-red-200 backdrop-blur-md animate-in fade-in">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>Microphone access was denied. Please allow microphone permissions in your browser.</span>
              </div>
            )}

            {isConnected && (
              <div className="w-full px-3 sm:px-4 py-2 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col gap-1.5 shadow-2xl">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center gap-2">
                    {isSpeaking ? (
                      <span className="flex items-center gap-1 text-cyan-400 font-bold tracking-wider">
                        <Volume2 size={12} className="animate-pulse" /> IRIS SYNTHESIS
                      </span>
                    ) : isMuted ? (
                      <span className="flex items-center gap-1 text-red-400 font-bold tracking-wider">
                        <MicOff size={12} /> MIC MUTED
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-[#00ff41] font-bold tracking-wider">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff41] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff41]"></span>
                        </span>
                        VOICE-TO-TEXT ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Equalizer Audio Level Indicator */}
                  {!isMuted && isConnected && (
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-[9px] mr-1">INPUT</span>
                      <div className="flex items-end gap-0.5 h-3">
                        {[0.5, 1.2, 0.8, 1.5, 0.9, 1.1].map((scale, i) => {
                          const h = isSpeaking ? 8 : Math.max(3, Math.min(14, micLevel * 20 * scale))
                          return (
                            <span
                              key={i}
                              className={`w-0.5 rounded-full transition-all duration-75 ${
                                isSpeaking ? 'bg-cyan-400' : 'bg-[#00ff41]'
                              }`}
                              style={{ height: `${h}px` }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Speech Recognition Transcript Text */}
                <div className="text-xs min-h-[20px] flex items-center text-zinc-300">
                  {interimTranscript ? (
                    <span className="text-[#00ff41] font-mono flex items-center gap-1.5 break-all">
                      <span className="text-zinc-500">&gt;</span>
                      <span>"{interimTranscript}"</span>
                      <span className="inline-block w-1.5 h-3 bg-[#00ff41] animate-pulse" />
                    </span>
                  ) : lastFinalTranscript && !isSpeaking ? (
                    <span className="text-zinc-400 font-mono text-[11px] truncate">
                      <span className="text-zinc-600">&gt; Last query:</span> "{lastFinalTranscript}"
                    </span>
                  ) : isSpeaking ? (
                    <span className="text-cyan-300 font-mono text-[11px] italic">
                      Transmitting verbal neural telemetry...
                    </span>
                  ) : isMuted ? (
                    <span className="text-zinc-500 text-[11px]">Microphone muted. Click the mic button to speak.</span>
                  ) : (
                    <span className="text-zinc-500 text-[11px] italic truncate">
                      {statusMessage || 'Speak now — IRIS is listening for your command or question...'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Voice Command Chips */}
            {isConnected && (
              <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-md">
                {quickVoicePrompts.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => submitVoicePrompt?.(item.prompt)}
                    className="cursor-pointer px-2.5 py-1 rounded-full bg-zinc-900/60 hover:bg-[#00ff41]/10 border border-white/5 hover:border-[#00ff41]/30 text-zinc-400 hover:text-[#00ff41] text-[10px] font-mono transition-all duration-200"
                    title={`Speak: "${item.prompt}"`}
                  >
                    🎤 {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Control Capsule */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/60 backdrop-blur-2xl border border-white/10 p-1 sm:p-1.5 rounded-4xl shadow-[0_20px_50px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)] z-20">
            <div className="relative flex items-center justify-center">
              {showVisionMenu && isConnected && (
                <div className="absolute bottom-[calc(100%+12px)] flex flex-col gap-1 p-1.5 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,255,65,0.15)] z-50 origin-bottom animate-in fade-in zoom-in-95 duration-200 min-w-35">
                  <div className="px-3 py-1.5 border-b border-white/5 mb-1">
                    <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase">
                      Optics Feed
                    </span>
                  </div>
                  <button
                    onClick={() => changeVisionMode('camera')}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase cursor-pointer ${visionMode === 'camera' ? 'bg-[#00ff41]/15 text-[#00ff41]' : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-100'}`}
                  >
                    <Camera size={14} /> Lens
                  </button>
                  <button
                    onClick={() => changeVisionMode('screen')}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase cursor-pointer ${visionMode === 'screen' ? 'bg-cyan-500/15 text-cyan-400' : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-100'}`}
                  >
                    <Monitor size={14} /> Display
                  </button>
                  <button
                    onClick={() => changeVisionMode('off')}
                    className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-xl transition-all font-mono text-[10px] tracking-widest uppercase hover:bg-red-500/10 text-zinc-500 hover:text-red-400 cursor-pointer"
                  >
                    <X size={14} /> Offline
                  </button>
                </div>
              )}

              <button
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
              </button>
            </div>

            <div
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
            </div>

            <button
              onClick={handleMicToggle}
              disabled={!isConnected}
              className={`group w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full border transition-all duration-300 cursor-pointer ${
                !isConnected
                  ? 'opacity-30 cursor-not-allowed bg-zinc-900 border-transparent text-zinc-600'
                  : isMuted
                    ? 'bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:bg-red-500/20'
                    : 'bg-zinc-800/50 text-[#00ff41] border-[#00ff41]/20 shadow-[0_0_15px_rgba(0,255,65,0.1)] hover:border-[#00ff41]/40 hover:bg-zinc-800'
              }`}
              title={!isConnected ? 'Connect to enable microphone' : isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? (
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
            </button>
          </div>
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
            onSendPrompt={submitVoicePrompt}
          />
        </div>
      </main>
    </div>
  )
}
