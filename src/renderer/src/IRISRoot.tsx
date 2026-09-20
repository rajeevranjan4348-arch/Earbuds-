import { useState } from 'react'
import IRIS from './UI/IRIS'
import { useIrisVoice } from './hooks/useIrisVoice'

export type VisionMode = 'off' | 'camera' | 'screen'

const IndexRoot = () => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'NOTES' | 'GALLERY' | 'PHONE' | 'SETTINGS'>('DASHBOARD')
  const [visionMode, setVisionMode] = useState<VisionMode>('off')

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
    onNavigate: (tab) => setActiveTab(tab),
    onVisionMode: (mode) => setVisionMode(mode)
  })

  return (
    <div className="flex flex-col h-screen w-screen bg-black overflow-hidden relative">
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
      />
    </div>
  )
}

export default IndexRoot
