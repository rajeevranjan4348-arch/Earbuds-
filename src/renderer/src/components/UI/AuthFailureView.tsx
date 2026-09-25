import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw,
  Trash2,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle,
  Copy,
  Check,
  ShieldAlert,
  Terminal,
  Download,
  KeyRound,
  Activity,
  Layers
} from 'lucide-react'
import {
  RiGoogleFill,
  RiDriveLine,
  RiMailLine,
  RiCalendarLine,
  RiFileExcelLine,
  RiFileTextLine,
  RiCheckboxLine,
  RiVideoChatLine,
  RiChat3Line,
  RiContactsBookLine,
  RiFilePptLine,
  RiSurveyLine,
  RiBookOpenLine
} from 'react-icons/ri'
import { GoogleWorkspaceService, AuthFailureLog } from '../../services/workspace'
import { triggerWorkspaceOAuthPopup } from '../../lib/firebase'

interface AuthFailureViewProps {
  onReauthenticate?: () => void
  isEmbedded?: boolean
}

type SortField = 'timestamp' | 'statusCode' | 'service' | 'error'
type SortOrder = 'asc' | 'desc'

export default function AuthFailureView({
  onReauthenticate,
  isEmbedded = false
}: AuthFailureViewProps) {
  const [logs, setLogs] = useState<AuthFailureLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedService, setSelectedService] = useState<string>('ALL')
  const [selectedStatusCode, setSelectedStatusCode] = useState<string>('ALL')
  const [sortField, setSortField] = useState<SortField>('timestamp')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards')

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const data = await GoogleWorkspaceService.getAuthFailures()
      setLogs(data)
    } catch (err) {
      console.warn('[AuthFailureView] Error fetching logs:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  // Live background polling
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      GoogleWorkspaceService.getAuthFailures().then((data) => {
        setLogs(data)
      })
    }, 6000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all recorded authentication failure logs?')) return
    setIsLoading(true)
    const success = await GoogleWorkspaceService.clearAuthFailures()
    if (success) {
      setLogs([])
      setActionNotice('Authentication failure logs cleared.')
      setTimeout(() => setActionNotice(null), 3000)
    }
    setIsLoading(false)
  }

  const handleCopyLog = (log: AuthFailureLog, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleExportJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute(
      'download',
      `iris-workspace-auth-failures-${new Date().toISOString().slice(0, 10)}.json`
    )
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleAuthTrigger = async () => {
    if (onReauthenticate) {
      onReauthenticate()
    } else {
      setIsLoading(true)
      try {
        const token = await triggerWorkspaceOAuthPopup()
        if (token) {
          setActionNotice('OAuth authentication successful. Refreshing logs...')
          setTimeout(() => {
            fetchLogs()
            setActionNotice(null)
          }, 1500)
        }
      } catch (err: any) {
        setActionNotice(`Auth error: ${err?.message || 'Authentication cancelled'}`)
        setTimeout(() => setActionNotice(null), 4000)
      } finally {
        setIsLoading(false)
      }
    }
  }

  // Map service icon
  const getServiceIcon = (service: string) => {
    const s = service.toLowerCase()
    if (s.includes('drive')) return <RiDriveLine className="text-blue-400" size={16} />
    if (s.includes('gmail') || s.includes('mail'))
      return <RiMailLine className="text-red-400" size={16} />
    if (s.includes('calendar')) return <RiCalendarLine className="text-amber-400" size={16} />
    if (s.includes('sheet')) return <RiFileExcelLine className="text-emerald-400" size={16} />
    if (s.includes('doc')) return <RiFileTextLine className="text-blue-300" size={16} />
    if (s.includes('slide')) return <RiFilePptLine className="text-amber-500" size={16} />
    if (s.includes('task')) return <RiCheckboxLine className="text-indigo-400" size={16} />
    if (s.includes('meet')) return <RiVideoChatLine className="text-teal-400" size={16} />
    if (s.includes('chat')) return <RiChat3Line className="text-emerald-400" size={16} />
    if (s.includes('contact')) return <RiContactsBookLine className="text-cyan-400" size={16} />
    if (s.includes('form')) return <RiSurveyLine className="text-purple-400" size={16} />
    if (s.includes('classroom')) return <RiBookOpenLine className="text-emerald-500" size={16} />
    return <RiGoogleFill className="text-zinc-400" size={16} />
  }

  // Diagnostic Remediation Generator
  const getDiagnosticAdvice = (log: AuthFailureLog) => {
    const err = (log.error || '').toLowerCase()
    const code = log.statusCode

    if (
      code === 401 ||
      err.includes('unauthorized') ||
      err.includes('invalid_grant') ||
      err.includes('expired')
    ) {
      return {
        severity: 'HIGH',
        category: 'Token Expiration / Invalid Grant',
        recommendation:
          'The Google OAuth 2.0 access token has expired or was revoked. Re-authenticating your Google account will mint a fresh Bearer token.',
        actionLabel: 'Re-authenticate Workspace',
        actionType: 'auth'
      }
    }
    if (
      code === 403 ||
      err.includes('forbidden') ||
      err.includes('insufficientpermissions') ||
      err.includes('scope')
    ) {
      return {
        severity: 'HIGH',
        category: 'Missing OAuth Permission / Scope',
        recommendation: `The account lacks permissions for this service (${log.service}). Ensure all 13 Google Workspace OAuth scopes are accepted in the OAuth consent screen.`,
        actionLabel: 'Grant Missing Scopes',
        actionType: 'auth'
      }
    }
    if (code === 404 || err.includes('not found')) {
      return {
        severity: 'MEDIUM',
        category: 'Resource Not Found',
        recommendation:
          'The requested file, message, calendar event, or document was not found or was deleted in your Google account.',
        actionLabel: 'Verify Resource ID',
        actionType: 'info'
      }
    }
    if (code === 429 || err.includes('quota') || err.includes('rate limit')) {
      return {
        severity: 'MEDIUM',
        category: 'Rate Limited / Quota Exceeded',
        recommendation:
          'Google API rate limit reached. The system will automatically back off and retry in 60 seconds.',
        actionLabel: 'Wait for Backoff',
        actionType: 'wait'
      }
    }
    return {
      severity: 'LOW',
      category: 'Network / Gateway Anomaly',
      recommendation:
        'A transient network disruption occurred while communicating with Google API servers. Retrying the request should resolve it.',
      actionLabel: 'Retry Operation',
      actionType: 'retry'
    }
  }

  // Unique services in logs
  const availableServices = useMemo(() => {
    const set = new Set<string>()
    logs.forEach((l) => {
      if (l.service) set.add(l.service.toUpperCase())
    })
    return Array.from(set)
  }, [logs])

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Service filter
        if (selectedService !== 'ALL' && log.service.toUpperCase() !== selectedService) {
          return false
        }
        // Status code filter
        if (selectedStatusCode !== 'ALL') {
          if (selectedStatusCode === '401' && log.statusCode !== 401) return false
          if (selectedStatusCode === '403' && log.statusCode !== 403) return false
          if (selectedStatusCode === '404' && log.statusCode !== 404) return false
          if (selectedStatusCode === '500' && (log.statusCode || 0) < 500) return false
          if (selectedStatusCode === 'OTHER' && [401, 403, 404, 500].includes(log.statusCode || 0))
            return false
        }
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matches =
            log.service.toLowerCase().includes(q) ||
            log.error.toLowerCase().includes(q) ||
            (log.endpoint && log.endpoint.toLowerCase().includes(q)) ||
            (log.statusCode && log.statusCode.toString().includes(q))
          if (!matches) return false
        }
        return true
      })
      .sort((a, b) => {
        let diff = 0
        if (sortField === 'timestamp') {
          diff = a.timestamp - b.timestamp
        } else if (sortField === 'statusCode') {
          diff = (a.statusCode || 0) - (b.statusCode || 0)
        } else if (sortField === 'service') {
          diff = a.service.localeCompare(b.service)
        } else if (sortField === 'error') {
          diff = a.error.localeCompare(b.error)
        }
        return sortOrder === 'asc' ? diff : -diff
      })
  }, [logs, selectedService, selectedStatusCode, searchQuery, sortField, sortOrder])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  return (
    <div
      className={`flex flex-col h-full w-full bg-zinc-950/90 border border-white/10 rounded-2xl overflow-hidden shadow-2xl text-zinc-100 ${isEmbedded ? '' : 'p-4 sm:p-6'}`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-wider text-zinc-100 uppercase">
                Auth Diagnostics & Failure Log
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-white/10">
                Last {logs.length} / 50 Max
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Real-time audit log of HTTP 401/403 anomalies from Centralized Session Manager.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Auto-refresh failure logs every 6 seconds"
          >
            <Activity size={12} className={autoRefresh ? 'animate-pulse' : ''} />
            <span>{autoRefresh ? 'Live' : 'Paused'}</span>
          </button>

          <button
            onClick={fetchLogs}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 rounded-xl text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
            title="Fetch latest failure logs"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleExportJSON}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 rounded-xl text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-40"
            title="Export full diagnostics as JSON"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={handleAuthTrigger}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
            title="Re-authenticate Google Workspace account"
          >
            <KeyRound size={13} />
            <span>Re-authenticate</span>
          </button>

          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              title="Clear all recorded failure logs"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      <AnimatePresence>
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-2.5 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 shrink-0 font-mono"
          >
            <CheckCircle size={14} className="shrink-0" />
            <span>{actionNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2 py-3 border-b border-white/5 shrink-0">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search error message, endpoint, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-900/90 border border-white/10 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Service Filter */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Filter size={13} className="text-zinc-400 shrink-0 hidden sm:inline" />
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="flex-1 sm:flex-none px-2.5 py-1.5 bg-zinc-900 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            <option value="ALL">All Services ({logs.length})</option>
            {availableServices.map((svc) => (
              <option key={svc} value={svc}>
                {svc}
              </option>
            ))}
          </select>

          {/* Status Code Filter */}
          <select
            value={selectedStatusCode}
            onChange={(e) => setSelectedStatusCode(e.target.value)}
            className="flex-1 sm:flex-none px-2.5 py-1.5 bg-zinc-900 border border-white/10 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            <option value="ALL">All Status Codes</option>
            <option value="401">401 Unauthorized</option>
            <option value="403">403 Forbidden</option>
            <option value="404">404 Not Found</option>
            <option value="500">500+ Server Error</option>
            <option value="OTHER">Network / Other</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Card view with diagnostic remediation"
            >
              <Layers size={13} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Dense sortable table view"
            >
              <Terminal size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-3 pr-1 space-y-2.5">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <CheckCircle size={28} />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                {logs.length === 0 ? 'All Systems Operational' : 'No Matching Log Entries'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {logs.length === 0
                  ? 'No Google Workspace authentication failures or permission errors have been detected. All 13 connected endpoints are responding normally.'
                  : 'Try adjusting your search query or filters to inspect specific service records.'}
              </p>
            </div>
            {logs.length === 0 && (
              <button
                onClick={fetchLogs}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl text-xs font-mono text-emerald-400 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Run Diagnostic Polling</span>
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* Dense Sortable Table */
          <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-900/50">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-900 border-b border-white/10 text-zinc-400 font-mono text-[11px]">
                  <th
                    onClick={() => toggleSort('timestamp')}
                    className="py-2.5 px-3 cursor-pointer hover:text-zinc-200 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Time</span>
                      <ArrowUpDown
                        size={11}
                        className={sortField === 'timestamp' ? 'text-emerald-400' : ''}
                      />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('service')}
                    className="py-2.5 px-3 cursor-pointer hover:text-zinc-200 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Service</span>
                      <ArrowUpDown
                        size={11}
                        className={sortField === 'service' ? 'text-emerald-400' : ''}
                      />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('statusCode')}
                    className="py-2.5 px-3 cursor-pointer hover:text-zinc-200 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>HTTP</span>
                      <ArrowUpDown
                        size={11}
                        className={sortField === 'statusCode' ? 'text-emerald-400' : ''}
                      />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort('error')}
                    className="py-2.5 px-3 cursor-pointer hover:text-zinc-200 select-none"
                  >
                    <div className="flex items-center gap-1">
                      <span>Error Diagnostic</span>
                      <ArrowUpDown
                        size={11}
                        className={sortField === 'error' ? 'text-emerald-400' : ''}
                      />
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {filteredLogs.map((log, idx) => {
                  const logId = `tbl_log_${log.timestamp}_${idx}`
                  const isExpanded = expandedLogId === logId
                  const advice = getDiagnosticAdvice(log)

                  return (
                    <React.Fragment key={logId}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : logId)}
                        className={`hover:bg-white/5 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-white/5' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-zinc-200 font-sans font-medium">
                            {getServiceIcon(log.service)}
                            <span>{log.service.toUpperCase()}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.statusCode === 401
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : log.statusCode === 403
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : 'bg-zinc-800 text-zinc-300 border border-white/10'
                            }`}
                          >
                            {log.statusCode || 'ERR'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 max-w-md truncate text-zinc-300">{log.error}</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCopyLog(log, logId)
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                            title="Copy log JSON"
                          >
                            {copiedId === logId ? (
                              <Check size={13} className="text-emerald-400" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-950/80">
                          <td
                            colSpan={5}
                            className="p-4 border-b border-white/10 font-sans text-xs"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-red-400 font-bold uppercase text-[10px] tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                                      {advice.category}
                                    </span>
                                    <span className="text-zinc-400 text-[11px] font-mono">
                                      {new Date(log.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-zinc-300 text-xs font-mono bg-zinc-900 p-2 rounded-lg border border-white/5 break-all">
                                    {log.error}
                                  </p>
                                </div>
                                <button
                                  onClick={handleAuthTrigger}
                                  className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase transition-all"
                                >
                                  {advice.actionLabel}
                                </button>
                              </div>

                              {log.endpoint && (
                                <div className="text-[11px] text-zinc-400 font-mono">
                                  <span className="text-zinc-500">Target Endpoint: </span>
                                  <code className="text-zinc-300">{log.endpoint}</code>
                                </div>
                              )}

                              <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
                                <CheckCircle size={14} className="shrink-0 mt-0.5" />
                                <div className="leading-relaxed">
                                  <strong>Remediation: </strong>
                                  {advice.recommendation}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Rich Card Format */
          filteredLogs.map((log, idx) => {
            const logId = `card_log_${log.timestamp}_${idx}`
            const isExpanded = expandedLogId === logId
            const advice = getDiagnosticAdvice(log)

            return (
              <motion.div
                key={logId}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                  log.statusCode === 401
                    ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50'
                    : log.statusCode === 403
                      ? 'bg-red-950/20 border-red-500/30 hover:border-red-500/50'
                      : 'bg-zinc-900/60 border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      {getServiceIcon(log.service)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-zinc-100 uppercase tracking-wider">
                          {log.service}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            log.statusCode === 401
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : log.statusCode === 403
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-zinc-800 text-zinc-300 border border-white/10'
                          }`}
                        >
                          HTTP {log.statusCode || 'ERR'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 font-mono leading-relaxed break-all">
                        {log.error}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleCopyLog(log, logId)}
                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/5 transition-colors cursor-pointer"
                      title="Copy JSON record"
                    >
                      {copiedId === logId ? (
                        <Check size={13} className="text-emerald-400" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : logId)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-[11px] font-mono transition-colors cursor-pointer"
                    >
                      {isExpanded ? 'Less' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-white/10 space-y-2.5 overflow-hidden"
                    >
                      {log.endpoint && (
                        <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-400">
                          <span className="text-zinc-500">API Endpoint: </span>
                          <span className="text-zinc-200">{log.endpoint}</span>
                        </div>
                      )}

                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-[11px] uppercase tracking-wider text-emerald-400">
                            Recommended Action: {advice.category}
                          </div>
                          <p className="text-zinc-300 text-xs leading-relaxed">
                            {advice.recommendation}
                          </p>
                        </div>
                        <button
                          onClick={handleAuthTrigger}
                          className="shrink-0 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          {advice.actionLabel}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
