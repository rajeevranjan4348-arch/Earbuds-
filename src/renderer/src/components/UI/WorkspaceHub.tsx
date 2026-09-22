import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiGoogleFill,
  RiDriveLine,
  RiFileExcelLine,
  RiMailLine,
  RiCalendarLine,
  RiFileTextLine,
  RiPresentationLine,
  RiTaskLine,
  RiChat3Line,
  RiSurveyLine,
  RiVideoChatLine,
  RiContactsLine,
  RiFolderDownloadLine,
  RiGraduationCapLine,
  RiRefreshLine,
  RiCheckLine,
  RiAlertLine,
  RiCloseCircleLine,
  RiDeleteBinLine,
  RiTimeLine,
  RiKey2Line,
  RiShieldCheckLine,
  RiSearchLine,
  RiExternalLinkLine,
  RiInformationLine,
  RiFileCopyLine,
  RiTerminalBoxLine
} from 'react-icons/ri'
import { signInWithGoogle, logOutGoogle, getCachedAccessToken, setCachedAccessToken } from '../../lib/firebase'
import AuthFailureView from './AuthFailureView'

export interface AuthFailureLog {
  service: string
  endpoint?: string
  timestamp: number
  error: string
  statusCode?: number
}

export interface WorkspaceSessionData {
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

export interface ServiceHealth {
  status: 'healthy' | 'unauthorized' | 'forbidden' | 'error' | 'ready' | 'pending'
  message?: string
  latencyMs?: number
}

interface WorkspaceHubProps {
  onClose?: () => void
  onSelectServiceTab?: (tabId: string) => void
  glassPanel?: string
}

const WORKSPACE_SERVICES = [
  {
    id: 'drive',
    name: 'Google Drive',
    tabId: 'DRIVE',
    category: 'Storage & Files',
    icon: <RiDriveLine size={20} className="text-amber-400" />,
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    scope: 'https://www.googleapis.com/auth/drive',
    description: 'File storage, document indexing, folder management, and cloud backups'
  },
  {
    id: 'docs',
    name: 'Google Docs',
    tabId: 'DOCS',
    category: 'Productivity',
    icon: <RiFileTextLine size={20} className="text-blue-400" />,
    color: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    scope: 'https://www.googleapis.com/auth/documents',
    description: 'Collaborative documents, real-time rich text, and AI script generation'
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    tabId: 'SHEETS',
    category: 'Data & Analytics',
    icon: <RiFileExcelLine size={20} className="text-emerald-400" />,
    color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    description: 'Spreadsheet creation, tabular analytics, cell formulas, and dataset sync'
  },
  {
    id: 'slides',
    name: 'Google Slides',
    tabId: 'SLIDES',
    category: 'Productivity',
    icon: <RiPresentationLine size={20} className="text-yellow-400" />,
    color: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    scope: 'https://www.googleapis.com/auth/presentations',
    description: 'Presentations, deck slide generators, and visual pitch decks'
  },
  {
    id: 'gmail',
    name: 'Gmail',
    tabId: 'GMAIL',
    category: 'Communication',
    icon: <RiMailLine size={20} className="text-rose-400" />,
    color: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    scope: 'https://mail.google.com/',
    description: 'Email reading, AI drafting, thread management, and inbox notifications'
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    tabId: 'CALENDAR',
    category: 'Scheduling',
    icon: <RiCalendarLine size={20} className="text-cyan-400" />,
    color: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    scope: 'https://www.googleapis.com/auth/calendar',
    description: 'Event scheduling, agenda sync, reminders, and calendar invitations'
  },
  {
    id: 'tasks',
    name: 'Google Tasks',
    tabId: 'TASKS',
    category: 'Task Management',
    icon: <RiTaskLine size={20} className="text-indigo-400" />,
    color: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
    scope: 'https://www.googleapis.com/auth/tasks',
    description: 'Actionable to-dos, subtask completion, and deadline tracking'
  },
  {
    id: 'meet',
    name: 'Google Meet',
    tabId: 'MEET',
    category: 'Communication',
    icon: <RiVideoChatLine size={20} className="text-teal-400" />,
    color: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
    scope: 'https://www.googleapis.com/auth/meetings.space.created',
    description: 'Instant meeting spaces, video conference links, and conference rooms'
  },
  {
    id: 'chat',
    name: 'Google Chat',
    tabId: 'CHAT',
    category: 'Communication',
    icon: <RiChat3Line size={20} className="text-emerald-400" />,
    color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    scope: 'https://www.googleapis.com/auth/chat.spaces',
    description: 'Direct messaging, space rooms, thread replies, and workspace channels'
  },
  {
    id: 'contacts',
    name: 'Google Contacts',
    tabId: 'CONTACTS',
    category: 'People',
    icon: <RiContactsLine size={20} className="text-purple-400" />,
    color: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    scope: 'https://www.googleapis.com/auth/contacts',
    description: 'Address book, contact cards, email lookup, and phone numbers'
  },
  {
    id: 'forms',
    name: 'Google Forms',
    tabId: 'FORMS',
    category: 'Data & Analytics',
    icon: <RiSurveyLine size={20} className="text-violet-400" />,
    color: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    scope: 'https://www.googleapis.com/auth/forms.body',
    description: 'Surveys, automated questionnaires, feedback collection, and responses'
  },
  {
    id: 'classroom',
    name: 'Google Classroom',
    tabId: 'CLASSROOM',
    category: 'Education',
    icon: <RiGraduationCapLine size={20} className="text-green-400" />,
    color: 'border-green-500/30 bg-green-500/10 text-green-300',
    scope: 'https://www.googleapis.com/auth/classroom.courses.readonly',
    description: 'Course listings, educational assignments, course rosters, and announcements'
  },
  {
    id: 'picker',
    name: 'Google Picker',
    tabId: 'PICKER',
    category: 'Utilities',
    icon: <RiFolderDownloadLine size={20} className="text-orange-400" />,
    color: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    scope: 'Client-side OAuth Picker',
    description: 'Interactive Google Drive file chooser and asset picker modal'
  }
]

export const WorkspaceHub: React.FC<WorkspaceHubProps> = ({
  onClose,
  onSelectServiceTab,
  glassPanel = 'bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl'
}) => {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'SCOPES' | 'TROUBLESHOOT'>('SERVICES')
  const [session, setSession] = useState<WorkspaceSessionData | null>(null)
  const [authLogs, setAuthLogs] = useState<AuthFailureLog[]>([])
  const [serviceHealth, setServiceHealth] = useState<Record<string, ServiceHealth>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTestingServices, setIsTestingServices] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [logFilter, setLogFilter] = useState<string>('ALL')
  const [timeRemainingDisplay, setTimeRemainingDisplay] = useState<string>('')
  const [expirationProgress, setExpirationProgress] = useState<number>(100)

  // Fetch session information
  const loadSession = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.session) {
          setSession(data.session)
        }
      }
    } catch (_err) {}
  }, [])

  // Fetch auth failure logs
  const loadAuthLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/auth/logs')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.logs)) {
          setAuthLogs(data.logs)
        }
      }
    } catch (_err) {}
  }, [])

  useEffect(() => {
    loadSession()
    loadAuthLogs()
    const timer = setInterval(() => {
      loadSession()
      loadAuthLogs()
    }, 15000)
    return () => clearInterval(timer)
  }, [loadSession, loadAuthLogs])

  // Live Token Expiration Countdown calculation
  useEffect(() => {
    if (!session?.expiresAt) {
      setTimeRemainingDisplay('Offline / Disconnected')
      setExpirationProgress(0)
      return
    }

    const updateTimer = () => {
      const now = Date.now()
      const remainingMs = session.expiresAt - now
      if (remainingMs <= 0) {
        setTimeRemainingDisplay('Token Expired')
        setExpirationProgress(0)
      } else {
        const totalDurationMs = 3600 * 1000 // default 1 hour standard OAuth
        const pct = Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100))
        setExpirationProgress(pct)

        const hours = Math.floor(remainingMs / 3600000)
        const mins = Math.floor((remainingMs % 3600000) / 60000)
        const secs = Math.floor((remainingMs % 60000) / 1000)

        if (hours > 0) {
          setTimeRemainingDisplay(`${hours}h ${mins}m ${secs < 10 ? '0' : ''}${secs}s`)
        } else {
          setTimeRemainingDisplay(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`)
        }
      }
    }

    updateTimer()
    const intv = setInterval(updateTimer, 1000)
    return () => clearInterval(intv)
  }, [session?.expiresAt])

  // Manual token refresh
  const handleRefreshToken = async () => {
    setIsRefreshing(true)
    setActionMessage('Requesting fresh token from Google OAuth...')
    try {
      const res = await fetch('/api/workspace/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success && data.accessToken) {
        setCachedAccessToken(data.accessToken)
        setActionMessage('OAuth access token refreshed successfully!')
        await loadSession()
        await loadAuthLogs()
      } else {
        setActionMessage(`Refresh failed: ${data.error || 'Re-authentication required'}`)
      }
    } catch (err: any) {
      setActionMessage(`Network error during refresh: ${err?.message}`)
    } finally {
      setIsRefreshing(false)
      setTimeout(() => setActionMessage(null), 4000)
    }
  }

  // Interactive Re-Authentication
  const handleReAuthenticate = async () => {
    setIsLoading(true)
    setActionMessage('Opening Google Authentication...')
    try {
      const result = await signInWithGoogle()
      setCachedAccessToken(result.accessToken)
      await fetch('/api/workspace/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          accessToken: result.accessToken
        })
      })
      setActionMessage(`Connected as ${result.user.email}`)
      await loadSession()
      await loadAuthLogs()
    } catch (err: any) {
      setActionMessage(`Authentication failed: ${err.message}`)
    } finally {
      setIsLoading(false)
      setTimeout(() => setActionMessage(null), 4000)
    }
  }

  // Clear Session
  const handleDisconnect = async () => {
    await logOutGoogle()
    try {
      await fetch('/api/workspace/auth/session', { method: 'DELETE' })
    } catch (_e) {}
    setActionMessage('Google Workspace account disconnected')
    await loadSession()
    setTimeout(() => setActionMessage(null), 3000)
  }

  // Run full service connection test
  const handleTestAllServices = async () => {
    setIsTestingServices(true)
    setActionMessage('Pinging all Google Workspace services for latency & health...')
    try {
      const res = await fetch('/api/workspace/auth/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success && data.services) {
        setServiceHealth(data.services)
        setActionMessage('Service connectivity diagnostics complete')
      } else {
        setActionMessage(`Diagnostics error: ${data.error || 'Could not verify endpoints'}`)
      }
      await loadAuthLogs()
      await loadSession()
    } catch (err: any) {
      setActionMessage(`Failed to run diagnostics: ${err?.message}`)
    } finally {
      setIsTestingServices(false)
      setTimeout(() => setActionMessage(null), 4000)
    }
  }

  // Clear Auth Failure Logs
  const handleClearAuthLogs = async () => {
    try {
      const res = await fetch('/api/workspace/auth/logs', { method: 'DELETE' })
      if (res.ok) {
        setAuthLogs([])
        setActionMessage('Authentication failure logs cleared')
        setTimeout(() => setActionMessage(null), 3000)
      }
    } catch (_e) {}
  }

  // Copy Diagnostics Report
  const handleCopyDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      user: {
        email: session?.email,
        displayName: session?.displayName,
        isConnected: session?.isConnected,
        isExpired: session?.isExpired,
        timeRemainingMinutes: session?.timeRemainingMinutes,
        scopes: session?.scopes
      },
      serviceHealth,
      recentFailures: authLogs
    }
    navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setActionMessage('Diagnostic snapshot copied to clipboard')
    setTimeout(() => setActionMessage(null), 3000)
  }

  // Copy Access Token
  const handleCopyToken = () => {
    const token = getCachedAccessToken()
    if (token) {
      navigator.clipboard.writeText(token)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  // Filter logs
  const filteredLogs = authLogs.filter((log) => {
    if (logFilter === 'ALL') return true
    if (logFilter === '401') return log.statusCode === 401
    if (logFilter === '403') return log.statusCode === 403
    return log.service.toLowerCase() === logFilter.toLowerCase()
  })

  const isConnected = session?.isConnected ?? false
  const isExpired = session?.isExpired ?? false

  return (
    <div className={`flex flex-col h-full w-full max-w-full overflow-hidden text-zinc-100 font-mono ${glassPanel}`}>
      {/* Top Hub Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-950/80 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <RiGoogleFill size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm tracking-wider uppercase text-zinc-100">
                Workspace Hub & Diagnostics
              </h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                isConnected && !isExpired
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : isConnected && isExpired
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}>
                {isConnected ? (isExpired ? 'Token Expired' : 'Authenticated') : 'Disconnected'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Centralized Google 1P API Lifecycle, Real-Time Health & Auth Failures Management
            </p>
          </div>
        </div>

        {/* Action Controls & Close */}
        <div className="flex items-center gap-2">
          {actionMessage && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[11px] px-3 py-1 rounded-lg bg-zinc-900 border border-white/15 text-cyan-300 font-medium hidden md:block"
            >
              {actionMessage}
            </motion.div>
          )}

          <button
            onClick={handleTestAllServices}
            disabled={isTestingServices || !isConnected}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
            title="Test real-time connection across all 13 Google Workspace endpoints"
          >
            <RiRefreshLine size={13} className={isTestingServices ? 'animate-spin text-indigo-400' : ''} />
            <span className="hidden sm:inline">Test Services</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="Close Hub"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Profile & Live Token Status Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-zinc-950/40 border-b border-white/5 shrink-0">
        {/* User Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0">
            {session?.email ? session.email[0].toUpperCase() : 'G'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Primary Account</div>
            <div className="font-bold text-xs text-zinc-100 truncate">{session?.email || 'kumarimamta87565@gmail.com'}</div>
            <div className="text-[10px] text-zinc-500 truncate">{session?.displayName || 'Mamta Kumari'}</div>
          </div>
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] cursor-pointer"
              title="Disconnect session"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={handleReAuthenticate}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
            >
              Connect
            </button>
          )}
        </div>

        {/* Token Validity & Countdown */}
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/10 flex flex-col justify-between">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <RiTimeLine size={12} className="text-cyan-400" />
              Token Expiration Countdown
            </span>
            <span className={`font-bold ${isExpired ? 'text-amber-400' : 'text-emerald-400'}`}>
              {timeRemainingDisplay}
            </span>
          </div>

          <div className="w-full bg-zinc-800 rounded-full h-1.5 my-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                expirationProgress > 50
                  ? 'bg-emerald-500'
                  : expirationProgress > 20
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${expirationProgress}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-zinc-500">
            <span>Refresh: Automated</span>
            <button
              onClick={handleRefreshToken}
              disabled={isRefreshing}
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RiRefreshLine size={11} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Now'}</span>
            </button>
          </div>
        </div>

        {/* Diagnostics & Health Summary */}
        <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <RiShieldCheckLine size={12} className="text-emerald-400" />
              Session Health Status
            </div>
            <div className="text-xs font-bold text-zinc-200">
              {authLogs.length === 0 ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <RiCheckLine size={13} /> 100% Operational (0 Failures)
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <RiAlertLine size={13} /> {authLogs.length} Auth Failures Recorded
                </span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500">
              {session?.scopes ? `${session.scopes.length} Scopes Active` : '14 Scopes Authorized'}
            </div>
          </div>

          <button
            onClick={() => setActiveTab('TROUBLESHOOT')}
            className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              authLogs.length > 0
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 animate-pulse'
                : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-300'
            }`}
          >
            <RiTerminalBoxLine size={14} />
            <span>Troubleshoot ({authLogs.length})</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 px-4 pt-3 border-b border-white/10 shrink-0 bg-zinc-950/20">
        <button
          onClick={() => setActiveTab('SERVICES')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
            activeTab === 'SERVICES'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <RiGoogleFill size={15} />
          <span>Connected Services ({WORKSPACE_SERVICES.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SCOPES')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
            activeTab === 'SCOPES'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <RiKey2Line size={15} />
          <span>OAuth Scopes & Token</span>
        </button>

        <button
          onClick={() => setActiveTab('TROUBLESHOOT')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${
            activeTab === 'TROUBLESHOOT'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <RiTerminalBoxLine size={15} />
          <span>Auth Failures & Troubleshooter</span>
          {authLogs.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
              {authLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* TAB 1: CONNECTED SERVICES GRID */}
        {activeTab === 'SERVICES' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold uppercase text-zinc-300 tracking-wider">
                  Google Workspace 1P Gateway Services Matrix
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Select any service to navigate directly or check live endpoint status
                </p>
              </div>
              <button
                onClick={handleTestAllServices}
                disabled={isTestingServices || !isConnected}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RiRefreshLine size={13} className={isTestingServices ? 'animate-spin text-blue-400' : ''} />
                <span>Run Health Check</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {WORKSPACE_SERVICES.map((svc) => {
                const health = serviceHealth[svc.id]
                return (
                  <motion.div
                    key={svc.id}
                    whileHover={{ scale: 1.01 }}
                    className="p-3.5 rounded-xl bg-zinc-900/70 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-3 shadow-lg"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg border ${svc.color}`}>
                            {svc.icon}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-zinc-100">{svc.name}</div>
                            <div className="text-[9px] text-zinc-500 uppercase">{svc.category}</div>
                          </div>
                        </div>

                        {/* Status pill */}
                        {health ? (
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${
                              health.status === 'healthy'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : health.status === 'unauthorized'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : health.status === 'forbidden'
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-zinc-800 text-zinc-300 border-white/10'
                            }`}
                          >
                            {health.status === 'healthy' ? `${health.latencyMs}ms` : health.status}
                          </span>
                        ) : (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Ready
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-2.5 line-clamp-2 leading-relaxed">
                        {svc.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                      <span className="text-[9px] text-zinc-500 truncate max-w-[140px]" title={svc.scope}>
                        {svc.scope.split('/').pop()}
                      </span>
                      <button
                        onClick={() => onSelectServiceTab && onSelectServiceTab(svc.tabId)}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Open</span>
                        <RiExternalLinkLine size={10} />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 2: OAUTH SCOPES & TOKEN LIFECYCLE */}
        {activeTab === 'SCOPES' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold uppercase text-zinc-200 tracking-wider flex items-center gap-2">
                    <RiKey2Line className="text-blue-400" />
                    Authorized Google Workspace OAuth 2.0 Scopes
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    The session manager authorizes granular API scopes to allow IRIS to access tools securely on the user's behalf.
                  </p>
                </div>

                <button
                  onClick={handleReAuthenticate}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <RiShieldCheckLine size={14} />
                  <span>Update Scopes</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {(session?.scopes || WORKSPACE_SERVICES.map((s) => s.scope)).map((scope, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950/60 border border-white/5 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <RiShieldCheckLine size={14} className="text-emerald-400 shrink-0" />
                      <span className="text-zinc-300 font-mono truncate">{scope}</span>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      Granted
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw Token Inspection Card */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-bold uppercase text-zinc-200 tracking-wider">
                    Client-Side Bearer Token Inspector
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Active token injected into the `Authorization: Bearer` header for Google APIs
                  </p>
                </div>
                <button
                  onClick={handleCopyToken}
                  className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RiFileCopyLine size={13} />
                  <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
                </button>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950 border border-white/10 font-mono text-[11px] text-zinc-400 break-all select-all">
                {getCachedAccessToken()
                  ? `${getCachedAccessToken()?.slice(0, 32)}••••••••••••••••••••••••••••••••••••••••••••••••${getCachedAccessToken()?.slice(-16)}`
                  : 'No active client-side cached token'}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUTH FAILURES & TROUBLESHOOTING MANAGEMENT VIEW */}
        {activeTab === 'TROUBLESHOOT' && (
          <div className="h-full min-h-[480px]">
            <AuthFailureView
              isEmbedded
              onReauthenticate={handleReAuthenticate}
              onNavigateService={(svc) => onSelectServiceTab?.(svc)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default WorkspaceHub
