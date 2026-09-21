import { useState, useEffect, useCallback, useRef } from 'react'
import { voiceService, VoiceStatus } from '../services/voiceService'

interface UseIrisVoiceOptions {
  onNavigate?: (
    tab: 'DASHBOARD' | 'YOUTUBE' | 'WORKSPACE' | 'MAPS' | 'NOTES' | 'GALLERY' | 'PHONE' | 'SETTINGS'
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('Standby')

  const optionsRef = useRef(options)
  optionsRef.current = options
  const lastSubmittedPromptRef = useRef<{ text: string; time: number }>({ text: '', time: 0 })

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
      onStatusChange: (status, message) => {
        setVoiceStatus(status)
        if (message) setStatusMessage(message)
      }
    })

    return () => {
      voiceService.stop()
    }
  }, [])

  const toggleConnection = useCallback(async () => {
    if (isConnected) {
      voiceService.stop()
      setIsConnected(false)
      setIsMuted(false)
      setIsSpeaking(false)
      setInterimTranscript('')
      setMicLevel(0)
      setVoiceStatus('idle')
      setStatusMessage('Voice interface offline.')
    } else {
      const success = await voiceService.start()
      if (success) {
        setIsConnected(true)
        setIsMuted(false)
      } else {
        setIsConnected(false)
      }
    }
  }, [isConnected])

  const toggleMute = useCallback(() => {
    if (!isConnected) return
    const nextMuted = !isMuted
    setIsMuted(nextMuted)
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
    voiceService.triggerVoiceInput(clean)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [])

  return {
    isConnected,
    isMuted,
    isSpeaking,
    isListening: isConnected && !isMuted && !isSpeaking,
    interimTranscript,
    lastFinalTranscript,
    micLevel,
    voiceStatus,
    statusMessage,
    toggleConnection,
    toggleMute,
    submitVoicePrompt,
    stopSpeaking
  }
}
