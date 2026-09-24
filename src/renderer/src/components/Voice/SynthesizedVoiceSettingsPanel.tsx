import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Sliders,
  Check,
  Globe,
  Radio,
  RefreshCw,
  Cpu,
  Mic,
  Database,
  Layers,
  Wand2,
  Zap,
  Info
} from 'lucide-react'
import { RiMagicLine, RiSparkling2Line, RiSoundModuleLine } from 'react-icons/ri'
import {
  voiceSettings,
  VoicePrivacySettings,
  VoicePersonalityId,
  SupportedLanguage
} from '../../services/voice'
import { soundEffects } from '../../services/soundEffectsService'
import { geminiLiveVoiceClient, VoiceOption } from '../../services/geminiLiveVoiceClient'
import { irisIndexedDBCache, StorageStats } from '../../services/irisIndexedDBCache'

export interface SynthesizedVoicePreset {
  id: string
  geminiVoice: VoiceOption
  name: string
  title: string
  persona: string
  gender: 'Female' | 'Male' | 'Neutral'
  tone: string
  accentColor: string
  badge: string
  description: string
  sampleGreeting: string
  idealFor: string
  pitch: number
  rate: number
}

export const SYNTHESIZED_VOICE_PRESETS: SynthesizedVoicePreset[] = [
  {
    id: 'kore',
    geminiVoice: 'Kore',
    name: 'Kore (Default)',
    title: 'Natural & Warm Conversational Core',
    persona: 'Empathetic, clear, and composed voice archetype with warm cadence.',
    gender: 'Female',
    tone: 'Smooth & Warm',
    accentColor: '#10b981', // emerald
    badge: 'Gemini Primary',
    description: 'High dynamic range voice synthesized for deep conversational fluency and everyday tasks.',
    sampleGreeting: "Greetings! I am IRIS, operating with the Kore voice synthesis model. All systems are fully synchronized.",
    idealFor: 'Executive briefing, workflow orchestration, chat responses',
    pitch: 1.0,
    rate: 1.02
  },
  {
    id: 'zephyr',
    geminiVoice: 'Zephyr',
    name: 'Zephyr',
    title: 'Dynamic & Expressive Multi-Modal Voice',
    persona: 'Fast-paced, vibrant, articulate, and highly responsive modern synth.',
    gender: 'Female',
    tone: 'Bright & Crisp',
    accentColor: '#06b6d4', // cyan
    badge: 'Ultra Low Latency',
    description: 'Optimized for rapid back-and-forth dialogue, brainstorming, and live hands-free collaboration.',
    sampleGreeting: "Hello! Zephyr synthesis online. Ready to analyze codebases, execute operations, and stream real-time results.",
    idealFor: 'Real-time live dialogue, creative drafting, brainstorming',
    pitch: 1.08,
    rate: 1.1
  },
  {
    id: 'charon',
    geminiVoice: 'Charon',
    name: 'Charon',
    title: 'Authoritative & Deep Technical Anchor',
    persona: 'Baritone, deeply resonant, commanding, and methodical voice profile.',
    gender: 'Male',
    tone: 'Deep & Authoritative',
    accentColor: '#8b5cf6', // purple
    badge: 'JARVIS Classic',
    description: 'A rich baritone acoustic profile engineered for technical architecture and mission-critical telemetry.',
    sampleGreeting: "JARVIS core online. Telemetry feeds verified, secure memory indexed. How may I assist your engineering session?",
    idealFor: 'JARVIS mode, security audits, technical diagnostics',
    pitch: 0.88,
    rate: 0.98
  },
  {
    id: 'puck',
    geminiVoice: 'Puck',
    name: 'Puck',
    title: 'Youthful, Energetic & Agile Assistant',
    persona: 'Playful, uplifting, enthusiastic, and fast-tempo conversationalist.',
    gender: 'Male',
    tone: 'Energetic & Crisp',
    accentColor: '#f59e0b', // amber
    badge: 'High Energy',
    description: 'Energetic pitch distribution ideal for quick lookups, notifications, and productivity sprints.',
    sampleGreeting: "Hey there! Puck voice matrix engaged. Let's power through your tasks, analyze data, and build something great today!",
    idealFor: 'Fast notifications, task lists, rapid Q&A',
    pitch: 1.15,
    rate: 1.12
  },
  {
    id: 'fenrir',
    geminiVoice: 'Fenrir',
    name: 'Fenrir',
    title: 'Analytical, Focused & Precise Synth',
    persona: 'Direct, focused, no-nonsense delivery with surgical clarity.',
    gender: 'Male',
    tone: 'Focused & Direct',
    accentColor: '#ec4899', // pink
    badge: 'High Precision',
    description: 'Razor-sharp consonants and deliberate pacing calibrated for scientific queries and coding instructions.',
    sampleGreeting: "Fenrir synthesizer initialized. Ready to inspect algorithms, review data structures, and execute commands.",
    idealFor: 'Code reviews, calculations, debugging sessions',
    pitch: 0.96,
    rate: 1.05
  }
]

interface SynthesizedVoiceSettingsPanelProps {
  className?: string
  embedded?: boolean
}

export const SynthesizedVoiceSettingsPanel: React.FC<SynthesizedVoiceSettingsPanelProps> = ({
  className = '',
  embedded = false
}) => {
  const [settings, setSettings] = useState<VoicePrivacySettings>(voiceSettings.getSettings())
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState<VoiceOption>(() => {
    return geminiLiveVoiceClient.getVoice() || 'Kore'
  })
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isPlayingPreview, setIsPlayingPreview] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [cacheStats, setCacheStats] = useState<StorageStats | null>(null)
  const [activeVoiceCategory, setActiveVoiceCategory] = useState<'gemini' | 'system' | 'offline'>('gemini')
  const [statusNotification, setStatusNotification] = useState<string | null>(null)

  useEffect(() => {
    const unsubVoice = voiceSettings.subscribe((s) => setSettings(s))
    const unsubCache = irisIndexedDBCache.subscribe((s) => setCacheStats(s))

    // Load available Web Speech voices
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices()
        setSystemVoices(voices || [])
      }
    }
    loadVoices()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }

    return () => {
      unsubVoice()
      unsubCache()
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const handleSelectGeminiVoice = (preset: SynthesizedVoicePreset) => {
    setSelectedGeminiVoice(preset.geminiVoice)
    geminiLiveVoiceClient.setVoice(preset.geminiVoice)
    voiceSettings.updateSettings({
      selectedVoice: preset.geminiVoice,
      speed: preset.rate,
      pitch: preset.pitch
    })
    soundEffects.play('click')
    showStatusToast(`AI Synthesized Voice updated to ${preset.name}`)
  }

  const showStatusToast = (msg: string) => {
    setStatusNotification(msg)
    setTimeout(() => setStatusNotification(null), 2500)
  }

  const handlePreviewVoice = async (preset: SynthesizedVoicePreset) => {
    if (isPlayingPreview === preset.id) {
      stopVoicePreview()
      return
    }

    stopVoicePreview()
    setIsPlayingPreview(preset.id)

    // Simulate animated audio visualizer waves during preview
    let simInterval: any = setInterval(() => {
      setAudioLevel(0.2 + Math.random() * 0.7)
    }, 80)

    try {
      // 1. First attempt Gemini Live/TTS synthesis through backend endpoint
      const response = await fetch('/api/ai/voice/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: preset.sampleGreeting,
          voiceName: preset.geminiVoice
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data && data.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`)
          audio.onended = () => {
            clearInterval(simInterval)
            setAudioLevel(0)
            setIsPlayingPreview(null)
          }
          audio.onerror = () => {
            playFallbackSpeech(preset, simInterval)
          }
          await audio.play()
          return
        }
      }
      playFallbackSpeech(preset, simInterval)
    } catch (_e) {
      playFallbackSpeech(preset, simInterval)
    }
  }

  const playFallbackSpeech = (preset: SynthesizedVoicePreset, simInterval: any) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      clearInterval(simInterval)
      setIsPlayingPreview(null)
      setAudioLevel(0)
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(preset.sampleGreeting)
    utterance.rate = preset.rate || settings.speed || 1.0
    utterance.pitch = preset.pitch || settings.pitch || 1.0
    utterance.volume = settings.volume || 1.0

    // Try finding matching voice
    const voices = window.speechSynthesis.getVoices()
    const targetKeywords =
      preset.gender === 'Female'
        ? ['female', 'samantha', 'zira', 'karen', 'victoria', 'google us english', 'natural']
        : ['male', 'david', 'george', 'daniel', 'alex', 'google uk english male']

    let matchedVoice: SpeechSynthesisVoice | null = null
    for (const v of voices) {
      const name = v.name.toLowerCase()
      if (targetKeywords.some((kw) => name.includes(kw))) {
        matchedVoice = v
        break
      }
    }
    if (matchedVoice) utterance.voice = matchedVoice

    utterance.onend = () => {
      clearInterval(simInterval)
      setIsPlayingPreview(null)
      setAudioLevel(0)
    }

    utterance.onerror = () => {
      clearInterval(simInterval)
      setIsPlayingPreview(null)
      setAudioLevel(0)
    }

    window.speechSynthesis.speak(utterance)
  }

  const stopVoicePreview = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsPlayingPreview(null)
    setAudioLevel(0)
  }

  const handleSliderChange = (key: keyof VoicePrivacySettings, val: number) => {
    voiceSettings.updateSettings({ [key]: val })
  }

  const selectedPreset =
    SYNTHESIZED_VOICE_PRESETS.find((p) => p.geminiVoice === selectedGeminiVoice) ||
    SYNTHESIZED_VOICE_PRESETS[0]

  return (
    <div className={`flex flex-col gap-6 text-zinc-200 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-emerald-950/40 via-zinc-900/60 to-cyan-950/40 border border-emerald-500/20 rounded-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />
        
        <div className="flex items-start gap-3.5 z-10">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <RiSoundModuleLine size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                AI Voice Synthesizer & Speech Engine
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Gemini Multi-Modal
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              Toggle between high-fidelity neural voice personas powered by Gemini 3.8 / Live TTS
              and local acoustic synthesizers. All states are cached non-volatilely in IndexedDB.
            </p>
          </div>
        </div>

        {/* Current Active Voice Pill */}
        <div className="z-10 shrink-0 flex items-center gap-3 self-start sm:self-center">
          <div className="px-3.5 py-2 bg-black/60 border border-white/10 rounded-xl flex items-center gap-2.5">
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: selectedPreset.accentColor }}
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                Active Synth
              </span>
              <span className="text-xs font-bold font-mono text-white">
                {selectedPreset.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {statusNotification && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs font-mono text-emerald-300 flex items-center gap-2 shadow-lg"
        >
          <Check size={14} className="text-emerald-400" />
          <span>{statusNotification}</span>
        </motion.div>
      )}

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveVoiceCategory('gemini')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            activeVoiceCategory === 'gemini'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Sparkles size={14} className="text-emerald-400" />
          <span>Gemini Synthesized Personas</span>
          <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-[10px] font-mono text-emerald-400 border border-emerald-500/30">
            {SYNTHESIZED_VOICE_PRESETS.length}
          </span>
        </button>

        <button
          onClick={() => setActiveVoiceCategory('offline')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            activeVoiceCategory === 'offline'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Database size={14} className="text-cyan-400" />
          <span>IndexedDB Cache & Offline Voice</span>
          {cacheStats && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-[10px] font-mono text-cyan-300 border border-cyan-500/30">
              {cacheStats.cachedResponsesCount} cached
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveVoiceCategory('system')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
            activeVoiceCategory === 'system'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
          }`}
        >
          <Cpu size={14} className="text-purple-400" />
          <span>System Native Voices</span>
          <span className="px-1.5 py-0.2 rounded bg-purple-950 text-[10px] font-mono text-purple-300 border border-purple-500/30">
            {systemVoices.length}
          </span>
        </button>
      </div>

      {/* ========================================== */}
      {/* 1. GEMINI SYNTHESIZED VOICES GRID          */}
      {/* ========================================== */}
      {activeVoiceCategory === 'gemini' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {SYNTHESIZED_VOICE_PRESETS.map((preset) => {
              const isSelected = selectedGeminiVoice === preset.geminiVoice
              const isPlaying = isPlayingPreview === preset.id

              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectGeminiVoice(preset)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 backdrop-blur-md group ${
                    isSelected
                      ? 'bg-zinc-900/90 border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50'
                      : 'bg-zinc-950/60 border-white/10 hover:border-white/20 hover:bg-zinc-900/40'
                  }`}
                >
                  {/* Top Row: Name, Badge, Active Indicator */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: `${preset.accentColor}33`, border: `1px solid ${preset.accentColor}66` }}
                      >
                        <Volume2 size={16} style={{ color: preset.accentColor }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">
                            {preset.name}
                          </h3>
                          {isSelected && (
                            <span className="p-0.5 rounded-full bg-emerald-500 text-black">
                              <Check size={11} strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400 block">
                          {preset.gender} • {preset.tone}
                        </span>
                      </div>
                    </div>

                    <span
                      className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${preset.accentColor}22`,
                        color: preset.accentColor,
                        border: `1px solid ${preset.accentColor}44`
                      }}
                    >
                      {preset.badge}
                    </span>
                  </div>

                  {/* Description & Persona */}
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    {preset.description}
                  </p>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-400">
                    <span className="text-zinc-500 block text-[9px] uppercase">Optimal Use:</span>
                    <span className="text-zinc-300">{preset.idealFor}</span>
                  </div>

                  {/* Audio Preview & Select Actions */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePreviewVoice(preset)
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isPlaying
                          ? 'bg-amber-500 text-black shadow-lg animate-pulse'
                          : 'bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white border border-white/10'
                      }`}
                    >
                      {isPlaying ? <Square size={12} /> : <Play size={12} />}
                      <span>{isPlaying ? 'Stop' : 'Listen Sample'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectGeminiVoice(preset)
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-black'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                      }`}
                    >
                      {isSelected ? 'Active Model' : 'Select Voice'}
                    </button>
                  </div>

                  {/* Visualizer animation if currently playing this preset */}
                  {isPlaying && (
                    <div className="flex items-center gap-1 h-3 pt-1 justify-center">
                      {[...Array(12)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            height: [4, Math.max(4, Math.sin(i + Date.now()) * 16 * audioLevel), 4]
                          }}
                          transition={{ repeat: Infinity, duration: 0.3 + i * 0.05 }}
                          className="w-1 rounded-full bg-emerald-400"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Real-time Voice Fine-Tuning Sliders */}
          <div className="p-5 bg-black/60 border border-white/10 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Acoustic Synthesis Parameters
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  voiceSettings.updateSettings({ speed: 1.0, pitch: 1.0, volume: 1.0 })
                  soundEffects.play('toggle')
                }}
                className="text-[11px] font-mono text-zinc-400 hover:text-emerald-300 cursor-pointer"
              >
                Reset Defaults
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Pitch */}
              <div className="space-y-2 p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Voice Pitch</span>
                  <span className="font-mono text-emerald-400">{(settings.pitch || 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.05"
                  value={settings.pitch || 1.0}
                  onChange={(e) => handleSliderChange('pitch', parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Deep</span>
                  <span>Standard</span>
                  <span>High</span>
                </div>
              </div>

              {/* Rate / Speed */}
              <div className="space-y-2 p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Speaking Pace (Speed)</span>
                  <span className="font-mono text-emerald-400">{(settings.speed || 1.0).toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.6"
                  step="0.05"
                  value={settings.speed || 1.0}
                  onChange={(e) => handleSliderChange('speed', parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Deliberate (0.7x)</span>
                  <span>Normal (1.0x)</span>
                  <span>Rapid (1.6x)</span>
                </div>
              </div>

              {/* Volume */}
              <div className="space-y-2 p-3 bg-zinc-950/60 rounded-xl border border-white/5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">Synthesis Master Gain</span>
                  <span className="font-mono text-emerald-400">{Math.round((settings.volume || 1.0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.volume !== undefined ? settings.volume : 1.0}
                  onChange={(e) => handleSliderChange('volume', parseFloat(e.target.value))}
                  className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Mute</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 2. INDEXEDDB LOCAL CACHING & OUTAGES TAB   */}
      {/* ========================================== */}
      {activeVoiceCategory === 'offline' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-950/80 border border-cyan-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="text-cyan-400" size={18} />
                <h3 className="text-sm font-bold text-white">
                  IndexedDB Local Context & Outage Resilience Layer
                </h3>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 ${
                irisIndexedDBCache.isOnline()
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
              }`}>
                <span className={`w-2 h-2 rounded-full ${irisIndexedDBCache.isOnline() ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
                <span>{irisIndexedDBCache.isOnline() ? 'Online (Cloud Sync Active)' : 'Offline (IndexedDB Autonomous)'}</span>
              </span>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              IRIS automatically mirrors all conversation turns, workspace documents, offline voice commands,
              and semantic context into client-side <strong>IndexedDB (IRIS_AI_STORE_V1)</strong>. During internet
              outages, IRIS continues responding autonomously from local cached knowledge without crashing.
            </p>

            {/* Storage Metric Badges */}
            {cacheStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-xl">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase block">Local Sessions</span>
                  <span className="text-lg font-bold font-mono text-white">{cacheStats.sessionCount}</span>
                </div>
                <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-xl">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase block">Total Messages</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">{cacheStats.messageCount}</span>
                </div>
                <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-xl">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase block">Cached AI Responses</span>
                  <span className="text-lg font-bold font-mono text-cyan-400">{cacheStats.cachedResponsesCount}</span>
                </div>
                <div className="p-3 bg-zinc-900/80 border border-white/5 rounded-xl">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase block">Pending Outbox Sync</span>
                  <span className="text-lg font-bold font-mono text-amber-400">{cacheStats.outboxPending}</span>
                </div>
              </div>
            )}

            {/* Manual Sync & Cache Flush Actions */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  const count = await irisIndexedDBCache.processOfflineOutbox()
                  showStatusToast(`Processed ${count} offline pending items`)
                  soundEffects.play('success')
                }}
                className="px-3.5 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>Force Sync Outbox to Cloud</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await irisIndexedDBCache.init()
                  showStatusToast('IndexedDB stores validated & refreshed')
                  soundEffects.play('click')
                }}
                className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-white/10"
              >
                <Layers size={13} />
                <span>Inspect Database Stores</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* 3. SYSTEM NATIVE WEBSPEECH VOICES          */}
      {/* ========================================== */}
      {activeVoiceCategory === 'system' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="text-purple-400" size={18} />
                <h3 className="text-sm font-bold text-white">
                  Installed Operating System Speech Synthesizers
                </h3>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                {systemVoices.length} voices detected
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Browser Web Speech API synthesizers installed on this OS. Used for zero-bandwidth, offline fallback speech.
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {systemVoices.map((v, i) => (
                <div
                  key={`${v.name}-${i}`}
                  className="p-3 bg-zinc-900/60 border border-white/5 rounded-xl flex items-center justify-between text-xs hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-zinc-200">{v.name}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Lang: {v.lang} {v.default ? '• (Default)' : ''} {v.localService ? '• Local' : ''}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel()
                        const u = new SpeechSynthesisUtterance(`Testing native synthesizer ${v.name}`)
                        u.voice = v
                        u.rate = settings.speed || 1.0
                        u.pitch = settings.pitch || 1.0
                        window.speechSynthesis.speak(u)
                      }
                    }}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-zinc-200 rounded-lg text-xs font-mono cursor-pointer"
                  >
                    Test Voice
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SynthesizedVoiceSettingsPanel
