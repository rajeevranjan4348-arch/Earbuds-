import { useState, useEffect, useRef, useCallback } from 'react'
import { voiceService } from '../services/voiceService'
import { chatHistoryService, Message } from '../services/chatHistoryService'
import { soundEffects } from '../services/soundEffectsService'
import { voiceCommandProcessor } from '../services/voiceCommandProcessor'

export type ListenerState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'
export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface UseSphereVoiceListenerOptions {
  onTranscript?: (text: string, isFinal: boolean) => void
  onAiResponse?: (text: string) => void
  onStateChange?: (state: ListenerState) => void
  autoSpeakResponse?: boolean
}

export function useSphereVoiceListener(options: UseSphereVoiceListenerOptions = {}) {
  const [listenerState, setListenerState] = useState<ListenerState>('idle')
  const [permissionState, setPermissionState] = useState<MicPermissionState>('prompt')
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [micVolume, setMicVolume] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const recognitionRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isListeningRef = useRef(false)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Update listener state helper
  const updateState = useCallback((nextState: ListenerState) => {
    setListenerState(nextState)
    optionsRef.current.onStateChange?.(nextState)
  }, [])

  // Check microphone permissions
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setPermissionState('unsupported')
      return
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setPermissionState(permissionStatus.state as MicPermissionState)
          permissionStatus.onchange = () => {
            setPermissionState(permissionStatus.state as MicPermissionState)
          }
        })
        .catch(() => {
          // Fallback if query fails
        })
    }
  }, [])

  // Process user voice query through Gemini AI Backend
  const dispatchQueryToGemini = useCallback(
    async (userQueryText: string) => {
      if (!userQueryText || !userQueryText.trim()) {
        updateState('idle')
        return
      }

      const cleanQuery = userQueryText.trim()
      updateState('processing')
      setErrorMessage(null)

      const activeSessionId = chatHistoryService.getActiveSessionId()
      const reqId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const userMsgId = `msg_user_${reqId}`
      const assistantMsgId = `msg_model_${reqId}`

      // Save user voice query to unified chat history
      const userMessage: Message = {
        id: userMsgId,
        messageId: userMsgId,
        conversationId: activeSessionId,
        requestId: reqId,
        role: 'user',
        mode: 'voice',
        text: cleanQuery,
        transcript: cleanQuery,
        content: cleanQuery,
        timestamp: Date.now(),
        inputType: 'voice'
      }
      try {
        chatHistoryService.addMessage(activeSessionId, userMessage)
      } catch (e) {
        console.warn('[VoiceListener] Error adding user message:', e)
      }

      // 1. Process Voice Commands via Voice Command Processor (triggers functions like open gallery, check telemetry, etc.)
      try {
        const cmdResult = await voiceCommandProcessor.process(cleanQuery, {
          navigate: (tab) => window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab } })),
          setVisionMode: (mode) => window.dispatchEvent(new CustomEvent('iris:vision-mode', { detail: { mode } })),
          setMuted: (muted) => voiceService.setMuted(muted),
          stopSpeaking: () => voiceService.stopSpeaking()
        })

        if (cmdResult && cmdResult.intent !== 'CONVERSATIONAL' && cmdResult.intent !== 'CONVERSATIONAL_AI') {
          const executedResponse = cmdResult.response || 'Executed voice command.'

          const assistantMessage: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'assistant',
            mode: 'voice',
            text: executedResponse,
            content: executedResponse,
            timestamp: Date.now(),
            provider: 'iris-voice-processor'
          }
          try {
            chatHistoryService.addMessage(activeSessionId, assistantMessage)
          } catch (_e) {}

          optionsRef.current.onAiResponse?.(executedResponse)

          if (optionsRef.current.autoSpeakResponse !== false) {
            updateState('speaking')
            soundEffects.play('pop')
            await voiceService.speak(executedResponse)
          }

          updateState('idle')
          return
        }
      } catch (cmdErr) {
        console.warn('[VoiceListener] Voice command processor notice:', cmdErr)
      }

      // 2. Fallback to Gemini AI for general knowledge, reasoning, and conversational queries
      // Prepare context from recent chat history
      const session = chatHistoryService.getSession(activeSessionId)
      const recentMessages = (session?.messages || [])
        .slice(-8)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text || m.content || ''
        }))

      try {
        abortControllerRef.current = new AbortController()

        // Dispatch to backend Gemini AI chat endpoint
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            messages: recentMessages,
            prompt: cleanQuery,
            sessionId: activeSessionId,
            mode: 'voice'
          })
        })

        if (!response.ok) {
          throw new Error(`Gemini AI backend returned ${response.status}`)
        }

        const data = await response.json()
        const aiText = data.text || data.response || data.content || data.message || 'I processed your query.'

        // Save assistant response to unified chat history
        const assistantMessage: Message = {
          id: assistantMsgId,
          messageId: assistantMsgId,
          conversationId: activeSessionId,
          requestId: reqId,
          role: 'assistant',
          mode: 'voice',
          text: aiText,
          content: aiText,
          timestamp: Date.now(),
          provider: data.provider || 'gemini-3.8-flash'
        }
        try {
          chatHistoryService.addMessage(activeSessionId, assistantMessage)
        } catch (e) {
          console.warn('[VoiceListener] Error adding AI message:', e)
        }

        optionsRef.current.onAiResponse?.(aiText)

        // Speak AI response if enabled
        if (optionsRef.current.autoSpeakResponse !== false) {
          updateState('speaking')
          soundEffects.play('pop')
          await voiceService.speak(aiText)
        }

        updateState('idle')
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          console.log('[VoiceListener] Request aborted.')
          updateState('idle')
          return
        }
        console.error('[VoiceListener] Gemini dispatch error:', err)
        setErrorMessage(err?.message || 'Failed to process voice query')
        updateState('error')
        setTimeout(() => updateState('idle'), 3500)
      }
    },
    [updateState]
  )

  // Start Audio Stream & Volume Analyser
  const startAudioAnalyser = async (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const checkVolume = () => {
        if (!isListeningRef.current) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(1, avg / 128)
        setMicVolume(normalized)
        animFrameRef.current = requestAnimationFrame(checkVolume)
      }

      checkVolume()
    } catch (e) {
      console.warn('[VoiceListener] Volume analyser setup error:', e)
    }
  }

  // Stop Audio Stream & Analyser
  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setMicVolume(0)
  }

  // Start Voice Command Listener
  const startListening = useCallback(async () => {
    if (listenerState === 'listening' || listenerState === 'processing') return

    // Stop speaking if currently active
    voiceService.stopSpeaking()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setTranscript('')
    setInterimText('')
    setErrorMessage(null)

    try {
      // 1. Request microphone permission via getUserMedia
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      mediaStreamRef.current = stream
      setPermissionState('granted')
      isListeningRef.current = true
      updateState('listening')
      soundEffects.play('activate')

      await startAudioAnalyser(stream)

      // 2. Initialize Web Speech Recognition
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'en-US'

        let accumulatedFinal = ''

        recognition.onresult = (event: any) => {
          let currentInterim = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptChunk = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              accumulatedFinal += transcriptChunk + ' '
            } else {
              currentInterim += transcriptChunk
            }
          }

          setInterimText(currentInterim)
          if (accumulatedFinal) {
            setTranscript(accumulatedFinal)
          }

          optionsRef.current.onTranscript?.(
            accumulatedFinal || currentInterim,
            Boolean(accumulatedFinal)
          )

          // Reset silence timer on speech
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
          }
          silenceTimerRef.current = setTimeout(() => {
            if (isListeningRef.current) {
              stopListening()
            }
          }, 2400)
        }

        recognition.onerror = (event: any) => {
          console.warn('[VoiceListener] Speech recognition warning:', event.error)
          if (event.error === 'not-allowed') {
            setPermissionState('denied')
            setErrorMessage('Microphone permission denied.')
          }
        }

        recognition.onend = () => {
          if (isListeningRef.current) {
            isListeningRef.current = false
            stopAudioAnalyser()
            const finalQuery = accumulatedFinal.trim()
            if (finalQuery) {
              dispatchQueryToGemini(finalQuery)
            } else {
              updateState('idle')
            }
          }
        }

        recognitionRef.current = recognition
        recognition.start()
      } else {
        // Fallback for browsers without SpeechRecognition
        console.warn('[VoiceListener] SpeechRecognition API not supported, simulated prompt.')
        setErrorMessage('Speech Recognition API unavailable in current browser.')
        updateState('error')
        stopAudioAnalyser()
        isListeningRef.current = false
      }
    } catch (err: any) {
      console.error('[VoiceListener] Microphone access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setErrorMessage('Microphone permission was denied.')
      } else {
        setErrorMessage(err?.message || 'Could not access microphone.')
      }
      updateState('error')
      isListeningRef.current = false
      stopAudioAnalyser()
    }
  }, [listenerState, updateState, dispatchQueryToGemini])

  // Stop Listening manually
  const stopListening = useCallback(() => {
    if (!isListeningRef.current) return
    isListeningRef.current = false

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (_e) {}
      recognitionRef.current = null
    }

    stopAudioAnalyser()
  }, [])

  // Toggle listener state
  const toggleListening = useCallback(() => {
    if (listenerState === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }, [listenerState, startListening, stopListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (_e) {}
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      stopAudioAnalyser()
    }
  }, [])

  return {
    listenerState,
    permissionState,
    isListening: listenerState === 'listening',
    isProcessing: listenerState === 'processing',
    isSpeaking: listenerState === 'speaking',
    transcript,
    interimText,
    micVolume,
    errorMessage,
    startListening,
    stopListening,
    toggleListening,
    dispatchQueryToGemini
  }
}
export default useSphereVoiceListener
