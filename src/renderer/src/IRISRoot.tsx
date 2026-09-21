import { useState } from 'react'
import IRIS from './UI/IRIS'
import { useIrisVoice } from './hooks/useIrisVoice'

export type VisionMode = 'off' | 'camera' | 'screen'

export type ActiveTab =
  | 'DASHBOARD'
  | 'YOUTUBE'
  | 'WORKSPACE'
  | 'MAPS'
  | 'NOTES'
  | 'GALLERY'
  | 'PHONE'
  | 'SETTINGS'

const IndexRoot = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD')
  const [visionMode, setVisionMode] = useState<VisionMode>('off')
  const [isDocOverlayOpen, setIsDocOverlayOpen] = useState(false)

  const {
    isConnected,
    isMuted,
    isSpeaking,
    isListening,
    interimTranscript,
    lastFinalTranscript,
    micLevel,
    voiceStatus,
    statusMessage,
    toggleConnection,
    toggleMute,
    submitVoicePrompt
  } = useIrisVoice({
    onNavigate: (tab) => setActiveTab(tab as ActiveTab),
    onVisionMode: (mode) => setVisionMode(mode),
    onKnowledgeOpen: (open) => setIsDocOverlayOpen(open)
  })

  return (
    <div className="flex h-screen w-screen bg-black overflow-hidden relative select-none">
      <main className="w-full h-full min-w-0 overflow-hidden relative">
        <IRIS
          isConnected={isConnected}
          toggleConnection={toggleConnection}
          isSpeaking={isSpeaking}
          isMuted={isMuted}
          handleMicToggle={toggleMute}
          activeTab={activeTab}
          setActiveTab={setActiveTab as any}
          visionMode={visionMode}
          setVisionMode={setVisionMode}
          isListening={isListening}
          interimTranscript={interimTranscript}
          lastFinalTranscript={lastFinalTranscript}
          micLevel={micLevel}
          voiceStatus={voiceStatus}
          statusMessage={statusMessage}
          submitVoicePrompt={submitVoicePrompt}
          isDocOverlayOpen={isDocOverlayOpen}
          setIsDocOverlayOpen={setIsDocOverlayOpen}
        />
      </main>
    </div>
  )
}

export default IndexRoot
