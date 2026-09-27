import React, { useState, useEffect } from 'react'
import {
  backgroundExecutionService,
  BackgroundSettings,
  BackgroundState
} from '../../services/backgroundExecutionService'
import {
  RiPulseLine,
  RiNotification4Line,
  RiShieldFlashLine,
  RiVolumeUpLine,
  RiMic2Line,
  RiCheckLine,
  RiSettings4Line
} from 'react-icons/ri'

export const BackgroundModeController: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [settings, setSettings] = useState<BackgroundSettings>(backgroundExecutionService.getSettings())
  const [bgState, setBgState] = useState<BackgroundState>(backgroundExecutionService.getState())
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = backgroundExecutionService.subscribe((newSettings, newState) => {
      setSettings(newSettings)
      setBgState(newState)
    })
    backgroundExecutionService.startBackgroundKeepAlive()
    return () => unsubscribe()
  }, [])

  const toggleGlobalBackground = () => {
    const updated = !settings.enabled
    backgroundExecutionService.saveSettings({ enabled: updated })
  }

  const toggleSetting = (key: keyof BackgroundSettings) => {
    backgroundExecutionService.saveSettings({ [key]: !settings[key] })
  }

  const handleRequestNotifications = async () => {
    const granted = await backgroundExecutionService.requestNotificationPermission()
    if (granted) {
      backgroundExecutionService.saveSettings({ notifications: true })
      backgroundExecutionService.sendNotification('IRIS AI Background Active', {
        body: 'IRIS will now alert you in background even when browser is minimized.'
      })
    }
  }

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Background Status Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="IRIS Background Execution Status & Controls"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer ${
          settings.enabled && bgState === 'running'
            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10'
            : 'bg-zinc-900/80 hover:bg-zinc-800/80 text-zinc-400 border-zinc-800'
        }`}
      >
        <span className="relative flex h-2 w-2">
          {settings.enabled && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              settings.enabled ? 'bg-emerald-500' : 'bg-zinc-600'
            }`}
          ></span>
        </span>
        <span>{settings.enabled ? 'BG Active' : 'BG Off'}</span>
        <RiPulseLine className="w-3 h-3 text-emerald-400 opacity-80" />
      </button>

      {/* Popover Settings Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-zinc-950/95 border border-zinc-800 shadow-2xl p-4 z-50 text-zinc-100 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2">
              <RiPulseLine className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Background Engine
              </h4>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
            Keep IRIS listening, processing, and executing commands even when browser or device tab is minimized.
          </p>

          {/* Master Switch */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 mb-3">
            <div className="flex items-center gap-2">
              <RiShieldFlashLine className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-zinc-200">Run in Background</span>
            </div>
            <button
              onClick={toggleGlobalBackground}
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                settings.enabled ? 'bg-emerald-500' : 'bg-zinc-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  settings.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sub-Toggles */}
          <div className="space-y-2 text-xs">
            {/* Audio Keep-Alive */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
              <div className="flex items-center gap-2 text-zinc-300">
                <RiVolumeUpLine className="w-3.5 h-3.5 text-emerald-400" />
                <span>Audio Keep-Alive Loop</span>
              </div>
              <input
                type="checkbox"
                checked={settings.audioKeepAlive}
                onChange={() => toggleSetting('audioKeepAlive')}
                disabled={!settings.enabled}
                className="accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {/* Wake Lock */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
              <div className="flex items-center gap-2 text-zinc-300">
                <RiShieldFlashLine className="w-3.5 h-3.5 text-emerald-400" />
                <span>Device CPU Wake Lock</span>
              </div>
              <input
                type="checkbox"
                checked={settings.wakeLock}
                onChange={() => toggleSetting('wakeLock')}
                disabled={!settings.enabled}
                className="accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {/* Background Voice Listener */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
              <div className="flex items-center gap-2 text-zinc-300">
                <RiMic2Line className="w-3.5 h-3.5 text-emerald-400" />
                <span>Background Speech Input</span>
              </div>
              <input
                type="checkbox"
                checked={settings.wakeWordInBackground}
                onChange={() => toggleSetting('wakeWordInBackground')}
                disabled={!settings.enabled}
                className="accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {/* OS Web Notifications */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/40">
              <div className="flex items-center gap-2 text-zinc-300">
                <RiNotification4Line className="w-3.5 h-3.5 text-emerald-400" />
                <span>OS System Notifications</span>
              </div>
              <button
                onClick={handleRequestNotifications}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              >
                {settings.notifications ? 'Enabled' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
