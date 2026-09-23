import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mic,
  Send,
  Sparkles,
  Bot,
  User,
  Volume2,
  Terminal,
  Zap,
  CornerDownLeft,
  CheckCircle2,
  Radio,
  Clock
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  model?: string
}

export const ChatDemo: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      role: 'user',
      text: 'Analyze the latest research paper on multi-agent consensus and schedule a review meeting with my team.',
      timestamp: '10:42 AM'
    },
    {
      id: 'msg-2',
      role: 'assistant',
      text: 'I have ingested the consensus preprint, summarized the fault-tolerance guarantees, and checked your calendar. Found an open slot tomorrow at 2:00 PM EST. Meeting invite drafted and ready for one-tap dispatch.',
      timestamp: '10:42 AM',
      model: 'IRIS Neural Core • Gemini 3.8'
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const samplePrompts = [
    'Summarize my Google Drive workspace',
    'Execute autonomous competitor research',
    'Generate video script with analytics trends',
    'Reverse geocode my spatial coordinates'
  ]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input
    if (!promptToSend.trim() || isLoading) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: promptToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMsg])
    if (!customPrompt) setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend.trim(),
          conversationHistory: messages.map((m) => ({
            role: m.role,
            text: m.text
          }))
        })
      })

      const data = await res.json()
      const assistantText =
        data.text || data.response || 'Action processed and autonomous pipeline initialized.'

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: assistantText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: data.model || 'IRIS Autonomous Engine'
      }

      setMessages((prev) => [...prev, aiMsg])
    } catch (_err) {
      const fallbackMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: `Executed pipeline for: "${promptToSend.trim()}". Multi-agent orchestrator standing by.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: 'IRIS Offline Core'
      }
      setMessages((prev) => [...prev, fallbackMsg])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section id="demo" className="relative py-24 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xs font-mono uppercase tracking-widest text-emerald-400 mb-2">
            Interactive Testbed
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Experience the Neural Interface
          </p>
          <p className="mt-3 text-sm text-zinc-400">
            Interact with the live AI engine below or click any sample workflow prompt.
          </p>
        </div>

        {/* Mock Terminal/Chat Interface Window */}
        <div className="relative rounded-3xl bg-[#0b0c14] border border-white/[0.08] shadow-[0_20px_70px_rgba(0,0,0,0.8)] overflow-hidden">
          {/* Window Header */}
          <div className="px-6 py-4 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="h-4 w-[1px] bg-white/10 mx-1" />
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>iris-session-live.sh</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Ready
              </span>
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="p-6 space-y-4 max-h-[380px] min-h-[280px] overflow-y-auto">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] sm:max-w-[70%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-br-none shadow-md'
                      : 'bg-white/[0.04] border border-white/[0.08] text-zinc-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{msg.model || 'User Command'}</span>
                    <span>{msg.timestamp}</span>
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            ))}

            {isLoading && (
              <div className="flex gap-3 items-center text-xs text-zinc-400 font-mono">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Synthesizing multi-agent response...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions */}
          <div className="px-6 py-2 bg-white/[0.01] border-t border-white/[0.04] flex items-center gap-2 overflow-x-auto text-[11px]">
            <span className="text-zinc-500 whitespace-nowrap">Try:</span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p)}
                className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-300 transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input Box Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="p-4 bg-white/[0.02] border-t border-white/[0.06] flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask IRIS anything or dispatch a complex workflow..."
              className="flex-1 bg-black/40 border border-white/[0.08] rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
            />

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))}
              className="p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] text-emerald-400 border border-white/[0.08] transition-colors cursor-pointer"
              title="Speak prompt with microphone"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold transition-colors cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

export default ChatDemo
