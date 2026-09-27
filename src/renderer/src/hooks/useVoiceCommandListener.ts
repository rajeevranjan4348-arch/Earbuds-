/**
 * IRIS Voice Command Listener Hook
 * (src/renderer/src/hooks/useVoiceCommandListener.ts)
 * 
 * Custom React hook that integrates directly with the Microphone API (getUserMedia / AudioContext)
 * and Speech-to-Text recognition to capture live vocal input, process natural language commands,
 * and trigger application navigation or system actions.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { voiceCommandProcessor, CommandProcessResult } from '../services/voiceCommandProcessor'
import { SpeechRecognitionManager } from '../services/voice/SpeechRecognitionManager'
import { microphoneManager } from '../services/voice/MicrophoneManager'
import { voiceService } from '../services/voiceService'
import { soundEffects } from '../services/soundEffectsService'
import { SupportedLanguage } from '../services/voice/VoiceTypes'

export type ListenerStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface CustomVoiceCommandRule {
  /** Regex pattern or substring to match in speech transcript */
  match: string | RegExp
  /** Description of command action */
  description?: string
  /** Handler to invoke when rule matches */
  handler: (transcript: string, matchResult?: RegExpMatchArray | null) => void | boolean | Promise<void | boolean>
}

export interface UseVoiceCommandListenerOptions {
  /** Wake word prefix filter (e.g., "iris", "hey iris") */
  wakeWord?: string
  /** Require wake word prefix before processing commands */
  requireWakeWord?: boolean
  /** Auto-start listening on component mount */
  autoStart?: boolean
  /** Language configuration for STT */
  language?: SupportedLanguage
  /** Speak TTS voice response after command execution */
  speakFeedback?: boolean
  /** Play audio feedback chimes on start and command execution */
  enableSoundEffects?: boolean
  /** Custom navigation callback (overrides window event if returned true) */
  onNavigate?: (tab: string) => void
  /** Custom system action callback */
  onSystemAction?: (action: string, payload?: any) => void
  /** Fired on every speech transcript update (interim or final) */
  onTranscript?: (text: string, isFinal: boolean) => void
  /** Fired when a command is executed successfully */
  onCommandExecuted?: (result: CommandProcessResult) => void
  /** Custom application-specific voice command rules */
  customCommands?: CustomVoiceCommandRule[]
}

export interface UseVoiceCommandListenerReturn {
  /** Current state of the voice command listener */
  status: ListenerStatus
  /** True if microphone is active and listening */
  isListening: boolean
  /** Microphone permission status from browser query */
  permissionState: MicPermissionState
  /** Live audio volume metric (0 to 100) */
  audioLevel: number
  /** Live interim speech transcript */
  interimTranscript: string
  /** Last processed final speech transcript */
  finalTranscript: string
  /** Error message if microphone or STT failed */
  errorMessage: string | null
  /** History of executed commands in this session */
  executedCommands: CommandProcessResult[]
  /** Most recently executed command result */
  lastCommand: CommandProcessResult | null
  /** Starts hardware microphone and speech-to-text listener */
  startListening: () => Promise<boolean>
  /** Stops microphone and speech listener */
  stopListening: () => void
  /** Toggles active microphone listening state */
  toggleListening: () => Promise<void>
  /** Manually processes a text string as a voice command */
  processCommand: (commandText: string) => Promise<CommandProcessResult>
  /** Clears current transcript and error states */
  clearTranscript: () => void
}

export function useVoiceCommandListener(
  options: UseVoiceCommandListenerOptions = {}
): UseVoiceCommandListenerReturn {
  const {
    wakeWord = 'iris',
    requireWakeWord = false,
    autoStart = false,
    language = 'auto',
    speakFeedback = true,
    enableSoundEffects = true
  } = options

  // State
  const [status, setStatus] = useState<ListenerStatus>('idle')
  const [permissionState, setPermissionState] = useState<MicPermissionState>('prompt')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [interimTranscript, setInterimTranscript] = useState<string>('')
  const [finalTranscript, setFinalTranscript] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [executedCommands, setExecutedCommands] = useState<CommandProcessResult[]>([])
  const [lastCommand, setLastCommand] = useState<CommandProcessResult | null>(null)

  // Refs for callbacks & instances
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const sttManagerRef = useRef<SpeechRecognitionManager | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef<boolean>(true)

  // Query hardware microphone permissions
  useEffect(() => {
    isMountedRef.current = true

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setPermissionState('unsupported')
      return
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (isMountedRef.current) {
            setPermissionState(status.state as MicPermissionState)
          }
          status.onchange = () => {
            if (isMountedRef.current) {
              setPermissionState(status.state as MicPermissionState)
            }
          }
        })
        .catch(() => {
          // Fallback if query fails
        })
    }

    // Subscribe to hardware audio volume level metrics
    const unsubscribeMicMetrics = microphoneManager.onMetrics((m) => {
      if (isMountedRef.current) {
        setAudioLevel(Math.round(m.normalizedLevel * 100))
      }
    })

    return () => {
      isMountedRef.current = false
      unsubscribeMicMetrics()
    }
  }, [])

  // Navigation dispatcher helper
  const handleNavigation = useCallback((tab: string) => {
    if (optionsRef.current.onNavigate) {
      optionsRef.current.onNavigate(tab)
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab } }))
    }
  }, [])

  // Process raw voice transcript text into system actions or navigation
  const processCommand = useCallback(
    async (commandText: string): Promise<CommandProcessResult> => {
      if (!commandText || !commandText.trim()) {
        const emptyResult: CommandProcessResult = {
          handled: false,
          intent: 'CONVERSATIONAL',
          spokenResponse: ''
        }
        return emptyResult
      }

      const cleanText = commandText.trim()
      setStatus('processing')
      setErrorMessage(null)

      // Check Wake Word requirement if enabled
      let targetText = cleanText
      if (requireWakeWord && wakeWord) {
        const lower = cleanText.toLowerCase()
        const wakeLower = wakeWord.toLowerCase()
        if (!lower.includes(wakeLower)) {
          setStatus('idle')
          return {
            handled: false,
            intent: 'CONVERSATIONAL',
            spokenResponse: `Command ignored. Please say '${wakeWord}' first.`
          }
        }
        // Strip wake word from command payload
        const regex = new RegExp(`^${wakeLower}\\s*`, 'i')
        targetText = cleanText.replace(regex, '').trim() || cleanText
      }

      // 1. Check custom commands array
      const customRules = optionsRef.current.customCommands || []
      for (const rule of customRules) {
        if (typeof rule.match === 'string') {
          if (targetText.toLowerCase().includes(rule.match.toLowerCase())) {
            const res = await rule.handler(targetText, null)
            if (res !== false) {
              if (enableSoundEffects) soundEffects.play('pop')
              const customResult: CommandProcessResult = {
                handled: true,
                intent: 'APP_CONTROL',
                spokenResponse: `Executed custom command: ${rule.description || rule.match}`,
                actionExecuted: String(rule.match)
              }
              setLastCommand(customResult)
              setExecutedCommands((prev) => [customResult, ...prev.slice(0, 49)])
              optionsRef.current.onCommandExecuted?.(customResult)
              setStatus('idle')
              return customResult
            }
          }
        } else if (rule.match instanceof RegExp) {
          const matchResult = targetText.match(rule.match)
          if (matchResult) {
            const res = await rule.handler(targetText, matchResult)
            if (res !== false) {
              if (enableSoundEffects) soundEffects.play('pop')
              const customResult: CommandProcessResult = {
                handled: true,
                intent: 'APP_CONTROL',
                spokenResponse: `Executed custom command: ${rule.description || rule.match.source}`,
                actionExecuted: rule.match.source
              }
              setLastCommand(customResult)
              setExecutedCommands((prev) => [customResult, ...prev.slice(0, 49)])
              optionsRef.current.onCommandExecuted?.(customResult)
              setStatus('idle')
              return customResult
            }
          }
        }
      }

      // 2. Delegate to IRIS Voice Command Processor service
      try {
        const result = await voiceCommandProcessor.process(targetText, {
          navigate: (tab) => handleNavigation(tab),
          setVisionMode: (mode) => {
            if (optionsRef.current.onSystemAction) {
              optionsRef.current.onSystemAction('SET_VISION_MODE', mode)
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('iris:vision-mode', { detail: { mode } }))
            }
          },
          setMuted: (muted) => {
            voiceService.setMuted(muted)
            if (optionsRef.current.onSystemAction) {
              optionsRef.current.onSystemAction('SET_MUTED', muted)
            }
          },
          stopSpeaking: () => voiceService.stopSpeaking()
        })

        if (enableSoundEffects) soundEffects.play('pop')

        setLastCommand(result)
        setExecutedCommands((prev) => [result, ...prev.slice(0, 49)])

        // Broadcast global voice command event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('iris:voice-command', {
              detail: { commandText: targetText, result }
            })
          )
        }

        optionsRef.current.onCommandExecuted?.(result)

        // Speak audio feedback if enabled
        if (speakFeedback && result.spokenResponse) {
          setStatus('speaking')
          await voiceService.speak(result.spokenResponse, {
            onEnd: () => {
              if (isMountedRef.current) setStatus('idle')
            }
          })
        } else {
          setStatus('idle')
        }

        return result
      } catch (err: any) {
        console.error('[useVoiceCommandListener] Command processing error:', err)
        if (enableSoundEffects) soundEffects.play('error')
        const errResult: CommandProcessResult = {
          handled: false,
          intent: 'CONVERSATIONAL',
          spokenResponse: 'I encountered an issue processing that voice command.'
        }
        setErrorMessage(err?.message || 'Command execution failed.')
        setStatus('error')
        return errResult
      }
    },
    [wakeWord, requireWakeWord, enableSoundEffects, speakFeedback, handleNavigation]
  )

  // Start listening method
  const startListening = useCallback(async (): Promise<boolean> => {
    if (status === 'listening') return true

    try {
      setErrorMessage(null)
      setInterimTranscript('')
      setFinalTranscript('')

      // 1. Request hardware microphone stream via MicrophoneManager
      const stream = await microphoneManager.requestMicrophone()
      if (!stream || !stream.active) {
        throw new Error('Could not access microphone input stream.')
      }
      mediaStreamRef.current = stream

      if (enableSoundEffects) soundEffects.play('chime')

      // 2. Initialize STT SpeechRecognitionManager instance
      sttManagerRef.current = new SpeechRecognitionManager(
        {
          onInterimTranscript: (text) => {
            if (!isMountedRef.current) return
            setInterimTranscript(text)
            optionsRef.current.onTranscript?.(text, false)
          },
          onFinalTranscript: (text) => {
            if (!isMountedRef.current) return
            setFinalTranscript(text)
            setInterimTranscript('')
            optionsRef.current.onTranscript?.(text, true)
            processCommand(text)
          },
          onError: (err) => {
            console.warn('[useVoiceCommandListener] STT Error:', err)
            if (isMountedRef.current) {
              setErrorMessage(err)
            }
          },
          onEnd: () => {
            if (isMountedRef.current && status === 'listening') {
              // Safe restart if still supposed to be listening
              setTimeout(() => {
                if (isMountedRef.current && sttManagerRef.current && mediaStreamRef.current) {
                  sttManagerRef.current.start(mediaStreamRef.current)
                }
              }, 300)
            }
          }
        },
        language
      )

      const started = sttManagerRef.current.start(stream)
      if (!started) {
        throw new Error('Speech Recognition engine failed to start.')
      }

      setStatus('listening')
      return true
    } catch (err: any) {
      console.error('[useVoiceCommandListener] Start failed:', err)
      if (enableSoundEffects) soundEffects.play('error')
      setStatus('error')
      setErrorMessage(err?.message || 'Failed to start microphone voice listener.')
      return false
    }
  }, [status, language, enableSoundEffects, processCommand])

  // Stop listening method
  const stopListening = useCallback(() => {
    if (sttManagerRef.current) {
      sttManagerRef.current.stop()
      sttManagerRef.current = null
    }
    if (mediaStreamRef.current) {
      microphoneManager.releaseMicrophone()
      mediaStreamRef.current = null
    }
    if (isMountedRef.current) {
      setStatus('idle')
      setAudioLevel(0)
    }
  }, [])

  // Toggle listening method
  const toggleListening = useCallback(async () => {
    if (status === 'listening') {
      stopListening()
    } else {
      await startListening()
    }
  }, [status, startListening, stopListening])

  // Clear state helper
  const clearTranscript = useCallback(() => {
    setInterimTranscript('')
    setFinalTranscript('')
    setErrorMessage(null)
  }, [])

  // Auto-start listening on mount if enabled
  useEffect(() => {
    if (autoStart) {
      startListening()
    }
    return () => {
      stopListening()
    }
  }, [autoStart, startListening, stopListening])

  return {
    status,
    isListening: status === 'listening',
    permissionState,
    audioLevel,
    interimTranscript,
    finalTranscript,
    errorMessage,
    executedCommands,
    lastCommand,
    startListening,
    stopListening,
    toggleListening,
    processCommand,
    clearTranscript
  }
}
