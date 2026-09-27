import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiSmartphoneLine,
  RiShieldCheckLine,
  RiShieldLine,
  RiCameraLensLine,
  RiMicLine,
  RiMapPinLine,
  RiNotification3Line,
  RiEyeLine,
  RiBluetoothLine,
  RiContactsLine,
  RiCalendarLine,
  RiFolderLine,
  RiVolumeUpLine,
  RiPhoneLine,
  RiMessage3Line,
  RiWifiLine,
  RiSignalWifi3Line,
  RiBattery2ChargeLine,
  RiAlarmLine,
  RiGlobalLine,
  RiCloseLine,
  RiCheckLine,
  RiAlertLine,
  RiRefreshLine,
  RiSearchLine,
  RiExternalLinkLine
} from 'react-icons/ri'
import { permissionManager } from '../../services/androidAgent/PermissionManager'
import { PermissionName, PermissionState } from '../../services/androidAgent/types'

interface MobileAccessPermissionsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface PermissionCardItem {
  id: PermissionName
  label: string
  category: 'hardware' | 'automation' | 'communication' | 'storage' | 'system'
  icon: React.ReactNode
  description: string
  intent: string
}

const PERMISSION_METADATA: PermissionCardItem[] = [
  // Hardware & Optics
  {
    id: 'camera',
    label: 'Camera & Vision Scanner',
    category: 'hardware',
    icon: <RiCameraLensLine size={18} className="text-emerald-400" />,
    description: 'Visual question answering, live document scanning, and OCR image frame capture.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  {
    id: 'microphone',
    label: 'Microphone & Audio Stream',
    category: 'hardware',
    icon: <RiMicLine size={18} className="text-cyan-400" />,
    description: 'Continuous voice recognition, wake word detection, and two-way voice conversations.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  {
    id: 'location',
    label: 'GPS & Geolocation',
    category: 'hardware',
    icon: <RiMapPinLine size={18} className="text-amber-400" />,
    description: 'Real-time device coordinates, GIS telemetry mapping, and navigation routes.',
    intent: 'android.settings.LOCATION_SOURCE_SETTINGS'
  },
  {
    id: 'bluetooth',
    label: 'Bluetooth & Audio Peripherals',
    category: 'hardware',
    icon: <RiBluetoothLine size={18} className="text-blue-400" />,
    description: 'Audio headset discovery, peripheral status checks, and wireless link telemetry.',
    intent: 'android.settings.BLUETOOTH_SETTINGS'
  },

  // Automation & Accessibility
  {
    id: 'accessibility',
    label: 'Accessibility Service & Automation',
    category: 'automation',
    icon: <RiEyeLine size={18} className="text-purple-400" />,
    description: 'Inspecting live Android UI hierarchy, simulated assistive tapping, and scroll actions.',
    intent: 'android.settings.ACCESSIBILITY_SETTINGS'
  },
  {
    id: 'notifications',
    label: 'Notification Listener & Alerts',
    category: 'automation',
    icon: <RiNotification3Line size={18} className="text-rose-400" />,
    description: 'Parsing incoming status bar alerts, message notifications, and urgent device pings.',
    intent: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS'
  },

  // Communication
  {
    id: 'contacts',
    label: 'Contacts & Address Book',
    category: 'communication',
    icon: <RiContactsLine size={18} className="text-indigo-400" />,
    description: 'Resolving contact names, phone numbers, email addresses, and recipient lookups.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  {
    id: 'calls',
    label: 'Phone Dialer & Outbound Calls',
    category: 'communication',
    icon: <RiPhoneLine size={18} className="text-emerald-400" />,
    description: 'Placing user-confirmed phone calls and launching phone dialer intents.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  {
    id: 'messaging',
    label: 'SMS & Messaging Dispatcher',
    category: 'communication',
    icon: <RiMessage3Line size={18} className="text-teal-400" />,
    description: 'Composing SMS message drafts and dispatching verified mobile messages.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },

  // Storage & Files
  {
    id: 'files',
    label: 'Device Storage & Media Files',
    category: 'storage',
    icon: <RiFolderLine size={18} className="text-yellow-400" />,
    description: 'Reading saved photos, documents, log files, and downloading generated assets.',
    intent: 'android.settings.STORAGE_SETTINGS'
  },
  {
    id: 'calendar',
    label: 'Mobile Calendar & Events',
    category: 'storage',
    icon: <RiCalendarLine size={18} className="text-orange-400" />,
    description: 'Reading device appointments, booking calendar slots, and schedule alerts.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },

  // System & Telemetry
  {
    id: 'wifi',
    label: 'Wi-Fi & Network State',
    category: 'system',
    icon: <RiWifiLine size={18} className="text-sky-400" />,
    description: 'Inspecting Wi-Fi SSID, signal strength dBm, and local network link.',
    intent: 'android.settings.WIFI_SETTINGS'
  },
  {
    id: 'mobile_data',
    label: 'Cellular Data & Carrier',
    category: 'system',
    icon: <RiSignalWifi3Line size={18} className="text-fuchsia-400" />,
    description: 'Monitoring cellular network type (5G/LTE), roaming, and data state.',
    intent: 'android.settings.DATA_ROAMING_SETTINGS'
  },
  {
    id: 'battery',
    label: 'Battery & Power Diagnostics',
    category: 'system',
    icon: <RiBattery2ChargeLine size={18} className="text-green-400" />,
    description: 'Inspecting charge percentage, thermal state, and power saver mode.',
    intent: 'android.settings.BATTERY_SAVER_SETTINGS'
  },
  {
    id: 'media_control',
    label: 'Media Playback & Volume Control',
    category: 'system',
    icon: <RiVolumeUpLine size={18} className="text-violet-400" />,
    description: 'Controlling system volume, music playback, pause/resume, and track navigation.',
    intent: 'android.settings.SOUND_SETTINGS'
  },
  {
    id: 'alarms',
    label: 'System Alarms & Reminders',
    category: 'system',
    icon: <RiAlarmLine size={18} className="text-rose-400" />,
    description: 'Setting Android clock alarms, countdown timers, and recurrent alerts.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  },
  {
    id: 'web_browser',
    label: 'Web Browser & Deep-Links',
    category: 'system',
    icon: <RiGlobalLine size={18} className="text-blue-400" />,
    description: 'Launching URLs, viewing external documentation, and OAuth web redirects.',
    intent: 'android.settings.APPLICATION_DETAILS_SETTINGS'
  }
]

export const MobileAccessPermissionsModal: React.FC<MobileAccessPermissionsModalProps> = ({
  isOpen,
  onClose
}) => {
  const [permissionStates, setPermissionStates] = useState<Map<PermissionName, PermissionState>>(
    new Map()
  )
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeRequesting, setActiveRequesting] = useState<PermissionName | null>(null)
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setFeedbackToast(msg)
    setTimeout(() => setFeedbackToast(null), 3000)
  }

  // Subscribe to permission manager updates
  useEffect(() => {
    const unsub = permissionManager.subscribe((states) => {
      setPermissionStates(new Map(states))
    })
    return () => unsub()
  }, [])

  // Handle toggling permission
  const handleToggle = async (permId: PermissionName) => {
    const current = permissionManager.checkPermission(permId)
    if (current.status === 'granted') {
      // Revoke permission
      permissionManager.setPermissionStatus(permId, 'denied')
      showNotification(`Revoked access for ${permId.toUpperCase()}`)
    } else {
      // Request permission
      setActiveRequesting(permId)
      try {
        const result = await permissionManager.requestPermission(permId)
        if (result.granted) {
          showNotification(`Granted ${permId.toUpperCase()} permission`)
        } else {
          showNotification(`Permission ${permId.toUpperCase()} was denied`)
        }
      } catch (err: any) {
        showNotification(err?.message || 'Permission request failed')
      } finally {
        setActiveRequesting(null)
      }
    }
  }

  // Grant all recommended permissions
  const handleGrantAllRecommended = async () => {
    showNotification('Granting recommended mobile permissions...')
    const targets: PermissionName[] = [
      'microphone',
      'camera',
      'location',
      'notifications',
      'accessibility',
      'files',
      'contacts',
      'wifi',
      'battery',
      'media_control',
      'web_browser'
    ]
    for (const p of targets) {
      permissionManager.setPermissionStatus(p, 'granted')
    }
    showNotification('All recommended mobile permissions activated!')
  }

  // Reset permissions to default prompt
  const handleResetDefaults = () => {
    PERMISSION_METADATA.forEach((meta) => {
      const isSensitive = ['microphone', 'camera', 'location', 'accessibility', 'notifications', 'contacts', 'calls', 'messaging', 'files'].includes(meta.id)
      permissionManager.setPermissionStatus(meta.id, isSensitive ? 'prompt' : 'granted')
    })
    showNotification('Reset mobile permissions to system defaults')
  }

  // Open native Android settings for permission
  const handleOpenSettings = async (permId: PermissionName) => {
    await permissionManager.openSettings(permId)
    showNotification(`Dispatched settings intent for ${permId.toUpperCase()}`)
  }

  if (!isOpen) return null

  // Filter items
  const filteredItems = PERMISSION_METADATA.filter((item) => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    }
    return true
  })

  // Calculate statistics
  let grantedCount = 0
  let sensitiveCount = 0
  PERMISSION_METADATA.forEach((meta) => {
    const st = permissionStates.get(meta.id)
    if (st?.status === 'granted') grantedCount++
    if (st?.isSensitive) sensitiveCount++
  })

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-zinc-950/95 border border-emerald-500/30 rounded-2xl shadow-[0_0_50px_rgba(16,185,129,0.15)] text-zinc-100 font-mono overflow-hidden"
        >
          {/* Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 border-b border-white/10 bg-zinc-900/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <RiSmartphoneLine size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-zinc-100">
                    Mobile Access Permissions & Gateways
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                    {grantedCount} / {PERMISSION_METADATA.length} Active
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Granular Android device capability controls, real-time access policies, and assistive agent gating
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {feedbackToast && (
                <span className="text-[11px] text-emerald-300 px-3 py-1 bg-zinc-900 border border-emerald-500/40 rounded-lg animate-in fade-in">
                  {feedbackToast}
                </span>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                title="Close Modal"
              >
                <RiCloseLine size={18} />
              </button>
            </div>
          </div>

          {/* Quick Action Strip & Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 sm:p-4 bg-zinc-950/60 border-b border-white/5 text-xs shrink-0">
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase">Granted Capability</div>
              <div className="font-bold text-sm text-emerald-400">{grantedCount} Ready</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase">Sensitive Gated</div>
              <div className="font-bold text-sm text-amber-400">{sensitiveCount} Protected</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5">
              <div className="text-[10px] text-zinc-500 uppercase">Protocol Engine</div>
              <div className="font-bold text-sm text-cyan-400">ADB TCP/IP 5555</div>
            </div>
            <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase">Approval Mode</div>
                <div className="font-bold text-sm text-purple-400">Human-In-Loop</div>
              </div>
            </div>
          </div>

          {/* Controls & Filter Bar */}
          <div className="p-3 sm:p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/40 shrink-0">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <RiSearchLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mobile permission (e.g. camera, microphone, accessibility)..."
                className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All' },
                { id: 'hardware', label: 'Hardware' },
                { id: 'automation', label: 'Automation' },
                { id: 'communication', label: 'Communication' },
                { id: 'storage', label: 'Storage' },
                { id: 'system', label: 'System' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer shrink-0 ${
                    filterCategory === cat.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Batch Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleGrantAllRecommended}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <RiCheckLine size={14} />
                <span>Grant Recommended</span>
              </button>
              <button
                onClick={handleResetDefaults}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 text-xs font-bold transition-colors cursor-pointer"
              >
                <RiRefreshLine size={13} />
                <span className="hidden sm:inline">Reset Defaults</span>
              </button>
            </div>
          </div>

          {/* Permission Cards Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {filteredItems.map((item) => {
                const state = permissionStates.get(item.id)
                const isGranted = state?.status === 'granted'
                const isSensitive = state?.isSensitive ?? false
                const isProcessing = activeRequesting === item.id

                return (
                  <motion.div
                    key={item.id}
                    layout
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-md ${
                      isGranted
                        ? 'bg-zinc-900/70 border-emerald-500/30 hover:border-emerald-500/50'
                        : 'bg-zinc-900/40 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-zinc-950 border border-white/10">
                            {item.icon}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-zinc-100 flex items-center gap-1.5">
                              <span>{item.label}</span>
                              {isSensitive && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                                  Sensitive
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                              {item.id}
                            </div>
                          </div>
                        </div>

                        {/* Status Toggle Button */}
                        <button
                          onClick={() => handleToggle(item.id)}
                          disabled={isProcessing}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isGranted ? 'bg-emerald-500' : 'bg-zinc-800'
                          }`}
                          title={isGranted ? 'Click to Revoke' : 'Click to Authorize'}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              isGranted ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Description */}
                      <p className="text-[11px] text-zinc-400 mt-2.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isGranted
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                              : state?.status === 'prompt'
                                ? 'bg-amber-400'
                                : 'bg-zinc-600'
                          }`}
                        />
                        <span className={isGranted ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                          {isGranted ? 'Granted & Active' : state?.status === 'prompt' ? 'Prompt on Demand' : 'Denied'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenSettings(item.id)}
                          className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 border border-white/5 flex items-center gap-1 transition-colors cursor-pointer"
                          title={`Launch Android Intent: ${item.intent}`}
                        >
                          <span className="text-[9px]">Settings</span>
                          <RiExternalLinkLine size={10} />
                        </button>

                        <button
                          onClick={() => handleToggle(item.id)}
                          disabled={isProcessing}
                          className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                            isGranted
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {isProcessing ? 'Gating...' : isGranted ? 'Revoke' : 'Authorize'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-3.5 sm:p-4 bg-zinc-950 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
              <RiShieldLine className="text-emerald-400" />
              <span>Permission decisions are encrypted and securely stored in local preferences.</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors cursor-pointer text-xs"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default MobileAccessPermissionsModal
