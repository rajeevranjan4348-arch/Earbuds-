/**
 * IRIS — Android System-Style Permission Center
 * Renders live, reactive Android runtime permission states categorized into
 * 'Allowed' and 'Not allowed' sections with direct action request triggers
 * and Android Settings intent deep-linking.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  RiCameraLensLine,
  RiMicLine,
  RiContactsLine,
  RiMapPinLine,
  RiPhoneLine,
  RiMessage3Line,
  RiNotification3Line,
  RiBluetoothLine,
  RiFolderLine,
  RiCheckLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiSettings4Line,
  RiDownload2Line
} from 'react-icons/ri'
import { FaAndroid } from 'react-icons/fa6'
import { permissionManager } from '../../services/androidAgent/PermissionManager'
import { PermissionName, PermissionState } from '../../services/androidAgent/types'
import { AndroidApkDownloadModal } from './AndroidApkDownloadModal'

interface PermissionItemDef {
  id: PermissionName
  name: string
  androidPermission: string
  icon: React.ReactNode
  description: string
}

const CORE_PERMISSIONS: PermissionItemDef[] = [
  {
    id: 'camera',
    name: 'Camera',
    androidPermission: 'android.permission.CAMERA',
    icon: <RiCameraLensLine className="text-emerald-400" size={20} />,
    description: 'Used for Iris vision and live camera features. Required only when Vision/Camera is open.'
  },
  {
    id: 'microphone',
    name: 'Microphone',
    androidPermission: 'android.permission.RECORD_AUDIO',
    icon: <RiMicLine className="text-cyan-400" size={20} />,
    description: 'Used for Iris voice chat, ambient wake-word listener, and speech recognition.'
  },
  {
    id: 'contacts',
    name: 'Contacts',
    androidPermission: 'READ_CONTACTS / WRITE_CONTACTS',
    icon: <RiContactsLine className="text-indigo-400" size={20} />,
    description: 'Lookup contact names for commands like "call Rahul" or "message Rahul". Minimal data accessed.'
  },
  {
    id: 'location',
    name: 'Location',
    androidPermission: 'ACCESS_COARSE_LOCATION / ACCESS_FINE_LOCATION',
    icon: <RiMapPinLine className="text-amber-400" size={20} />,
    description: 'Requested only for location-dependent features (maps, nearby places, navigation, local weather).'
  },
  {
    id: 'calls',
    name: 'Phone',
    androidPermission: 'android.permission.CALL_PHONE',
    icon: <RiPhoneLine className="text-emerald-400" size={20} />,
    description: 'Requires explicit user confirmation before placing calls. Iris never calls silently.'
  },
  {
    id: 'messaging',
    name: 'SMS',
    androidPermission: 'android.permission.SEND_SMS',
    icon: <RiMessage3Line className="text-purple-400" size={20} />,
    description: 'Displays recipient and message draft for explicit user confirmation before transmitting SMS.'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    androidPermission: 'NOTIFICATION_LISTENER',
    icon: <RiNotification3Line className="text-rose-400" size={20} />,
    description: 'Reading status bar pings and alerting you to urgent incoming phone messages.'
  },
  {
    id: 'bluetooth',
    name: 'Bluetooth',
    androidPermission: 'BLUETOOTH_CONNECT',
    icon: <RiBluetoothLine className="text-blue-400" size={20} />,
    description: 'Audio headset discovery, paired earbud status, and peripheral telemetry link.'
  },
  {
    id: 'files',
    name: 'Storage & Files',
    androidPermission: 'READ_EXTERNAL_STORAGE',
    icon: <RiFolderLine className="text-amber-300" size={20} />,
    description: 'Reading requested local documents, analyzing images, and organizing exports.'
  }
]

export const AndroidPermissionCenter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [permissionStates, setPermissionStates] = useState<Map<PermissionName, PermissionState>>(
    new Map()
  )
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [showApkModal, setShowApkModal] = useState<boolean>(false)

  const refreshLiveState = useCallback(async () => {
    setIsRefreshing(true)
    const updated = await permissionManager.syncLivePermissions()
    setPermissionStates(new Map(updated))
    setTimeout(() => setIsRefreshing(false), 300)
  }, [])

  useEffect(() => {
    // Subscribe to permissionManager updates
    const unsub = permissionManager.subscribe((states) => {
      setPermissionStates(new Map(states))
    })

    // Sync on mount and window focus
    refreshLiveState()

    const handleFocus = () => {
      refreshLiveState()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      unsub()
      window.removeEventListener('focus', handleFocus)
    }
  }, [refreshLiveState])

  const handleRequestPermission = async (permId: PermissionName, name: string) => {
    setActionNotice(`Requesting ${name} runtime permission...`)
    const res = await permissionManager.requestPermission(permId)
    await refreshLiveState()

    if (res.granted) {
      setActionNotice(`✓ ${name} permission granted!`)
    } else {
      setActionNotice(`✕ ${name} permission denied by user.`)
    }
    setTimeout(() => setActionNotice(null), 3000)
  }

  const handleOpenSettings = async (permId: PermissionName, name: string) => {
    setActionNotice(`Opening Android System Settings for ${name}...`)
    await permissionManager.openSettings(permId)
    setTimeout(() => setActionNotice(null), 3000)
  }

  // Categorize into Allowed and Not Allowed
  const allowedList = CORE_PERMISSIONS.filter((item) => {
    const state = permissionStates.get(item.id)
    return state?.status === 'granted'
  })

  const notAllowedList = CORE_PERMISSIONS.filter((item) => {
    const state = permissionStates.get(item.id)
    return state?.status !== 'granted'
  })

  return (
    <div className={`w-full flex flex-col gap-6 select-none ${className}`}>
      {/* System Status Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900/80 border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <RiShieldCheckLine size={22} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Android Runtime Permissions
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-zinc-300 font-normal">
                Live Status
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Iris requests permissions through Android's official API only when features are activated.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => setShowApkModal(true)}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <FaAndroid size={14} />
            <span>Download APK</span>
          </button>

          <button
            onClick={refreshLiveState}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RiRefreshLine size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Sync Live State
          </button>
        </div>
      </div>

      <AndroidApkDownloadModal
        isOpen={showApkModal}
        onClose={() => setShowApkModal(false)}
      />

      {actionNotice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-zinc-800 border border-white/10 rounded-xl text-xs font-mono text-emerald-300 flex items-center justify-between"
        >
          <span>{actionNotice}</span>
        </motion.div>
      )}

      {/* SECTION 1: ALLOWED PERMISSIONS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <RiCheckLine size={16} className="text-emerald-400" />
            Allowed ({allowedList.length})
          </h4>
          <span className="text-[11px] text-zinc-500 font-mono">Granted & Active</span>
        </div>

        {allowedList.length === 0 ? (
          <div className="p-5 text-center rounded-2xl bg-zinc-950/40 border border-dashed border-white/10 text-xs text-zinc-500">
            No permissions currently allowed. Tap any item below to grant access.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allowedList.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-zinc-900/60 border border-emerald-500/20 hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-3 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{item.name}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium flex items-center gap-1">
                          <RiCheckLine size={10} /> Allowed
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                        {item.androidPermission}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>

                <div className="pt-2 border-t border-white/5 flex justify-end">
                  <button
                    onClick={() => handleOpenSettings(item.id, item.name)}
                    className="text-[11px] font-medium text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>App Settings</span>
                    <RiExternalLinkLine size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: NOT ALLOWED PERMISSIONS */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full border border-zinc-500 flex items-center justify-center text-[8px] text-zinc-500">
              ○
            </div>
            Not allowed ({notAllowedList.length})
          </h4>
          <span className="text-[11px] text-zinc-500 font-mono">Tap to Request</span>
        </div>

        {notAllowedList.length === 0 ? (
          <div className="p-5 text-center rounded-2xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300">
            ✓ All required runtime permissions have been granted!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notAllowedList.map((item) => {
              const state = permissionStates.get(item.id)
              const isDenied = state?.status === 'denied' || state?.status === 'blocked'

              return (
                <div
                  key={item.id}
                  onClick={() => !isDenied && handleRequestPermission(item.id, item.name)}
                  className={`p-4 rounded-2xl bg-zinc-900/40 border transition-all flex flex-col justify-between gap-3 ${
                    isDenied
                      ? 'border-rose-500/20 hover:border-rose-500/40'
                      : 'border-white/10 hover:border-white/25 cursor-pointer hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 shrink-0">
                        {item.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-200">{item.name}</span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium ${
                              isDenied
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {isDenied ? 'Denied' : 'Not Allowed'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                          {item.androidPermission}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">{item.description}</p>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">
                      {isDenied ? 'Permanently denied' : 'Tap card to grant'}
                    </span>

                    {isDenied ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenSettings(item.id, item.name)
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-bold border border-rose-500/30 flex items-center gap-1 cursor-pointer transition-all"
                      >
                        <RiSettings4Line size={12} />
                        Open Settings
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRequestPermission(item.id, item.name)
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-md"
                      >
                        Grant Access
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default AndroidPermissionCenter
