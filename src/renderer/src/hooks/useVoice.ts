import { useState, useEffect, useRef, useCallback } from 'react'
import { voiceService } from '../services/voiceService'

export interface VoiceCommandEvent {
  raw: string
  wakeWordDetected: boolean
  commandText: string
  action: string
  payload?: any
  confidence: number
  timestamp: number
}

export interface UseVoiceOptions {
  wakeWord?: string
  continuous?: boolean
  lang?: string
  onWakeWord?: (wakeWord: string, fullTranscript: string) => void
  onCommand?: (event: VoiceCommandEvent) => void
  onTranscript?: (transcript: string, isFinal: boolean) => void
  onAiResponse?: (response: string, isComplete: boolean) => void
  onNavigate?: (
    tab: 'DASHBOARD' | 'YOUTUBE' | 'WORKSPACE' | 'MAPS' | 'NOTES' | 'GALLERY' | 'PHONE' | 'SETTINGS'
  ) => void
  onVisionMode?: (mode: 'off' | 'camera' | 'screen') => void
  onKnowledgeOpen?: (open: boolean) => void
  onSystemAction?: (action: string, payload?: any) => void
  autoStart?: boolean
}

export interface UseVoiceReturn {
  isListening: boolean
  isWakeWordDetected: boolean
  isProcessing: boolean
  isSpeaking: boolean
  transcript: string
  interimTranscript: string
  aiResponse: string
  lastCommand: VoiceCommandEvent | null
  commandHistory: VoiceCommandEvent[]
  audioLevel: number
  micPermission: 'prompt' | 'granted' | 'denied' | 'unknown'
  error: string | null
  isSupported: boolean
  startListening: () => Promise<boolean>
  stopListening: () => void
  toggleListening: () => Promise<void>
  clearTranscript: () => void
  submitPrompt: (promptText: string, inputType?: 'voice' | 'text') => void
  simulateCommand: (commandString: string) => void
}

// Built-in system command rules
const parseCommand = (cleanText: string): { action: string; payload?: any } => {
  const lower = cleanText.toLowerCase().trim()

  // 1. Navigation Commands
  if (lower.includes('dashboard') || lower.includes('home') || lower.includes('command center')) {
    return { action: 'NAVIGATE', payload: 'DASHBOARD' }
  }
  if (lower.includes('youtube') || lower.includes('video') || lower.includes('trends')) {
    return { action: 'NAVIGATE', payload: 'YOUTUBE' }
  }
  if (lower.includes('workspace') || lower.includes('editor') || lower.includes('code') || lower.includes('work space')) {
    return { action: 'NAVIGATE', payload: 'WORKSPACE' }
  }
  if (lower.includes('map') || lower.includes('location') || lower.includes('gps') || lower.includes('navigation')) {
    return { action: 'NAVIGATE', payload: 'MAPS' }
  }
  if (lower.includes('note') || lower.includes('memo') || lower.includes('journal') || lower.includes('scratchpad')) {
    return { action: 'NAVIGATE', payload: 'NOTES' }
  }
  if (lower.includes('gallery') || lower.includes('images') || lower.includes('photos') || lower.includes('art')) {
    return { action: 'NAVIGATE', payload: 'GALLERY' }
  }
  if (lower.includes('phone') || lower.includes('call') || lower.includes('contacts') || lower.includes('dialer')) {
    return { action: 'NAVIGATE', payload: 'PHONE' }
  }
  if (lower.includes('settings') || lower.includes('config') || lower.includes('preferences')) {
    return { action: 'NAVIGATE', payload: 'SETTINGS' }
  }

  // 2. Vision & Camera Modes
  if (lower.includes('camera on') || lower.includes('optics on') || lower.includes('start camera') || lower.includes('lens mode')) {
    return { action: 'SET_VISION_MODE', payload: 'camera' }
  }
  if (lower.includes('screen share') || lower.includes('screen on') || lower.includes('display mode') || lower.includes('watch screen')) {
    return { action: 'SET_VISION_MODE', payload: 'screen' }
  }
  if (lower.includes('vision off') || lower.includes('stop camera') || lower.includes('disable vision') || lower.includes('optics off')) {
    return { action: 'SET_VISION_MODE', payload: 'off' }
  }

  // 3. Knowledge & Documents
  if (lower.includes('pdf') || lower.includes('knowledge') || lower.includes('document') || lower.includes('doc base')) {
    return { action: 'TOGGLE_KNOWLEDGE', payload: true }
  }
  if (lower.includes('close doc') || lower.includes('close knowledge') || lower.includes('hide pdf')) {
    return { action: 'TOGGLE_KNOWLEDGE', payload: false }
  }

  // 4. System HUD & Controls
  if (lower.includes('minimal hud') || lower.includes('focus mode') || lower.includes('hide ui')) {
    return { action: 'TOGGLE_MINIMAL_HUD' }
  }
  if (lower.includes('stop speaking') || lower.includes('silence') || lower.includes('be quiet') || lower.includes('shut up') || lower.includes('halt')) {
    return { action: 'STOP_SPEAKING' }
  }
  if (lower.includes('mute') || lower.includes('microphone off')) {
    return { action: 'MUTE_MIC' }
  }
  if (lower.includes('unmute') || lower.includes('microphone on')) {
    return { action: 'UNMUTE_MIC' }
  }
  if (lower.includes('system status') || lower.includes('telemetry') || lower.includes('performance') || lower.includes('system stats')) {
    return { action: 'SHOW_TELEMETRY' }
  }

  // General AI Query or Fallback Action
  return { action: 'AI_QUERY', payload: cleanText }
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    wakeWord = 'iris',
    continuous = true,
    lang = 'en-US',
    onWakeWord,
    onCommand,
    onTranscript,
    onAiResponse,
    onNavigate,
    onVisionMode,
    onKnowledgeOpen,
    onSystemAction,
    autoStart = false
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isWakeWordDetected, setIsWakeWordDetected] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [lastCommand, setLastCommand] = useState<VoiceCommandEvent | null>(null)
  const [commandHistory, setCommandHistory] = useState<VoiceCommandEvent[]>([])
  const [audioLevel, setAudioLevel] = useState(0)
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const shouldListenRef = useRef(false)
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  })

  // Detect Web Speech API support
  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  // Listen to the unified single conversation bus (window.iris) for streaming AI responses
  useEffect(() => {
    let isMounted = true

    const handleTranscriptEvent = (data: {
      id?: string
      requestId?: string
      role?: string
      text?: string
      content?: string
      isFinal?: boolean
    }) => {
      if (!isMounted || !data) return
      const role = ((data.role || 'assistant') as string).toLowerCase()
      const text = data.text || data.content || ''

      if (role === 'model' || role === 'assistant') {
        setIsProcessing(false)
        setAiResponse(text)
        optionsRef.current.onAiResponse?.(text, false)
      } else if (role === 'user') {
        setIsProcessing(true)
      }
    }

    const handleTranscriptCompleteEvent = (data?: {
      id?: string
      requestId?: string
      role?: string
      text?: string
      content?: string
      status?: 'success' | 'failed'
    }) => {
      if (!isMounted) return
      setIsProcessing(false)
      const text = data?.text || data?.content || ''
      if (text) {
        setAiResponse(text)
        optionsRef.current.onAiResponse?.(text, true)
      }
    }

    let unsubTranscript: any
    let unsubComplete: any

    if (typeof window !== 'undefined' && (window as any).iris) {
      unsubTranscript = (window as any).iris.onTranscript?.(handleTranscriptEvent)
      unsubComplete = (window as any).iris.onTranscriptComplete?.(handleTranscriptCompleteEvent)
    }

    return () => {
      isMounted = false
      if (typeof unsubTranscript === 'function') {
        unsubTranscript()
      } else if (typeof window !== 'undefined' && (window as any).iris?.offTranscript) {
        ;(window as any).iris.offTranscript(handleTranscriptEvent)
      }

      if (typeof unsubComplete === 'function') {
        unsubComplete()
      } else if (typeof window !== 'undefined' && (window as any).iris?.offTranscriptComplete) {
        ;(window as any).iris.offTranscriptComplete(handleTranscriptCompleteEvent)
      }
    }
  }, [])

  // Submit prompt through unified pipeline
  const submitPrompt = useCallback((promptText: string, inputType: 'voice' | 'text' = 'voice') => {
    const clean = promptText?.trim()
    if (!clean) return

    setIsProcessing(true)
    setAiResponse('')

    // Dispatches to the single conversation state and AI execution engine
    voiceService.triggerVoiceInput(clean, inputType)
  }, [])

  // Execute parsed command
  const executeCommand = useCallback(
    (event: VoiceCommandEvent) => {
      setLastCommand(event)
      setCommandHistory((prev) => [event, ...prev.slice(0, 19)])

      optionsRef.current.onCommand?.(event)

      switch (event.action) {
        case 'NAVIGATE':
          optionsRef.current.onNavigate?.(event.payload)
          break
        case 'SET_VISION_MODE':
          optionsRef.current.onVisionMode?.(event.payload)
          break
        case 'TOGGLE_KNOWLEDGE':
          optionsRef.current.onKnowledgeOpen?.(event.payload)
          break
        case 'STOP_SPEAKING':
          voiceService.stopSpeaking()
          setIsSpeaking(false)
          break
        case 'MUTE_MIC':
          voiceService.setMuted(true)
          break
        case 'UNMUTE_MIC':
          voiceService.setMuted(false)
          break
        case 'AI_QUERY':
        default:
          if (optionsRef.current.onSystemAction) {
            optionsRef.current.onSystemAction(event.action, event.payload)
          } else {
            submitPrompt(event.commandText || event.raw, 'voice')
          }
          break
      }
    },
    [submitPrompt]
  )

  // Process raw text for wake word and commands
  const processTranscript = useCallback(
    (rawText: string, confidence = 0.95) => {
      const lower = rawText.toLowerCase().trim()
      const wakeWordRegex = new RegExp(`\\b${wakeWord.toLowerCase()}\\b`, 'i')
      const hasWakeWord = wakeWordRegex.test(lower)

      if (hasWakeWord) {
        setIsWakeWordDetected(true)
        setTimeout(() => setIsWakeWordDetected(false), 3000)

        optionsRef.current.onWakeWord?.(wakeWord, rawText)

        // Extract command after wake word if present
        const wakeIdx = lower.indexOf(wakeWord.toLowerCase())
        let commandAfterWake = rawText.substring(wakeIdx + wakeWord.length).replace(/^[,:;\s]+/, '').trim()
        if (!commandAfterWake) {
          commandAfterWake = rawText.trim()
        }

        const { action, payload } = parseCommand(commandAfterWake || rawText)
        const event: VoiceCommandEvent = {
          raw: rawText,
          wakeWordDetected: true,
          commandText: commandAfterWake || rawText,
          action,
          payload,
          confidence,
          timestamp: Date.now()
        }

        executeCommand(event)
      } else {
        // Evaluate direct system commands or general AI query
        const { action, payload } = parseCommand(rawText)
        const event: VoiceCommandEvent = {
          raw: rawText,
          wakeWordDetected: false,
          commandText: rawText,
          action,
          payload,
          confidence,
          timestamp: Date.now()
        }
        executeCommand(event)
      }
    },
    [wakeWord, executeCommand]
  )

  // Setup live audio meter analyzer with explicit getUserMedia permission acquisition
  const startAudioMeter = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Microphone access is not supported by your browser environment.')
      }

      // Reuse existing active stream if available
      if (mediaStreamRef.current && mediaStreamRef.current.active) {
        setMicPermission('granted')
        return mediaStreamRef.current
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      }).catch(async () => {
        // Fallback to basic unconstrained audio
        return await navigator.mediaDevices.getUserMedia({ audio: true })
      })

      // Validate stream tracks
      const tracks = stream.getAudioTracks()
      if (!tracks || tracks.length === 0 || tracks[0].readyState !== 'live') {
        stream.getTracks().forEach((t) => t.stop())
        throw new Error('Microphone did not provide an active live audio track.')
      }

      mediaStreamRef.current = stream
      setMicPermission('granted')
      console.log('[VOICE] microphone permission: granted')

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtxClass) {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close().catch(() => {})
          } catch (_e) {}
        }
        const ctx = new AudioCtxClass()
        audioContextRef.current = ctx
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {})
        }
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.8
        source.connect(analyser)
        analyserRef.current = analyser

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateLevel = () => {
          if (!analyserRef.current || !shouldListenRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i]
          }
          const avg = sum / dataArray.length
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
          animFrameRef.current = requestAnimationFrame(updateLevel)
        }

        animFrameRef.current = requestAnimationFrame(updateLevel)
      }

      return stream
    } catch (err: any) {
      console.warn('[useVoice] Audio meter setup error:', err)
      const errName = err?.name || ''
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setMicPermission('denied')
        setError('Microphone permission denied. Please allow microphone access in your browser.')
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setMicPermission('denied')
        setError('No microphone hardware detected on this device.')
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setError('Microphone is currently in use by another application.')
      } else {
        setError(err?.message || 'Failed to acquire microphone stream.')
      }
      return null
    }
  }, [])

  const stopAudioMeter = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch (_e) {}
      })
      mediaStreamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
    setAudioLevel(0)
  }, [])

  // Start listening method - Requests microphone permission first, then initializes SpeechRecognition
  const startListening = useCallback(async (): Promise<boolean> => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setError('Web Speech Recognition is not supported in this browser.')
      return false
    }

    try {
      setError(null)
      shouldListenRef.current = true

      // 1. Request microphone permission first using getUserMedia
      const stream = await startAudioMeter()
      if (!stream) {
        shouldListenRef.current = false
        setIsListening(false)
        return false
      }

      // 2. Initialize SpeechRecognition instance ONLY after mic permission is granted
      const recognition = new SpeechRecognitionClass()
      recognition.continuous = continuous
      recognition.interimResults = true
      recognition.lang = lang
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        console.log('[VOICE] recognition started')
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          const transcriptChunk = item[0]?.transcript || ''
          if (item.isFinal) {
            final += transcriptChunk
            const conf = item[0]?.confidence || 0.95
            processTranscript(final, conf)
          } else {
            interim += transcriptChunk
          }
        }

        if (interim) {
          console.log('[VOICE] interim transcript:', interim)
          setInterimTranscript(interim)
          optionsRef.current.onTranscript?.(interim, false)
        }

        if (final) {
          console.log('[VOICE] final transcript:', final)
          setTranscript(final)
          setInterimTranscript('')
          optionsRef.current.onTranscript?.(final, true)
        }
      }

      recognition.onerror = (evt: any) => {
        const err = evt.error
        console.warn('[VOICE] recognition error:', err)
        if (err === 'no-speech') {
          return
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setMicPermission('denied')
          setError('Microphone access denied. Please allow microphone permission in your browser.')
          return
        }
        if (err === 'network') {
          console.warn('[VOICE] Speech recognition network notice, auto-recovering...')
          return
        }
      }

      recognition.onend = () => {
        console.log('[VOICE] recognition ended')
        // Auto restart if continuous listening is requested and still active
        if (shouldListenRef.current) {
          setTimeout(() => {
            if (shouldListenRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start()
              } catch (_e) {}
            }
          }, 200)
        } else {
          setIsListening(false)
        }
      }

      recognition.start()
      recognitionRef.current = recognition

      return true
    } catch (err: any) {
      console.error('[useVoice] Failed to start voice listener:', err)
      setError(err?.message || 'Failed to initialize voice recognition.')
      setIsListening(false)
      shouldListenRef.current = false
      return false
    }
  }, [continuous, lang, processTranscript, startAudioMeter])

  // Stop listening method
  const stopListening = useCallback(() => {
    shouldListenRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (_e) {}
      recognitionRef.current = null
    }
    stopAudioMeter()
    setIsListening(false)
    setInterimTranscript('')
  }, [stopAudioMeter])

  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (isListening) {
      stopListening()
    } else {
      await startListening()
    }
  }, [isListening, startListening, stopListening])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
  }, [])

  // Manual simulation helper for programmatic or UI testing
  const simulateCommand = useCallback(
    (commandString: string) => {
      setTranscript(commandString)
      processTranscript(commandString, 1.0)
    },
    [processTranscript]
  )

  // Cleanup on unmount
  useEffect(() => {
    if (autoStart) {
      startListening()
    }
    return () => {
      shouldListenRef.current = false
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (_e) {}
      }
      stopAudioMeter()
    }
  }, [autoStart, startListening, stopAudioMeter])

  return {
    isListening,
    isWakeWordDetected,
    isProcessing,
    isSpeaking,
    transcript,
    interimTranscript,
    aiResponse,
    lastCommand,
    commandHistory,
    audioLevel,
    micPermission,
    error,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
    submitPrompt,
    simulateCommand
  }
}

export default useVoice
