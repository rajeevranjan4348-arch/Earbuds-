import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send,
  Plus,
  History,
  Trash2,
  Clock,
  MessageSquare,
  X,
  Search,
  Sparkles,
  Mic,
  Square,
  VolumeX,
  AlertTriangle,
  RotateCcw,
  Volume2,
  Radio,
  Cpu,
  Terminal,
  Database,
  Wifi,
  WifiOff
} from 'lucide-react'
import { RiFlashlightFill } from 'react-icons/ri'
import { chatHistoryService, Message, ChatSession } from '../../services/chatHistoryService'
import { shortcutService } from '../../services/shortcutService'
import { voiceService } from '../../services/voiceService'
import { coreSettingsService } from '../../services/coreSettingsService'
import { irisIndexedDBCache } from '../../services/irisIndexedDBCache'
import { offlineAiResponseEngine } from '../../services/offlineAiResponseEngine'
import { geminiLiveVoiceClient, VoiceOption } from '../../services/geminiLiveVoiceClient'
import { voiceSettings } from '../../services/voice'
import MicrophoneInputButton from './MicrophoneInputButton'
import { VoiceCommandLogSidePanel } from './VoiceCommandLogSidePanel'
import { IntentResolver, launchManager } from '../../launcher'
import { voiceCommandProcessor } from '../../services/voiceCommandProcessor'
import { normalizeAIResponse } from '../../services/aiResponseNormalizer'

export type { Message, ChatSession }

interface RightPanelProps {
  interimTranscript?: string
  isListening?: boolean
  micLevel?: number
  onSendPrompt?: (text: string) => void
}

function formatSessionTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffDayCalc(diffHour))

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function diffDayCalc(hours: number): number {
  return Math.floor(hours / 24)
}

/**
 * Normalizes accidental duplicate adjacent tokens and sentences
 * caused by multiple listeners or duplicate stream chunk processing.
 */
function normalizeDuplicateTokens(text: string): string {
  if (!text) return ''
  const trimmed = text.trim()
  // Clean up only exact immediate duplications of entire sentences or phrases
  const len = trimmed.length
  if (len >= 12 && len % 2 === 0) {
    const half = len / 2
    if (trimmed.slice(0, half).trim() === trimmed.slice(half).trim()) {
      return trimmed.slice(0, half).trim()
    }
  }
  return trimmed
}

/**
 * Memoized Chat Message Item Component
 * Avoids full list re-rendering and expensive markdown re-parsing during token streaming.
 */
interface ChatMessageItemProps {
  msg: Message
  isStreaming: boolean
  onRetry: (msg: Message) => void
}

const ChatMessageItem = memo(
  function ChatMessageItem({ msg, isStreaming, onRetry }: ChatMessageItemProps) {
    const isUser = msg.role === 'user'
    const isFallbackOrError =
      !isUser &&
      (msg.status === 'failed' ||
        (msg.text && msg.text.includes('⚠️')) ||
        (msg.content && msg.content.includes('⚠️')))

    const rawContent =
      typeof msg.text === 'string' && msg.text.trim()
        ? msg.text
        : typeof msg.content === 'string' && msg.content.trim()
          ? msg.content
          : ''

    const displayContent =
      rawContent ||
      (isStreaming
        ? '...'
        : isUser
          ? ''
          : msg.status === 'failed'
            ? '⚠️ AI request encountered an issue. Please click retry to resend.'
            : 'I am standing by to assist with your request.')

    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`max-w-[90%] sm:max-w-[85%] p-3 sm:p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-lg break-words overflow-wrap-anywhere ${
            isUser
              ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/25 rounded-br-md shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              : isFallbackOrError
                ? 'bg-amber-950/25 text-amber-100 border border-amber-500/30 rounded-bl-md shadow-[0_0_15px_rgba(245,158,11,0.08)]'
                : 'bg-white/5 text-gray-200 border border-white/5 rounded-bl-md'
          }`}
        >
          {isUser ? (
            <span>{displayContent}</span>
          ) : (
            <div className="text-xs sm:text-sm leading-relaxed space-y-2">
              {isFallbackOrError && (
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-amber-500/20 text-amber-300 text-[11px] font-medium">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                    <span>AI Execution Notice</span>
                  </div>
                  <span className="text-[10px] text-amber-400/70 font-mono">Status: Handled</span>
                </div>
              )}

              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ node, ...props }) => (
                    <img
                      {...props}
                      className="rounded-xl max-h-72 w-auto object-cover border border-white/10 my-2 shadow-lg"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ),
                  a: ({ node, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 break-all"
                    />
                  ),
                  code: ({ node, inline, className, children, ...props }: any) => {
                    return (
                      <code
                        className={`${className || ''} bg-black/40 px-1.5 py-0.5 rounded text-[11px] font-mono text-emerald-300 border border-white/5`}
                        {...props}
                      >
                        {children}
                      </code>
                    )
                  },
                  pre: ({ node, children, ...props }: any) => {
                    return (
                      <pre
                        className="bg-black/60 p-2.5 rounded-xl border border-white/10 my-2 overflow-x-auto text-[11px] font-mono text-zinc-200"
                        {...props}
                      >
                        {children}
                      </pre>
                    )
                  }
                }}
              >
                {displayContent}
              </ReactMarkdown>

              {!isUser && !isStreaming && rawContent && (
                <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => voiceService.speak(rawContent)}
                    className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-emerald-500/15 text-zinc-400 hover:text-emerald-300 border border-white/5 hover:border-emerald-500/30 text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                    title="Speak answer with voice"
                  >
                    <Volume2 size={11} />
                    <span>Speak</span>
                  </button>
                  {((msg as any).provider || (msg as any).model) && (
                    <span className="text-[10px] font-mono text-zinc-500">
                      {(msg as any).provider === 'nvidia_kimi_k3'
                        ? 'NVIDIA Kimi-k3'
                        : (msg as any).model || ''}
                    </span>
                  )}
                </div>
              )}

              {isFallbackOrError && (
                <div className="pt-2 mt-1 border-t border-amber-500/15 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onRetry(msg)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Retry prompt"
                  >
                    <RotateCcw size={11} />
                    <span>Retry Prompt</span>
                  </button>
                  <span className="text-[10px] text-zinc-500 italic">Fallback active</span>
                </div>
              )}
            </div>
          )}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 rounded-full animate-pulse align-middle"></span>
          )}
        </div>
      </motion.div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.msg.id === nextProps.msg.id &&
      prevProps.msg.text === nextProps.msg.text &&
      prevProps.msg.content === nextProps.msg.content &&
      prevProps.msg.status === nextProps.msg.status &&
      prevProps.isStreaming === nextProps.isStreaming
    )
  }
)

import LatticeLoader from './LatticeLoader'

/**
 * Premium AI Thinking Indicator with dynamic LatticeLoader
 */
const AIThinkingIndicator = memo(function AIThinkingIndicator({
  statusText = 'Thinking...'
}: {
  statusText?: string
}) {
  const [currentStatus, setCurrentStatus] = useState<string>(statusText)

  useEffect(() => {
    const unsubscribe = voiceSessionManager.subscribe((_state, payload) => {
      if (payload?.thinkingStatus) {
        setCurrentStatus(payload.thinkingStatus)
      } else if (payload?.activeTool) {
        const toolName = payload.activeTool
        const formatted =
          toolName.toLowerCase().includes('search')
            ? 'Searching...'
            : toolName.toLowerCase().includes('rag') || toolName.toLowerCase().includes('code')
            ? 'Processing codebase...'
            : toolName.toLowerCase().includes('map')
            ? 'Locating on map...'
            : `Executing ${toolName}...`
        setCurrentStatus(formatted)
      }
    })
    return () => unsubscribe()
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex justify-start my-2"
    >
      <div className="p-3 sm:p-3.5 rounded-2xl rounded-bl-md bg-zinc-900/90 border border-emerald-500/30 text-xs sm:text-sm text-zinc-200 shadow-[0_0_20px_rgba(16,185,129,0.12)] flex items-center gap-3">
        <LatticeLoader
          status="working"
          label={currentStatus || 'Thinking...'}
          doneLabel="Done"
          pattern="orbit"
          grid={3}
          shape="round"
          cellSize={5}
          gap={2}
          fontSize={13}
          showTimer
          glow
          glowColor="rgba(34, 197, 94, 0.4)"
          color="#10b981"
        />
      </div>
    </motion.div>
  )
})

export default function RightPanel({
  interimTranscript = '',
  isListening = false,
  micLevel = 0,
  onSendPrompt
}: RightPanelProps) {
  // Session State backed by chatHistoryService
  const [sessions, setSessions] = useState<ChatSession[]>(() => chatHistoryService.getSessions())
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    chatHistoryService.getActiveSessionId()
  )

  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showVoiceLog, setShowVoiceLog] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [activeStreamingId, setActiveStreamingId] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chatProvider, setChatProvider] = useState<
    'deepseek' | 'deepseek_r1' | 'gemini' | 'nvidia_kimi'
  >(() => {
    const active = coreSettingsService.getSettings().activeProvider
    if (active === 'deepseek' || active === 'deepseek_r1' || active === 'nvidia_kimi') return active
    return 'gemini'
  })
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(() => {
    return geminiLiveVoiceClient.getVoice() || 'Kore'
  })
  const [showVoiceMenu, setShowVoiceMenu] = useState(false)
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  // Voice Chat Input & TTS States
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const finalTextRef = useRef('')
  const wasVoicePromptRef = useRef(false)

  // Browser speech recognition
  const startListening = async () => {
    setMicError(null)

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setMicError('Voice recognition is not supported in this browser. Please type your message.')
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    // Explicitly request microphone access via getUserMedia to prompt browser permission dialog
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Release the temporary track so SpeechRecognition has complete access
        stream.getTracks().forEach((track) => track.stop())
      } catch (permErr: any) {
        console.warn('[MIC_PERMISSION]', permErr?.name || permErr?.message)
        if (
          permErr?.name === 'NotAllowedError' ||
          permErr?.name === 'PermissionDeniedError' ||
          permErr?.name === 'SecurityError'
        ) {
          setMicError('Microphone access blocked. Click the lock/site settings in your browser address bar to allow microphone.')
          setListening(false)
          return
        }
      }
    }

    try {
      const recognition = new SpeechRecognition()

      recognition.lang = 'en-US'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      finalTextRef.current = inputVal

      recognition.onstart = () => {
        setListening(true)
        wasVoicePromptRef.current = true
        setMicError(null)
      }

      recognition.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        const combined =
          `${finalTextRef.current} ${finalTranscript} ${interimTranscript}`
            .replace(/\s+/g, ' ')
            .trim()

        setInputVal(combined)
        chatHistoryService.saveDraft(activeSessionId, combined)
      }

      recognition.onerror = (event: any) => {
        const errType = event?.error || 'unknown'
        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          setMicError('Microphone permission required. Please allow microphone access in your browser.')
        } else if (errType === 'no-speech') {
          // Normal when user pauses or hasn't spoken yet
        } else if (errType !== 'aborted') {
          setMicError(`Voice input notice: ${errType}`)
        }
        setListening(false)
      }

      recognition.onend = () => {
        setListening(false)
        recognitionRef.current = null
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (startErr: any) {
      console.warn('[SPEECH_START_ERROR]', startErr)
      setListening(false)
      setMicError('Could not start speech recognition. Please check your microphone.')
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  // AI voice response (Text-to-Speech)
  const speakAI = (response: string) => {
    if (!('speechSynthesis' in window)) return

    window.speechSynthesis.cancel()

    const cleanText = response
      .replace(/>\s*💭[\s\S]*?\n\n/g, '')
      .replace(/[#*_`~>[\]]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()

    if (!cleanText) return

    const utterance = new SpeechSynthesisUtterance(cleanText)

    utterance.lang = 'en-US'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1

    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      if ('speechSynthesis' in window) {
        window.speechSynthesis?.cancel()
      }
    }
  }, [])

  // Synchronize active AI state with coreSettingsService & network status
  useEffect(() => {
    const unsub = coreSettingsService.subscribe((settings) => {
      if (settings.activeProvider === 'deepseek') {
        setChatProvider((prev) => (prev.startsWith('deepseek') ? prev : 'deepseek'))
      } else if (settings.activeProvider === 'gemini') {
        setChatProvider('gemini')
      }
    })

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      unsub()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)

  // Tracking refs to ensure idempotency and deduplication
  const activeRequestIdRef = useRef<string | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const seenChunksPerRequestRef = useRef<Map<string, Set<number>>>(new Map())
  const lastChunkRecordRef = useRef<Map<string, { text: string; time: number }>>(new Map())
  const lastSubmissionRef = useRef<{ text: string; time: number }>({ text: '', time: 0 })
  const lastSavedHashRef = useRef<string>('')

  // 1. Initial hydration of chat history from active session or memory
  useEffect(() => {
    let isMounted = true

    // Restore uncommitted draft for the active session
    const savedDraft = chatHistoryService.getDraft(activeSessionId)
    if (savedDraft) {
      setInputVal(savedDraft)
    } else {
      setInputVal('')
    }

    const allSessions = chatHistoryService.getSessions()
    const currentSavedSession = allSessions.find((s) => s.id === activeSessionId)
    if (currentSavedSession && currentSavedSession.messages.length > 0) {
      lastSavedHashRef.current = `${activeSessionId}_${currentSavedSession.messages.length}_${
        currentSavedSession.messages[currentSavedSession.messages.length - 1]?.text || ''
      }`
      setChatHistory(currentSavedSession.messages)
      for (const m of currentSavedSession.messages) {
        seenMessageIdsRef.current.add(m.id)
      }
      return
    }

    // Fallback: Check past history from window.iris
    const loadLegacyHistory = async () => {
      if ((window as any).iris?.getHistory) {
        try {
          const pastMemories = await (window as any).iris.getHistory()
          if (!isMounted || !Array.isArray(pastMemories) || pastMemories.length === 0) return

          const map = new Map<string, Message>()
          for (let i = 0; i < pastMemories.length; i++) {
            const m = pastMemories[i]
            const id =
              m.id || `hist_${m.role || 'sys'}_${i}_${m.text?.slice(0, 16).replace(/\s+/g, '')}`
            map.set(id, {
              id,
              requestId: m.requestId,
              role: (m.role || 'system').toLowerCase() as 'user' | 'model' | 'system',
              text: normalizeDuplicateTokens(m.text || ''),
              timestamp: m.timestamp
            })
            seenMessageIdsRef.current.add(id)
          }

          const legacyMessages = Array.from(map.values()).slice(-50)
          if (legacyMessages.length > 0) {
            setChatHistory(legacyMessages)
          }
        } catch (err) {
          console.error('[IRIS] Failed to load legacy history', err)
        }
      }
    }

    loadLegacyHistory()

    return () => {
      isMounted = false
    }
  }, [activeSessionId])

  // 2. Real-time transcript stream listeners
  useEffect(() => {
    let isMounted = true

    const handleTranscript = (data: {
      id?: string
      requestId?: string
      role: string
      text?: string
      content?: string
      isFinal?: boolean
      chunkIndex?: number
      mode?: 'delta' | 'cumulative'
    }) => {
      if (!isMounted || !data) return

      const reqId = data.requestId || activeRequestIdRef.current || `req_${Date.now()}`
      const role = ((data.role || 'assistant') as string).toLowerCase()
      const rawText = data.text || data.content || ''

      if (role === 'user') {
        const userMsgId = data.id || `msg_user_${reqId}`
        if (seenMessageIdsRef.current.has(userMsgId)) return

        seenMessageIdsRef.current.add(userMsgId)
        const cleanUserText = normalizeDuplicateTokens(rawText)

        setChatHistory((prev) => {
          if (
            prev.some((m) => m.id === userMsgId || (m.requestId === reqId && m.role === 'user'))
          ) {
            return prev
          }
          const userMsg: Message = {
            id: userMsgId,
            messageId: userMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'user',
            text: cleanUserText,
            content: cleanUserText,
            timestamp: (data as any).timestamp || Date.now(),
            inputType: (data as any).inputType || 'voice'
          }
          console.log('[AI_STATE_UPDATED]', {
            messageId: userMsgId,
            role: 'user',
            textLength: cleanUserText.length
          })
          return [...prev, userMsg].slice(-50)
        })
      } else if (role === 'model' || role === 'assistant') {
        const assistantMsgId = data.id || `msg_model_${reqId}`

        if (activeRequestIdRef.current !== reqId) {
          activeRequestIdRef.current = reqId
        }

        if (data.chunkIndex !== undefined) {
          let seenChunks = seenChunksPerRequestRef.current.get(reqId)
          if (!seenChunks) {
            seenChunks = new Set<number>()
            seenChunksPerRequestRef.current.set(reqId, seenChunks)
          }
          if (seenChunks.has(data.chunkIndex)) {
            return
          }
          seenChunks.add(data.chunkIndex)
        }

        const now = Date.now()
        const lastRecord = lastChunkRecordRef.current.get(reqId)
        if (
          lastRecord &&
          lastRecord.text === rawText &&
          now - lastRecord.time < 350 &&
          data.chunkIndex === undefined
        ) {
          return
        }
        lastChunkRecordRef.current.set(reqId, { text: rawText, time: now })

        setActiveStreamingId(assistantMsgId)
        seenMessageIdsRef.current.add(assistantMsgId)

        setChatHistory((prev) => {
          const existingIdx = prev.findIndex(
            (m) =>
              m.id === assistantMsgId ||
              (m.requestId === reqId && (m.role === 'model' || m.role === 'assistant'))
          )

          if (existingIdx >= 0) {
            const current = prev[existingIdx]
            let nextText = current.text

            if (
              data.mode === 'cumulative' ||
              (rawText.length >= current.text.length && rawText.startsWith(current.text))
            ) {
              nextText = rawText
            } else {
              if (current.text.endsWith(rawText) && rawText.length > 2) {
                nextText = current.text
              } else {
                nextText = current.text + rawText
              }
            }

            const updated = [...prev]
            updated[existingIdx] = {
              ...current,
              text: nextText,
              content: nextText
            }
            return updated
          } else {
            const newAssistantMsg: Message = {
              id: assistantMsgId,
              messageId: assistantMsgId,
              conversationId: activeSessionId,
              requestId: reqId,
              role: 'assistant',
              text: rawText,
              content: rawText,
              timestamp: now,
              inputType: (data as any).inputType || 'voice'
            }
            return [...prev, newAssistantMsg].slice(-50)
          }
        })
      }
    }

    const handleTranscriptComplete = (data?: {
      id?: string
      requestId?: string
      role?: string
      text?: string
      content?: string
      status?: 'success' | 'failed'
    }) => {
      if (!isMounted) return

      const reqId = data?.requestId || activeRequestIdRef.current
      const assistantMsgId = data?.id || (reqId ? `msg_model_${reqId}` : null)
      const rawText = data?.text || data?.content || ''
      const cleaned = rawText ? normalizeDuplicateTokens(rawText.trim()) : ''

      if (assistantMsgId || reqId) {
        setChatHistory((prev) => {
          const idx = prev.findIndex(
            (m) =>
              (assistantMsgId && m.id === assistantMsgId) ||
              (reqId && m.requestId === reqId && (m.role === 'model' || m.role === 'assistant'))
          )
          if (idx >= 0) {
            const final = cleaned || prev[idx].text || prev[idx].content || ''
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              text: final,
              content: final,
              status: data?.status || 'success'
            }
            console.log('[AI_STATE_UPDATED]', {
              messageId: updated[idx].id,
              role: updated[idx].role,
              status: data?.status || 'success'
            })
            return updated
          } else if (cleaned) {
            const finalId = assistantMsgId || `msg_model_${Date.now()}`
            const newAssistantMsg: Message = {
              id: finalId,
              messageId: finalId,
              conversationId: activeSessionId,
              requestId: reqId || undefined,
              role: 'assistant',
              text: cleaned,
              content: cleaned,
              timestamp: Date.now(),
              inputType: (data as any)?.inputType || 'voice',
              status: data?.status || 'success'
            }
            console.log('[AI_STATE_UPDATED]', {
              messageId: finalId,
              role: 'assistant',
              status: data?.status || 'success',
              createdOnComplete: true
            })
            return [...prev, newAssistantMsg].slice(-50)
          }
          return prev
        })
      }

      setActiveStreamingId(null)
      activeRequestIdRef.current = null
      setIsSubmitting(false)
    }

    let unsubTranscript: any
    let unsubComplete: any

    if ((window as any).iris) {
      unsubTranscript = (window as any).iris.onTranscript?.(handleTranscript)
      unsubComplete = (window as any).iris.onTranscriptComplete?.(handleTranscriptComplete)
    }

    return () => {
      isMounted = false
      if (typeof unsubTranscript === 'function') {
        unsubTranscript()
      } else if ((window as any).iris?.offTranscript) {
        ;(window as any).iris.offTranscript(handleTranscript)
      }

      if (typeof unsubComplete === 'function') {
        unsubComplete()
      } else if ((window as any).iris?.offTranscriptComplete) {
        ;(window as any).iris.offTranscriptComplete(handleTranscriptComplete)
      }
    }
  }, [])

  // 3. Auto-save chatHistory into sessions
  useEffect(() => {
    if (chatHistory.length === 0) return

    const currentHash = `${activeSessionId}_${chatHistory.length}_${
      chatHistory[chatHistory.length - 1]?.text || ''
    }`
    if (currentHash === lastSavedHashRef.current) return
    lastSavedHashRef.current = currentHash

    const userFirstMsg = chatHistory.find((m) => m.role === 'user')
    const titleSnippet = userFirstMsg ? userFirstMsg.text.slice(0, 36) : 'Conversation'

    setSessions((prevSessions) => {
      const existingIdx = prevSessions.findIndex((s) => s.id === activeSessionId)
      let nextSessions: ChatSession[]

      if (existingIdx >= 0) {
        if (prevSessions[existingIdx].messages === chatHistory) {
          return prevSessions
        }
        nextSessions = [...prevSessions]
        nextSessions[existingIdx] = {
          ...nextSessions[existingIdx],
          title:
            nextSessions[existingIdx].title === 'New Conversation'
              ? titleSnippet
              : nextSessions[existingIdx].title,
          updatedAt: Date.now(),
          messages: chatHistory
        }
      } else {
        const newSession: ChatSession = {
          id: activeSessionId,
          title: titleSnippet,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: chatHistory
        }
        nextSessions = [newSession, ...prevSessions]
      }

      chatHistoryService.saveSessions(nextSessions)
      return nextSessions
    })
  }, [chatHistory, activeSessionId])

  // 4. Auto-scroll on new messages and streaming updates with RAF and user scroll protection
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    isUserScrolledUpRef.current = !isNearBottom
  }, [])

  useEffect(() => {
    if (scrollRef.current && !showHistory && !isUserScrolledUpRef.current) {
      const el = scrollRef.current
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      })
    }
  }, [chatHistory, showHistory, activeStreamingId, interimTranscript, isSubmitting])

  // New Chat Handler
  const handleNewChat = () => {
    const newId = chatHistoryService.createNewSession()
    setActiveSessionId(newId)

    setChatHistory([])
    setActiveStreamingId(null)
    activeRequestIdRef.current = null
    seenMessageIdsRef.current.clear()
    seenChunksPerRequestRef.current.clear()
    lastChunkRecordRef.current.clear()
    setShowHistory(false)
    setShowVoiceLog(false)
    setInputVal('')

    if ((window as any).iris?.clearHistory) {
      try {
        ;(window as any).iris.clearHistory()
      } catch (_e) {}
    }
  }

  // External sync listeners (from IRISRoot sidebar or history actions)
  useEffect(() => {
    const handleExtNewChat = (e: any) => {
      const newId = e.detail || chatHistoryService.createNewSession()
      setActiveSessionId(newId)
      setChatHistory([])
      setActiveStreamingId(null)
      activeRequestIdRef.current = null
      seenMessageIdsRef.current.clear()
      seenChunksPerRequestRef.current.clear()
      lastChunkRecordRef.current.clear()
      setShowHistory(false)
    }
    const handleExtLoadSession = (e: any) => {
      if (e.detail) {
        handleSelectSession(e.detail)
      }
    }
    const handleExtToggleHistory = () => {
      setShowHistory((prev) => !prev)
    }
    const handleExtSessionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        const updated = e.detail as ChatSession[]
        setSessions((prev) => {
          if (prev.length === updated.length && prev[0]?.updatedAt === updated[0]?.updatedAt) {
            return prev
          }
          return updated
        })
      }
    }
    const handleExtActiveSessionChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setActiveSessionId(e.detail)
      }
    }

    window.addEventListener('iris:new-chat', handleExtNewChat)
    window.addEventListener('iris:load-session', handleExtLoadSession)
    window.addEventListener('iris:toggle-history', handleExtToggleHistory)
    window.addEventListener('iris:sessions-updated', handleExtSessionsUpdated)
    window.addEventListener('iris:active-session-changed', handleExtActiveSessionChanged)

    return () => {
      window.removeEventListener('iris:new-chat', handleExtNewChat)
      window.removeEventListener('iris:load-session', handleExtLoadSession)
      window.removeEventListener('iris:toggle-history', handleExtToggleHistory)
      window.removeEventListener('iris:sessions-updated', handleExtSessionsUpdated)
      window.removeEventListener('iris:active-session-changed', handleExtActiveSessionChanged)
    }
  }, [])

  // Restore past session
  const handleSelectSession = (session: ChatSession) => {
    chatHistoryService.setActiveSessionId(session.id)
    setActiveSessionId(session.id)

    setChatHistory(session.messages)
    seenMessageIdsRef.current.clear()
    for (const m of session.messages) {
      seenMessageIdsRef.current.add(m.id)
    }

    setActiveStreamingId(null)
    activeRequestIdRef.current = null
    setShowHistory(false)
  }

  // Delete specific session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = chatHistoryService.deleteSession(sessionId)
    setSessions(updated)

    if (sessionId === activeSessionId) {
      handleNewChat()
    }
  }

  // Clear all history
  const handleClearAllSessions = () => {
    if (window.confirm('Clear all conversation history?')) {
      chatHistoryService.clearAllSessions()
      setSessions([])
      handleNewChat()
    }
  }

  // Retry prompt handler for fallback notices / failed messages
  const handleRetry = (failedMsg: Message) => {
    // Find the preceding user message in chatHistory
    const msgIdx = chatHistory.findIndex((m) => m.id === failedMsg.id)
    let promptToRetry = ''
    if (msgIdx > 0) {
      for (let i = msgIdx - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'user') {
          promptToRetry = chatHistory[i].text
          break
        }
      }
    }

    if (!promptToRetry) {
      // Extract from message text if available (e.g. *"prompt"*)
      const match = failedMsg.text.match(/\*"([^"]+)"\*/) || failedMsg.text.match(/> \*"([^"]+)"\*/)
      if (match && match[1]) {
        promptToRetry = match[1].trim()
      }
    }

    if (promptToRetry) {
      if (onSendPrompt) {
        onSendPrompt(promptToRetry)
      } else {
        voiceService.triggerVoiceInput(promptToRetry, 'text')
      }
    }
  }

  // Safety watchdog: clear streaming and submitting if hanging for more than 16 seconds
  useEffect(() => {
    if (!isSubmitting && !activeStreamingId) return

    const watchdog = setTimeout(() => {
      console.warn('[AI_WATCHDOG] AI request/streaming timed out, resetting states.')
      setIsSubmitting(false)
      setActiveStreamingId(null)
      activeRequestIdRef.current = null
    }, 16000)

    return () => clearTimeout(watchdog)
  }, [isSubmitting, activeStreamingId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputVal.trim()
    if (!trimmed || isSubmitting) return

    console.log('[AI_INPUT]', { text: trimmed, inputType: 'text', sessionId: activeSessionId })

    const now = Date.now()
    if (trimmed === lastSubmissionRef.current.text && now - lastSubmissionRef.current.time < 800) {
      return
    }
    lastSubmissionRef.current = { text: trimmed, time: now }

    const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const userMsgId = `msg_user_${reqId}`
    const assistantMsgId = `msg_model_${reqId}`

    const isVoiceInput = wasVoicePromptRef.current || listening
    if (listening) {
      stopListening()
    }
    wasVoicePromptRef.current = false

    activeRequestIdRef.current = reqId
    setIsSubmitting(true)
    chatHistoryService.clearDraft(activeSessionId)
    setInputVal('')

    // Immediately push user message to chat state
    seenMessageIdsRef.current.add(userMsgId)
    setChatHistory((prev) => {
      if (prev.some((m) => m.id === userMsgId)) return prev
      const userMsg: Message = {
        id: userMsgId,
        messageId: userMsgId,
        conversationId: activeSessionId,
        requestId: reqId,
        role: 'user',
        text: trimmed,
        content: trimmed,
        timestamp: now,
        inputType: isVoiceInput ? 'voice' : 'text'
      }
      return [...prev, userMsg].slice(-50)
    })

    // Scroll to bottom immediately
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    })

    // 0. Check for App Launching & System Voice/Chat Commands (e.g. "open youtube", "open spotify", "launch github", etc.)
    const resolvedApp = IntentResolver.resolve(trimmed)
    if (resolvedApp && resolvedApp.app && resolvedApp.confidence >= 0.75) {
      ;(async () => {
        try {
          const launchRes = await launchManager.launch(resolvedApp.app, resolvedApp.secondaryParam)
          const fallbackLink = launchRes.fallbackUrl || (resolvedApp.app.type === 'external' ? resolvedApp.app.target : '')
          const responseText = `🚀 **Opening ${resolvedApp.app.name}**\n\nCommand executed: opened **${resolvedApp.app.name}** on your device.${fallbackLink ? `\n\n[👉 Open ${resolvedApp.app.name}](${fallbackLink})` : ''}`
          const spoken = launchRes.spokenResponse || `Opening ${resolvedApp.app.name}.`

          seenMessageIdsRef.current.add(assistantMsgId)
          const assistantMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'assistant',
            text: responseText,
            content: responseText,
            timestamp: Date.now(),
            inputType: isVoiceInput ? 'voice' : 'text'
          }
          setChatHistory((prev) => [...prev, assistantMsg].slice(-50))
          try {
            if (typeof chatHistoryService.addMessage === 'function') {
              chatHistoryService.addMessage(activeSessionId, assistantMsg)
            } else if (typeof (chatHistoryService as any).appendMessageToActiveSession === 'function') {
              (chatHistoryService as any).appendMessageToActiveSession(assistantMsg)
            }
          } catch (storageErr) {
            console.warn('[RightPanel] Could not save message to chatHistoryService:', storageErr)
          }
          setIsSubmitting(false)

          if (isVoiceInput) {
            speakAI(spoken)
          }
        } catch (err: any) {
          console.error('[RightPanel] App launch error:', err)
          setIsSubmitting(false)
        }
      })()
      return
    }

    // 1. Direct Real-time Streaming with DeepSeek (V3 & Reasoner R1)
    if (chatProvider === 'deepseek' || chatProvider === 'deepseek_r1') {
      ;(async () => {
        const dsModel = chatProvider === 'deepseek_r1' ? 'deepseek-reasoner' : 'deepseek-chat'
        try {
          setActiveStreamingId(assistantMsgId)
          seenMessageIdsRef.current.add(assistantMsgId)

          const placeholderMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'assistant',
            text: '',
            content: '',
            timestamp: Date.now(),
            inputType: 'text',
            provider: dsModel
          }
          setChatHistory((prev) => [...prev, placeholderMsg].slice(-50))

          const dsApiKey = localStorage.getItem('deepseek_api_key') || undefined

          const response = await fetch('/api/ai/deepseek/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(dsApiKey ? { 'x-deepseek-api-key': dsApiKey } : {})
            },
            body: JSON.stringify({
              prompt: trimmed,
              model: dsModel,
              apiKey: dsApiKey,
              stream: true,
              messages: chatHistory.slice(-8).map((m) => ({
                role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.text || m.content || ''
              }))
            })
          })

          if (!response.ok) {
            throw new Error(`DeepSeek API HTTP ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) throw new Error('Stream reader unavailable')

          const decoder = new TextDecoder()
          let accumulatedText = ''
          let accumulatedReasoning = ''
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine || trimmedLine.startsWith(':')) continue
              if (trimmedLine === 'data: [DONE]') continue
              if (trimmedLine.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmedLine.slice(6))
                  if (data.reasoning) {
                    accumulatedReasoning += data.reasoning
                  }
                  if (data.text) {
                    accumulatedText += data.text
                  }

                  let combined = ''
                  if (accumulatedReasoning && !accumulatedText) {
                    combined = `> 💭 *Thinking:*\n> ${accumulatedReasoning.replace(/\n/g, '\n> ')}`
                  } else if (accumulatedReasoning && accumulatedText) {
                    combined = `> 💭 *Thinking:*\n> ${accumulatedReasoning.replace(/\n/g, '\n> ')}\n\n${accumulatedText}`
                  } else {
                    combined = accumulatedText
                  }

                  setChatHistory((prev) => {
                    const idx = prev.findIndex((m) => m.id === assistantMsgId)
                    if (idx >= 0) {
                      const updated = [...prev]
                      updated[idx] = {
                        ...updated[idx],
                        text: combined,
                        content: combined
                      }
                      return updated
                    }
                    return prev
                  })

                  requestAnimationFrame(() => {
                    if (scrollRef.current && !isUserScrolledUpRef.current) {
                      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                    }
                  })
                } catch (_e) {}
              }
            }
          }

          setActiveStreamingId(null)
          setIsSubmitting(false)

          if (isVoiceInput && accumulatedText) {
            speakAI(accumulatedText)
          }
        } catch (dsErr: any) {
          setChatHistory((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantMsgId)
            const errorMsg = `⚠️ **DeepSeek Notice:** ${dsErr?.message || 'Request failure'}. Standing by.`
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                text: errorMsg,
                content: errorMsg,
                status: 'failed'
              }
              return updated
            }
            return prev
          })
          setActiveStreamingId(null)
          setIsSubmitting(false)
        }
      })()
      return
    }

    // 2. Direct Real-time Streaming with NVIDIA Moonshot Kimi-k3
    if (chatProvider === 'nvidia_kimi' || trimmed.includes('phi-3-5-vision')) {
      ;(async () => {
        try {
          setActiveStreamingId(assistantMsgId)
          seenMessageIdsRef.current.add(assistantMsgId)

          // Seed assistant message placeholder in chat history
          const placeholderMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'assistant',
            text: '',
            content: '',
            timestamp: Date.now(),
            inputType: 'text',
            provider: 'nvidia_kimi_k3'
          }
          setChatHistory((prev) => [...prev, placeholderMsg].slice(-50))

          const imageUrlMatch = trimmed.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)/i)
          const detectedImageUrl = imageUrlMatch
            ? imageUrlMatch[0]
            : trimmed.includes('phi-3-5-vision')
              ? 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1b.jpg'
              : undefined

          const response = await fetch('/api/ai/nvidia/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: trimmed,
              model: 'moonshotai/kimi-k3',
              stream: true,
              imageUrl: detectedImageUrl,
              messages: chatHistory.slice(-6).map((m) => ({
                role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.text || m.content || ''
              }))
            })
          })

          if (!response.ok) {
            throw new Error(`NVIDIA API HTTP ${response.status}`)
          }

          const reader = response.body?.getReader()
          if (!reader) throw new Error('Stream reader unavailable')

          const decoder = new TextDecoder()
          let accumulated = ''
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmedLine = line.trim()
              if (!trimmedLine || trimmedLine.startsWith(':')) continue
              if (trimmedLine === 'data: [DONE]') continue
              if (trimmedLine.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmedLine.slice(6))
                  if (data.text) {
                    accumulated += data.text
                    const currentAccum = accumulated
                    setChatHistory((prev) => {
                      const idx = prev.findIndex((m) => m.id === assistantMsgId)
                      if (idx >= 0) {
                        const updated = [...prev]
                        updated[idx] = {
                          ...updated[idx],
                          text: currentAccum,
                          content: currentAccum
                        }
                        return updated
                      }
                      return prev
                    })
                    requestAnimationFrame(() => {
                      if (scrollRef.current && !isUserScrolledUpRef.current) {
                        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                      }
                    })
                  }
                } catch (_e) {}
              }
            }
          }

          setActiveStreamingId(null)
          setIsSubmitting(false)

          if (isVoiceInput && accumulated) {
            speakAI(accumulated)
          }
        } catch (nvidiaErr: any) {
          setChatHistory((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantMsgId)
            const errorMsg = `⚠️ **NVIDIA Kimi-k3 Stream Notice:** ${nvidiaErr?.message || 'Request failure'}. Default engine standing by.`
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                text: errorMsg,
                content: errorMsg,
                status: 'failed'
              }
              return updated
            }
            return prev
          })
          setActiveStreamingId(null)
          setIsSubmitting(false)
        }
      })()
      return
    }

    // 3. Multimodal Chat with Gemini (AI-Q Citation Grounded)
    if (chatProvider === 'gemini') {
      ;(async () => {
        try {
          setActiveStreamingId(assistantMsgId)
          seenMessageIdsRef.current.add(assistantMsgId)

          const placeholderMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionId,
            requestId: reqId,
            role: 'assistant',
            text: '',
            content: '',
            timestamp: Date.now(),
            inputType: 'text',
            provider: 'gemini'
          }
          setChatHistory((prev) => [...prev, placeholderMsg].slice(-50))

          const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: trimmed,
              provider: 'gemini',
              model: 'gemini-2.5-flash',
              conversationHistory: chatHistory.slice(-8).map((m) => ({
                role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                text: m.text || m.content || ''
              }))
            })
          })

          const data = await response.json().catch(() => null)
          const normalized = normalizeAIResponse(data, {
            prompt: trimmed,
            requestId: reqId,
            conversationId: activeSessionId,
            provider: 'gemini',
            model: 'gemini-2.5-flash'
          })
          const returnedText = normalized.text

          setChatHistory((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantMsgId)
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                text: returnedText,
                content: returnedText,
                status: normalized.success ? 'success' : 'failed'
              }
              return updated
            }
            return prev
          })
          setActiveStreamingId(null)
          setIsSubmitting(false)

          if (isVoiceInput && returnedText) {
            speakAI(returnedText)
          }
        } catch (gemErr: any) {
          console.warn('[IRIS][AI] Direct fetch error, cascading to voice/chat service:', gemErr)
          if (onSendPrompt) {
            onSendPrompt(trimmed)
          } else {
            voiceService.triggerVoiceInput(trimmed, 'text')
          }
        }
      })()
      return
    }

    try {
      if (onSendPrompt) {
        onSendPrompt(trimmed)
      } else {
        voiceService.triggerVoiceInput(trimmed, 'text')
      }
    } catch (err: any) {
      console.warn('[AI_REQUEST_NOTICE]', err?.message || err)
      const errorMsg = `⚠️ **AI Notice:** Received "${trimmed}". Please retry in a moment.`
      setChatHistory((prev) => {
        const errorMsgObj: Message = {
          id: assistantMsgId,
          messageId: assistantMsgId,
          conversationId: activeSessionId,
          requestId: reqId,
          role: 'assistant',
          text: errorMsg,
          content: errorMsg,
          timestamp: Date.now(),
          inputType: 'text',
          status: 'failed'
        }
        return [...prev, errorMsgObj].slice(-50)
      })
      setIsSubmitting(false)
      setActiveStreamingId(null)
    }
  }

  // Active session helper for status display
  const activeSessionObj = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId)
  }, [sessions, activeSessionId])

  // Filtered sessions for History View
  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return sessions
    const query = historySearch.toLowerCase()
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.messages.some((m) => m.text.toLowerCase().includes(query))
    )
  }, [sessions, historySearch])

  return (
    <div className="h-full min-h-0 flex flex-col bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative">
      {/* Header with Conversation title, New Chat and History buttons */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 flex justify-between items-center shrink-0 bg-black/40 gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <h2 className="text-sm font-semibold text-white/90 tracking-wide shrink-0">
            Conversation
          </h2>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-mono shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium">Live</span>
          </div>
          {activeSessionObj && activeSessionObj.title !== 'New Conversation' && (
            <span
              className="text-[11px] text-zinc-400 truncate max-w-[100px] sm:max-w-[140px] hidden md:inline-block font-mono border-l border-white/10 pl-2"
              title={activeSessionObj.title}
            >
              {activeSessionObj.title}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Outage / Offline Indicator */}
          {!isOnline && (
            <div
              title="Internet outage detected. Autonomous IndexedDB offline cache active."
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-500/40 text-[10px] font-mono text-amber-300 shrink-0"
            >
              <WifiOff size={11} className="text-amber-400" />
              <span className="hidden sm:inline">Offline</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleNewChat}
            title="Start New Chat"
            aria-label="New Chat"
            className="flex items-center justify-center p-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg transition-all cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.12)] active:scale-95"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowHistory(!showHistory)
              if (!showHistory) setShowVoiceLog(false)
            }}
            title={showHistory ? 'Return to conversation' : 'View chat history'}
            aria-label="History"
            className={`flex items-center justify-center gap-1 p-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer active:scale-95 ${
              showHistory
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border-white/10'
            }`}
          >
            <History size={14} />
            {sessions.length > 0 && (
              <span className="px-1.5 py-0.2 bg-white/10 text-emerald-400 rounded-full text-[10px] font-mono leading-none">
                {sessions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Area: Either Voice Command Log OR Chat History View OR Active Messages */}
      {showVoiceLog ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-zinc-950/95 animate-in fade-in duration-150">
          <VoiceCommandLogSidePanel
            embedded
            onClose={() => setShowVoiceLog(false)}
            onExecuteCommand={(cmd) => {
              setShowVoiceLog(false)
              if (onSendPrompt) {
                onSendPrompt(cmd)
              } else {
                voiceService.triggerVoiceInput(cmd, 'text')
              }
            }}
          />
        </div>
      ) : showHistory ? (
        /* History Overlay View */
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden bg-zinc-950/95 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Chat History
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">({sessions.length} saved)</span>
            </div>

            <button
              onClick={() => setShowHistory(false)}
              className="p-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Close history"
            >
              <X size={15} />
            </button>
          </div>

          {/* Search Box */}
          {sessions.length > 0 && (
            <div className="mt-3 relative shrink-0">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40"
              />
            </div>
          )}

          {/* Sessions List */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-small">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-zinc-500 space-y-3">
                <MessageSquare size={32} className="text-zinc-700" />
                <p className="text-xs">
                  {historySearch ? 'No chats match your search.' : 'No saved chat history yet.'}
                </p>
                <button
                  onClick={handleNewChat}
                  className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs flex items-center gap-1.5 hover:bg-emerald-500/25 transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Start New Conversation</span>
                </button>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.id === activeSessionId
                const lastMsg = session.messages[session.messages.length - 1]

                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer group flex flex-col gap-1.5 relative ${
                      isActive
                        ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                        : 'bg-white/5 hover:bg-white/8 border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {session.title || 'Conversation'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {formatSessionTime(session.updatedAt || session.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="text-zinc-500 hover:text-red-400 p-1 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                          title="Delete chat"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {lastMsg && (
                      <p className="text-[11px] text-zinc-400 line-clamp-1 italic font-light">
                        {lastMsg.role === 'user' ? 'You: ' : 'IRIS: '}
                        {lastMsg.text}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-0.5">
                      <span>{session.messages.length} messages</span>
                      {isActive && (
                        <span className="text-emerald-400 font-mono font-medium">Active</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer Actions */}
          {sessions.length > 0 && (
            <div className="pt-3 border-t border-white/5 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleClearAllSessions}
                className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Clear all history</span>
              </button>

              <button
                type="button"
                onClick={handleNewChat}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} />
                <span>New chat</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Conversation Chat Messages Stream */
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 px-3 py-3 sm:px-4 sm:py-4 overflow-y-auto overscroll-contain flex flex-col gap-3 sm:gap-3.5 scroll-smooth smooth-scroll-container
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-white/10
            [&::-webkit-scrollbar-thumb]:rounded-full
            hover:[&::-webkit-scrollbar-thumb]:bg-emerald-500/40"
        >
          {chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center my-auto text-center space-y-3 px-2 py-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <Sparkles size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-200">New Conversation</h3>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Speak into your microphone or type a prompt below to communicate with IRIS.
                </p>
              </div>

              {/* Starter Suggestion Chips */}
              <div className="flex flex-col gap-1.5 w-full max-w-xs pt-1.5">
                {[
                  'What is IRIS and what can you do?',
                  'Search uploaded PDF documents for key insights',
                  'Search the web for latest AI breakthroughs',
                  'Generate an image of cybernetic neural core',
                  'Create architecture diagram of microservices',
                  'Scientific research on quantum entanglement',
                  'Search codebase for AICoreSphere'
                ].map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ x: 2, scale: 1.005 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setInputVal(prompt)
                    }}
                    className="w-full text-left px-2.5 py-1.5 text-[11px] sm:text-xs text-zinc-300 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 rounded-xl transition-colors cursor-pointer truncate"
                  >
                    &gt; {prompt}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {chatHistory.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                isStreaming={msg.id === activeStreamingId}
                onRetry={handleRetry}
              />
            ))}

            {/* Premium AI Thinking Indicator while waiting for streaming tokens */}
            {isSubmitting && !activeStreamingId && <AIThinkingIndicator key="iris-thinking" />}
          </AnimatePresence>

          {/* Real-time Audio Visualization & Interim Transcript when microphone is active */}
          {(isListening || interimTranscript) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex justify-end my-1"
            >
              <div className="max-w-[90%] sm:max-w-[85%] p-2.5 sm:p-3 rounded-2xl bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 rounded-br-md text-xs leading-relaxed shadow-lg flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 border-b border-emerald-500/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                      Voice Command Listening
                    </span>
                  </div>
                  {/* Real-time Decibel / Animated Waveform Meter */}
                  <div className="flex items-end gap-1 h-3.5 px-1.5 py-0.5 bg-black/50 rounded-full border border-emerald-500/20">
                    {[0.5, 1.2, 0.7, 1.6, 1.0, 1.4, 0.8, 1.3].map((factor, idx) => {
                      const level = Math.max(0.15, micLevel || 0.25)
                      const barH = Math.max(3, Math.min(12, level * 20 * factor))
                      return (
                        <span
                          key={idx}
                          className="w-1 rounded-full bg-emerald-400 transition-all duration-75"
                          style={{ height: `${barH}px` }}
                        />
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="italic font-mono text-[11px] text-emerald-200 truncate">
                    {interimTranscript
                      ? `"${interimTranscript}"`
                      : 'Listening for your voice command...'}
                  </span>
                  <span className="w-1.5 h-3 bg-emerald-400 animate-pulse shrink-0" />
                </div>
              </div>
            </motion.div>
          )}

          {/* Bottom spacing anchor to guarantee last message is never covered */}
          <div ref={messagesEndRef} className="h-2 shrink-0" />
        </div>
      )}

      {/* Bottom Composer */}
      <div className="shrink-0 border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl p-2 sm:p-2.5 flex flex-col gap-1.5 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] relative">
        {/* Microphone Permission / Status Warning Banner */}
        {micError && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs shadow-md">
            <span className="truncate">{micError}</span>
            <button
              type="button"
              onClick={() => setMicError(null)}
              className="text-amber-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Stop AI Voice Floating Pill when speaking */}
        {speaking && (
          <div className="flex items-center justify-end px-1 -mb-0.5">
            <button
              type="button"
              onClick={stopSpeaking}
              title="Stop AI voice speech"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/50 text-rose-300 text-xs font-mono transition-all cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse"
            >
              <VolumeX size={13} />
              <span>🔇 Stop AI Voice</span>
            </button>
          </div>
        )}

        {/* Input Form at bottom */}
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2 relative">
          <div className="relative flex-1 flex items-center min-w-0">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => {
                const nextVal = e.target.value
                setInputVal(nextVal)
                chatHistoryService.saveDraft(activeSessionId, nextVal)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder={
                listening
                  ? 'Listening...'
                  : speaking
                    ? 'AI is speaking...'
                    : 'Type message or voice prompt...'
              }
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40 transition-colors"
            />
          </div>

          {/* Microphone Button for Voice Input */}
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            title={listening ? 'Stop listening' : 'Voice input (Speak)'}
            className={`p-2 min-h-9 min-w-9 sm:min-h-10 sm:min-w-10 flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer shrink-0 ${
              listening
                ? 'bg-rose-950/60 border-rose-500/60 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.35)] animate-pulse'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/30 hover:bg-emerald-500/10 active:scale-95'
            }`}
          >
            {listening ? <Square size={14} className="fill-current" /> : <Mic size={16} />}
          </button>

          {/* Send Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={!inputVal.trim() || isSubmitting}
            className={`p-2 min-h-9 min-w-9 sm:min-h-10 sm:min-w-10 flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer shrink-0 ${
              inputVal.trim() && !isSubmitting
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-zinc-600 border-transparent cursor-not-allowed'
            }`}
            title="Send query"
          >
            <Send size={15} />
          </motion.button>
        </form>
      </div>
    </div>
  )
}
