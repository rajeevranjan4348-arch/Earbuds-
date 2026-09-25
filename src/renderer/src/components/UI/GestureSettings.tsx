import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Hand,
  Camera,
  Sliders,
  Volume2,
  VolumeX,
  RotateCcw,
  Check,
  HelpCircle,
  Eye,
  Zap,
  Play
} from 'lucide-react'
import {
  gestureRecognitionService,
  GestureConfig,
  GESTURE_DEFINITIONS,
  ACTION_DESCRIPTIONS,
  GestureType,
  GestureActionId
} from '../../services/gestureRecognitionService'
import GestureGuideModal from './GestureGuideModal'

interface GestureSettingsProps {
  onStatusChange?: (msg: string) => void
}

export const GestureSettings: React.FC<GestureSettingsProps> = ({ onStatusChange }) => {
  const [config, setConfig] = useState<GestureConfig>(gestureRecognitionService.getConfig())
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const [testedGesture, setTestedGesture] = useState<string | null>(null)

  useEffect(() => {
    const unsub = gestureRecognitionService.subscribeConfig((c) => setConfig(c))
    gestureRecognitionService.getAvailableCameras().then(setCameras)
    return () => unsub()
  }, [])

  const update = (partial: Partial<GestureConfig>) => {
    gestureRecognitionService.updateConfig(partial)
    onStatusChange?.('Gesture configuration updated.')
  }

  const handleActionChange = (gesture: GestureType, action: GestureActionId) => {
    gestureRecognitionService.setActionMapping(gesture, action)
    onStatusChange?.(
      `Mapped ${GESTURE_DEFINITIONS[gesture].name} to: ${ACTION_DESCRIPTIONS[action]}`
    )
  }

  const testGesture = (g: GestureType) => {
    gestureRecognitionService.triggerGesture(g, 1.0)
    setTestedGesture(g)
    setTimeout(() => setTestedGesture(null), 1800)
  }

  const resetToDefaults = () => {
    const defaultMappings: Record<GestureType, GestureActionId> = {
      SWIPE_LEFT: 'NEXT_TAB',
      SWIPE_RIGHT: 'PREV_TAB',
      SWIPE_UP: 'SCROLL_UP',
      SWIPE_DOWN: 'SCROLL_DOWN',
      OPEN_PALM: 'TOGGLE_QUICK_ACTIONS',
      CLOSED_FIST: 'STOP_SPEECH_OR_MUTE',
      VICTORY: 'TOGGLE_MINIMAL_HUD',
      THUMBS_UP: 'NAV_DASHBOARD',
      POINT_UP: 'TOGGLE_MIC',
      PINCH: 'TOGGLE_KNOWLEDGE_OVERLAY'
    }
    gestureRecognitionService.updateConfig({
      enabled: true,
      sensitivity: 'medium',
      cooldownMs: 850,
      soundFeedback: true,
      showPreviewPip: true,
      actionMappings: defaultMappings
    })
    onStatusChange?.('Reset gesture mappings to factory defaults.')
  }

  const gestures = Object.values(GESTURE_DEFINITIONS)
  const allActionIds = Object.keys(ACTION_DESCRIPTIONS) as GestureActionId[]

  return (
    <div className="space-y-6">
      {/* Top Controls: Enable & Sensitivity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Enable Toggle Card */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Hand size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Camera Gesture Engine</p>
              <p className="text-xs text-zinc-400 font-mono">
                Optical hand tracking for touchless navigation
              </p>
            </div>
          </div>

          <button
            onClick={() => update({ enabled: !config.enabled })}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              config.enabled ? 'bg-emerald-500' : 'bg-zinc-800'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sound Feedback Card */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              {config.soundFeedback ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Acoustic Sci-Fi Chime</p>
              <p className="text-xs text-zinc-400 font-mono">
                Audio pulse feedback on gesture recognition
              </p>
            </div>
          </div>

          <button
            onClick={() => update({ soundFeedback: !config.soundFeedback })}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              config.soundFeedback ? 'bg-cyan-500' : 'bg-zinc-800'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                config.soundFeedback ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Sensitivity & Cooldown Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sensitivity Selector */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Sliders size={14} className="text-emerald-400" /> Tracking Sensitivity
            </span>
            <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10">
              {config.sensitivity}
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Higher sensitivity responds to lighter hand motions; lower prevents false triggers.
          </p>
          <div className="flex gap-2 pt-1">
            {(['low', 'medium', 'high'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => update({ sensitivity: lvl })}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                  config.sensitivity === lvl
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Cooldown Range Slider */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <RotateCcw size={14} className="text-cyan-400" /> Trigger Cooldown
            </span>
            <span className="text-[11px] font-mono text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-500/10">
              {config.cooldownMs} ms
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Minimum pause time required between consecutive gesture triggers.
          </p>
          <div className="pt-2">
            <input
              type="range"
              min="400"
              max="2000"
              step="50"
              value={config.cooldownMs}
              onChange={(e) => update({ cooldownMs: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1">
              <span>Fast (400ms)</span>
              <span>Balanced (850ms)</span>
              <span>Deliberate (2000ms)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Device Selector if multiple present */}
      {cameras.length > 0 && (
        <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
          <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
            <Camera size={14} className="text-emerald-400" /> Optical Sensor Camera Input
          </label>
          <select
            value={config.selectedCameraId || ''}
            onChange={(e) => {
              const id = e.target.value
              update({ selectedCameraId: id })
              gestureRecognitionService.startCamera(id)
            }}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">Default Front / User Camera</option>
            {cameras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Action Mappings Table */}
      <div className="p-4 sm:p-5 rounded-xl bg-black/40 border border-white/5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" /> Gesture Action Bindings
            </h4>
            <p className="text-xs text-zinc-400">
              Customize what each physical hand motion controls across the IRIS workspace
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsGuideOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle size={13} className="text-emerald-400" /> View Illustrated Guide
            </button>
            <button
              onClick={resetToDefaults}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} /> Reset Defaults
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {gestures.map((g) => {
            const currentAction = config.actionMappings[g.id] || 'NONE'
            const isJustTested = testedGesture === g.id

            return (
              <div
                key={g.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isJustTested
                    ? 'bg-emerald-500/20 border-emerald-500/50'
                    : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl select-none">{g.emoji}</span>
                  <div>
                    <span className="text-xs font-bold text-zinc-200">{g.name}</span>
                    <p className="text-[10px] text-zinc-500 font-mono hidden sm:block">
                      {g.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testGesture(g.id)}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300 border border-white/5 transition-colors cursor-pointer"
                    title={`Test ${g.name}`}
                  >
                    <Play size={12} />
                  </button>

                  <select
                    value={currentAction}
                    onChange={(e) => handleActionChange(g.id, e.target.value as GestureActionId)}
                    className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 cursor-pointer min-w-40 sm:min-w-48"
                  >
                    {allActionIds.map((act) => (
                      <option key={act} value={act}>
                        {ACTION_DESCRIPTIONS[act]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <GestureGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  )
}

export default GestureSettings
