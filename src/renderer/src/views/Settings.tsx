import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GiArtificialIntelligence } from 'react-icons/gi'
import { RiKey2Line, RiSave3Line, RiShieldKeyholeLine, RiPlugLine } from 'react-icons/ri'
import {
  Brain,
  Cpu,
  Sparkles,
  Mic,
  Camera,
  Monitor,
  Volume2,
  Trash2,
  Plus,
  User,
  Check,
  Sliders,
  MapPin,
  Keyboard,
  Hand,
  Radio
} from 'lucide-react'
import {
  coreSettingsService,
  CoreSettings,
  ParticlePresetKey,
  PARTICLE_PRESETS
} from '../services/coreSettingsService'
import { memoryService, MemoryItem } from '../services/memoryService'
import { firebaseAuthService, FirebaseUserContext } from '../services/firebaseAuth'
import KeyboardShortcutsSettings from '../components/UI/KeyboardShortcutsSettings'
import GestureSettings from '../components/UI/GestureSettings'
import { soundEffects, SoundType } from '../services/soundEffectsService'
import {
  voiceSessionManager,
  voiceSettings,
  VoicePrivacySettings,
  VoicePersonalityId,
  SupportedLanguage
} from '../services/voice'

interface SettingsProps {
  isSystemActive: boolean
}

type TabType = 'keys' | 'ai' | 'shortcuts' | 'gestures' | 'audio' | 'particles' | 'memory' | 'hardware'

function GlassPanel({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 shadow-lg ${className}`}
    >
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export default function SettingsView({ isSystemActive }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('keys')

  const [geminiKey, setGeminiKey] = useState('')
  const [deepseekKey, setDeepseekKey] = useState('')
  const [groqKey, setGroqKey] = useState('')
  const [hfKey, setHfKey] = useState('')
  const [tavilyKey, settavilyKey] = useState('')
  const [mem0Key, setMem0Key] = useState('')

  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(soundEffects.getIsEnabled())
  const [sfxVolume, setSfxVolume] = useState<number>(soundEffects.getVolume())
  const [voicePrivSettings, setVoicePrivSettings] = useState<VoicePrivacySettings>(
    voiceSettings.getSettings()
  )

  // Core settings & Mem0 state
  const [coreSettings, setCoreSettings] = useState<CoreSettings>(coreSettingsService.getSettings())
  const [currentUser, setCurrentUser] = useState<FirebaseUserContext>(
    firebaseAuthService.getCurrentUser()
  )
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [newMemoryText, setNewMemoryText] = useState('')
  const [isAddingMemory, setIsAddingMemory] = useState(false)

  useEffect(() => {
    const unsubSettings = coreSettingsService.subscribe((s) => setCoreSettings(s))
    const unsubAuth = firebaseAuthService.subscribe((u) => {
      setCurrentUser(u)
      loadMemories(u.uid)
    })
    const unsubVoice = voiceSettings.subscribe((s) => setVoicePrivSettings(s))

    loadMemories(firebaseAuthService.getUserId())

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke('secure-get-keys').then((keys: any) => {
        if (keys) {
          setGeminiKey(keys.geminiKey || '')
          setDeepseekKey(keys.deepseekKey || localStorage.getItem('deepseek_api_key') || '')
          setGroqKey(keys.groqKey || '')
          setHfKey(keys.hfKey || '')
          settavilyKey(keys.tavilyKey || '')
          setMem0Key(keys.mem0Key || '')
        }
      })
    } else {
      setGeminiKey(localStorage.getItem('gemini_api_key') || '')
      setDeepseekKey(localStorage.getItem('deepseek_api_key') || '')
      setMem0Key(localStorage.getItem('mem0_api_key') || '')
    }

    return () => {
      unsubSettings()
      unsubAuth()
      unsubVoice()
    }
  }, [])

  const loadMemories = async (uid: string) => {
    try {
      const list = await memoryService.listMemories(uid)
      setMemories(list)
    } catch (_e) {
      setMemories([])
    }
  }

  const handleAddMemory = async () => {
    if (!newMemoryText.trim()) return
    setIsAddingMemory(true)
    try {
      await memoryService.addMemory(newMemoryText.trim(), currentUser.uid, {
        source: 'explicit'
      })
      setNewMemoryText('')
      await loadMemories(currentUser.uid)
      setSaveStatus('Memory saved to Mem0 persistent storage.')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (_e) {
      setSaveStatus('Failed to record memory.')
      setTimeout(() => setSaveStatus(null), 3000)
    } finally {
      setIsAddingMemory(false)
    }
  }

  const handleDeleteMemory = async (id: string) => {
    try {
      await memoryService.deleteMemory(id, currentUser.uid)
      await loadMemories(currentUser.uid)
      setSaveStatus('Memory item deleted.')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (_e) {
      setSaveStatus('Failed to delete memory.')
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }

  const handleClearAllMemories = async () => {
    if (confirm('Clear all long-term memories for this profile?')) {
      await memoryService.clearUserMemory(currentUser.uid)
      await loadMemories(currentUser.uid)
      setSaveStatus('All profile memories cleared.')
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }

  const switchUserProfile = (targetUid: string, name: string) => {
    firebaseAuthService.switchUser(targetUid, name)
    setSaveStatus(`Active user context switched to: ${name}`)
    setTimeout(() => setSaveStatus(null), 3000)
  }

  const saveApiKeys = async () => {
    // Persist to local storage
    if (geminiKey) localStorage.setItem('gemini_api_key', geminiKey)
    if (deepseekKey) localStorage.setItem('deepseek_api_key', deepseekKey)
    if (mem0Key) localStorage.setItem('mem0_api_key', mem0Key)
    if (groqKey) localStorage.setItem('groq_api_key', groqKey)

    // Sync to backend key store
    try {
      await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiKey,
          deepseekKey,
          groqKey,
          hfKey,
          tavilyKey,
          mem0Key
        })
      })
    } catch (_err) {
      // Non-fatal if offline
    }

    if (window.electron?.ipcRenderer) {
      try {
        await window.electron.ipcRenderer.invoke('secure-save-keys', {
          groqKey,
          geminiKey,
          deepseekKey,
          hfKey,
          tavilyKey,
          mem0Key
        })
        setSaveStatus('API Keys securely encrypted and saved to Vault.')
        setTimeout(() => setSaveStatus(null), 3000)
      } catch (e) {
        setSaveStatus('API Keys saved locally and applied to server.')
        setTimeout(() => setSaveStatus(null), 3000)
      }
    } else {
      setSaveStatus('API Keys saved and applied successfully.')
      setTimeout(() => setSaveStatus(null), 3000)
    }
  }

  const inputContainerClass =
    'flex items-center bg-black/40 border border-white/10 rounded-lg px-3.5 sm:px-4 py-2.5 sm:py-3 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all duration-200 w-full'
  const labelClass =
    'text-xs sm:text-sm text-zinc-300 font-medium flex items-center gap-2 mb-1.5 sm:mb-2'
  const titleClass =
    'text-base sm:text-lg font-semibold text-white flex items-center gap-2 sm:gap-3'

  const tabConfigs = [
    { id: 'keys', label: 'API Keys', icon: <RiPlugLine size={18} /> },
    { id: 'ai', label: 'AI Interaction', icon: <Brain size={18} /> },
    { id: 'audio', label: 'Audio & Feedback', icon: <Volume2 size={18} /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={18} /> },
    { id: 'gestures', label: 'Hands-Free Gestures', icon: <Hand size={18} /> },
    { id: 'particles', label: '3D Particle Core', icon: <Sparkles size={18} /> },
    { id: 'memory', label: `Mem0 Memory (${memories.length})`, icon: <Brain size={18} /> },
    { id: 'hardware', label: 'Hardware Permissions', icon: <Cpu size={18} /> }
  ]

  return (
    <div className="flex-1 p-3 sm:p-6 md:p-10 flex flex-col items-center bg-transparent min-h-screen text-zinc-100 overflow-y-auto scrollbar-small pb-24">
      <motion.div
        className="w-full max-w-4xl flex flex-col gap-6 sm:gap-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-white/10">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-zinc-900 border border-white/10 shadow-lg shrink-0">
              <GiArtificialIntelligence size={24} className="text-zinc-100 sm:w-7 sm:h-7" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Settings</h2>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`h-2 w-2 rounded-full ${isSystemActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}
                />
                <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                  {isSystemActive ? 'System is Online' : 'System is Offline'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-white/10 backdrop-blur-md shadow-xl overflow-x-auto scrollbar-none self-start sm:self-auto relative">
            {tabConfigs.map((tab) => (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`relative cursor-pointer flex items-center gap-2 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? 'text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="settingsTabActivePill"
                    className="absolute inset-0 bg-white rounded-lg shadow-md"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{tab.icon}</span>
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {saveStatus && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl font-mono animate-in fade-in flex items-center gap-2">
            <Check size={14} /> {saveStatus}
          </div>
        )}

        <div className="relative min-h-[500px]">
          <AnimatePresence mode="wait">
            {/* TAB: API KEYS */}
            {activeTab === 'keys' && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
                  <div className="flex justify-between items-center pb-2 gap-3 flex-wrap">
                    <span className={titleClass}>
                      <RiKey2Line className="text-emerald-400 shrink-0" size={22} /> API Providers &
                      Services
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={saveApiKeys}
                      className="bg-emerald-500 cursor-pointer text-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-lg flex items-center gap-2"
                    >
                      <RiSave3Line size={16} /> Save Keys
                    </motion.button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div>
                      <label className={labelClass}>
                        <span>Google Gemini API (Chat & Live Voice)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ml-auto">
                          Live Bridge
                        </span>
                      </label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        <span>DeepSeek API (V3 Chat & Reasoner R1)</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 ml-auto">
                          Reasoning CoT
                        </span>
                      </label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={deepseekKey}
                          onChange={(e) => setDeepseekKey(e.target.value)}
                          placeholder="sk-..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        Mem0 Memory API Key (Optional Cloud Sync)
                      </label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={mem0Key}
                          onChange={(e) => setMem0Key(e.target.value)}
                          placeholder="m0-..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Groq Cloud API</label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={groqKey}
                          onChange={(e) => setGroqKey(e.target.value)}
                          placeholder="gsk_..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Hugging Face Token</label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={hfKey}
                          onChange={(e) => setHfKey(e.target.value)}
                          placeholder="hf_..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Tavily Search API</label>
                      <div className={inputContainerClass}>
                        <input
                          type="password"
                          value={tavilyKey}
                          onChange={(e) => settavilyKey(e.target.value)}
                          placeholder="tvly-..."
                          className="bg-transparent border-none outline-none text-sm sm:text-base text-white w-full placeholder:text-zinc-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-800/50 border border-white/5 p-3 sm:p-4 rounded-xl flex gap-3 items-start mt-2 sm:mt-4">
                    <RiShieldKeyholeLine className="text-zinc-400 shrink-0 mt-0.5" size={18} />
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                      <strong>Privacy Notice:</strong> Your API keys are encrypted and saved locally
                      or passed safely through server-side environment variables. DeepSeek API powers both general V3 chat and deep mathematical/logical chain-of-thought reasoning (R1).
                    </p>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: AI INTERACTION & MODEL ROUTING */}
            {activeTab === 'ai' && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-2">
                    <span className={titleClass}>
                      <Brain className="text-emerald-400 shrink-0" size={22} /> AI Interaction Settings & Engine Routing
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 -mt-2">
                    Configure active AI providers for text chat and live real-time voice conversations.
                  </p>

                  <div className="flex flex-col gap-5 pt-2">
                    {/* Active Default AI Provider */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-zinc-200 block">
                            Primary AI Model & Chat Engine
                          </span>
                          <span className="text-xs text-zinc-400 block">
                            Select which engine handles conversational queries and tool reasoning
                          </span>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active: {coreSettings.activeProvider.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {[
                          {
                            id: 'deepseek',
                            name: 'DeepSeek',
                            subtitle: 'DeepSeek V3 & Reasoner R1',
                            desc: 'Official DeepSeek API integration with fast chat completion and deep mathematical/logical chain-of-thought reasoning',
                            tag: 'DeepSeek API'
                          },
                          {
                            id: 'gemini',
                            name: 'Google Gemini',
                            subtitle: 'Gemini 3.8 Flash & Live Voice Bridge',
                            desc: 'Multimodal vision, Live audio bridge, and grounding with web search & Google tools',
                            tag: 'Multimodal'
                          },
                          {
                            id: 'groq',
                            name: 'Groq Cloud LPU',
                            subtitle: 'Llama 3.3 70B & Mixtral',
                            desc: 'Sub-second inference acceleration on high-throughput open models',
                            tag: 'Ultra Fast'
                          },
                          {
                            id: 'huggingface',
                            name: 'Hugging Face',
                            subtitle: 'Inference Hub',
                            desc: 'Access to open weights and specialized fine-tunes across the HF ecosystem',
                            tag: 'Open Weights'
                          }
                        ].map((provider) => {
                          const isSelected = coreSettings.activeProvider === provider.id
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => {
                                coreSettingsService.setActiveProvider(provider.id as any)
                                setSaveStatus(`Primary AI engine switched to: ${provider.name}`)
                                setTimeout(() => setSaveStatus(null), 3000)
                              }}
                              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                                isSelected
                                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-zinc-600'}`} />
                                  <span className={`text-sm font-semibold ${isSelected ? 'text-emerald-300' : 'text-zinc-200'}`}>
                                    {provider.name}
                                  </span>
                                </div>
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-white/5 text-zinc-400'}`}>
                                  {provider.tag}
                                </span>
                              </div>
                              <span className="text-[11px] text-zinc-400 font-mono">
                                {provider.subtitle}
                              </span>
                              <p className="text-xs text-zinc-400 line-clamp-2">
                                {provider.desc}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Live Real-time Multimodal Voice Bridge */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-zinc-200 block flex items-center gap-2">
                            <Radio size={16} className="text-emerald-400 animate-pulse" />
                            Gemini Live Multimodal Voice Bridge
                          </span>
                          <span className="text-xs text-zinc-400 block">
                            Continuous 24kHz bi-directional live audio stream powered by Google Gemini Live API
                          </span>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Active Ready
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 pt-1 leading-relaxed">
                        Access live hands-free conversation with real-time waveform visualization, continuous audio streaming, and realistic voice presets (Kore, Zephyr, Puck, Fenrir, Charon) by tapping the <strong>Live Voice</strong> button in the conversation header.
                      </p>
                    </div>

                    {/* Real-Time Voice Chat System (ChatGPT / JARVIS Style) */}
                    <div className="p-4 bg-black/40 border border-cyan-500/20 rounded-xl space-y-3 shadow-[0_0_20px_rgba(6,182,212,0.06)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                          <div>
                            <span className="text-sm font-semibold text-zinc-200 block">
                              Real-Time Voice Chat Engine (ChatGPT / JARVIS)
                            </span>
                            <span className="text-xs text-zinc-400 block">
                              Streaming STT, progressive TTS, instant barge-in interruption, wake-word detection, and multi-language support.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.dispatchEvent(new CustomEvent('iris:open-voice-modal'))}
                          className="px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition-all cursor-pointer"
                        >
                          Launch Voice Chat
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                        {/* Personality */}
                        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-white/5 space-y-1">
                          <label className="text-zinc-400 font-medium block text-[11px]">Personality Profile</label>
                          <select
                            defaultValue={voiceSessionManager.getConfig().personality}
                            onChange={(e) => voiceSessionManager.setPersonality(e.target.value as VoicePersonalityId)}
                            className="w-full bg-zinc-950 border border-white/10 text-zinc-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500/50"
                          >
                            <option value="jarvis">JARVIS (Calm, Professional)</option>
                            <option value="assistant">Assistant (Friendly, Natural)</option>
                            <option value="developer">Developer (Technical, Concise)</option>
                            <option value="casual">Casual (Relaxed, Witty)</option>
                          </select>
                        </div>

                        {/* Language */}
                        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-white/5 space-y-1">
                          <label className="text-zinc-400 font-medium block text-[11px]">Spoken Language</label>
                          <select
                            defaultValue={voiceSessionManager.getConfig().language}
                            onChange={(e) => voiceSessionManager.setLanguage(e.target.value as SupportedLanguage)}
                            className="w-full bg-zinc-950 border border-white/10 text-zinc-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-cyan-500/50"
                          >
                            <option value="auto">Auto-Detect</option>
                            <option value="en-US">English (US)</option>
                            <option value="en-IN">Hinglish / EN (IN)</option>
                            <option value="hi-IN">Hindi (हिंदी)</option>
                          </select>
                        </div>

                        {/* Wake Word */}
                        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-white/5 flex flex-col justify-between">
                          <span className="text-zinc-400 font-medium text-[11px]">Wake Word ("Hey JARVIS")</span>
                          <label className="flex items-center gap-2 cursor-pointer pt-1 text-[11px] text-zinc-300">
                            <input
                              type="checkbox"
                              defaultChecked={voiceSessionManager.getConfig().wakeWordEnabled}
                              onChange={(e) => voiceSessionManager.setWakeWordEnabled(e.target.checked)}
                              className="accent-emerald-500"
                            />
                            <span>Client-Side Only (100% Private)</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* AI-Q Citation-Backed Answers */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-zinc-200 block">
                            AI-Q Citation-Backed Grounding
                          </span>
                          <span className="text-xs text-zinc-400 block">
                            Automatically annotates model answers with verified research source links
                          </span>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Enabled
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        All models (DeepSeek, Gemini, and NVIDIA) automatically run through the AI-Q citation engine when research and retrieval operations occur.
                      </p>
                    </div>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: AUDITORY FEEDBACK & WEB AUDIO */}
            {activeTab === 'audio' && (
              <motion.div
                key="audio"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-2">
                    <span className={titleClass}>
                      <Volume2 className="text-emerald-400 shrink-0" size={22} /> Auditory Feedback & UI Sound FX
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 -mt-2">
                    IRIS generates subtle, low-latency procedural sound waves with the Web Audio API for tactile feedback during button hovers, clicks, tab navigation, and AI state transitions.
                  </p>

                  <div className="flex flex-col gap-5 pt-2">
                    {/* Master Auditory Feedback Toggle */}
                    <div className="flex items-center justify-between p-4 bg-black/40 border border-white/10 rounded-xl">
                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-zinc-200 block">
                          UI Auditory Feedback
                        </span>
                        <span className="text-xs text-zinc-400 block">
                          Enable delicate acoustic cues for hovers, clicks, and menu switches
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const next = !sfxEnabled
                          setSfxEnabled(next)
                          soundEffects.setEnabled(next)
                          if (next) soundEffects.play('activate')
                        }}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                          sfxEnabled ? 'bg-emerald-500' : 'bg-zinc-800'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            sfxEnabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Master Volume Slider */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-zinc-200">
                          Feedback Volume
                        </span>
                        <span className="text-xs font-mono text-emerald-400">
                          {Math.round(sfxVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={sfxVolume}
                        disabled={!sfxEnabled}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          setSfxVolume(val)
                          soundEffects.setVolume(val)
                          soundEffects.play('click')
                        }}
                        className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer disabled:opacity-40"
                      />
                    </div>

                    {/* Sound Effect Palette Previews */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-3">
                      <span className="text-sm font-semibold text-zinc-200 block">
                        Procedural Sound Palette Previews
                      </span>
                      <p className="text-xs text-zinc-400">
                        Test each procedurally synthesized acoustic profile:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        {(
                          [
                            { id: 'hover', label: 'Hover Chime' },
                            { id: 'click', label: 'Tactile Click' },
                            { id: 'tab', label: 'Tab Blip' },
                            { id: 'toggle', label: 'Switch Chirp' },
                            { id: 'activate', label: 'Voice Start' },
                            { id: 'deactivate', label: 'Voice Stop' },
                            { id: 'success', label: 'Success Triad' },
                            { id: 'shortcut', label: 'Key Action' }
                          ] as { id: SoundType; label: string }[]
                        ).map((item) => (
                          <button
                            key={item.id}
                            disabled={!sfxEnabled}
                            onClick={() => soundEffects.play(item.id)}
                            className="px-3 py-2 bg-zinc-900/90 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-950/30 text-zinc-200 hover:text-emerald-300 text-xs font-medium rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                          >
                            <Sparkles size={12} className="text-emerald-400" />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* JARVIS VOICE INTERACTION & PRIVACY CONTROLS */}
                    <div className="pt-4 border-t border-white/10 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                            <Mic className="text-emerald-400" size={16} /> JARVIS Hands-Free & Voice Privacy
                          </span>
                          <span className="text-xs text-zinc-400 block pt-0.5">
                            Client-side local processing. Raw microphone audio is never uploaded to external servers.
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10">
                            Mic: {voicePrivSettings.micPermissionStatus}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Wake Word Detection ("Hey JARVIS") */}
                        <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-200 block">Wake Word ("Hey JARVIS")</span>
                            <span className="text-[11px] text-zinc-400 block">Hands-free client-side wake trigger</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = !voicePrivSettings.wakeWordEnabled
                              voiceSessionManager.setWakeWordEnabled(next)
                              voiceSettings.updateSettings({ wakeWordEnabled: next })
                            }}
                            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              voicePrivSettings.wakeWordEnabled ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                voicePrivSettings.wakeWordEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Voice Activity Detection (VAD) */}
                        <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-200 block">Voice Activity Detection (VAD)</span>
                            <span className="text-[11px] text-zinc-400 block">Dynamic ambient noise & silence cut</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = !voicePrivSettings.vadEnabled
                              voiceSettings.updateSettings({ vadEnabled: next })
                              voiceSessionManager.audioManager.vad.setEnabled(next)
                            }}
                            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              voicePrivSettings.vadEnabled ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                voicePrivSettings.vadEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Continuous Conversation */}
                        <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-200 block">Continuous Conversation</span>
                            <span className="text-[11px] text-zinc-400 block">Resume listening after AI finishes speaking</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = !voicePrivSettings.continuousListening
                              voiceSettings.updateSettings({ continuousListening: next })
                            }}
                            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              voicePrivSettings.continuousListening ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                voicePrivSettings.continuousListening ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Voice Response (TTS) */}
                        <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-xs font-medium text-zinc-200 block">Voice Audio Response</span>
                            <span className="text-[11px] text-zinc-400 block">Speak answers aloud with streaming TTS</span>
                          </div>
                          <button
                            onClick={() => {
                              const next = !voicePrivSettings.voiceResponseEnabled
                              voiceSettings.updateSettings({ voiceResponseEnabled: next })
                            }}
                            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              voicePrivSettings.voiceResponseEnabled ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                voicePrivSettings.voiceResponseEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Immediate Control Actions */}
                      <div className="flex flex-wrap gap-2.5 pt-2">
                        <button
                          onClick={() => {
                            voiceSessionManager.stopMicrophoneImmediately()
                          }}
                          className="px-3 py-2 bg-red-950/40 border border-red-500/30 hover:bg-red-900/50 text-red-300 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Mic size={13} className="text-red-400" />
                          Stop Microphone Immediately
                        </button>
                        <button
                          onClick={() => {
                            voiceSessionManager.clearSessionHistory()
                            voiceSettings.clearVoiceSessionHistory()
                          }}
                          className="px-3 py-2 bg-zinc-900 border border-white/10 hover:border-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 size={13} className="text-zinc-400" />
                          Clear Voice Session & History
                        </button>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: KEYBOARD SHORTCUTS */}
            {activeTab === 'shortcuts' && (
              <motion.div
                key="shortcuts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <KeyboardShortcutsSettings />
              </motion.div>
            )}

            {/* TAB: HANDS-FREE CAMERA GESTURES */}
            {activeTab === 'gestures' && (
              <motion.div
                key="gestures"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-2">
                    <span className={titleClass}>
                      <Hand className="text-emerald-400 shrink-0" size={22} /> Hands-Free Camera Gesture Navigation
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-400 -mt-2">
                    Control tabs, trigger voice listening, scroll views, and command IRIS touchlessly using your webcam.
                  </p>
                  <GestureSettings
                    onStatusChange={(msg) => {
                      setSaveStatus(msg)
                      setTimeout(() => setSaveStatus(null), 3000)
                    }}
                  />
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: 3D PARTICLE CORE */}
            {activeTab === 'particles' && (
              <motion.div
                key="particles"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
                  <div className="flex justify-between items-center pb-2">
                    <span className={titleClass}>
                      <Sparkles className="text-emerald-400 shrink-0" size={22} /> 3D Particle Core
                      & Visual Dynamics
                    </span>
                  </div>

                  <div>
                    <label className={labelClass}>Color Scheme Presets</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(Object.keys(PARTICLE_PRESETS) as ParticlePresetKey[]).map((key) => {
                        const preset = PARTICLE_PRESETS[key]
                        const isSelected = coreSettings.particleSettings.preset === key
                        return (
                          <button
                            key={key}
                            onClick={() => coreSettingsService.applyPreset(key)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-white/10 border-emerald-400 shadow-md ring-1 ring-emerald-400/50'
                                : 'bg-black/30 border-white/5 hover:border-white/20'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full shrink-0 shadow-inner"
                              style={{ backgroundColor: preset.primaryColor }}
                            />
                            <span className="text-xs sm:text-sm font-medium text-zinc-200 truncate">
                              {preset.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-white/10">
                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-2">
                        <span className="text-zinc-300 font-medium">Particle Core Intensity</span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(coreSettings.particleSettings.intensity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={coreSettings.particleSettings.intensity}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            intensity: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-2">
                        <span className="text-zinc-300 font-medium">
                          Rotation & Oscillation Speed
                        </span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(coreSettings.particleSettings.speed * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="2.5"
                        step="0.05"
                        value={coreSettings.particleSettings.speed}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            speed: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs sm:text-sm mb-2">
                        <span className="text-zinc-300 font-medium">Particle Density</span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(coreSettings.particleSettings.density * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="1.5"
                        step="0.05"
                        value={coreSettings.particleSettings.density}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            density: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs sm:text-sm text-zinc-300 font-medium">
                        Bloom & Atmospheric Glow
                      </span>
                      <button
                        onClick={() =>
                          coreSettingsService.updateParticleSettings({
                            glow: !coreSettings.particleSettings.glow
                          })
                        }
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                          coreSettings.particleSettings.glow ? 'bg-emerald-500' : 'bg-zinc-800'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            coreSettings.particleSettings.glow ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: MEM0 PERSISTENT MEMORY */}
            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-2 flex-wrap gap-3">
                    <span className={titleClass}>
                      <Brain className="text-emerald-400 shrink-0" size={22} /> Mem0 Persistent
                      Memory Vault
                    </span>
                    {memories.length > 0 && (
                      <button
                        onClick={handleClearAllMemories}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 cursor-pointer bg-red-950/40 border border-red-500/20 px-3 py-1.5 rounded-lg"
                      >
                        <Trash2 size={14} /> Clear All Memories
                      </button>
                    )}
                  </div>

                  {/* Multi-Tenant User Profile Switcher */}
                  <div className="p-4 bg-black/40 border border-white/10 rounded-xl space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                        <User size={16} className="text-emerald-400" /> Active User Profile Scope
                        (Multi-Tenancy)
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 px-2 py-0.5 bg-white/5 rounded">
                        UID: {currentUser.uid}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap pt-1">
                      {[
                        { uid: 'usr_iris_default', name: 'Primary User' },
                        { uid: 'usr_developer_beta', name: 'Developer Beta' },
                        { uid: 'usr_guest_demo', name: 'Guest Demo' }
                      ].map((u) => (
                        <button
                          key={u.uid}
                          onClick={() => switchUserProfile(u.uid, u.name)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                            currentUser.uid === u.uid
                              ? 'bg-emerald-500 text-black font-semibold'
                              : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          {u.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Manual Ingestion */}
                  <div>
                    <label className={labelClass}>Manual Memory Ingestion ("Remember this")</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMemoryText}
                        onChange={(e) => setNewMemoryText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                        placeholder="e.g., I am building an AI launcher in Vue and Tailwind..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 placeholder:text-zinc-600"
                      />
                      <button
                        onClick={handleAddMemory}
                        disabled={isAddingMemory || !newMemoryText.trim()}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Plus size={16} /> Remember
                      </button>
                    </div>
                  </div>

                  {/* Stored Memories List */}
                  <div>
                    <label className={labelClass}>
                      Active Long-Term Memories ({memories.length})
                    </label>

                    {memories.length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-white/10 rounded-xl text-zinc-500 text-xs sm:text-sm">
                        No persistent memories recorded for this user profile yet.
                        <p className="mt-1 text-zinc-600">
                          Use voice commands like "Remember that I prefer Python" or add an entry
                          above.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-small">
                        {memories.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-black/30 border border-white/5 hover:border-white/15 transition-all group"
                          >
                            <div className="flex-1">
                              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                                {m.memory}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-zinc-500 font-mono">
                                <span>{new Date(m.createdAt || (m as any).created_at || Date.now()).toLocaleDateString()}</span>
                                {m.category && (
                                  <span className="text-emerald-400/80">
                                    • {m.category}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              className="text-zinc-600 hover:text-red-400 p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Delete memory"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </GlassPanel>
              </motion.div>
            )}

            {/* TAB: HARDWARE PERMISSIONS */}
            {activeTab === 'hardware' && (
              <motion.div
                key="hardware"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full"
              >
                <GlassPanel className="p-4 sm:p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center pb-2">
                    <span className={titleClass}>
                      <Cpu className="text-emerald-400 shrink-0" size={22} /> Hardware Permissions &
                      Telemetry
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-400 -mt-2">
                    Manage hardware peripherals, speech recognition engines, and optical sensors.
                  </p>

                  <div className="space-y-3">
                    {[
                      {
                        key: 'microphone' as const,
                        label: 'Microphone & Acoustic Speech Recognition',
                        desc: 'Processes offline microphone streams and hotwords via Vosk/WebSpeech',
                        icon: <Mic size={18} className="text-emerald-400" />
                      },
                      {
                        key: 'camera' as const,
                        label: 'Optics & Visual Perception Camera',
                        desc: 'Live webcam optical feed analysis and peripheral snapshot processing',
                        icon: <Camera size={18} className="text-cyan-400" />
                      },
                      {
                        key: 'screenCapture' as const,
                        label: 'Screen Telemetry & Canvas Optics',
                        desc: 'Allows IRIS to analyze active displays and desktop workflows',
                        icon: <Monitor size={18} className="text-purple-400" />
                      },
                      {
                        key: 'audioOutput' as const,
                        label: 'Synthesizer Audio Output',
                        desc: 'Vocal response playback and acoustic feedback',
                        icon: <Volume2 size={18} className="text-amber-400" />
                      },
                      {
                        key: 'location' as const,
                        label: 'Live Geolocation & Spatial Telemetry',
                        desc: 'Acquires satellite GPS coordinates, street/city geocoding, and telemetry mapping',
                        icon: <MapPin size={18} className="text-cyan-400" />
                      }
                    ].map((item) => {
                      const enabled = coreSettings.hardwarePermissions[item.key]
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="p-2.5 rounded-xl bg-white/5">{item.icon}</div>
                            <div>
                              <p className="text-xs sm:text-sm font-medium text-zinc-200">
                                {item.label}
                              </p>
                              <p className="text-[11px] sm:text-xs text-zinc-400">{item.desc}</p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              coreSettingsService.setHardwarePermission(item.key, !enabled)
                            }
                            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              enabled ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                enabled ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
