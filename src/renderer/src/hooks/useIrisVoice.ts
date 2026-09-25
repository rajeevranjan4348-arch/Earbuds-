import { useState, useEffect, useCallback, useRef } from 'react'
import { voiceService, VoiceStatus } from '../services/voiceService'
import { aiRealtimeVoice } from '../services/aiCoreMicrophoneBridge'
import { geminiLiveVoiceClient } from '../services/geminiLiveVoiceClient'

interface UseIrisVoiceOptions {
  onNavigate?: (
    tab:
      | 'DASHBOARD'
      | 'YOUTUBE'
      | 'WORKSPACE'
      | 'MAPS'
      | 'NOTES'
      | 'GALLERY'
      | 'PHONE'
      | 'SETTINGS'
      | 'SMOOTHNESS'
      | string
  ) => void
  onVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  onKnowledgeOpen?: (open: boolean) => void
}

export function useIrisVoice(options: UseIrisVoiceOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [lastFinalTranscript, setLastFinalTranscript] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('Standby')

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const lastSubmittedPromptRef = useRef<{ text: string; time: number }>({ text: '', time: 0 })
  const lastFreqUpdateRef = useRef<number>(0)

  useEffect(() => {
    // Connect audio level callback from AICoreMicrophoneBridge to micLevel
    ;(window as any).__IRIS_ON_AUDIO_LEVEL__ = (level: number) => {
      if (!isMuted) {
        setMicLevel(level)
      }
    }

    return () => {
      ;(window as any).__IRIS_ON_AUDIO_LEVEL__ = null
    }
  }, [isMuted])

  useEffect(() => {
    voiceService.setHandlers({
      onNavigate: (tab) => optionsRef.current.onNavigate?.(tab),
      onVisionMode: (mode) => optionsRef.current.onVisionMode?.(mode),
      onKnowledgeOpen: (open) => optionsRef.current.onKnowledgeOpen?.(open),
      onInterimTranscript: (text) => {
        setInterimTranscript(text)
      },
      onFinalTranscript: (text) => {
        setInterimTranscript('')
        setLastFinalTranscript(text)
      },
      onSpeakingChange: (speaking) => {
        setIsSpeaking(speaking)
      },
      onAudioLevel: (level) => {
        setMicLevel(level)
      },
      onFrequencyData: (data) => {
        const now = performance.now()
        if (now - lastFreqUpdateRef.current > 40) {
          lastFreqUpdateRef.current = now
          setFrequencyData(data)
        }
      },
      onStatusChange: (status, message) => {
        setVoiceStatus(status)
        if (message) setStatusMessage(message)
      }
    })

    const unsubLive = geminiLiveVoiceClient.subscribe((state, payload) => {
      if (state === 'speaking') {
        setIsSpeaking(true)
        setVoiceStatus('speaking')
        setStatusMessage('IRIS is speaking...')
      } else if (state === 'interrupted' || state === 'listening') {
        setIsSpeaking(false)
        setVoiceStatus('listening')
        setStatusMessage('IRIS is listening...')
      } else if (state === 'processing') {
        setVoiceStatus('processing')
        setStatusMessage('AI thinking...')
      }

      if (payload?.history && payload.history.length > 0) {
        const last = payload.history[payload.history.length - 1]
        if (last.role === 'user') {
          setInterimTranscript(last.text)
        } else if (last.role === 'assistant') {
          setLastFinalTranscript(last.text)
        }
      }
    })

    return () => {
      unsubLive()
      aiRealtimeVoice.stopAIListening()
      voiceService.stop()
    }
  }, [])

  const toggleConnection = useCallback(async () => {
    if (isConnected) {
      aiRealtimeVoice.stopAIListening()
      geminiLiveVoiceClient.stopPlayback()
      voiceService.setRunningState(false)
      setIsConnected(false)
      setIsMuted(false)
      setIsSpeaking(false)
      setInterimTranscript('')
      setMicLevel(0)
      setVoiceStatus('idle')
      setStatusMessage('Voice interface offline.')
    } else {
      setVoiceStatus('listening')
      setStatusMessage('Microphone active. IRIS is listening...')
      const success = await aiRealtimeVoice.startAIListening()
      if (success) {
        setIsConnected(true)
        setIsMuted(false)
        voiceService.setRunningState(true)
      } else {
        setIsConnected(false)
        setVoiceStatus('idle')
        setStatusMessage('Microphone access unavailable.')
      }
    }
  }, [isConnected])

  const toggleMute = useCallback(() => {
    if (!isConnected) return
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
    geminiLiveVoiceClient.setMuted(nextMuted)
    voiceService.setMuted(nextMuted)
  }, [isConnected, isMuted])

  const submitVoicePrompt = useCallback((promptText: string) => {
    const clean = promptText.trim()
    if (!clean) return
    const now = Date.now()
    if (
      clean.toLowerCase() === lastSubmittedPromptRef.current.text.toLowerCase() &&
      now - lastSubmittedPromptRef.current.time < 1000
    ) {
      return
    }
    lastSubmittedPromptRef.current = { text: clean, time: now }

    setLastFinalTranscript(clean)
    setInterimTranscript('')
    geminiLiveVoiceClient.sendTextTurn(clean)
    voiceService.triggerVoiceInput(clean, 'text')
  }, [])

  const stopSpeaking = useCallback(() => {
    geminiLiveVoiceClient.stopPlayback()
    voiceService.stopSpeaking()
    setIsSpeaking(false)
  }, [])

  return {
    isConnected,
    isMuted,
    isSpeaking,
    isListening: isConnected && !isMuted && !isSpeaking,
    interimTranscript,
    lastFinalTranscript,
    micLevel,
    frequencyData,
    voiceStatus,
    statusMessage,
    toggleConnection,
    toggleMute,
    submitVoicePrompt,
    stopSpeaking
  }
}
