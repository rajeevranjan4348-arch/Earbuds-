import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Sliders,
  Cpu,
  Mic,
  Camera,
  Monitor,
  Volume2,
  Brain,
  Trash2,
  Plus,
  User,
  Shield,
  Check,
  RefreshCw,
  Sparkles,
  Key,
  MapPin
} from 'lucide-react'
import {
  coreSettingsService,
  CoreSettings,
  ParticlePresetKey,
  PARTICLE_PRESETS
} from '../../services/coreSettingsService'
import { memoryService, MemoryItem } from '../../services/memoryService'
import { firebaseAuthService, FirebaseUserContext } from '../../services/firebaseAuth'

interface SettingsOverlayProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'hardware' | 'particles' | 'providers' | 'memory'
}

type ActiveSection = 'hardware' | 'particles' | 'providers' | 'memory'

export default function SettingsOverlay({
  isOpen,
  onClose,
  initialTab = 'particles'
}: SettingsOverlayProps) {
  const [section, setSection] = useState<ActiveSection>(initialTab)
  const [settings, setSettings] = useState<CoreSettings>(coreSettingsService.getSettings())
  const [currentUser, setCurrentUser] = useState<FirebaseUserContext>(
    firebaseAuthService.getCurrentUser()
  )
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [newMemoryText, setNewMemoryText] = useState('')
  const [isAddingMemory, setIsAddingMemory] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Subscribe to coreSettingsService & firebaseAuthService
  useEffect(() => {
    const unsubSettings = coreSettingsService.subscribe((s) => setSettings(s))
    const unsubAuth = firebaseAuthService.subscribe((u) => {
      setCurrentUser(u)
      loadMemories(u.uid)
    })

    loadMemories(firebaseAuthService.getUserId())

    return () => {
      unsubSettings()
      unsubAuth()
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadMemories(firebaseAuthService.getUserId())
    }
  }, [isOpen])

  const loadMemories = async (uid: string) => {
    try {
      const list = await memoryService.listMemories(uid)
      setMemories(list)
    } catch (_e) {
      setMemories([])
    }
  }

  const showStatus = (msg: string) => {
    setStatusMsg(msg)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const handleAddMemory = async () => {
    if (!newMemoryText.trim()) return
    setIsAddingMemory(true)
    try {
      await memoryService.addMemory(newMemoryText.trim(), currentUser.uid, { source: 'manual_ui' })
      setNewMemoryText('')
      await loadMemories(currentUser.uid)
      showStatus('Memory committed to Mem0 persistent storage.')
    } catch (_e) {
      showStatus('Failed to commit memory.')
    } finally {
      setIsAddingMemory(false)
    }
  }

  const handleDeleteMemory = async (id: string) => {
    try {
      await memoryService.deleteMemory(id, currentUser.uid)
      await loadMemories(currentUser.uid)
      showStatus('Memory removed.')
    } catch (_e) {
      showStatus('Failed to delete memory.')
    }
  }

  const handleClearAllMemories = async () => {
    if (confirm('Clear all long-term memories for this profile?')) {
      await memoryService.clearUserMemory(currentUser.uid)
      await loadMemories(currentUser.uid)
      showStatus('All profile memories deleted.')
    }
  }

  const switchUserProfile = (targetUid: string, name: string) => {
    firebaseAuthService.switchUser(targetUid, name)
    showStatus(`Switched active user scope to: ${name}`)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          {/* Overlay Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white tracking-wide">
                    IRIS System Controls
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Core parameters, Mem0 long-term memory & hardware orchestration
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Status Toast */}
            {statusMsg && (
              <div className="bg-emerald-950/90 border-b border-emerald-500/30 px-6 py-2 text-xs font-mono text-emerald-300 flex items-center gap-2">
                <Check size={14} /> {statusMsg}
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex px-6 pt-3 border-b border-white/5 gap-2 bg-zinc-900/30 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setSection('particles')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                  section === 'particles'
                    ? 'border-emerald-400 text-emerald-300 bg-white/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles size={14} /> 3D Particle Core
              </button>
              <button
                onClick={() => setSection('memory')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                  section === 'memory'
                    ? 'border-emerald-400 text-emerald-300 bg-white/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Brain size={14} /> Mem0 Memory ({memories.length})
              </button>
              <button
                onClick={() => setSection('hardware')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                  section === 'hardware'
                    ? 'border-emerald-400 text-emerald-300 bg-white/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Cpu size={14} /> Hardware & Optics
              </button>
              <button
                onClick={() => setSection('providers')}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors cursor-pointer border-b-2 ${
                  section === 'providers'
                    ? 'border-emerald-400 text-emerald-300 bg-white/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Key size={14} /> API Providers
              </button>
            </div>

            {/* Body Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-small">
              {/* SECTION: 3D PARTICLE CORE */}
              {section === 'particles' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">Color Scheme Presets</h4>
                    <p className="text-xs text-zinc-400 mb-3">
                      Select reactive aesthetic themes mapped onto the dynamic Three.js neural
                      sphere
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {(Object.keys(PARTICLE_PRESETS) as ParticlePresetKey[]).map((key) => {
                        const preset = PARTICLE_PRESETS[key]
                        const isSelected = settings.particleSettings.preset === key
                        return (
                          <button
                            key={key}
                            onClick={() => coreSettingsService.applyPreset(key)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-white/10 border-emerald-400 shadow-md ring-1 ring-emerald-400/40'
                                : 'bg-black/30 border-white/5 hover:border-white/20'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full shrink-0 shadow-inner"
                              style={{ backgroundColor: preset.primaryColor }}
                            />
                            <span className="text-xs font-medium text-zinc-200 truncate">
                              {preset.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Intensity and Dynamics Sliders */}
                  <div className="space-y-4 pt-2 border-t border-white/5">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-300 font-medium">Particle Core Intensity</span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(settings.particleSettings.intensity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={settings.particleSettings.intensity}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            intensity: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-300 font-medium">
                          Rotation & Oscillation Speed
                        </span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(settings.particleSettings.speed * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="2.5"
                        step="0.05"
                        value={settings.particleSettings.speed}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            speed: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-zinc-300 font-medium">Particle Count / Density</span>
                        <span className="text-emerald-400 font-mono">
                          {Math.round(settings.particleSettings.density * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="1.5"
                        step="0.05"
                        value={settings.particleSettings.density}
                        onChange={(e) =>
                          coreSettingsService.updateParticleSettings({
                            density: parseFloat(e.target.value)
                          })
                        }
                        className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-zinc-300">Bloom & Atmospheric Glow</span>
                      <button
                        onClick={() =>
                          coreSettingsService.updateParticleSettings({
                            glow: !settings.particleSettings.glow
                          })
                        }
                        className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                          settings.particleSettings.glow ? 'bg-emerald-500' : 'bg-zinc-800'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            settings.particleSettings.glow ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: MEM0 MEMORY */}
              {section === 'memory' && (
                <div className="space-y-6">
                  {/* User Profile Switcher for Multi-Tenant Isolation Testing */}
                  <div className="p-3.5 bg-black/40 border border-white/10 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                        <User size={14} className="text-emerald-400" /> Active User Profile Scope
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 bg-white/5 rounded">
                        UID: {currentUser.uid}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { uid: 'usr_iris_default', name: 'Primary User' },
                        { uid: 'usr_developer_beta', name: 'Developer Beta' },
                        { uid: 'usr_guest_demo', name: 'Guest Demo' }
                      ].map((u) => (
                        <button
                          key={u.uid}
                          onClick={() => switchUserProfile(u.uid, u.name)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
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

                  {/* Add Memory Input */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Manual Memory Ingestion ("Remember this")
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMemoryText}
                        onChange={(e) => setNewMemoryText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                        placeholder="e.g., I prefer TypeScript and Dark Mode interfaces..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 placeholder:text-zinc-600"
                      />
                      <button
                        onClick={handleAddMemory}
                        disabled={isAddingMemory || !newMemoryText.trim()}
                        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Plus size={14} /> Commit
                      </button>
                    </div>
                  </div>

                  {/* Memories List */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Brain size={14} className="text-emerald-400" /> Stored Long-Term Memories (
                        {memories.length})
                      </span>
                      {memories.length > 0 && (
                        <button
                          onClick={handleClearAllMemories}
                          className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={12} /> Clear Profile Memories
                        </button>
                      )}
                    </div>

                    {memories.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-zinc-500 text-xs">
                        No persistent memories recorded for this user profile yet.
                        <p className="mt-1 text-zinc-600">
                          Speak naturally ("Remember that I like Next.js") or add an entry above.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-small">
                        {memories.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-start justify-between gap-3 p-3 rounded-xl bg-black/30 border border-white/5 hover:border-white/15 transition-all group"
                          >
                            <div className="flex-1">
                              <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                                {m.memory}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 font-mono">
                                <span>{new Date(m.created_at).toLocaleDateString()}</span>
                                {m.categories && m.categories.length > 0 && (
                                  <span className="text-emerald-400/80">
                                    • {m.categories.join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Delete memory"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION: HARDWARE PERMISSIONS */}
              {section === 'hardware' && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400 mb-2">
                    Manage real-time peripheral access and voice-command activation permissions
                  </p>

                  <div className="space-y-2.5">
                    {[
                      {
                        key: 'microphone' as const,
                        label: 'Microphone & Vosk Speech Recognition',
                        desc: 'Processes offline acoustic voice streams and wake-words',
                        icon: <Mic size={16} className="text-emerald-400" />
                      },
                      {
                        key: 'camera' as const,
                        label: 'Optics & Visual Perception Camera',
                        desc: 'Live desktop optical frames and peripheral snapshot analysis',
                        icon: <Camera size={16} className="text-cyan-400" />
                      },
                      {
                        key: 'screenCapture' as const,
                        label: 'Screen Telemetry & Canvas Optics',
                        desc: 'Allows IRIS to analyze active displays and desktop workflows',
                        icon: <Monitor size={16} className="text-purple-400" />
                      },
                      {
                        key: 'audioOutput' as const,
                        label: 'Synthesizer Audio Output',
                        desc: 'Vocal response playback and dynamic acoustic feedback',
                        icon: <Volume2 size={16} className="text-amber-400" />
                      },
                      {
                        key: 'location' as const,
                        label: 'Live Geolocation & Spatial Telemetry',
                        desc: 'Acquires satellite GPS coordinates, street/city geocoding, and telemetry mapping',
                        icon: <MapPin size={16} className="text-cyan-400" />
                      }
                    ].map((item) => {
                      const enabled = settings.hardwarePermissions[item.key]
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-white/5">{item.icon}</div>
                            <div>
                              <p className="text-xs font-medium text-zinc-200">{item.label}</p>
                              <p className="text-[11px] text-zinc-400">{item.desc}</p>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              coreSettingsService.setHardwarePermission(item.key, !enabled)
                            }
                            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                              enabled ? 'bg-emerald-500' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: API PROVIDERS */}
              {section === 'providers' && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Configure preferred cloud models, Mem0 endpoint, and search accelerators
                  </p>
                  <div className="space-y-2.5">
                    {[
                      {
                        key: 'gemini' as const,
                        name: 'Google Gemini Pro / Flash 2.5',
                        status: 'Active Provider'
                      },
                      {
                        key: 'groq' as const,
                        name: 'Groq LPU Inference (Llama 3)',
                        status: 'Fallback Engine'
                      },
                      {
                        key: 'huggingface' as const,
                        name: 'Hugging Face Inference API',
                        status: 'Available'
                      },
                      {
                        key: 'tavily' as const,
                        name: 'Tavily Deep Web Search',
                        status: 'Grounding'
                      },
                      {
                        key: 'mem0' as const,
                        name: 'Mem0 Persistent Memory Layer',
                        status: 'Enabled & Synced'
                      }
                    ].map((p) => {
                      const isSelected = settings.apiProviders.selected === p.key
                      return (
                        <div
                          key={p.key}
                          onClick={() => coreSettingsService.setSelectedProvider(p.key)}
                          className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-500/10 border-emerald-400'
                              : 'bg-black/30 border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div>
                            <p className="text-xs font-semibold text-white">{p.name}</p>
                            <p className="text-[11px] text-zinc-400">{p.status}</p>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-400'
                                : 'border-zinc-600 bg-transparent'
                            }`}
                          >
                            {isSelected && <Check size={10} className="text-black stroke-[3]" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <Shield size={12} className="text-emerald-400" /> IRIS Neural Architecture v1.7.0
              </span>
              <button
                onClick={onClose}
                className="bg-white text-black font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
