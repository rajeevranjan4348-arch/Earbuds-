import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Hand,
  Sparkles,
  Camera,
  Check,
  Zap,
  Info,
  Play,
  RotateCcw,
  Sliders,
  Volume2
} from 'lucide-react'
import {
  gestureRecognitionService,
  GESTURE_DEFINITIONS,
  GestureType,
  ACTION_DESCRIPTIONS
} from '../../services/gestureRecognitionService'

interface GestureGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export const GestureGuideModal: React.FC<GestureGuideModalProps> = ({ isOpen, onClose }) => {
  const [selectedGesture, setSelectedGesture] = useState<GestureType>('SWIPE_LEFT')
  const [testResult, setTestResult] = useState<string | null>(null)

  const gestures = Object.values(GESTURE_DEFINITIONS)
  const currentDef = GESTURE_DEFINITIONS[selectedGesture]

  const handleTestGesture = (g: GestureType) => {
    gestureRecognitionService.triggerGesture(g, 0.98)
    setTestResult(
      `Executed: ${ACTION_DESCRIPTIONS[gestureRecognitionService.getConfig().actionMappings[g]]}`
    )
    setTimeout(() => setTestResult(null), 2500)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-zinc-950 border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden font-sans text-zinc-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Hand size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                  Hands-Free Camera Gesture Guide
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold tracking-widest uppercase">
                    Neural Optics
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 font-mono">
                  Navigate, control, and command IRIS without touching mouse or keyboard
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 scrollbar-small">
            {/* Gesture Selector List */}
            <div className="md:col-span-5 flex flex-col gap-2">
              <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Zap size={13} className="text-emerald-400" /> Supported Hand Gestures
              </span>
              <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1 scrollbar-small">
                {gestures.map((g) => {
                  const isSelected = selectedGesture === g.id
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGesture(g.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-white shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                          : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl select-none">{g.emoji}</span>
                        <div>
                          <p className="text-xs font-semibold text-zinc-200">{g.name}</p>
                          <p className="text-[10px] font-mono text-emerald-400/80">
                            →{' '}
                            {
                              ACTION_DESCRIPTIONS[
                                gestureRecognitionService.getConfig().actionMappings[g.id]
                              ]
                            }
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Gesture Details & Interactive Sandbox */}
            <div className="md:col-span-7 flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-white/10 flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl select-none">{currentDef.emoji}</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">{currentDef.name}</h3>
                      <p className="text-xs text-emerald-400 font-mono">
                        Action:{' '}
                        {
                          ACTION_DESCRIPTIONS[
                            gestureRecognitionService.getConfig().actionMappings[currentDef.id]
                          ]
                        }
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTestGesture(currentDef.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors shadow-lg cursor-pointer"
                  >
                    <Play size={13} />
                    <span>Test Gesture</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-xs text-zinc-300 leading-relaxed font-sans">
                  {currentDef.description}
                </div>

                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2"
                  >
                    <Check size={14} /> {testResult}
                  </motion.div>
                )}

                {/* Practical Tips */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Info size={12} className="text-cyan-400" /> Optimal Execution Tips
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-400 font-sans">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <strong className="text-zinc-200 block mb-0.5">Camera Distance:</strong>
                      Hold hand roughly 0.5m - 1.2m (1.5 to 4 feet) from the camera lens.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <strong className="text-zinc-200 block mb-0.5">Lighting:</strong>
                      Ensure front lighting on your hand so fingers and silhouette are distinct.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <strong className="text-zinc-200 block mb-0.5">Motion Speed:</strong>
                      For Swipes, move hand in one fluid horizontal stroke across the frame.
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                      <strong className="text-zinc-200 block mb-0.5">Static Poses:</strong>
                      For Palm, Fist, or Peace, hold the pose steadily for ~0.2 seconds.
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Flow Architecture */}
              <div className="p-4 rounded-xl bg-zinc-900/30 border border-white/5">
                <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2 block">
                  IRIS Hands-Free Interface Cycle
                </span>
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                  {[
                    'Command',
                    'YouTube',
                    'Workspace',
                    'Maps',
                    'Notes',
                    'Gallery',
                    'Mobile',
                    'Settings'
                  ].map((tab, idx) => (
                    <React.Fragment key={tab}>
                      <span className="px-2 py-1 rounded bg-zinc-900 border border-white/10 text-zinc-300">
                        {tab}
                      </span>
                      {idx < 7 && <span className="text-emerald-500 font-bold">⇄</span>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10 bg-zinc-900/80 shrink-0">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Camera size={14} className="text-emerald-400" />
              <span>Camera processing runs 100% on-device inside browser canvas.</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              Close Guide
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default GestureGuideModal
