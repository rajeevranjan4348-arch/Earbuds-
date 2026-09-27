import { useState, useEffect, useCallback } from 'react'
import {
  wakeWordService,
  WakeWordConfig,
  WakeWordEventDetail,
  WakeWordLogEntry,
  WakeWordFrequencyStats
} from '../services/wakeWordService'

export interface WakeWordManagerReturn {
  config: WakeWordConfig
  enabled: boolean
  isListening: boolean
  isSupported: boolean
  lastEvent: WakeWordEventDetail | null
  customWakeWord: string
  wakePhrases: string[]
  logHistory: WakeWordLogEntry[]
  frequencyStats: WakeWordFrequencyStats
  setEnabled: (enabled: boolean) => void
  setCustomWakeWord: (word: string) => void
  addWakePhrase: (phrase: string) => void
  removeWakePhrase: (phrase: string) => void
  setSensitivity: (sensitivity: number) => void
  setSoundFeedback: (enabled: boolean) => void
  setAutoExecute: (autoExecuteCommand: boolean) => void
  startListening: () => boolean
  stopListening: () => void
  toggleListening: () => void
  clearLogs: () => void
  playTestChime: () => void
}

export function useWakeWordManager(): WakeWordManagerReturn {
  const [config, setConfig] = useState<WakeWordConfig>(() => wakeWordService.getConfig())
  const [isListening, setIsListening] = useState<boolean>(false)
  const [lastEvent, setLastEvent] = useState<WakeWordEventDetail | null>(null)
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [logHistory, setLogHistory] = useState<WakeWordLogEntry[]>(() => wakeWordService.getLogHistory())
  const [frequencyStats, setFrequencyStats] = useState<WakeWordFrequencyStats>(() =>
    wakeWordService.getFrequencyStats()
  )

  const refreshLogs = useCallback(() => {
    setLogHistory(wakeWordService.getLogHistory())
    setFrequencyStats(wakeWordService.getFrequencyStats())
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setIsSupported(Boolean(SpeechRec))
    }

    const unsubState = wakeWordService.subscribeState((active, currentConfig) => {
      setIsListening(active)
      setConfig(currentConfig)
      refreshLogs()
    })

    const unsubEvents = wakeWordService.subscribe((event) => {
      setLastEvent(event)
      refreshLogs()
    })

    return () => {
      unsubState()
      unsubEvents()
    }
  }, [refreshLogs])

  const setEnabled = useCallback((enabled: boolean) => {
    wakeWordService.updateConfig({ enabled })
  }, [])

  const setCustomWakeWord = useCallback((word: string) => {
    const trimmed = word.trim()
    if (!trimmed) return
    const currentPhrases = wakeWordService.getConfig().wakePhrases || []
    // Put custom word as primary phrase
    const nextPhrases = [trimmed, ...currentPhrases.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())]
    wakeWordService.updateConfig({ wakePhrases: nextPhrases })
  }, [])

  const addWakePhrase = useCallback((phrase: string) => {
    const trimmed = phrase.trim()
    if (!trimmed) return
    const currentPhrases = wakeWordService.getConfig().wakePhrases || []
    if (currentPhrases.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return
    wakeWordService.updateConfig({ wakePhrases: [...currentPhrases, trimmed] })
  }, [])

  const removeWakePhrase = useCallback((phraseToRemove: string) => {
    const currentPhrases = wakeWordService.getConfig().wakePhrases || []
    const nextPhrases = currentPhrases.filter((p) => p.toLowerCase() !== phraseToRemove.toLowerCase())
    wakeWordService.updateConfig({ wakePhrases: nextPhrases.length > 0 ? nextPhrases : ['iris'] })
  }, [])

  const setSensitivity = useCallback((sensitivity: number) => {
    wakeWordService.updateConfig({ sensitivity })
  }, [])

  const setSoundFeedback = useCallback((soundFeedback: boolean) => {
    wakeWordService.updateConfig({ soundFeedback })
  }, [])

  const setAutoExecute = useCallback((autoExecuteCommand: boolean) => {
    wakeWordService.updateConfig({ autoExecuteCommand })
  }, [])

  const startListening = useCallback(() => {
    return wakeWordService.start()
  }, [])

  const stopListening = useCallback(() => {
    wakeWordService.stop()
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      wakeWordService.stop()
    } else {
      wakeWordService.start()
    }
  }, [isListening])

  const clearLogs = useCallback(() => {
    wakeWordService.clearLogHistory()
    refreshLogs()
  }, [refreshLogs])

  const primaryWakeWord = config.wakePhrases?.[0] || 'Iris'

  return {
    config,
    enabled: config.enabled,
    isListening,
    isSupported,
    lastEvent,
    customWakeWord: primaryWakeWord,
    wakePhrases: config.wakePhrases || ['iris'],
    logHistory,
    frequencyStats,
    setEnabled,
    setCustomWakeWord,
    addWakePhrase,
    removeWakePhrase,
    setSensitivity,
    setSoundFeedback,
    setAutoExecute,
    startListening,
    stopListening,
    toggleListening,
    clearLogs,
    playTestChime: () => wakeWordService.playWakeChime()
  }
}

export default useWakeWordManager
