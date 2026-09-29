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
  Radio,
  Cpu,
  Terminal,
  Database,
  Wifi,
  WifiOff,
  MapPin,
  Navigation,
  CalendarDays,
  ChevronDown,
  Check,
  ExternalLink,
  FileText,
  Video,
  Film,
  Music,
  ArrowDown
} from 'lucide-react'
import { RiFlashlightFill } from 'react-icons/ri'
import GoogleMapsPlaceCard from '../Chat/GoogleMapsPlaceCard'
import GoogleMapsDirectionsCard from '../Chat/GoogleMapsDirectionsCard'
import BookingCard from '../Chat/BookingCard'
import GeminiLiveVoiceBar from '../Chat/GeminiLiveVoiceBar'
import { chatHistoryService, Message, ChatSession } from '../../services/chatHistoryService'
import { shortcutService } from '../../services/shortcutService'
import { voiceService } from '../../services/voiceService'
import { coreSettingsService } from '../../services/coreSettingsService'
import { irisIndexedDBCache } from '../../services/irisIndexedDBCache'
import { offlineAiResponseEngine } from '../../services/offlineAiResponseEngine'
import { geminiLiveVoiceClient, VoiceOption } from '../../services/geminiLiveVoiceClient'
import { voiceSessionManager, voiceSettings } from '../../services/voice'
import { VoiceCommandLogSidePanel } from './VoiceCommandLogSidePanel'
import { IntentResolver, launchManager } from '../../launcher'
import { voiceCommandProcessor } from '../../services/voiceCommandProcessor'
import { normalizeAIResponse } from '../../services/aiResponseNormalizer'
import { getAiInstance } from '../../services/gemini'
import { smoothScrollEngine } from '../../services/smoothScrollEngine'
import { irisApiUrl } from '../../services/platformCapabilities'
import { PromptInputBox } from '@/components/ui/ai-prompt-box'
import { Plan } from '@/components/ui/agent-plan'
import { Brain, ChevronRight } from 'lucide-react'

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
async function requestDirectGeminiFallback(prompt: string, history: Message[]): Promise<string> {
  try {
    const ai = getAiInstance()
    const contents = [
      ...history.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || m.content || '' }]
      })),
      { role: 'user', parts: [{ text: prompt }] }
    ]

    for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction:
              'You are IRIS, a helpful conversational AI assistant. Answer the user directly and clearly. Do not mention internal fallback systems.'
          }
        })
        const text =
          typeof response.text === 'string'
            ? response.text.trim()
            : typeof response.text === 'function'
              ? String(response.text()).trim()
              : response.candidates?.[0]?.content?.parts
                  ?.map((p: any) => (typeof p === 'string' ? p : p.text || ''))
                  .filter(Boolean)
                  .join('\n')
                  .trim() || ''
        if (text) return text
      } catch (modelErr) {
        console.warn('[IRIS][DIRECT_GEMINI_FALLBACK]', model, modelErr)
      }
    }
  } catch (err) {
    console.warn('[IRIS][DIRECT_GEMINI_FALLBACK_INIT]', err)
  }
  return ''
}

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
  onSendPrompt?: (text: string) => void
}

const ChatMessageItem = memo(
  function ChatMessageItem({ msg, isStreaming, onRetry, onSendPrompt }: ChatMessageItemProps) {
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
        layoutId={`chat-msg-${msg.id}`}
        layout="position"
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
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
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                {(msg.mode === 'voice' || msg.inputType === 'voice') && (
                  <Mic size={11} className="text-emerald-400 shrink-0 inline mr-0.5" title="Voice transcript" />
                )}
                <span>{displayContent}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs sm:text-sm leading-relaxed space-y-2"><ReactMarkdown
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
                      <div
                        className="bg-black/60 p-2.5 rounded-xl border border-white/10 my-2 overflow-x-auto text-[11px] font-mono text-zinc-200"
                        {...props}
                      >
                        {children}
                      </div>
                    )
                  }
                }}
              >
                {displayContent}
              </ReactMarkdown>

              {/* Real-time Google Maps Places Card */}
              {msg.mapsData?.type === 'places' &&
                Array.isArray(msg.mapsData.places) &&
                msg.mapsData.places.length > 0 && (
                  <GoogleMapsPlaceCard
                    places={msg.mapsData.places}
                    onSelectDirections={(place) =>
                      onSendPrompt?.(`directions to ${place.name}, ${place.formattedAddress}`)
                    }
                    onSelectBooking={(place) =>
                      onSendPrompt?.(`book a table at ${place.name}`)
                    }
                  />
                )}

              {/* Real-time Google Maps Route & Turn-by-Turn Directions Card */}
              {msg.mapsData?.type === 'directions' && msg.mapsData.directions && (
                <GoogleMapsDirectionsCard directions={msg.mapsData.directions} />
              )}

              {/* Context-Aware Multi-Step Booking Card */}
              {msg.bookingData && (
                <BookingCard
                  data={msg.bookingData}
                  onAction={(actionText) => onSendPrompt?.(actionText)}
                />
              )}

              {/* Normalized Clickable Links Bar */}
              {Array.isArray(msg.links) && msg.links.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1.5 mt-1 border-t border-white/5">
                  <span className="text-[10px] text-zinc-500 font-mono">Links:</span>
                  {msg.links.map((link, lIdx) => (
                    <a
                      key={lIdx}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono transition-colors break-all"
                    >
                      <ExternalLink size={10} className="shrink-0" />
                      <span className="max-w-[200px] truncate">{link.replace(/^https?:\/\//i, '')}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Message File Attachments (Photos, Videos, Audio, Documents) */}
              {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 mt-1 border-t border-white/10">
                  {msg.attachments.map((att: any, attIdx: number) => {
                    const isImg = att.type === 'image' || (att.url && att.url.startsWith('data:image'))
                    const isVid = att.type === 'video' || (att.name && /\.(mp4|webm|mov|mkv)$/i.test(att.name))
                    const isAud = att.type === 'audio' || (att.name && /\.(mp3|wav|ogg|m4a)$/i.test(att.name))

                    if (isImg && att.url) {
                      return (
                        <div
                          key={attIdx}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-white/20 relative group/att cursor-pointer bg-black/50 hover:border-emerald-500/50 transition-colors"
                          onClick={() => window.open(att.url, '_blank')}
                          title={att.name || 'View Image'}
                        >
                          <img src={att.url} alt={att.name || 'attachment'} className="w-full h-full object-cover" />
                        </div>
                      )
                    }

                    if (isAud && att.url) {
                      return (
                        <div key={attIdx} className="flex flex-col gap-1 p-2 rounded-xl bg-black/40 border border-emerald-500/20 max-w-[220px]">
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300 truncate">
                            <Music size={12} className="shrink-0 text-emerald-400" />
                            <span className="truncate">{att.name}</span>
                          </div>
                          <audio src={att.url} controls className="h-7 w-full max-w-[200px]" />
                        </div>
                      )
                    }

                    return (
                      <a
                        key={attIdx}
                        href={att.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 text-zinc-200 hover:text-emerald-300 text-xs font-mono transition-colors"
                        title={att.name}
                      >
                        {isVid ? <Film size={14} className="text-purple-400" /> : <FileText size={14} className="text-amber-400" />}
                        <span className="max-w-[150px] truncate">{att.name}</span>
                      </a>
                    )
                  })}
                </div>
              )}</div>
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
 * Premium AI Thinking Indicator with dynamic LatticeLoader and multi-stage reasoning animation
 */
const AIThinkingIndicator = memo(function AIThinkingIndicator({
  statusText = 'Thinking...'
}: {
  statusText?: string
}) {
  const [currentStatus, setCurrentStatus] = useState<string>(statusText)
  const [stageIndex, setStageIndex] = useState<number>(0)
  const [showPlan, setShowPlan] = useState<boolean>(false)

  const thinkingStages = [
    'Parsing intent & semantic query context...',
    'Analyzing agent tools & memory graph...',
    'Executing neural reasoning & planning steps...',
    'Synthesizing final response output...'
  ]

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStageIndex((prev) => (prev < thinkingStages.length - 1 ? prev + 1 : prev))
    }, 1200)

    const unsubscribe = voiceSessionManager.subscribe((_state, payload) => {
      if (payload?.thinkingStatus) {
        setCurrentStatus(payload.thinkingStatus)
      } else if (payload?.activeTool) {
        const toolName = payload.activeTool
        const formatted =
          toolName.toLowerCase().includes('search')
            ? 'Searching live web...'
            : toolName.toLowerCase().includes('rag') || toolName.toLowerCase().includes('code')
            ? 'Processing codebase indexing...'
            : toolName.toLowerCase().includes('map')
            ? 'Locating coordinates on map...'
            : `Executing ${toolName}...`
        setCurrentStatus(formatted)
      }
    })
    return () => {
      clearInterval(stageInterval)
      unsubscribe()
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-2 my-2 w-full max-w-[95%] sm:max-w-[90%]"
    >
      <div className="p-3 sm:p-3.5 rounded-2xl rounded-bl-md bg-zinc-900/95 border border-emerald-500/30 text-xs sm:text-sm text-zinc-200 shadow-[0_0_24px_rgba(16,185,129,0.15)] flex flex-col gap-2.5">
        {/* Top Header with Lattice Loader & Status */}
        <motion.div
          className="h-px w-full overflow-hidden rounded-full bg-emerald-500/10"
          aria-hidden="true"
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
            animate={{ x: ["-120%", "320%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
            <LatticeLoader
              status="working"
              label={currentStatus || thinkingStages[stageIndex]}
              doneLabel="Done"
              pattern="orbit"
              grid={3}
              shape="round"
              cellSize={4.5}
              gap={2}
              fontSize={12}
              showTimer
              glow
              glowColor="rgba(34, 197, 94, 0.4)"
              color="#10b981"
            />
            <motion.span
              aria-label="Loading"
              className="flex items-center gap-0.5 text-emerald-400/80"
              initial={{ opacity: 0.35 }}
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  animate={{ y: [0, -3, 0], scale: [0.8, 1.15, 0.8] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: dot * 0.16,
                    ease: "easeInOut"
                  }}
                />
              ))}
            </motion.span>
          </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPlan((p) => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-[11px] font-mono text-emerald-400 border border-emerald-500/20 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Brain size={12} className="animate-pulse" />
            <span>{showPlan ? 'Hide Plan' : 'View Plan'}</span>
            <ChevronRight
              size={12}
              className={`transition-transform duration-200 ${showPlan ? 'rotate-90' : ''}`}
            />
          </button>
        </div>

        {/* Animated Reasoning Stage Stepper */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          {thinkingStages.map((stage, idx) => {
            const isCurrent = idx === stageIndex
            const isCompleted = idx < stageIndex
            return (
              <div
                key={idx}
                className="flex-1 flex flex-col gap-1"
                title={stage}
              >
                <div className="h-1 w-full rounded-full overflow-hidden bg-zinc-800">
                  <motion.div
                    className={`h-full ${
                      isCompleted
                        ? 'bg-emerald-400'
                        : isCurrent
                        ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                        : 'bg-zinc-800'
                    }`}
                    initial={{ width: 0 }}
                    animate={{
                      width: isCompleted ? '100%' : isCurrent ? '100%' : '0%'
                    }}
                    transition={{
                      duration: isCurrent ? 1.2 : 0.2,
                      ease: 'easeInOut'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Expandable Agent Reasoning Plan */}
        <AnimatePresence>
          {showPlan && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden pt-2"
            >
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/70 p-1">
                <Plan />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
  const activeSessionIdRef = useRef<string>(activeSessionId)

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  const [chatHistory, setChatHistory] = useState<Message[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [showVoiceLog, setShowVoiceLog] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [activeStreamingId, setActiveStreamingId] = useState<string | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chatProvider, setChatProvider] = useState<
    'gemini' | 'gemini_live' | 'google_maps' | 'deepseek' | 'deepseek_r1' | 'nvidia_kimi'
  >(() => {
    const active = coreSettingsService.getSettings().activeProvider
    if (active === 'deepseek' || active === 'deepseek_r1' || active === 'nvidia_kimi') return active
    return 'gemini'
  })
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [isGeminiLiveBarOpen, setIsGeminiLiveBarOpen] = useState(false)
  const [activeActionCategory, setActiveActionCategory] = useState<'places' | 'directions' | 'bookings' | null>(null)
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
  const prevUserSubmissionRef = useRef<{ text: string; time: number } | null>(null)
  const activeSubmitLockRef = useRef(false)

  const getAssistantMessageId = (requestId: string) => `msg_model_${requestId}`

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
    if (currentSavedSession) {
      if (currentSavedSession.messages.length > 0) {
        lastSavedHashRef.current = `${activeSessionId}_${currentSavedSession.messages.length}_${
          currentSavedSession.messages[currentSavedSession.messages.length - 1]?.text || ''
        }`
        setChatHistory(currentSavedSession.messages)
        seenMessageIdsRef.current.clear()
        for (const m of currentSavedSession.messages) {
          seenMessageIdsRef.current.add(m.id)
        }
      } else {
        setChatHistory([])
        seenMessageIdsRef.current.clear()
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

  // Voice history bridge: saves Gemini Live turns into the exact same session used by text chat.
  useEffect(() => {
    const handleVoiceHistory = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail?.text?.trim()) return

      const role = detail.role === 'user' ? 'user' : 'assistant'
      const messageId = detail.messageId || detail.id || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const message: Message = {
        id: messageId,
        messageId,
        conversationId: activeSessionIdRef.current,
        requestId: detail.requestId,
        role,
        mode: 'voice',
        text: detail.text.trim(),
        transcript: detail.text.trim(),
        content: detail.text.trim(),
        timestamp: detail.timestamp || Date.now(),
        inputType: 'voice',
        status: detail.status || 'success'
      }

      try {
        chatHistoryService.addMessage(activeSessionIdRef.current, message)
      } catch (error) {
        console.warn('[IRIS] Voice history save failed:', error)
      }

      setChatHistory((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id === messageId ||
            (m.messageId && m.messageId === messageId) ||
            (m.role === message.role &&
              m.text.trim().toLowerCase() === message.text.trim().toLowerCase() &&
              Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 2500)
        )

        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], ...message }
          return updated
        }

        return [...prev, message].slice(-50)
      })

      if (role === 'assistant') {
        setActiveStreamingId(null)
        setIsSubmitting(false)
      }
    }

    window.addEventListener('iris:voice-history', handleVoiceHistory)
    return () => window.removeEventListener('iris:voice-history', handleVoiceHistory)
  }, [])

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
        const cleanUserText = normalizeDuplicateTokens(rawText).trim()
        if (!cleanUserText) return

        const normalized = cleanUserText.replace(/\s+/g, ' ').trim().toLowerCase()
        const now = Date.now()
        const previous = prevUserSubmissionRef.current

        if (previous && previous.text === normalized && now - previous.time < 1500) {
          console.debug('[IRIS_DEDUPE] Duplicate voice transcript ignored')
          return
        }

        if (activeRequestIdRef.current && data.requestId && activeRequestIdRef.current === data.requestId) {
          console.debug('[IRIS_DEDUPE] Active request already owns transcript')
          return
        }

        setChatHistory((prev) => {
          const duplicate = prev.some((m) => {
            if (m.role !== 'user') return false
            const existing = normalizeDuplicateTokens(m.text || m.content || '').replace(/\s+/g, ' ').trim().toLowerCase()
            return existing === normalized
          })

          if (duplicate) {
            console.debug('[IRIS_DEDUPE] Existing user message found')
            return prev
          }

          const userMsgId = data.id || `msg_user_voice_${Date.now()}`
          const userMsg: Message = {
            id: userMsgId,
            messageId: userMsgId,
            conversationId: activeSessionIdRef.current,
            requestId: data.requestId,
            role: 'user',
            mode: 'voice',
            text: cleanUserText,
            transcript: cleanUserText,
            content: cleanUserText,
            timestamp: (data as any).timestamp || now,
            inputType: 'voice'
          }

          seenMessageIdsRef.current.add(userMsgId)

          try {
            chatHistoryService.addMessage(activeSessionIdRef.current, userMsg)
          } catch (error) {
            console.warn('[IRIS] Transcript save failed:', error)
          }

          prevUserSubmissionRef.current = { text: normalized, time: now }
          return [...prev, userMsg].slice(-50)
        })
      } else if (role === 'model' || role === 'assistant') {
        const reqId = data.requestId || activeRequestIdRef.current
        if (!reqId) return

        const assistantMsgId = data.id || getAssistantMessageId(reqId)
        const incoming = normalizeDuplicateTokens(rawText || '')

        if (!incoming && data.isFinal) return

        if (data.chunkIndex !== undefined) {
          let seenChunks = seenChunksPerRequestRef.current.get(reqId)
          if (!seenChunks) {
            seenChunks = new Set<number>()
            seenChunksPerRequestRef.current.set(reqId, seenChunks)
          }
          if (seenChunks.has(data.chunkIndex)) return
          seenChunks.add(data.chunkIndex)
        }

        setActiveStreamingId(assistantMsgId)

        setChatHistory((prev) => {
          const existingIdx = prev.findIndex(
            (m) =>
              m.id === assistantMsgId ||
              (m.requestId === reqId && (m.role === 'assistant' || m.role === 'model'))
          )

          if (existingIdx >= 0) {
            const updated = [...prev]
            const current = updated[existingIdx]
            let nextText = current.text || ''

            if (data.mode === 'cumulative') {
              nextText = incoming
            } else if (incoming && nextText && incoming.startsWith(nextText)) {
              nextText = incoming
            } else if (incoming && !nextText.endsWith(incoming)) {
              nextText += incoming
            } else if (!nextText) {
              nextText = incoming
            }

            updated[existingIdx] = {
              ...current,
              id: assistantMsgId,
              messageId: assistantMsgId,
              requestId: reqId,
              role: 'assistant',
              text: nextText,
              content: nextText
            }
            return updated
          }

          if (!incoming.trim()) return prev

          const assistantMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionIdRef.current,
            requestId: reqId,
            role: 'assistant',
            text: incoming,
            content: incoming,
            timestamp: Date.now(),
            inputType: 'voice'
          }

          return [...prev, assistantMsg].slice(-50)
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
      if (!reqId) {
        setActiveStreamingId(null)
        setIsSubmitting(false)
        return
      }

      const assistantMsgId = data?.id || getAssistantMessageId(reqId)
      const finalText = normalizeDuplicateTokens(data?.text || data?.content || '').trim()

      setChatHistory((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id === assistantMsgId ||
            (m.requestId === reqId && (m.role === 'assistant' || m.role === 'model'))
        )

        if (idx >= 0) {
          const final = finalText || prev[idx].text || prev[idx].content || ''
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            id: assistantMsgId,
            messageId: assistantMsgId,
            text: final,
            content: final,
            status: data?.status || 'success'
          }
          return updated
        } else if (finalText) {
          const assistantMsg: Message = {
            id: assistantMsgId,
            messageId: assistantMsgId,
            conversationId: activeSessionIdRef.current,
            requestId: reqId,
            role: 'assistant',
            text: finalText,
            content: finalText,
            timestamp: Date.now(),
            inputType: 'voice',
            status: data?.status || 'success'
          }
          return [...prev, assistantMsg].slice(-50)
        }
        return prev
      })

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

    const lastMsg = chatHistory[chatHistory.length - 1]
    const currentHash = `${activeSessionId}_${chatHistory.length}_${lastMsg?.id || ''}_${lastMsg?.text || ''}_${lastMsg?.status || ''}`
    if (currentHash === lastSavedHashRef.current) return
    lastSavedHashRef.current = currentHash

    const userFirstMsg = chatHistory.find((m) => m.role === 'user')
    const titleSnippet = userFirstMsg ? userFirstMsg.text.slice(0, 36) : 'Conversation'

    setSessions((prevSessions) => {
      const existingIdx = prevSessions.findIndex((s) => s.id === activeSessionId)
      let nextSessions: ChatSession[]

      if (existingIdx >= 0) {
        const currentSession = prevSessions[existingIdx]
        if (
          currentSession.messages.length === chatHistory.length &&
          currentSession.messages[currentSession.messages.length - 1]?.id === lastMsg?.id &&
          currentSession.messages[currentSession.messages.length - 1]?.text === lastMsg?.text &&
          currentSession.messages[currentSession.messages.length - 1]?.status === lastMsg?.status
        ) {
          return prevSessions
        }
        nextSessions = [...prevSessions]
        nextSessions[existingIdx] = {
          ...currentSession,
          title:
            currentSession.title === 'New Conversation'
              ? titleSnippet
              : currentSession.title,
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

      // Save sessions asynchronously without triggering unneeded re-renders
      setTimeout(() => {
        chatHistoryService.saveSessions(nextSessions)
      }, 0)

      return nextSessions
    })
  }, [chatHistory, activeSessionId])

  // 4. Auto-scroll on new messages and streaming updates with RAF and user scroll protection
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    isUserScrolledUpRef.current = !isNearBottom
    setShowScrollToBottom(!isNearBottom)
  }, [])

  // 4. Attach ultra-smooth kinetic inertial scrolling and auto-scroll to bottom
  useEffect(() => {
    if (!scrollRef.current) return
    const cleanup = smoothScrollEngine.attachSmoothScroll(scrollRef.current)
    return () => cleanup()
  }, [showHistory])

  useEffect(() => {
    if (scrollRef.current && !showHistory && !isUserScrolledUpRef.current) {
      // Use physics-based smoothScrollToBottom for 120fps fluid scrolling
      smoothScrollEngine.smoothScrollToBottom(scrollRef.current, activeStreamingId ? 120 : 250)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
        setSessions(updated)

        // Real-time voice to text chat synchronization:
        // If current active session received new turns, update chatHistory immediately
        const curActiveId = activeSessionIdRef.current || chatHistoryService.getActiveSessionId()
        const currentActive = updated.find((s) => s.id === curActiveId)
        if (currentActive && Array.isArray(currentActive.messages)) {
          setChatHistory((prev) => {
            const lastPrev = prev[prev.length - 1]
            const lastCurr = currentActive.messages[currentActive.messages.length - 1]
            const hasNewMessages =
              currentActive.messages.length !== prev.length ||
              (lastCurr && lastPrev && (
                lastCurr.id !== lastPrev.id ||
                lastCurr.text !== lastPrev.text ||
                lastCurr.status !== lastPrev.status
              ))

            if (hasNewMessages) {
              seenMessageIdsRef.current.clear()
              for (const m of currentActive.messages) {
                seenMessageIdsRef.current.add(m.id)
              }
              return currentActive.messages
            }
            return prev
          })
        }
      }
    }
    const handleExtActiveSessionChanged = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        const targetId = e.detail
        setActiveSessionId(targetId)
        const all = chatHistoryService.getSessions()
        const target = all.find((s) => s.id === targetId)
        if (target && Array.isArray(target.messages)) {
          setChatHistory(target.messages)
          seenMessageIdsRef.current.clear()
          for (const m of target.messages) {
            seenMessageIdsRef.current.add(m.id)
          }
        } else {
          setChatHistory([])
        }
      }
    }

    window.addEventListener('iris:new-chat', handleExtNewChat)
    window.addEventListener('iris:load-session', handleExtLoadSession)
    window.addEventListener('iris:toggle-history', handleExtToggleHistory)
    window.addEventListener('iris:sessions-updated', handleExtSessionsUpdated)
    window.addEventListener('iris:active-session-changed', handleExtActiveSessionChanged)

    const handleShareToChat = (e: any) => {
      const files = e.detail?.files
      if (Array.isArray(files) && files.length > 0) {
        const limited = files.slice(0, 10)
        const summary = `Shared ${limited.length} file(s) from Gallery: ${limited.map((f: any) => f.name || f.displayName || 'file').join(', ')}`
        handleSendPrompt(summary, limited)
      }
    }
    window.addEventListener('iris:share-to-chat', handleShareToChat)

    return () => {
      window.removeEventListener('iris:new-chat', handleExtNewChat)
      window.removeEventListener('iris:load-session', handleExtLoadSession)
      window.removeEventListener('iris:toggle-history', handleExtToggleHistory)
      window.removeEventListener('iris:sessions-updated', handleExtSessionsUpdated)
      window.removeEventListener('iris:active-session-changed', handleExtActiveSessionChanged)
      window.removeEventListener('iris:share-to-chat', handleShareToChat)
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
      const match = failedMsg.text.match(/\*"([^"]+)"\*/) || failedMsg.text.match(/> \*"([^"]+)"\*/)
      if (match?.[1]) {
        promptToRetry = match[1].trim()
      }
    }

    if (promptToRetry) {
      void handleSubmit(undefined, promptToRetry)
    }
  }

  const handleSendPrompt = useCallback(
    (promptText: string, attachedFiles?: any[]) => {
      const trimmed = (promptText || '').trim()
      const hasAttachments = Array.isArray(attachedFiles) && attachedFiles.length > 0
      if (!trimmed && !hasAttachments) return

      void handleSubmit(undefined, trimmed, attachedFiles)
    },
    []
  )

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

  const handleSubmit = async (e?: React.FormEvent, customText?: string, attachedFiles?: any[]) => {
    if (e) e.preventDefault()
    let trimmed = (customText !== undefined ? customText : inputVal).trim()
    const hasAttachments = Array.isArray(attachedFiles) && attachedFiles.length > 0
    if ((!trimmed && !hasAttachments) || isSubmitting) return
    if (!trimmed && hasAttachments) {
      trimmed = `Shared ${attachedFiles.length} file(s)`
    }

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
    isUserScrolledUpRef.current = false
    setShowScrollToBottom(false)
    if (scrollRef.current) {
      smoothScrollEngine.smoothScrollToBottom(scrollRef.current, 200)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    chatHistoryService.clearDraft(activeSessionId)
    setInputVal('')

    let formattedAttachments: any[] | undefined = undefined
    if (hasAttachments) {
      formattedAttachments = await Promise.all(
        attachedFiles.map(async (f: any) => {
          if (f.url) {
            return {
              name: f.name || f.displayName || 'file',
              url: f.url,
              type: f.type || 'file',
              size: f.size
            }
          }
          if (f instanceof File) {
            const url = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = (ev) => resolve((ev.target?.result as string) || '')
              reader.onerror = () => resolve('')
              reader.readAsDataURL(f)
            })
            return {
              name: f.name,
              url,
              type: f.type.startsWith('image/')
                ? 'image'
                : f.type.startsWith('video/')
                  ? 'video'
                  : f.type.startsWith('audio/')
                    ? 'audio'
                    : 'file',
              size: f.size
            }
          }
          return {
            name: f.name || 'file',
            url: f.customUrl || '',
            type: f.type || 'file',
            size: f.size
          }
        })
      )
    }

    // Immediately push user message to chat state and persist to unified chatHistoryService
    seenMessageIdsRef.current.add(userMsgId)
    const userMsg: Message = {
      id: userMsgId,
      messageId: userMsgId,
      conversationId: activeSessionId,
      requestId: reqId,
      role: 'user',
      mode: isVoiceInput ? 'voice' : 'text',
      text: trimmed,
      transcript: trimmed,
      content: trimmed,
      timestamp: now,
      inputType: isVoiceInput ? 'voice' : 'text',
      attachments: formattedAttachments
    }

    try {
      chatHistoryService.addMessage(activeSessionId, userMsg)
    } catch (_storeErr) {
      console.warn('[RightPanel] Error saving user message:', _storeErr)
    }

    setChatHistory((prev) => {
      if (prev.some((m) => m.id === userMsgId)) return prev
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

    // 0b. Check for Memory Storage Intent ("store this memory in Google Drive", "store this memory in Google Spreadsheets")
    const lowerTrimmed = trimmed.toLowerCase()
    const isMemoryDriveIntent =
      (lowerTrimmed.includes('store') || lowerTrimmed.includes('save') || lowerTrimmed.includes('keep') || lowerTrimmed.includes('add')) &&
      (lowerTrimmed.includes('memory') || lowerTrimmed.includes('this note') || lowerTrimmed.includes('note') || lowerTrimmed.includes('history')) &&
      (lowerTrimmed.includes('google drive') || lowerTrimmed.includes('drive'))

    const isMemorySheetsIntent =
      (lowerTrimmed.includes('store') || lowerTrimmed.includes('save') || lowerTrimmed.includes('keep') || lowerTrimmed.includes('add')) &&
      (lowerTrimmed.includes('memory') || lowerTrimmed.includes('this note') || lowerTrimmed.includes('note') || lowerTrimmed.includes('history')) &&
      (lowerTrimmed.includes('spreadsheet') || lowerTrimmed.includes('spreadsheets') || lowerTrimmed.includes('sheets') || lowerTrimmed.includes('google sheets'))

    if (isMemoryDriveIntent || isMemorySheetsIntent) {
      ;(async () => {
        try {
          const target = isMemorySheetsIntent ? 'sheets' : 'drive'
          let memoryContent = trimmed

          if (trimmed.length < 50 && chatHistory.length > 0) {
            const lastAssistantMsg = [...chatHistory].reverse().find((m) => m.role === 'assistant' && m.text)
            if (lastAssistantMsg) {
              memoryContent = `Prompt: ${trimmed}\n\nContext Memory:\n${lastAssistantMsg.text}`
            }
          }

          const res = await fetch('/api/workspace/memory/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              memoryText: memoryContent,
              target,
              title: `IRIS Memory Record (${new Date().toLocaleDateString()})`
            })
          })

          const data = await res.json()
          let responseText = ''
          let spokenText = ''

          if (data.success) {
            const targetName = target === 'sheets' ? 'Google Spreadsheets' : 'Google Drive'
            const fileLink = data.link || '#'
            responseText = `📁 **Memory Saved to ${targetName}**\n\nYour memory record has been successfully exported and stored in your ${targetName}.\n\n[👉 View File in ${targetName}](${fileLink})`
            spokenText = `I have stored your memory in ${targetName}.`
          } else {
            responseText = `⚠️ **Workspace Memory Storage Notice**\n\n${data.error || 'Unable to store memory to Google Workspace. Please check your OAuth connection in the Google Workspace Hub.'}`
            spokenText = `Failed to store memory to Google Workspace. Please verify your connection.`
          }

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
            chatHistoryService.addMessage(activeSessionId, assistantMsg)
          } catch (_err) {}
          setIsSubmitting(false)

          if (isVoiceInput) {
            speakAI(spokenText)
          }
        } catch (err: any) {
          console.error('[RightPanel] Memory storage error:', err)
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

    // 3. Multimodal Chat with Gemini (Context-Aware Booking, Maps Grounding & Support Agent)
    if (chatProvider === 'gemini' || chatProvider === 'google_maps') {
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
            provider: chatProvider === 'google_maps' ? 'google_maps' : 'gemini'
          }
          setChatHistory((prev) => [...prev, placeholderMsg].slice(-50))

          const response = await fetch(irisApiUrl('/api/ai/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: trimmed,
              provider: 'gemini',
              model: 'gemini-3.8-flash',
              agentRole: chatProvider === 'google_maps' ? 'maps' : undefined,
              conversationHistory: chatHistory.slice(-8).map((m) => ({
                role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                text: m.text || m.content || ''
              }))
            })
          })

          const data = await response.json().catch(() => null)
          let normalized = normalizeAIResponse(data, {
            prompt: trimmed,
            requestId: reqId,
            conversationId: activeSessionId,
            provider: 'gemini',
            model: 'gemini-3.8-flash'
          })

          if (!response.ok || !data || !normalized.success) {
            const directText = await requestDirectGeminiFallback(trimmed, chatHistory)
            if (directText) {
              normalized = normalizeAIResponse(
                { text: directText, provider: 'gemini', model: 'gemini-2.5-flash' },
                {
                  prompt: trimmed,
                  requestId: reqId,
                  conversationId: activeSessionId,
                  provider: 'gemini',
                  model: 'gemini-2.5-flash'
                }
              )
            }
          }

          const returnedText = normalized.text

          setChatHistory((prev) => {
            const idx = prev.findIndex((m) => m.id === assistantMsgId)
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                text: returnedText,
                content: returnedText,
                status: normalized.success ? 'success' : 'failed',
                mapsData: data?.mapsData,
                bookingData: data?.bookingData
              }
              try {
                chatHistoryService.addMessage(activeSessionId, updated[idx])
              } catch (_e) {}
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
    const query = historySearch.toLowerCase().trim()
    return sessions.filter(
      (s) =>
        (s.title || '').toLowerCase().includes(query) ||
        (s.messages || []).some((m) =>
          (m.text || m.content || m.transcript || '').toLowerCase().includes(query)
        )
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

        {/* Action buttons & Provider Selector */}
        <div className="flex items-center gap-1.5 shrink-0 relative">
          {/* Provider / Agent Mode Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-zinc-300 border border-white/10 cursor-pointer"
              title="Select AI Agent & Chat Option"
            >
              {chatProvider === 'gemini' && <Sparkles size={12} className="text-emerald-400" />}
              {chatProvider === 'gemini_live' && <Radio size={12} className="text-emerald-400 animate-pulse" />}
              {chatProvider === 'google_maps' && <MapPin size={12} className="text-amber-400" />}
              {chatProvider === 'deepseek' && <Cpu size={12} className="text-cyan-400" />}
              {chatProvider === 'deepseek_r1' && <Terminal size={12} className="text-purple-400" />}
              {chatProvider === 'nvidia_kimi' && <Sparkles size={12} className="text-green-400" />}
              <span className="hidden sm:inline font-semibold">
                {chatProvider === 'gemini'
                  ? 'Gemini Agent'
                  : chatProvider === 'gemini_live'
                    ? 'Gemini Live'
                    : chatProvider === 'google_maps'
                      ? 'Google Maps'
                      : chatProvider === 'deepseek_r1'
                        ? 'DeepSeek R1'
                        : chatProvider === 'deepseek'
                          ? 'DeepSeek'
                          : 'NVIDIA Kimi'}
              </span>
              <ChevronDown size={11} className="text-zinc-500" />
            </button>

            {showProviderMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-xl">
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold border-b border-white/5">
                  AI Chat & Agent Option
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChatProvider('gemini')
                    setShowProviderMenu(false)
                  }}
                  className={`flex items-start gap-2 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    chatProvider === 'gemini'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <Sparkles size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">Gemini Support Agent</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      Context-aware assistant for multi-step bookings & Google Maps
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChatProvider('gemini_live')
                    setIsGeminiLiveBarOpen(true)
                    setShowProviderMenu(false)
                  }}
                  className={`flex items-start gap-2 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    chatProvider === 'gemini_live' || isGeminiLiveBarOpen
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <Radio size={14} className="text-emerald-400 mt-0.5 shrink-0 animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">Gemini Live Voice</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      Real-time bidirectional speech conversation (Gemini Live API)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChatProvider('google_maps')
                    setShowProviderMenu(false)
                  }}
                  className={`flex items-start gap-2 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    chatProvider === 'google_maps'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <MapPin size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">Google Maps Agent</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      Real-time places discovery, directions & turn-by-turn routes
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChatProvider('deepseek_r1')
                    setShowProviderMenu(false)
                  }}
                  className={`flex items-start gap-2 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    chatProvider === 'deepseek_r1'
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <Terminal size={14} className="text-purple-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">DeepSeek Reasoner R1</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      In-depth chain-of-thought mathematical & logical reasoning
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setChatProvider('nvidia_kimi')
                    setShowProviderMenu(false)
                  }}
                  className={`flex items-start gap-2 p-2 rounded-xl text-left transition-colors cursor-pointer ${
                    chatProvider === 'nvidia_kimi'
                      ? 'bg-green-500/15 text-green-300 border border-green-500/30'
                      : 'hover:bg-white/5 text-zinc-300'
                  }`}
                >
                  <Cpu size={14} className="text-green-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold font-mono">NVIDIA Moonshot Kimi</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">
                      High-speed neural completion
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Quick Gemini Live Voice Toggle Button */}
          <button
            type="button"
            onClick={() => setIsGeminiLiveBarOpen(!isGeminiLiveBarOpen)}
            title={isGeminiLiveBarOpen ? 'Hide Gemini Live Voice' : 'Start Gemini Live Voice Conversation'}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
              isGeminiLiveBarOpen
                ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <Radio size={12} className={isGeminiLiveBarOpen ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Live Voice</span>
          </button>
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
                placeholder="Filter conversations by keyword..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40"
              />
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white rounded-md transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Sessions List */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-small ultra-smooth-scroll smooth-scroll-container">
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
        <motion.div
          key={activeSessionId}
          layoutId={`chat-stream-${activeSessionId}`}
          layout="position"
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 px-3 py-2.5 sm:px-4 sm:py-3 overflow-y-auto overscroll-contain flex flex-col gap-2.5 sm:gap-3 scroll-smooth smooth-scroll-container ultra-smooth-scroll iris-120fps-scroll
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
                  '📱 Inspect screen nodes via Iris Accessibility Service',
                  '⚡ Automate Android action: Open YouTube & Play',
                  '🗺️ Find top restaurants nearby',
                  '🛎️ Reserve a dinner table for 2 tomorrow at 7pm',
                  '🚗 Directions from here to Times Square',
                  '🏨 Book a hotel room for 2 guests',
                  'Search uploaded PDF documents for key insights',
                  'Search the web for latest AI breakthroughs'
                ].map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ x: 2, scale: 1.005 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const cleanPrompt = prompt.replace(/^[^\p{L}\p{N}\s]+/u, '').trim() || prompt
                      handleSendPrompt(cleanPrompt)
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
                onSendPrompt={(p) => handleSendPrompt(p)}
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
        </motion.div>
      )}

      {/* Bottom Composer */}
      <motion.div
        layoutId="chat-bottom-composer"
        layout="position"
        className="shrink-0 border-t border-white/10 bg-zinc-950/95 backdrop-blur-xl p-1 sm:p-1.5 flex flex-col gap-0.5 z-20 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] relative"
      >
        {/* Floating Scroll-to-Bottom Indicator Pill */}
        <AnimatePresence>
          {showScrollToBottom && !showHistory && (
            <motion.button
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              type="button"
              onClick={() => {
                isUserScrolledUpRef.current = false
                setShowScrollToBottom(false)
                if (scrollRef.current) {
                  smoothScrollEngine.smoothScrollToBottom(scrollRef.current, 300)
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className="absolute right-4 -top-11 z-30 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold font-mono shadow-[0_4px_20px_rgba(16,185,129,0.4)] transition-all cursor-pointer border border-emerald-300/40 active:scale-95"
            >
              <ArrowDown size={14} className="animate-bounce" />
              <span>Scroll to Latest Message</span>
            </motion.button>
          )}
        </AnimatePresence>
        {/* Inline Gemini Live Voice Stream Bar */}
        <AnimatePresence>
          {isGeminiLiveBarOpen && (
            <div className="mb-1">
              <GeminiLiveVoiceBar
                onClose={() => setIsGeminiLiveBarOpen(false)}
                onTranscriptReceived={(role, text) => {
                  if (role === 'user' && text && text.trim()) {
                    handleSendPrompt(text)
                  }
                }}
              />
            </div>
          )}
        </AnimatePresence>



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

        {/* AI Prompt Box Typing Bar with Voice, Images, and Tools */}
        <div className="relative w-full">
          <PromptInputBox
            placeholder={
              listening
                ? 'Listening...'
                : speaking
                  ? 'AI is speaking...'
                  : 'Type message, prompt, or attach images...'
            }
            isLoading={isSubmitting || !!activeStreamingId}
            onSend={(promptText, attachedFiles) => {
              if ((promptText && promptText.trim()) || (attachedFiles && attachedFiles.length > 0)) {
                handleSendPrompt(promptText || '', attachedFiles)
                setInputVal('')
              }
            }}
            className="border-white/10 bg-zinc-900/90 rounded-2xl"
          />
        </div>
      </motion.div>
    </div>
  )
}
