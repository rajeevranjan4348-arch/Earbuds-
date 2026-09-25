import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  MicOff,
  Send,
  Paperclip,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  StopCircle,
  Radio,
  Globe,
  Settings,
  CornerDownLeft
} from 'lucide-react'
import {
  voiceSessionManager,
  VoiceState,
  VoiceTurnMessage,
  VoicePersonalityId,
  SupportedLanguage,
  VOICE_PERSONALITIES
} from '../../services/voice'
import ThinkingIndicator from '../UI/ThinkingIndicator'
import ConfidenceMeter from '../UI/ConfidenceMeter'

export interface MediaAttachment {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
  size?: number
}

export interface AiChat8Props {
  onSendMessage?: (message: string, attachments: MediaAttachment[]) => void
  className?: string
  placeholder?: string
}

export const AiChat8: React.FC<AiChat8Props> = ({
  onSendMessage,
  className = '',
  placeholder = 'Type a message or press mic to speak...'
}) => {
  const [inputText, setInputText] = useState<string>('')
  const [attachments, setAttachments] = useState<MediaAttachment[]>([])
  const [voiceState, setVoiceState] = useState<VoiceState>(voiceSessionManager.getVoiceState())
  const [interimTranscript, setInterimTranscript] = useState<string>('')
  const [transcriptConfidence, setTranscriptConfidence] = useState<number>(88)
  const [micLevel, setMicLevel] = useState<number>(0)
  const [isMuted, setIsMuted] = useState<boolean>(voiceSessionManager.isMuted())
  const [activePersonality, setActivePersonality] = useState<VoicePersonalityId>(
    voiceSessionManager.getConfig().personality
  )
  const [language, setLanguage] = useState<SupportedLanguage>(
    voiceSessionManager.getConfig().language
  )
  const [thinkingStatus, setThinkingStatus] = useState<string>('Thinking...')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const unsubscribe = voiceSessionManager.subscribe((_state, payload) => {
      if (payload?.voiceState) {
        setVoiceState(payload.voiceState)
      } else {
        setVoiceState(voiceSessionManager.getVoiceState())
      }

      if (payload?.type === 'audio_level') {
        setMicLevel(payload.level)
      } else if (payload?.type === 'interim_transcript') {
        setInterimTranscript(payload.text)
        if (payload.confidence) setTranscriptConfidence(payload.confidence)
      } else if (payload?.confidence) {
        setTranscriptConfidence(payload.confidence)
      } else if (payload?.type === 'mute_change') {
        setIsMuted(payload.isMuted)
      } else if (payload?.type === 'personality_change') {
        setActivePersonality(payload.personality.id)
      } else if (payload?.type === 'language_change') {
        setLanguage(payload.language)
      } else if (payload?.thinkingStatus) {
        setThinkingStatus(payload.thinkingStatus)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Audio Waveform Visualization
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const bars = 24

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const isLive = voiceState === 'listening' || voiceState === 'user_speaking' || voiceState === 'speaking'
      const barWidth = canvas.width / bars - 2

      for (let i = 0; i < bars; i++) {
        let barHeight = 4
        if (isLive) {
          const factor = Math.sin(Date.now() * 0.008 + i * 0.3) * 0.5 + 0.5
          barHeight = Math.max(4, micLevel * canvas.height * factor * 1.5)
        }

        const x = i * (barWidth + 2)
        const y = (canvas.height - barHeight) / 2

        ctx.fillStyle = voiceState === 'speaking'
          ? '#3b82f6'
          : voiceState === 'user_speaking'
          ? '#22c55e'
          : '#52525b'

        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, 2)
        ctx.fill()
      }

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [voiceState, micLevel])

  const handleMicToggle = async () => {
    if (voiceState === 'speaking') {
      // Barge-in interrupt
      voiceSessionManager.handleBargeIn()
      return
    }

    if (voiceState === 'listening' || voiceState === 'user_speaking') {
      voiceSessionManager.stopSession()
    } else {
      await voiceSessionManager.startSession()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const fileType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'document'

      const reader = new FileReader()
      reader.onload = (event) => {
        const newAttachment: MediaAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: fileType,
          url: event.target?.result as string,
          size: file.size
        }
        setAttachments((prev) => [...prev, newAttachment])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const handleSend = () => {
    const textToSend = inputText.trim() || interimTranscript.trim()
    if (!textToSend && attachments.length === 0) return

    if (onSendMessage) {
      onSendMessage(textToSend, attachments)
    } else {
      voiceSessionManager.submitManualPrompt(textToSend)
    }

    setInputText('')
    setInterimTranscript('')
    setAttachments([])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isThinking =
    voiceState === 'thinking' ||
    voiceState === 'tool_execution' ||
    voiceState === 'generating' ||
    voiceState === 'processing_audio'

  return (
    <div className={`w-full max-w-4xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-950/90 backdrop-blur-xl p-4 shadow-2xl ${className}`}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.json,.csv"
      />

      {/* Thinking Status Indicator */}
      {isThinking && (
        <div className="mb-3">
          <ThinkingIndicator statusText={thinkingStatus} voiceState={voiceState} />
        </div>
      )}

      {/* Live Transcript / Interim Preview & Confidence Meter */}
      <AnimatePresence>
        {(interimTranscript || voiceState === 'user_speaking' || voiceState === 'listening') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 flex flex-col gap-2"
          >
            {interimTranscript && (
              <div className="px-4 py-2 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="font-medium">Live Transcript:</span>
                  <span className="italic">{interimTranscript}</span>
                </div>
                <button
                  onClick={() => setInterimTranscript('')}
                  className="text-emerald-400/60 hover:text-emerald-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {(voiceState === 'user_speaking' || voiceState === 'listening' || interimTranscript) && (
              <ConfidenceMeter
                confidence={transcriptConfidence}
                isTranscribing={voiceState === 'user_speaking' || Boolean(interimTranscript)}
                size="sm"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media & File Attachment Previews */}
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-200"
            >
              {att.type === 'image' && <ImageIcon className="w-4 h-4 text-emerald-400" />}
              {att.type === 'video' && <Video className="w-4 h-4 text-purple-400" />}
              {att.type === 'audio' && <Music className="w-4 h-4 text-blue-400" />}
              {att.type === 'document' && <FileText className="w-4 h-4 text-amber-400" />}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                onClick={() => handleRemoveAttachment(att.id)}
                className="text-neutral-500 hover:text-rose-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer Area */}
      <div className="relative flex flex-col gap-2 rounded-xl bg-neutral-900/60 border border-neutral-800 p-3 focus-within:border-emerald-500/50 transition-colors">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 resize-none focus:outline-none"
        />

        {/* Waveform Canvas & Controls Row */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
          <div className="flex items-center gap-2">
            {/* Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach media or files"
              className="p-2 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Mute Toggle */}
            <button
              onClick={() => voiceSessionManager.toggleMute()}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              className={`p-2 rounded-lg transition-colors ${
                isMuted
                  ? 'text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Personality / Mode Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800/80 border border-neutral-700/50 text-xs text-neutral-300">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>{VOICE_PERSONALITIES.find((p) => p.id === activePersonality)?.name || 'JARVIS'}</span>
            </div>

            {/* Language Badge */}
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-800/80 border border-neutral-700/50 text-xs text-neutral-400">
              <Globe className="w-3 h-3 text-sky-400" />
              <span className="uppercase">{language}</span>
            </div>
          </div>

          {/* Center Waveform Display */}
          <div className="flex-1 max-w-[180px] mx-4 hidden md:block">
            <canvas ref={canvasRef} width={180} height={24} className="w-full h-6 block" />
          </div>

          <div className="flex items-center gap-2">
            {/* Mic / Barge-In Interrupt Button */}
            <button
              onClick={handleMicToggle}
              title={
                voiceState === 'speaking'
                  ? 'Interrupt AI (Barge-in)'
                  : voiceState === 'listening'
                  ? 'Stop listening'
                  : 'Start voice input'
              }
              className={`p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
                voiceState === 'speaking'
                  ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400 animate-pulse'
                  : voiceState === 'listening' || voiceState === 'user_speaking'
                  ? 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/25'
                  : 'bg-neutral-800 text-neutral-300 hover:text-emerald-400 hover:bg-neutral-700'
              }`}
            >
              {voiceState === 'speaking' ? (
                <StopCircle className="w-4 h-4" />
              ) : voiceState === 'listening' || voiceState === 'user_speaking' ? (
                <Mic className="w-4 h-4 animate-bounce" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim() && !interimTranscript.trim() && attachments.length === 0}
              className="p-2.5 rounded-xl bg-emerald-500 text-neutral-950 font-medium hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AiChat8
