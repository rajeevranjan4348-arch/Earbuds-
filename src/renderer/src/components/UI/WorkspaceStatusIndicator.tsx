import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RiGoogleFill, RiRefreshLine, RiShieldCheckLine, RiAlertLine, RiCloseCircleLine, RiExternalLinkLine } from 'react-icons/ri'
import {
  auth,
  browserLocalPersistence,
  setPersistence,
  getCachedAccessToken,
  setCachedAccessToken,
  signInWithGoogle
} from '../../lib/firebase'

interface SessionInfo {
  isConnected: boolean
  userId: string
  email?: string
  displayName?: string
  scopes: string[]
  expiresAt: number
  timeRemainingMinutes: number
  isExpired: boolean
  hasRefreshToken: boolean
  lastVerifiedAt?: number
  lastError?: string
  lastFailedService?: string
}

interface WorkspaceStatusIndicatorProps {
  onOpenHub?: () => void
  onNavigateWorkspace?: () => void
  className?: string
}

export const WorkspaceStatusIndicator: React.FC<WorkspaceStatusIndicatorProps> = ({
  onOpenHub,
  onNavigateWorkspace,
  className = ''
}) => {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [countdownStr, setCountdownStr] = useState<string>('')

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.session) {
          setSession(data.session)
        }
      }
    } catch (_err) {
      // Network or offline
    }
  }, [])

  useEffect(() => {
    fetchSession()
    const interval = setInterval(fetchSession, 20000)
    const handleFocus = () => fetchSession()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchSession])

  // Live countdown timer calculation
  useEffect(() => {
    if (!session?.expiresAt) {
      setCountdownStr('')
      return
    }

    const updateCountdown = () => {
      const remainingMs = session.expiresAt - Date.now()
      if (remainingMs <= 0) {
        setCountdownStr('Expired')
      } else {
        const mins = Math.floor(remainingMs / 60000)
        const secs = Math.floor((remainingMs % 60000) / 1000)
        setCountdownStr(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`)
      }
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [session?.expiresAt])

  const handleRefresh = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/workspace/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success && data.accessToken) {
        setCachedAccessToken(data.accessToken)
        await fetchSession()
      }
    } catch (err) {
      console.warn('[WorkspaceStatusIndicator] Refresh error:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleQuickReAuth = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setIsLoading(true)
    try {
      await setPersistence(auth, browserLocalPersistence)
      const res = await signInWithGoogle()
      setCachedAccessToken(res.accessToken)
      await fetch('/api/workspace/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName,
          accessToken: res.accessToken
        })
      })
      await fetchSession()
      setIsOpen(false)
    } catch (err) {
      console.error('[WorkspaceStatusIndicator] Re-auth failed:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Determine status color & state
  const isConnected = session?.isConnected ?? false
  const isExpired = session?.isExpired ?? false
  const hasError = Boolean(session?.lastError)

  let statusType: 'connected' | 'warning' | 'disconnected' = 'disconnected'
  let statusText = 'Disconnected'
  let badgeColor = 'bg-zinc-800 text-zinc-400 border-white/10'
  let dotColor = 'bg-zinc-500'

  if (isConnected && !isExpired && !hasError) {
    statusType = 'connected'
    statusText = 'Connected'
    badgeColor = 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    dotColor = 'bg-emerald-400 text-emerald-400'
  } else if (isConnected && (isExpired || hasError)) {
    statusType = 'warning'
    statusText = isExpired ? 'Token Expired' : 'Re-auth Required'
    badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    dotColor = 'bg-amber-400 text-amber-400'
  } else {
    statusType = 'disconnected'
    statusText = 'Offline'
    badgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    dotColor = 'bg-rose-500 text-rose-500'
  }

  return (
    <div className={`relative ${className}`}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (onOpenHub) {
            onOpenHub()
          } else {
            setIsOpen(!isOpen)
          }
        }}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-mono tracking-wider transition-all duration-200 cursor-pointer ${badgeColor} backdrop-blur-md shadow-sm`}
        title={`Google Workspace: ${statusText}${countdownStr ? ` (${countdownStr} left)` : ''}`}
      >
        <RiGoogleFill size={14} className={statusType === 'connected' ? 'text-blue-400' : statusType === 'warning' ? 'text-amber-400' : 'text-zinc-500'} />
        
        <span className="hidden sm:inline font-bold">
          Workspace
        </span>

        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${dotColor} ${statusType === 'connected' ? 'shadow-[0_0_8px_rgba(52,211,153,0.8)]' : statusType === 'warning' ? 'animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]' : ''}`} />
          <span className="text-[10px] font-medium hidden md:inline">
            {statusText}
          </span>
        </div>

        {statusType === 'connected' && countdownStr && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono hidden xl:inline">
            {countdownStr}
          </span>
        )}
      </motion.button>

      {/* Popover Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-h-[85vh] overflow-y-auto p-3.5 rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl backdrop-blur-2xl z-50 text-zinc-200 font-mono text-xs custom-scrollbar"
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <RiGoogleFill size={16} />
                </div>
                <div>
                  <div className="font-bold text-zinc-100 text-[12px]">Google Workspace</div>
                  <div className="text-[10px] text-zinc-400">{session?.email || 'No active user'}</div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-900 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="py-2.5 space-y-2 text-[11px]">
              <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-zinc-900/60 border border-white/5">
                <span className="text-zinc-400">Connection State:</span>
                <span className={`font-bold ${statusType === 'connected' ? 'text-emerald-400' : statusType === 'warning' ? 'text-amber-400' : 'text-rose-400'}`}>
                  {statusText}
                </span>
              </div>

              {session?.expiresAt ? (
                <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-zinc-900/60 border border-white/5">
                  <span className="text-zinc-400">Token Validity:</span>
                  <span className="text-blue-300 font-mono">{countdownStr || 'Active'}</span>
                </div>
              ) : null}

              <div className="flex justify-between items-center py-1 px-2 rounded-lg bg-zinc-900/60 border border-white/5">
                <span className="text-zinc-400">Active Scopes:</span>
                <span className="text-zinc-200 font-mono">{session?.scopes?.length || 14} authorized</span>
              </div>

              {session?.lastError && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 flex items-start gap-1.5">
                  <RiAlertLine size={14} className="shrink-0 mt-0.5 text-amber-400" />
                  <span>{session.lastError}</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-200 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <RiRefreshLine size={12} className={isRefreshing ? 'animate-spin text-blue-400' : 'text-zinc-400'} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Token'}</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false)
                  if (onOpenHub) onOpenHub()
                  else if (onNavigateWorkspace) onNavigateWorkspace()
                }}
                className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-colors cursor-pointer"
              >
                <span>Open Hub</span>
                <RiExternalLinkLine size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default WorkspaceStatusIndicator
