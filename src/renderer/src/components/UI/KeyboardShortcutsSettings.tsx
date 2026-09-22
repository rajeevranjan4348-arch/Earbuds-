import React, { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Keyboard,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Check,
  Search,
  Volume2,
  Bell,
  Mic,
  Layout,
  Command,
  HelpCircle,
  Play,
  Flame,
  Info
} from 'lucide-react'
import {
  shortcutService,
  ShortcutItem,
  ShortcutActionId,
  ShortcutGlobalSettings,
  SHORTCUT_PRESETS,
  KeyCombo,
  formatKeyCombo,
  normalizeKey
} from '../../services/shortcutService'

export default function KeyboardShortcutsSettings() {
  const [shortcuts, setShortcuts] = useState<ShortcutItem[]>(shortcutService.getShortcuts())
  const [settings, setSettings] = useState<ShortcutGlobalSettings>(shortcutService.getSettings())
  const [activeCategory, setActiveCategory] = useState<'all' | 'voice' | 'ui' | 'system'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // Live tester state
  const [testerKeys, setTesterKeys] = useState<string[]>([])
  const [testedAction, setTestedAction] = useState<string | null>(null)
  const testerTimeoutRef = useRef<any>(null)

  useEffect(() => {
    const unsub = shortcutService.subscribe((list, cfg) => {
      setShortcuts(list)
      setSettings(cfg)
    })
    return () => unsub()
  }, [])

  // Listen to keydown on window to update live tester display
  useEffect(() => {
    const handleTestKeyDown = (e: KeyboardEvent) => {
      if (recordingId) return // Don't interfere with recording mode

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.metaKey) parts.push('Cmd')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      const k = normalizeKey(e.key)
      if (!['control', 'alt', 'shift', 'meta'].includes(k.toLowerCase())) {
        parts.push(k === ' ' ? 'Space' : k.toUpperCase())
      }

      setTesterKeys(parts)

      // Find matching shortcut
      const match = shortcuts.find((s) => {
        if (!s.enabled) return false
        const keyMatch = normalizeKey(s.key) === k
        const ctrlMatch = Boolean(s.ctrlKey) === Boolean(e.ctrlKey)
        const altMatch = Boolean(s.altKey) === Boolean(e.altKey)
        const metaMatch = Boolean(s.metaKey) === Boolean(e.metaKey)
        const shiftMatch = Boolean(s.shiftKey) === Boolean(e.shiftKey)
        return keyMatch && ctrlMatch && altMatch && metaMatch && shiftMatch
      })

      if (match) {
        setTestedAction(`${match.name} (${match.category.toUpperCase()})`)
      } else {
        setTestedAction(parts.length > 0 ? 'No action assigned' : null)
      }

      if (testerTimeoutRef.current) clearTimeout(testerTimeoutRef.current)
      testerTimeoutRef.current = setTimeout(() => {
        setTesterKeys([])
        setTestedAction(null)
      }, 2500)
    }

    window.addEventListener('keydown', handleTestKeyDown)
    return () => {
      window.removeEventListener('keydown', handleTestKeyDown)
      if (testerTimeoutRef.current) clearTimeout(testerTimeoutRef.current)
    }
  }, [shortcuts, recordingId])

  const showNotification = (msg: string) => {
    setFeedbackMessage(msg)
    setTimeout(() => setFeedbackMessage(null), 3000)
  }

  // Conflicts
  const conflicts = useMemo(() => shortcutService.getConflicts(), [shortcuts])
  const conflictCount = useMemo(() => {
    let count = 0
    conflicts.forEach((list) => {
      if (list.length > 0) count++
    })
    return count
  }, [conflicts])

  // Filtered list
  const filteredShortcuts = useMemo(() => {
    return shortcuts.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory
      const q = searchQuery.toLowerCase().trim()
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        formatKeyCombo(item).join(' ').toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [shortcuts, activeCategory, searchQuery])

  const startRecording = (actionId: ShortcutActionId) => {
    setRecordingId(actionId)
    shortcutService.startRecording(actionId, (combo: KeyCombo) => {
      shortcutService.updateShortcut(actionId, combo)
      setRecordingId(null)
      showNotification(`Assigned shortcut: ${formatKeyCombo(combo).join(' + ')}`)
    })
  }

  const cancelRecording = () => {
    shortcutService.cancelRecording()
    setRecordingId(null)
  }

  const handleResetShortcut = (id: ShortcutActionId) => {
    shortcutService.resetShortcut(id)
    showNotification('Shortcut reverted to default')
  }

  const handleToggleEnabled = (id: ShortcutActionId, current: boolean) => {
    shortcutService.updateShortcut(id, { enabled: !current })
  }

  const handleApplyPreset = (presetId: string) => {
    shortcutService.applyPreset(presetId)
    const preset = SHORTCUT_PRESETS.find((p) => p.id === presetId)
    showNotification(`Applied "${preset?.name || presetId}" preset`)
  }

  const handleResetAll = () => {
    if (confirm('Reset all keyboard shortcuts to their factory defaults?')) {
      shortcutService.resetAllToDefaults()
      showNotification('All keyboard shortcuts reset to defaults')
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full text-zinc-100">
      {/* Toast alert */}
      <AnimatePresence>
        {feedbackMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl font-mono shadow-xl"
          >
            <Check size={14} className="text-emerald-400" />
            <span>{feedbackMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Master Controls Card */}
      <div className="rounded-2xl bg-zinc-900/70 border border-white/10 p-4 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Keyboard size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Keyboard Shortcuts & Hotkeys
              </h3>
              <p className="text-xs text-zinc-400">
                Trigger IRIS voice recognition, toggle minimalist HUD mode, and navigate at speed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-auto self-start">
            <button
              onClick={handleResetAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
              title="Reset all bindings to default"
            >
              <RotateCcw size={13} />
              <span>Reset All</span>
            </button>
          </div>
        </div>

        {/* Global Settings Switches */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 cursor-pointer hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">Enable Shortcuts</span>
                <span className="text-[10px] text-zinc-400">Global hotkey listener</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => shortcutService.setGlobalSettings({ enabled: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-500 bg-zinc-800 border-white/20 focus:ring-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 cursor-pointer hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2.5">
              <Volume2 size={16} className="text-cyan-400" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">Acoustic Feedback</span>
                <span className="text-[10px] text-zinc-400">Chime when hotkey triggers</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.soundFeedback}
              onChange={(e) => shortcutService.setGlobalSettings({ soundFeedback: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-500 bg-zinc-800 border-white/20 focus:ring-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 cursor-pointer hover:border-white/15 transition-colors">
            <div className="flex items-center gap-2.5">
              <Bell size={16} className="text-amber-400" />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white">HUD Toast Notification</span>
                <span className="text-[10px] text-zinc-400">On-screen visual indicator</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showHudToast}
              onChange={(e) => shortcutService.setGlobalSettings({ showHudToast: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-500 bg-zinc-800 border-white/20 focus:ring-emerald-500"
            />
          </label>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
              <Flame size={14} className="text-orange-400" /> Quick Layout Presets:
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">1-Click Configuration</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SHORTCUT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleApplyPreset(p.id)}
                className="flex flex-col p-2.5 text-left rounded-xl bg-black/30 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer group"
              >
                <span className="text-xs font-bold text-zinc-200 group-hover:text-emerald-300 transition-colors">
                  {p.name}
                </span>
                <span className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                  {p.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Live Shortcut Tester Bar */}
      <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-4 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono font-semibold text-zinc-300 uppercase tracking-wider">
            Live Hotkey Tester:
          </span>
          <span className="text-xs text-zinc-400 hidden md:inline">
            Press any key combination on your keyboard to test:
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {testerKeys.length > 0 ? (
            <div className="flex items-center gap-1.5">
              {testerKeys.map((k, i) => (
                <kbd
                  key={i}
                  className="px-2 py-1 rounded bg-zinc-800 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold shadow-md animate-in zoom-in-90"
                >
                  {k}
                </kbd>
              ))}
              {testedAction && (
                <span className="ml-2 text-xs font-sans text-emerald-400 font-medium">
                  → {testedAction}
                </span>
              )}
            </div>
          ) : (
            <span className="text-zinc-500 italic text-[11px]">Awaiting keystrokes...</span>
          )}
        </div>
      </div>

      {/* Conflict Warning Alert if any duplicate bindings exist */}
      {conflictCount > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs shadow-lg">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-bold text-amber-300">
              Shortcut Conflict Detected ({conflictCount} overlapping bindings)
            </span>
            <span className="text-zinc-300">
              Two or more enabled actions share identical key combinations. Reassign or disable one
              of them to guarantee deterministic hotkey execution.
            </span>
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-white/10 backdrop-blur-md overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'All Shortcuts', count: shortcuts.length },
            {
              id: 'voice',
              label: 'Voice & Mic',
              count: shortcuts.filter((s) => s.category === 'voice').length
            },
            {
              id: 'ui',
              label: 'Core UI',
              count: shortcuts.filter((s) => s.category === 'ui').length
            },
            {
              id: 'system',
              label: 'System & Nav',
              count: shortcuts.filter((s) => s.category === 'system').length
            }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === tab.id
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search action or key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-900/90 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
          />
        </div>
      </div>

      {/* Shortcuts List */}
      <div className="flex flex-col gap-3">
        {filteredShortcuts.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-white/5 text-zinc-500 text-xs">
            No shortcuts match your current filter or search criteria.
          </div>
        ) : (
          filteredShortcuts.map((shortcut) => {
            const isRecordingThis = recordingId === shortcut.id
            const hasConflict = (conflicts.get(shortcut.id) || []).length > 0
            const keyParts = formatKeyCombo(shortcut)

            return (
              <motion.div
                key={shortcut.id}
                layout
                className={`relative rounded-2xl p-4 sm:p-5 border transition-all duration-200 backdrop-blur-xl ${
                  isRecordingThis
                    ? 'bg-emerald-950/40 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                    : hasConflict
                      ? 'bg-zinc-900/70 border-amber-500/40'
                      : shortcut.enabled
                        ? 'bg-zinc-900/60 border-white/10 hover:border-white/20 shadow-lg'
                        : 'bg-zinc-900/30 border-white/5 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Title & Description */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
                        shortcut.category === 'voice'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : shortcut.category === 'ui'
                            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                            : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                      }`}
                    >
                      {shortcut.category === 'voice' && <Mic size={18} />}
                      {shortcut.category === 'ui' && <Layout size={18} />}
                      {shortcut.category === 'system' && <Command size={18} />}
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{shortcut.name}</span>
                        <span
                          className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded-full border ${
                            shortcut.category === 'voice'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : shortcut.category === 'ui'
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                                : 'bg-purple-950 text-purple-300 border-purple-800'
                          }`}
                        >
                          {shortcut.category}
                        </span>
                        {hasConflict && (
                          <span className="flex items-center gap-1 text-[9px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                            <AlertTriangle size={10} /> Conflict
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        {shortcut.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: Key Badge & Controls */}
                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    {/* Visual Key Combination Badge */}
                    {isRecordingThis ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-mono animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>Press any key combination...</span>
                        <button
                          onClick={cancelRecording}
                          className="ml-2 text-zinc-400 hover:text-white text-[11px] underline"
                        >
                          Cancel (Esc)
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 font-mono">
                        {keyParts.map((part, idx) => (
                          <React.Fragment key={idx}>
                            <kbd className="px-2.5 py-1 rounded-lg bg-black/60 text-zinc-200 border border-white/15 text-xs font-semibold shadow-inner tracking-wider">
                              {part}
                            </kbd>
                            {idx < keyParts.length - 1 && (
                              <span className="text-zinc-500 text-xs font-bold">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                      <button
                        onClick={() => startRecording(shortcut.id)}
                        disabled={isRecordingThis}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
                        title="Record new shortcut combo"
                      >
                        {isRecordingThis ? 'Listening...' : 'Edit'}
                      </button>

                      <button
                        onClick={() => handleResetShortcut(shortcut.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                        title="Revert to factory default"
                      >
                        <RotateCcw size={14} />
                      </button>

                      <label className="relative inline-flex items-center cursor-pointer ml-1">
                        <input
                          type="checkbox"
                          checked={shortcut.enabled}
                          onChange={() => handleToggleEnabled(shortcut.id, shortcut.enabled)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Ergonomic User Guide & Documentation Box */}
      <div className="rounded-2xl bg-zinc-950/60 border border-white/10 p-5 backdrop-blur-xl flex flex-col gap-3 text-xs text-zinc-400 leading-relaxed">
        <div className="flex items-center gap-2 text-zinc-200 font-bold">
          <Info size={16} className="text-cyan-400" />
          <span>Keyboard Shortcut Guidelines & Behavior</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1">
            <p className="font-semibold text-zinc-300">
              🎙️ AI Voice Input (<kbd className="px-1 bg-black border border-white/15 rounded">Alt+V</kbd>):
            </p>
            <p className="text-zinc-400">
              Toggles the active microphone listening loop anywhere within IRIS. If IRIS is currently
              synthesizing speech, pressing the voice hotkey instantly interrupts speech and primes
              the system for your new command.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-zinc-300">
              🖥️ Core UI Toggle (<kbd className="px-1 bg-black border border-white/15 rounded">Ctrl+\</kbd>):
            </p>
            <p className="text-zinc-400">
              Switches IRIS into Minimalist Zen/HUD mode, seamlessly collapsing the header navigation
              bar and maximizing the 3D particle sphere and voice listening waveforms for
              distraction-free voice interactions.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-zinc-300">
              ⚡ Safe Text Input Isolation:
            </p>
            <p className="text-zinc-400">
              When typing inside a search bar, note editor, or chat prompt, single-key shortcuts
              without modifiers are automatically suspended so your typing is never interrupted.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-zinc-300">
              ⌨️ Custom Key Recording:
            </p>
            <p className="text-zinc-400">
              Click &quot;Edit&quot; on any shortcut, press your desired combination (e.g. <kbd className="px-1 bg-black border border-white/15 rounded">Shift+Space</kbd> or <kbd className="px-1 bg-black border border-white/15 rounded">F2</kbd>),
              and it saves automatically. Press <kbd className="px-1 bg-black border border-white/15 rounded">Esc</kbd> to cancel recording.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
