import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiGoogleFill,
  RiCalendarLine,
  RiDriveLine,
  RiRefreshLine,
  RiAddLine,
  RiExternalLinkLine,
  RiVideoChatLine,
  RiShieldCheckLine,
  RiPulseLine
} from 'react-icons/ri'
import { GoogleWorkspaceService, WorkspaceItem } from '../../services/workspace'
import { setCachedAccessToken } from '../../lib/firebase'

export interface WorkspaceTelemetryWidgetProps {
  className?: string
  compact?: boolean
  onNavigateTab?: (tab: string) => void
}

export const WorkspaceTelemetryWidget: React.FC<WorkspaceTelemetryWidgetProps> = ({
  className = '',
  compact = false,
  onNavigateTab
}) => {
  const [activeTab, setActiveTab] = useState<'CALENDAR' | 'FILES' | 'SCHEDULE'>('CALENDAR')
  const [sessionInfo, setSessionInfo] = useState<{
    isConnected: boolean
    email?: string
    expiresAt?: number
    timeRemainingMinutes?: number
    scopes?: string[]
  }>({ isConnected: false })

  const [calendarEvents, setCalendarEvents] = useState<WorkspaceItem[]>([])
  const [recentFiles, setRecentFiles] = useState<WorkspaceItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [statusMsg, setStatusMessage] = useState<string | null>(null)

  // Quick event scheduling state
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventTitleDate] = useState('')
  const [eventTime, setEventTitleTime] = useState('')
  const [addMeetLink, setAddMeetLink] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch Session & Workspace Telemetry
  const fetchTelemetry = useCallback(async () => {
    setIsLoading(true)
    try {
      // 1. Session check
      const sessionRes = await fetch('/api/workspace/auth/session')
      if (sessionRes.ok) {
        const sData = await sessionRes.json()
        if (sData.success && sData.session) {
          setSessionInfo({
            isConnected: sData.session.isConnected,
            email: sData.session.email,
            expiresAt: sData.session.expiresAt,
            timeRemainingMinutes: sData.session.timeRemainingMinutes,
            scopes: sData.session.scopes || []
          })
        }
      }

      // 2. Calendar & Files Activity
      const service = new GoogleWorkspaceService()
      
      const [calRes, filesRes] = await Promise.allSettled([
        service.fetchServiceItems('calendar'),
        service.fetchServiceItems('drive')
      ])

      if (calRes.status === 'fulfilled' && calRes.value.items) {
        setCalendarEvents(calRes.value.items.slice(0, 5))
      }
      if (filesRes.status === 'fulfilled' && filesRes.value.items) {
        setRecentFiles(filesRes.value.items.slice(0, 5))
      }
    } catch (err: any) {
      console.warn('[WorkspaceTelemetryWidget] Telemetry fetch warning:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const timer = setInterval(fetchTelemetry, 30000)
    return () => clearInterval(timer)
  }, [fetchTelemetry])

  // Handle Token Refresh
  const handleRefreshToken = async () => {
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
        setStatusMessage('Token refreshed successfully!')
        await fetchTelemetry()
      } else {
        setStatusMessage('Refresh failed: Re-authentication needed.')
      }
    } catch (_e) {
      setStatusMessage('Network error on token refresh.')
    } finally {
      setIsRefreshing(false)
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  // Handle Quick Schedule Event
  const handleQuickSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventTitle.trim()) return

    setIsSubmitting(true)
    setStatusMessage('Scheduling event with Google Workspace...')

    try {
      const startDateTime = eventDate && eventTime
        ? new Date(`${eventDate}T${eventTime}:00`).toISOString()
        : new Date(Date.now() + 3600000).toISOString()

      const endDateTime = new Date(new Date(startDateTime).getTime() + 1800000).toISOString()

      const service = new GoogleWorkspaceService()
      const result = await service.createCalendarEvent({
        summary: eventTitle,
        description: `Scheduled via IRIS AI Workspace Dashboard.`,
        startISO: startDateTime,
        endISO: endDateTime,
        createMeetLink: addMeetLink
      })

      if (result.success) {
        setStatusMessage('Event scheduled successfully on Google Calendar!')
        setEventTitle('')
        await fetchTelemetry()
      } else {
        setStatusMessage(`Schedule error: ${result.error || 'Check permissions'}`)
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message || 'Scheduling failed'}`)
    } finally {
      setIsSubmitting(false)
      setTimeout(() => setStatusMessage(null), 3500)
    }
  }

  const isConnected = sessionInfo.isConnected
  const remainingMins = sessionInfo.timeRemainingMinutes || 0

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-zinc-950/90 border border-white/10 p-4 shadow-[0_15px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl font-mono text-zinc-200 ${className}`}
    >
      {/* Background Accent Glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header with Connection Telemetry Status */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
            <RiGoogleFill size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-white uppercase tracking-wider">
                Google Workspace Telemetry
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {isConnected ? 'Active' : 'Offline'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-sans truncate">
              {sessionInfo.email || 'OAuth 2.0 Multi-Scope Connected'}
            </p>
          </div>
        </div>

        {/* Token Action Refresh */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefreshToken}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-300 border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh OAuth 2.0 Access Token"
          >
            <RiRefreshLine size={13} className={isRefreshing ? 'animate-spin text-blue-400' : ''} />
          </button>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('WORKSPACE')}
              className="px-2 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>Hub</span>
              <RiExternalLinkLine size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/5 mb-3 text-[11px] font-bold">
        <button
          onClick={() => setActiveTab('CALENDAR')}
          className={`flex-1 py-1 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'CALENDAR'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <RiCalendarLine size={12} />
          <span>Agenda ({calendarEvents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('FILES')}
          className={`flex-1 py-1 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'FILES'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <RiDriveLine size={12} />
          <span>Recent Files ({recentFiles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SCHEDULE')}
          className={`flex-1 py-1 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'SCHEDULE'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <RiAddLine size={12} />
          <span>Quick Schedule</span>
        </button>
      </div>

      {/* Status Banner Message */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 p-2 rounded-xl bg-blue-950/60 border border-blue-500/30 text-[10px] text-blue-200 flex items-center gap-2"
          >
            <RiPulseLine size={12} className="animate-spin text-blue-400 shrink-0" />
            <span className="truncate">{statusMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Tab Views */}
      <div className="min-h-[140px] max-h-[220px] overflow-y-auto custom-scrollbar">
        {activeTab === 'CALENDAR' && (
          <div className="space-y-1.5">
            {calendarEvents.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs italic">
                {isLoading ? 'Fetching Google Calendar agenda...' : 'No upcoming calendar appointments.'}
              </div>
            ) : (
              calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-2.5 rounded-xl bg-zinc-900/70 border border-white/5 hover:border-blue-500/30 transition-all flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
                      <RiCalendarLine size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-100 truncate">{evt.title}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{evt.subtitle || evt.snippet || 'Scheduled Event'}</div>
                    </div>
                  </div>

                  {evt.extra?.meetUrl || evt.link ? (
                    <a
                      href={evt.extra?.meetUrl || evt.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <RiVideoChatLine size={11} />
                      <span>Join Meet</span>
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'FILES' && (
          <div className="space-y-1.5">
            {recentFiles.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs italic">
                {isLoading ? 'Scanning Google Drive files...' : 'No recent files found.'}
              </div>
            ) : (
              recentFiles.map((file) => (
                <div
                  key={file.id}
                  className="p-2.5 rounded-xl bg-zinc-900/70 border border-white/5 hover:border-blue-500/30 transition-all flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                      <RiDriveLine size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-100 truncate">{file.title}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{file.subtitle || file.snippet || 'Google Drive File'}</div>
                    </div>
                  </div>

                  {file.link && (
                    <a
                      href={file.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-blue-300 border border-white/10 shrink-0 transition-colors"
                      title="Open file in browser"
                    >
                      <RiExternalLinkLine size={12} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <form onSubmit={handleQuickSchedule} className="space-y-2 text-xs font-mono">
            <div>
              <label className="block text-[10px] text-zinc-400 mb-1">Event Title</label>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="e.g. IRIS System Sync & Review"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventTitleDate(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Time</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTitleTime(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-[10px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addMeetLink}
                  onChange={(e) => setAddMeetLink(e.target.checked)}
                  className="accent-blue-500 rounded cursor-pointer"
                />
                <span>Attach Google Meet Link</span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting || !eventTitle.trim()}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1"
              >
                <RiAddLine size={13} />
                <span>{isSubmitting ? 'Scheduling...' : 'Schedule Event'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Footer Connectivity Telemetry */}
      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-400">
        <div className="flex items-center gap-1.5">
          <RiShieldCheckLine className="text-emerald-400" />
          <span>OAuth 2.0 Bearer Authenticated</span>
        </div>
        {remainingMins > 0 && (
          <span className="text-blue-300 font-bold">{remainingMins}m valid</span>
        )}
      </div>
    </div>
  )
}

export default WorkspaceTelemetryWidget
