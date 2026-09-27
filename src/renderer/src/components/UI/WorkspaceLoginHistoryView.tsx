import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  RiTimeLine,
  RiShieldCheckLine,
  RiCheckLine,
  RiUserFollowLine,
  RiRefreshLine,
  RiKey2Line,
  RiLogoutBoxRLine,
  RiGoogleFill,
  RiInformationLine,
  RiAlertLine
} from 'react-icons/ri'
import {
  getWorkspaceLoginHistory,
  getCachedWorkspaceUser,
  getCachedAccessToken,
  logOutGoogle,
  signInWithGoogle,
  ClientLoginHistoryEntry
} from '../../lib/firebase'

interface WorkspaceLoginHistoryViewProps {
  onReauthenticate?: () => void
  onSignOut?: () => void
}

export const WorkspaceLoginHistoryView: React.FC<WorkspaceLoginHistoryViewProps> = ({
  onReauthenticate,
  onSignOut
}) => {
  const [history, setHistory] = useState<ClientLoginHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(() => getCachedWorkspaceUser())
  const [currentToken, setCurrentToken] = useState(() => getCachedAccessToken())
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      // 1. Load local persistent history
      const local = getWorkspaceLoginHistory()
      const cachedU = getCachedWorkspaceUser()
      const token = getCachedAccessToken()
      setCurrentUser(cachedU)
      setCurrentToken(token)

      // 2. Fetch server persistent history
      const res = await fetch('/api/workspace/auth/history')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.history) && data.history.length > 0) {
          // Merge server and local history
          const map = new Map<string, ClientLoginHistoryEntry>()
          local.forEach((e) => map.set(e.id, e))
          data.history.forEach((e: ClientLoginHistoryEntry) => {
            if (map.has(e.id)) {
              map.set(e.id, { ...map.get(e.id)!, ...e })
            } else {
              map.set(e.id, e)
            }
          })
          const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp)
          setHistory(merged)
          return
        }
      }

      setHistory(local)
    } catch (_e) {
      setHistory(getWorkspaceLoginHistory())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleExplicitSignOut = async () => {
    try {
      await logOutGoogle()
      setCurrentUser(null)
      setCurrentToken(null)
      await loadHistory()
      setFeedbackMessage('Logged out. Login history record updated to Logged Out.')
      setTimeout(() => setFeedbackMessage(null), 3500)
      if (onSignOut) onSignOut()
    } catch (e: any) {
      console.error('Sign out error:', e)
    }
  }

  const handleExplicitSignIn = async () => {
    try {
      setIsLoading(true)
      const res = await signInWithGoogle()
      setCurrentUser({
        uid: res.user.uid,
        email: res.user.email || 'kumarimamta87565@gmail.com',
        displayName: res.user.displayName || 'Mamta Kumari'
      })
      setCurrentToken(res.accessToken)
      await loadHistory()
      setFeedbackMessage(`Signed in as ${res.user.email}. Login history recorded.`)
      setTimeout(() => setFeedbackMessage(null), 3500)
      if (onReauthenticate) onReauthenticate()
    } catch (e: any) {
      console.error('Sign in error:', e)
      setFeedbackMessage(e.message || 'Sign in failed')
      setTimeout(() => setFeedbackMessage(null), 3500)
    } finally {
      setIsLoading(false)
    }
  }

  const activeEntry = history.find((h) => h.status === 'active') || (currentToken ? history[0] : null)

  return (
    <div className="flex flex-col h-full w-full max-w-full min-h-0 overflow-y-auto space-y-4 p-4 text-zinc-100 font-mono custom-scrollbar">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-900/80 border border-white/10 rounded-xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md">
            <RiTimeLine size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm tracking-wider uppercase text-zinc-100">
                Workspace Login History & Session Persistence
              </h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                currentToken || activeEntry
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border-white/10'
              }`}>
                {currentToken || activeEntry ? 'Active & Persistent' : 'No Active Session'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Audit log of Google Workspace authentication events. Session persists across reloads and IRIS updates until user explicitly logs out.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {feedbackMessage && (
            <span className="text-[11px] text-cyan-300 px-2 py-1 bg-zinc-950 border border-cyan-500/30 rounded-lg">
              {feedbackMessage}
            </span>
          )}
          <button
            onClick={loadHistory}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RiRefreshLine size={13} className={isLoading ? 'animate-spin text-blue-400' : ''} />
            <span>Refresh History</span>
          </button>
        </div>
      </div>

      {/* Persistence Guarantee Notice */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-950/30 border border-blue-500/30 rounded-xl text-blue-200 text-xs">
        <RiInformationLine size={18} className="shrink-0 text-blue-400 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-blue-300 uppercase tracking-wider text-[11px]">
            Session & Login History Persistence Policy
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Your Google Workspace login credentials, tokens, and login history are stored in multi-tier persistent storage (browser local storage + backend JSON persistence). Refreshing the IRIS AI app, creating new notes, launching prompts, or running commands <strong>will NOT remove your login or history</strong>. History is only marked logged out when you explicitly click <strong>Sign Out</strong>.
          </p>
        </div>
      </div>

      {/* Active Session Card */}
      <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RiShieldCheckLine size={16} className="text-emerald-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-zinc-200">
              Current Active Login Session
            </span>
          </div>
          {currentToken || currentUser ? (
            <button
              onClick={handleExplicitSignOut}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              <RiLogoutBoxRLine size={13} />
              <span>Explicit Sign Out</span>
            </button>
          ) : (
            <button
              onClick={handleExplicitSignIn}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              <RiGoogleFill size={13} />
              <span>Connect Google Account</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-lg space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Account Email</div>
            <div className="font-bold text-xs text-zinc-200 truncate">
              {currentUser?.email || activeEntry?.email || 'kumarimamta87565@gmail.com'}
            </div>
          </div>

          <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-lg space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Operator Name</div>
            <div className="font-bold text-xs text-zinc-200 truncate">
              {currentUser?.displayName || activeEntry?.displayName || 'Mamta Kumari'}
            </div>
          </div>

          <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-lg space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Auth Provider</div>
            <div className="font-bold text-xs text-blue-400 truncate">
              {activeEntry?.provider || 'Google Workspace OAuth 2.0'}
            </div>
          </div>

          <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-lg space-y-1">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Session Status</div>
            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{currentToken || activeEntry ? 'Active & Preserved' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* History Log Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Login History Records ({history.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            Sorted by most recent activity
          </span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center bg-zinc-900/40 border border-white/10 rounded-xl space-y-2">
            <RiTimeLine size={28} className="mx-auto text-zinc-500 opacity-60" />
            <div className="text-xs text-zinc-400">No login records found yet.</div>
            <p className="text-[11px] text-zinc-600">
              When you authenticate with Google Workspace, your session is permanently recorded here.
            </p>
          </div>
        ) : (
          <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-900/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-zinc-950/80 border-b border-white/10 text-[10px] text-zinc-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Session ID</th>
                    <th className="py-2.5 px-3">User & Email</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Login Timestamp</th>
                    <th className="py-2.5 px-3">Last Active</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((entry) => {
                    const isActive = entry.status === 'active'
                    return (
                      <motion.tr
                        key={entry.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400 truncate max-w-[120px]">
                          {entry.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-zinc-200">{entry.displayName || 'Mamta Kumari'}</div>
                          <div className="text-[10px] text-zinc-500">{entry.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 text-[11px]">
                          {entry.provider}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                          {entry.lastActiveAt ? new Date(entry.lastActiveAt).toLocaleTimeString() : 'Recent'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                              isActive
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-zinc-800 text-zinc-400 border-white/10'
                            }`}
                          >
                            {isActive ? (
                              <>
                                <RiCheckLine size={11} />
                                <span>Active</span>
                              </>
                            ) : (
                              <span>Logged Out</span>
                            )}
                          </span>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspaceLoginHistoryView
