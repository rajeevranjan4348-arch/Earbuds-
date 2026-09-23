import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import IRIS from './UI/IRIS'
import { useIrisVoice } from './hooks/useIrisVoice'
import { shortcutService, ShortcutConfig, formatKeyCombo } from './services/shortcutService'
import { gestureRecognitionService } from './services/gestureRecognitionService'
import { soundEffects } from './services/soundEffectsService'
import { LauncherModal, launchManager } from './launcher'
import { VoiceChatModal } from './components/Voice/VoiceChatModal'
import { Zap } from 'lucide-react'

export type VisionMode = 'off' | 'camera' | 'screen'

export type ActiveTab =
  | 'DASHBOARD'
  | 'CHAT'
  | 'YOUTUBE'
  | 'WORKSPACE'
  | 'MAPS'
  | 'NOTES'
  | 'GALLERY'
  | 'PHONE'
  | 'SETTINGS'

const TAB_ORDER: ActiveTab[] = [
  'DASHBOARD',
  'CHAT',
  'YOUTUBE',
  'WORKSPACE',
  'MAPS',
  'NOTES',
  'GALLERY',
  'PHONE',
  'SETTINGS'
]

const IndexRoot = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('DASHBOARD')
  const [visionMode, setVisionMode] = useState<VisionMode>('off')
  const [isDocOverlayOpen, setIsDocOverlayOpen] = useState(false)
  const [isCoreUiMinimal, setIsCoreUiMinimal] = useState(false)
  const [isVoiceChatModalOpen, setIsVoiceChatModalOpen] = useState(false)

  // Live shortcut toast banner
  const [toast, setToast] = useState<{ shortcut: ShortcutConfig; timestamp: number } | null>(null)

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
    submitVoicePrompt,
    stopSpeaking
  } = useIrisVoice({
    onNavigate: (tab) => setActiveTab(tab as ActiveTab),
    onVisionMode: (mode) => setVisionMode(mode),
    onKnowledgeOpen: (open) => setIsDocOverlayOpen(open)
  })

  // Initialize Global Web Audio Auditory Feedback
  useEffect(() => {
    soundEffects.initGlobalListeners()
  }, [])

  // Hook up LaunchManager navigation callback
  useEffect(() => {
    launchManager.setNavigateCallback((tab) => {
      setActiveTab(tab as ActiveTab)
    })

    const handleNavEvent = (e: any) => {
      if (e.detail?.tab) {
        setActiveTab(e.detail.tab as ActiveTab)
      }
    }
    const handleVisionEvent = (e: any) => {
      if (e.detail?.mode) {
        setVisionMode(e.detail.mode as VisionMode)
      }
    }

    window.addEventListener('iris:navigate', handleNavEvent)
    window.addEventListener('iris:vision-mode', handleVisionEvent)

    const handleOpenVoice = () => setIsVoiceChatModalOpen(true)
    const handleCloseVoice = () => setIsVoiceChatModalOpen(false)
    const handleToggleVoice = () => setIsVoiceChatModalOpen((prev) => !prev)

    window.addEventListener('iris:open-voice-modal', handleOpenVoice)
    window.addEventListener('iris:close-voice-modal', handleCloseVoice)
    window.addEventListener('iris:toggle-voice-modal', handleToggleVoice)

    return () => {
      window.removeEventListener('iris:navigate', handleNavEvent)
      window.removeEventListener('iris:vision-mode', handleVisionEvent)
      window.removeEventListener('iris:open-voice-modal', handleOpenVoice)
      window.removeEventListener('iris:close-voice-modal', handleCloseVoice)
      window.removeEventListener('iris:toggle-voice-modal', handleToggleVoice)
    }
  }, [])

  // Register all system shortcut action handlers
  useEffect(() => {
    const unregVoice = shortcutService.registerActionHandler('TRIGGER_VOICE', () => {
      if (isSpeaking) {
        stopSpeaking()
      }
      if (!isConnected) {
        soundEffects.play('activate')
        toggleConnection()
      } else {
        soundEffects.play('toggle')
        toggleMute()
      }
    })

    const unregCoreUI = shortcutService.registerActionHandler('TOGGLE_CORE_UI', () => {
      setIsCoreUiMinimal((prev) => !prev)
    })

    const unregLauncher = shortcutService.registerActionHandler('OPEN_LAUNCHER', () => {
      window.dispatchEvent(new CustomEvent('iris:toggle-launcher'))
    })

    const unregMute = shortcutService.registerActionHandler('TOGGLE_MUTE', () => {
      toggleMute()
    })

    const unregStopSpeech = shortcutService.registerActionHandler('STOP_SPEECH', () => {
      stopSpeaking()
    })

    const unregVision = shortcutService.registerActionHandler('TOGGLE_VISION', () => {
      setVisionMode((prev) => (prev === 'off' ? 'camera' : prev === 'camera' ? 'screen' : 'off'))
    })

    const unregKnowledge = shortcutService.registerActionHandler('TOGGLE_KNOWLEDGE', () => {
      setIsDocOverlayOpen((prev) => !prev)
    })

    const unregSettings = shortcutService.registerActionHandler('OPEN_SETTINGS', () => {
      setActiveTab('SETTINGS')
    })

    // Listen for shortcut HUD notifications
    const unsubToast = shortcutService.subscribeToast((item) => {
      setToast({ shortcut: item, timestamp: Date.now() })
    })

    // Register Hands-Free Camera Gesture Actions
    const unregGestNext = gestureRecognitionService.registerActionHandler('NEXT_TAB', () => {
      setActiveTab((curr) => {
        const idx = TAB_ORDER.indexOf(curr)
        const nextIdx = (idx + 1) % TAB_ORDER.length
        return TAB_ORDER[nextIdx]
      })
    })

    const unregGestPrev = gestureRecognitionService.registerActionHandler('PREV_TAB', () => {
      setActiveTab((curr) => {
        const idx = TAB_ORDER.indexOf(curr)
        const prevIdx = (idx - 1 + TAB_ORDER.length) % TAB_ORDER.length
        return TAB_ORDER[prevIdx]
      })
    })

    const unregGestScrollUp = gestureRecognitionService.registerActionHandler('SCROLL_UP', () => {
      const scrollTarget = document.querySelector('main') || window
      scrollTarget.scrollBy({ top: -350, behavior: 'smooth' })
    })

    const unregGestScrollDown = gestureRecognitionService.registerActionHandler('SCROLL_DOWN', () => {
      const scrollTarget = document.querySelector('main') || window
      scrollTarget.scrollBy({ top: 350, behavior: 'smooth' })
    })

    const unregGestQuick = gestureRecognitionService.registerActionHandler('TOGGLE_QUICK_ACTIONS', () => {
      shortcutService.triggerAction('TOGGLE_QUICK_MENU')
    })

    const unregGestHalt = gestureRecognitionService.registerActionHandler('STOP_SPEECH_OR_MUTE', () => {
      if (isSpeaking) {
        stopSpeaking()
      } else {
        toggleMute()
      }
      setIsDocOverlayOpen(false)
    })

    const unregGestMinHud = gestureRecognitionService.registerActionHandler('TOGGLE_MINIMAL_HUD', () => {
      setIsCoreUiMinimal((prev) => !prev)
    })

    const unregGestDash = gestureRecognitionService.registerActionHandler('NAV_DASHBOARD', () => {
      setActiveTab('DASHBOARD')
    })

    const unregGestMic = gestureRecognitionService.registerActionHandler('TOGGLE_MIC', () => {
      if (isSpeaking) {
        stopSpeaking()
      }
      if (!isConnected) {
        toggleConnection()
      } else {
        toggleMute()
      }
    })

    const unregGestDocs = gestureRecognitionService.registerActionHandler('TOGGLE_KNOWLEDGE_OVERLAY', () => {
      setIsDocOverlayOpen((prev) => !prev)
    })

    return () => {
      unregVoice()
      unregCoreUI()
      unregLauncher()
      unregMute()
      unregStopSpeech()
      unregVision()
      unregKnowledge()
      unregSettings()
      unsubToast()
      unregGestNext()
      unregGestPrev()
      unregGestScrollUp()
      unregGestScrollDown()
      unregGestQuick()
      unregGestHalt()
      unregGestMinHud()
      unregGestDash()
      unregGestMic()
      unregGestDocs()
    }
  }, [isConnected, isSpeaking, toggleConnection, toggleMute, stopSpeaking])

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
          stopSpeaking={stopSpeaking}
          isDocOverlayOpen={isDocOverlayOpen}
          setIsDocOverlayOpen={setIsDocOverlayOpen}
          isCoreUiMinimal={isCoreUiMinimal}
          setIsCoreUiMinimal={setIsCoreUiMinimal}
        />

        {/* Floating HUD Shortcut Trigger Banner Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.timestamp}
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-zinc-950/90 border border-emerald-500/40 shadow-2xl backdrop-blur-xl"
            >
              <div className="w-5 h-5 rounded-md bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Zap size={12} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-200">
                  {toast.shortcut.name}
                </span>
                <div className="flex items-center gap-1">
                  {formatKeyCombo(toast.shortcut).map((k, i) => (
                    <kbd
                      key={i}
                      className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[10px] font-mono text-emerald-300 font-bold"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Universal AI App Launcher & Interactive Command Palette Modal */}
        <LauncherModal
          currentTab={activeTab}
          onNavigate={(tab) => setActiveTab(tab as ActiveTab)}
        />

        {/* Dedicated Real-Time Voice Chat Modal (ChatGPT / JARVIS Style) */}
        <VoiceChatModal
          isOpen={isVoiceChatModalOpen}
          onClose={() => setIsVoiceChatModalOpen(false)}
        />
      </main>
    </div>
  )
}

export default IndexRoot
