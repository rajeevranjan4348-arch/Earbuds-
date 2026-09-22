import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiYoutubeFill,
  RiPlayCircleLine,
  RiMagicLine,
  RiCheckDoubleLine,
  RiCloseCircleLine,
  RiTimeLine,
  RiEyeLine,
  RiThumbUpLine,
  RiUserFollowLine,
  RiSearchLine,
  RiSettings4Line,
  RiArrowRightLine,
  RiRefreshLine,
  RiFilmLine,
  RiShieldCheckLine,
  RiSendPlaneFill,
  RiVolumeUpLine,
  RiImageAddLine,
  RiFileTextLine,
  RiCalendarLine,
  RiAlertLine
} from 'react-icons/ri'
import {
  ContentJob,
  TrendTopic,
  ChannelProfile,
  ChannelAnalytics,
  AutomationScheduleConfig,
  VideoFormat,
  ApprovalMode
} from '../../../server/youtube/types'

interface YouTubeStudioViewProps {
  glassPanel?: string
}

export const YouTubeStudioView: React.FC<YouTubeStudioViewProps> = ({ glassPanel = '' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'PIPELINE' | 'TRENDS' | 'ANALYTICS' | 'SETTINGS'>('PIPELINE')
  const [jobs, setJobs] = useState<ContentJob[]>([])
  const [trends, setTrends] = useState<TrendTopic[]>([])
  const [profile, setProfile] = useState<ChannelProfile | null>(null)
  const [analytics, setAnalytics] = useState<ChannelAnalytics | null>(null)
  const [schedule, setSchedule] = useState<AutomationScheduleConfig | null>(null)
  const [selectedJob, setSelectedJob] = useState<ContentJob | null>(null)
  const [commandInput, setCommandInput] = useState('')
  const [commandResponse, setCommandResponse] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [filterNiche, setFilterNiche] = useState<string>('ALL')
  const [newFormat, setNewFormat] = useState<VideoFormat>('STANDARD')

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [jobsRes, trendsRes, profileRes, analyticsRes, scheduleRes] = await Promise.all([
        fetch('/api/youtube/jobs').then((r) => r.json()),
        fetch('/api/youtube/trends').then((r) => r.json()),
        fetch('/api/youtube/channel').then((r) => r.json()),
        fetch('/api/youtube/analytics').then((r) => r.json()),
        fetch('/api/youtube/scheduler').then((r) => r.json())
      ])

      if (jobsRes.success) {
        setJobs(jobsRes.jobs || [])
        if (!selectedJob && jobsRes.jobs?.length > 0) {
          setSelectedJob(jobsRes.jobs[0])
        } else if (selectedJob) {
          const updated = (jobsRes.jobs || []).find((j: ContentJob) => j.jobId === selectedJob.jobId)
          if (updated) setSelectedJob(updated)
        }
      }
      if (trendsRes.success) setTrends(trendsRes.trends || [])
      if (profileRes.success) setProfile(profileRes.profile || null)
      if (analyticsRes.success) setAnalytics(analyticsRes.analytics || null)
      if (scheduleRes.success) setSchedule(scheduleRes.schedule || null)
    } catch (err) {
      console.error('Failed to load YouTube Studio data:', err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 8000)

    const handleSubTabEvent = (e: any) => {
      const sub = e?.detail
      if (sub && ['PIPELINE', 'TRENDS', 'ANALYTICS', 'SETTINGS'].includes(sub)) {
        setActiveSubTab(sub)
      }
    }
    window.addEventListener('iris-youtube-subtab', handleSubTabEvent)

    return () => {
      clearInterval(interval)
      window.removeEventListener('iris-youtube-subtab', handleSubTabEvent)
    }
  }, [])

  // Handle Natural Language Command Execution
  const handleSendCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!commandInput.trim() || isProcessing) return

    const cmd = commandInput.trim()
    setCommandInput('')
    setIsProcessing(true)
    setCommandResponse('Processing autonomous command...')

    try {
      const res = await fetch('/api/youtube/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      }).then((r) => r.json())

      if (res.success) {
        setCommandResponse(res.response)
        fetchData()
      } else {
        setCommandResponse(`Command error: ${res.error || 'Failed'}`)
      }
    } catch (err: any) {
      setCommandResponse(`Exception: ${err?.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Create Video from Trend
  const handleCreateVideo = async (topic: TrendTopic, format: VideoFormat) => {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/youtube/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, format, autoExecute: true })
      }).then((r) => r.json())

      if (res.success && res.job) {
        setSelectedJob(res.job)
        setActiveSubTab('PIPELINE')
        fetchData()
      }
    } catch (err) {
      console.error('Create video error:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // Approve Video Job
  const handleApprove = async (jobId: string, scheduleFor?: string) => {
    try {
      const res = await fetch('/api/youtube/jobs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, scheduleFor })
      }).then((r) => r.json())
      if (res.success) fetchData()
    } catch (err) {
      console.error('Approve job error:', err)
    }
  }

  // Reject Video Job
  const handleReject = async (jobId: string) => {
    try {
      const res = await fetch('/api/youtube/jobs/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, reason: 'Declined by channel manager' })
      }).then((r) => r.json())
      if (res.success) fetchData()
    } catch (err) {
      console.error('Reject job error:', err)
    }
  }

  // Update Approval Mode
  const handleUpdateMode = async (mode: ApprovalMode, autoPublish: boolean) => {
    try {
      const res = await fetch('/api/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalMode: mode, autoPublishEnabled: autoPublish })
      }).then((r) => r.json())
      if (res.success) setProfile(res.profile)
    } catch (err) {
      console.error('Update mode error:', err)
    }
  }

  const stageColors: Record<string, { bg: string; text: string; border: string }> = {
    DISCOVERED: { bg: 'bg-zinc-800/80', text: 'text-zinc-300', border: 'border-zinc-700' },
    RESEARCHING: { bg: 'bg-cyan-950/60', text: 'text-cyan-400', border: 'border-cyan-500/40' },
    SCRIPT_READY: { bg: 'bg-blue-950/60', text: 'text-blue-400', border: 'border-blue-500/40' },
    ASSETS_READY: { bg: 'bg-purple-950/60', text: 'text-purple-400', border: 'border-purple-500/40' },
    RENDERING: { bg: 'bg-amber-950/60', text: 'text-amber-400', border: 'border-amber-500/40' },
    REVIEW: { bg: 'bg-yellow-950/70', text: 'text-yellow-400', border: 'border-yellow-500/50' },
    APPROVED: { bg: 'bg-emerald-950/60', text: 'text-emerald-400', border: 'border-emerald-500/40' },
    UPLOADED: { bg: 'bg-teal-950/60', text: 'text-teal-400', border: 'border-teal-500/40' },
    SCHEDULED: { bg: 'bg-indigo-950/60', text: 'text-indigo-400', border: 'border-indigo-500/40' },
    PUBLISHED: { bg: 'bg-emerald-900/80', text: 'text-emerald-300', border: 'border-emerald-400/60' },
    REJECTED: { bg: 'bg-red-950/60', text: 'text-red-400', border: 'border-red-500/40' }
  }

  return (
    <div className="flex flex-col min-h-full w-full max-w-7xl mx-auto space-y-4 text-zinc-100 font-sans select-none pb-12">
      {/* 1. Header Banner & Publishing Mode Bar */}
      <div className={`shrink-0 p-4 md:p-5 ${glassPanel} border border-white/10 bg-zinc-950/80 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xl relative`}>
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-12 h-12 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)] shrink-0">
            <RiYoutubeFill size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-black tracking-wider uppercase text-white">
                {profile?.channelName || 'IRIS Intelligence Labs'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                LIVE PIPELINE
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
              <span>{profile?.handle || '@iris_intelligence'}</span>
              <span>•</span>
              <span className="text-zinc-300">{profile?.subscribers.toLocaleString() || '18,450'} subscribers</span>
              <span>•</span>
              <span className="text-zinc-300">{profile?.publishedVideosCount || '14'} videos</span>
            </p>
          </div>
        </div>

        {/* Mode Selector & Controls */}
        <div className="flex flex-wrap items-center gap-2 z-10 w-full md:w-auto justify-start md:justify-end">
          <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-white/10">
            {(['MANUAL', 'SEMI_AUTO', 'AUTO'] as ApprovalMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleUpdateMode(mode, mode === 'AUTO')}
                className={`px-3 py-1 text-[11px] font-mono font-bold uppercase rounded-lg transition-all ${
                  profile?.approvalMode === mode
                    ? mode === 'AUTO'
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-100 text-zinc-900 shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {mode.replace('_', '-')}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            title="Refresh Pipeline Data"
          >
            <RiRefreshLine size={16} className={isProcessing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. Natural Language AI Command Bar */}
      <div className={`shrink-0 p-3 md:p-4 ${glassPanel} border border-white/10 bg-zinc-950/70 rounded-2xl`}>
        <form onSubmit={handleSendCommand} className="flex items-center gap-2">
          <div className="relative flex-1">
            <RiMagicLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" size={16} />
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Try: Find today's trends, Create a 60-second Short, Publish approved video, or Show analytics"
              className="w-full bg-zinc-900/90 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-sans transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isProcessing || !commandInput.trim()}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold font-mono tracking-wider uppercase rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <RiSendPlaneFill size={14} />
            <span>Execute</span>
          </button>
        </form>

        {commandResponse && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 bg-zinc-900/90 border border-emerald-500/20 rounded-xl text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-line"
          >
            <div className="flex items-center justify-between text-emerald-400 font-bold mb-1">
              <span>AUTONOMOUS AGENT DISPATCH RESPONSE:</span>
              <button
                onClick={() => setCommandResponse(null)}
                className="text-zinc-500 hover:text-zinc-300 text-[10px]"
              >
                ✕ Close
              </button>
            </div>
            {commandResponse}
          </motion.div>
        )}
      </div>

      {/* 3. Studio Sub-Navigation Tabs */}
      <div className="shrink-0 flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar relative">
        {[
          { id: 'PIPELINE', label: 'Production Queue', icon: <RiFilmLine size={15} /> },
          { id: 'TRENDS', label: 'Trend Discovery', icon: <RiMagicLine size={15} /> },
          { id: 'ANALYTICS', label: 'Channel Analytics', icon: <RiEyeLine size={15} /> },
          { id: 'SETTINGS', label: 'Scheduler & Style', icon: <RiSettings4Line size={15} /> }
        ].map((tab) => (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition-colors cursor-pointer ${
              activeSubTab === tab.id
                ? 'text-emerald-400'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            }`}
          >
            {activeSubTab === tab.id && (
              <motion.div
                layoutId="youtubeSubTabActive"
                className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/40 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">{tab.icon}</span>
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          {/* 4. Tab 1: PRODUCTION PIPELINE & KANBAN QUEUE */}
          {activeSubTab === 'PIPELINE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Jobs List */}
          <div className="lg:col-span-5 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                Active Content Pipeline ({jobs.length})
              </h2>
              <span className="text-[10px] font-mono text-emerald-400 animate-pulse">● Auto-Syncing</span>
            </div>

            <div className="flex flex-col space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
              {jobs.map((job) => {
                const sColor = stageColors[job.stage] || stageColors.DISCOVERED
                const isSelected = selectedJob?.jobId === job.jobId

                return (
                  <motion.div
                    key={job.jobId}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedJob(job)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
                        : 'bg-zinc-950/80 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${sColor.bg} ${sColor.text} ${sColor.border}`}>
                        {job.stage.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {job.format} • {new Date(job.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-zinc-100 line-clamp-2 leading-snug">
                      {job.script?.selectedTitle || job.topic.title}
                    </h3>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>Score: <b className="text-emerald-400">{job.topic.opportunityScore}/100</b></span>
                      <span>QC: {job.qualityGatePassed ? <b className="text-emerald-400">PASSED</b> : <b className="text-yellow-400">REVIEW</b>}</span>
                    </div>
                  </motion.div>
                )
              })}

              {jobs.length === 0 && (
                <div className="p-8 text-center bg-zinc-950/40 border border-white/5 rounded-2xl text-zinc-500 text-xs font-mono">
                  No active video jobs. Discover a trend to begin!
                </div>
              )}
            </div>
          </div>

          {/* Right: Detailed Video Studio Inspector */}
          <div className="lg:col-span-7">
            {selectedJob ? (
              <div className={`p-5 ${glassPanel} border border-white/10 bg-zinc-950/80 rounded-2xl flex flex-col space-y-4 shadow-2xl`}>
                {/* Inspector Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${stageColors[selectedJob.stage]?.bg} ${stageColors[selectedJob.stage]?.text} ${stageColors[selectedJob.stage]?.border}`}>
                        {selectedJob.stage}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">ID: {selectedJob.jobId}</span>
                    </div>
                    <h2 className="text-base font-bold text-zinc-100 mt-1">
                      {selectedJob.script?.selectedTitle || selectedJob.topic.title}
                    </h2>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedJob.stage === 'REVIEW' && (
                      <>
                        <button
                          onClick={() => handleApprove(selectedJob.jobId)}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold font-mono uppercase rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RiCheckDoubleLine size={14} />
                          <span>Approve & Publish</span>
                        </button>
                        <button
                          onClick={() => handleReject(selectedJob.jobId)}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-red-950 hover:text-red-400 text-zinc-400 text-xs font-bold font-mono uppercase rounded-xl transition-colors cursor-pointer"
                        >
                          <RiCloseCircleLine size={14} />
                        </button>
                      </>
                    )}

                    {selectedJob.youtubeVideoUrl && (
                      <a
                        href={selectedJob.youtubeVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-400 text-xs font-bold font-mono uppercase rounded-xl flex items-center gap-1.5 transition-colors"
                      >
                        <RiPlayCircleLine size={14} />
                        <span>View Video</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* 9-Point Quality Gate Verification Card */}
                <div className="p-3.5 bg-zinc-900/90 border border-white/5 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RiShieldCheckLine className="text-emerald-400" size={16} />
                      <span className="text-xs font-mono font-bold uppercase text-zinc-200">
                        9-Point Quality Gate Verification
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono font-bold ${selectedJob.qualityGatePassed ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {selectedJob.qualityGatePassed ? 'ALL CHECKS PASSED (100%)' : 'NEEDS REVIEW'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                    {(selectedJob.qualityChecks || []).map((qc) => (
                      <div
                        key={qc.check}
                        className={`p-2 rounded-lg border text-[10px] font-mono flex items-center justify-between ${
                          qc.passed ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-red-950/30 border-red-500/30 text-red-300'
                        }`}
                        title={qc.details}
                      >
                        <span className="truncate">{qc.check.replace('_', ' ')}</span>
                        <span className="font-bold">{qc.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7-Part Script Breakdown */}
                {selectedJob.script && (
                  <div className="p-3.5 bg-zinc-900/90 border border-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-2">
                        <RiFileTextLine className="text-cyan-400" size={15} />
                        7-Part Script Architecture (~{Math.round((selectedJob.script.estimatedDurationSec || 480) / 60)} min)
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        Pacing: {selectedJob.script.voiceoverPacing}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-sans text-zinc-300 max-h-48 overflow-y-auto pr-1">
                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">1. Opening Hook:</span>
                        <p className="mt-0.5 text-zinc-200">{selectedJob.script.hook.text}</p>
                        <span className="text-[9px] font-mono text-zinc-500">Visual: {selectedJob.script.hook.visualCue}</span>
                      </div>

                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">2. Problem Context:</span>
                        <p className="mt-0.5 text-zinc-200">{selectedJob.script.context.text}</p>
                      </div>

                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-blue-400 uppercase">3. Core Information:</span>
                        <ul className="list-disc list-inside mt-0.5 space-y-1 text-zinc-300">
                          {selectedJob.script.mainInfo.keyPoints.map((kp, i) => (
                            <li key={i}>{kp}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">4. Deep Dive Storytelling:</span>
                        <p className="mt-0.5 text-zinc-200">{selectedJob.script.storytelling.text}</p>
                      </div>

                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">6. Synthesis & Conclusion:</span>
                        <p className="mt-0.5 text-zinc-200">{selectedJob.script.conclusion.text}</p>
                      </div>

                      <div className="p-2 bg-zinc-950/60 rounded-lg border border-white/5">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">7. Call to Action:</span>
                        <p className="mt-0.5 text-zinc-200">{selectedJob.script.callToAction.text}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Thumbnails & Storyboard Previews */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Thumbnails */}
                  <div className="p-3 bg-zinc-900/90 border border-white/5 rounded-xl">
                    <span className="text-[11px] font-mono font-bold uppercase text-zinc-300 block mb-2">
                      Thumbnail Concepts (Mobile Scored)
                    </span>
                    <div className="space-y-2">
                      {(selectedJob.thumbnails || []).map((th) => (
                        <div
                          key={th.id}
                          className={`p-2.5 rounded-lg border text-xs ${
                            th.isSelected ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200' : 'bg-zinc-950 border-white/5 text-zinc-400'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono font-bold text-[10px]">
                            <span>{th.conceptName}</span>
                            <span className="text-emerald-400">Score: {th.mobileReadabilityScore}%</span>
                          </div>
                          <p className="font-bold text-zinc-100 text-sm mt-1 tracking-wide uppercase">
                            "{th.headlineText}"
                          </p>
                          <p className="text-[10px] text-zinc-500 line-clamp-2 mt-0.5">{th.compositionDescription}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Asset Manifest & Captions */}
                  <div className="p-3 bg-zinc-900/90 border border-white/5 rounded-xl">
                    <span className="text-[11px] font-mono font-bold uppercase text-zinc-300 block mb-2">
                      Legal Asset Manifest ({selectedJob.assetManifest?.length || 0} items)
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto text-[10px] font-mono text-zinc-400 pr-1">
                      {(selectedJob.assetManifest || []).map((asset) => (
                        <div key={asset.assetId} className="p-1.5 bg-zinc-950 rounded border border-white/5 flex items-center justify-between">
                          <span className="text-zinc-200 truncate">{asset.assetName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-emerald-400 text-[9px]">
                            {asset.licenseStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] flex items-center justify-center p-8 bg-zinc-950/40 border border-white/5 rounded-2xl text-zinc-500 font-mono text-xs">
                Select a video job from the queue to inspect production status.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: TREND DISCOVERY & OPPORTUNITY MATRIX */}
      {activeSubTab === 'TRENDS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-950/70 p-4 rounded-2xl border border-white/10">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                Verified Trend Discovery Matrix
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                Multidimensional opportunity scoring: Relevance, Demand, Low Competition, Freshness & Audience Fit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">Format:</span>
              <select
                value={newFormat}
                onChange={(e) => setNewFormat(e.target.value as any)}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none"
              >
                <option value="SHORTS">Shorts (60s)</option>
                <option value="MINI">Mini (1-3m)</option>
                <option value="STANDARD">Standard (5-10m)</option>
                <option value="LONG_FORM">Long-form (15m+)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trends.map((topic) => (
              <motion.div
                key={topic.id}
                whileHover={{ scale: 1.01 }}
                className="p-4 bg-zinc-950/80 border border-white/10 hover:border-emerald-500/40 rounded-2xl flex flex-col justify-between space-y-3 shadow-xl transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {topic.niche}
                    </span>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {topic.opportunityScore}/100
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 block">Opportunity</span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-zinc-100 line-clamp-2 leading-snug">
                    {topic.title}
                  </h3>

                  <p className="text-xs text-zinc-400 mt-2 font-mono line-clamp-3 leading-relaxed">
                    {topic.selectionReason}
                  </p>

                  {/* Dimension Metrics */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px] font-mono text-zinc-400 border-t border-white/5 pt-2">
                    <div>Demand: <b className="text-zinc-200">{topic.searchDemand}%</b></div>
                    <div>Comp: <b className="text-zinc-200">{topic.competitionScore}%</b></div>
                    <div>Fit: <b className="text-zinc-200">{topic.audienceFitScore}%</b></div>
                  </div>
                </div>

                <button
                  onClick={() => handleCreateVideo(topic, newFormat)}
                  disabled={isProcessing}
                  className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold font-mono uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RiPlayCircleLine size={15} />
                  <span>Produce {newFormat} Video</span>
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Tab 3: CHANNEL ANALYTICS & INSIGHTS */}
      {activeSubTab === 'ANALYTICS' && analytics && (
        <div className="space-y-4">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Views', value: analytics.views.toLocaleString(), icon: <RiEyeLine size={16} /> },
              { label: 'Watch Time', value: `${analytics.watchTimeHours.toLocaleString()}h`, icon: <RiTimeLine size={16} /> },
              { label: 'Avg Retention', value: `${analytics.retentionRate}%`, icon: <RiShieldCheckLine size={16} /> },
              { label: 'Avg CTR', value: `${analytics.ctr}%`, icon: <RiMagicLine size={16} /> },
              { label: 'Likes', value: analytics.likes.toLocaleString(), icon: <RiThumbUpLine size={16} /> },
              { label: 'Subs Gained', value: `+${analytics.subscribersGained.toLocaleString()}`, icon: <RiUserFollowLine size={16} /> }
            ].map((metric) => (
              <div key={metric.label} className="p-3.5 bg-zinc-950/80 border border-white/10 rounded-2xl">
                <div className="flex items-center justify-between text-zinc-500 mb-1">
                  <span className="text-[10px] font-mono uppercase">{metric.label}</span>
                  <span className="text-emerald-400">{metric.icon}</span>
                </div>
                <div className="text-base sm:text-lg font-bold font-mono text-zinc-100">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>

          {/* AI Growth Insights */}
          <div className="p-4 bg-zinc-950/80 border border-emerald-500/20 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase">
              <RiMagicLine size={16} />
              <span>AI Channel Growth & Topic Recommendations</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {analytics.aiInsights.map((insight, idx) => (
                <div key={idx} className="p-3 bg-zinc-900/90 rounded-xl border border-white/5 text-xs text-zinc-300 font-mono leading-relaxed">
                  {insight}
                </div>
              ))}
            </div>
          </div>

          {/* Top Performing Videos Table */}
          <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-300">
              Top Historical Video Performance
            </h3>
            <div className="space-y-2">
              {analytics.topPerformingVideos.map((vid) => (
                <div key={vid.videoId} className="p-3 bg-zinc-900/80 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-zinc-200">{vid.title}</span>
                  <div className="flex items-center gap-4 text-zinc-400 font-mono shrink-0">
                    <span>Views: <b className="text-emerald-400">{vid.views.toLocaleString()}</b></span>
                    <span>CTR: <b className="text-zinc-200">{vid.ctr}%</b></span>
                    <span>Retention: <b className="text-zinc-200">{vid.retention}%</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. Tab 4: SCHEDULER & CHANNEL SETTINGS */}
      {activeSubTab === 'SETTINGS' && profile && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-4">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-200 flex items-center gap-2">
              <RiCalendarLine className="text-emerald-400" size={16} />
              Automated Daily Production Schedule
            </h3>
            <div className="space-y-2 text-xs font-mono text-zinc-300">
              <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <span>07:00 UTC - Trend Discovery Engine</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <span>08:00 UTC - Deep Fact & Claim Verification</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <span>09:00 UTC - Gemini Script & Storyboard Synthesis</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <span>12:00 UTC - 9-Point Quality Gate Review</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-zinc-900 rounded-xl border border-white/5">
                <span>18:00 UTC - Scheduled YouTube Publishing</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-200">
              Channel Niche & Audience Configuration
            </h3>
            <div className="space-y-2 text-xs font-mono text-zinc-400">
              <div>
                <span className="text-zinc-200 block mb-1">Active Content Niches:</span>
                <div className="flex flex-wrap gap-1.5">
                  {profile.contentNiches.map((n) => (
                    <span key={n} className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-white/10 text-emerald-400 text-[11px]">
                      {n}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <span className="text-zinc-200 block mb-1">Target Audience:</span>
                <p className="p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-zinc-300">
                  {profile.targetAudience}
                </p>
              </div>

              <div className="pt-2">
                <span className="text-zinc-200 block mb-1">Brand Style & Tone:</span>
                <p className="p-2.5 bg-zinc-900 rounded-xl border border-white/5 text-zinc-300">
                  {profile.brandStyle.tone}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default YouTubeStudioView
