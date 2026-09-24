import { useState, useEffect, useCallback } from 'react'
import { wakeWordService, WakeWordConfig, WakeWordEventDetail } from '../services/wakeWordService'

export function useWakeWord() {
  const [config, setConfig] = useState<WakeWordConfig>(() => wakeWordService.getConfig())
  const [isListening, setIsListening] = useState<boolean>(false)
  const [lastEvent, setLastEvent] = useState<WakeWordEventDetail | null>(null)

  useEffect(() => {
    const unsubState = wakeWordService.subscribeState((active, currentConfig) => {
      setIsListening(active)
      setConfig(currentConfig)
    })

    const unsubEvents = wakeWordService.subscribe((event) => {
      setLastEvent(event)
    })

    return () => {
      unsubState()
      unsubEvents()
    }
  }, [])

  const setEnabled = useCallback((enabled: boolean) => {
    wakeWordService.updateConfig({ enabled })
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

  const toggleListening = useCallback(() => {
    if (isListening) {
      wakeWordService.stop()
    } else {
      wakeWordService.start()
    }
  }, [isListening])

  return {
    config,
    isListening,
    lastEvent,
    setEnabled,
    setSensitivity,
    setSoundFeedback,
    setAutoExecute,
    toggleListening,
    playTestChime: () => wakeWordService.playWakeChime()
  }
}

export default useWakeWord
