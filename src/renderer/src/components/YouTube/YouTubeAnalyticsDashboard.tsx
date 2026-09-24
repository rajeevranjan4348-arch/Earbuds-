import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts'
import {
  RiYoutubeFill,
  RiEyeLine,
  RiThumbUpLine,
  RiTimeLine,
  RiUserFollowLine,
  RiArrowRightUpLine,
  RiArrowRightDownLine,
  RiRefreshLine,
  RiDownload2Line,
  RiFilter3Line,
  RiMagicLine,
  RiShieldCheckLine,
  RiPlayCircleLine,
  RiPieChartLine,
  RiBarChartGroupedLine,
  RiCompass3Line,
  RiShareForwardLine,
  RiChat3Line
} from 'react-icons/ri'
import { ChannelAnalytics, ChannelProfile } from '../../../../server/youtube/types'

export interface ManagedChannelData {
  id: string
  name: string
  handle: string
  niche: string
  subscribers: number
  totalViews: number
  growthRate: number // %
  primaryColor: string
  publishedVideosCount: number
}

export const MANAGED_CHANNELS: ManagedChannelData[] = [
  {
    id: 'all',
    name: 'All Channels (Aggregated)',
    handle: '@iris_network',
    niche: 'Autonomous AI Network',
    subscribers: 45720,
    totalViews: 489900,
    growthRate: 24.8,
    primaryColor: '#10b981',
    publishedVideosCount: 42
  },
  {
    id: 'iris_intelligence',
    name: 'IRIS Intelligence Labs',
    handle: '@iris_intelligence',
    niche: 'AI & Autonomous Agents',
    subscribers: 18450,
    totalViews: 248900,
    growthRate: 28.4,
    primaryColor: '#10b981', // Emerald
    publishedVideosCount: 14
  },
  {
    id: 'iris_devops',
    name: 'IRIS DevOps & Cloud',
    handle: '@iris_devops',
    niche: 'Edge Containers & Cloud SQL',
    subscribers: 14920,
    totalViews: 142300,
    growthRate: 21.2,
    primaryColor: '#06b6d4', // Cyan
    publishedVideosCount: 16
  },
  {
    id: 'iris_codecraft',
    name: 'IRIS Codecraft & Tools',
    handle: '@iris_codecraft',
    niche: 'TypeScript & Frontend Systems',
    subscribers: 12350,
    totalViews: 98700,
    growthRate: 19.6,
    primaryColor: '#8b5cf6', // Violet
    publishedVideosCount: 12
  }
]

export interface TimelinePoint {
  date: string
  timestamp: number
  views: number
  movingAvg: number
  likes: number
  comments: number
  netSubs: number
  cumulativeSubs: number
  engagementRate: number
  ctr: number
  avgRetention: number
}

// 28-day historical trend generator based on channel profile
function generateTimelineData(channelId: string, days: number = 28): TimelinePoint[] {
  const points: TimelinePoint[] = []
  const now = new Date()

  // Base multipliers depending on channel
  const mult = channelId === 'all' ? 2.1 : channelId === 'iris_intelligence' ? 1.0 : channelId === 'iris_devops' ? 0.62 : 0.44

  let cumulativeSubs = channelId === 'all' ? 41200 : channelId === 'iris_intelligence' ? 16200 : channelId === 'iris_devops' ? 13100 : 10800

  for (let i = days; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    // Simulate realistic daily fluctuations with weekend surges and content releases
    const dayOfWeek = d.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const releaseBump = i === 18 || i === 9 || i === 2 ? 1.9 : 1.0

    const rawDailyViews = Math.round((2800 + Math.sin(i * 0.45) * 800 + (isWeekend ? 1200 : 0)) * mult * releaseBump)
    const likes = Math.round(rawDailyViews * (0.075 + Math.cos(i * 0.3) * 0.015))
    const comments = Math.round(rawDailyViews * 0.014)
    const netSubs = Math.round((rawDailyViews * 0.009) + (releaseBump > 1 ? 40 : 0))
    cumulativeSubs += netSubs

    const engagementRate = Number((((likes + comments) / rawDailyViews) * 100).toFixed(2))
    const ctr = Number((8.2 + Math.sin(i * 0.5) * 1.8 + (releaseBump > 1 ? 2.1 : 0)).toFixed(2))
    const avgRetention = Number((62 + Math.cos(i * 0.4) * 5).toFixed(1))

    points.push({
      date: dateStr,
      timestamp: d.getTime(),
      views: rawDailyViews,
      movingAvg: Math.round(rawDailyViews * 0.94),
      likes,
      comments,
      netSubs,
      cumulativeSubs,
      engagementRate,
      ctr,
      avgRetention
    })
  }
  return points
}

const TRAFFIC_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899']

interface YouTubeAnalyticsDashboardProps {
  initialAnalytics?: ChannelAnalytics | null
  initialProfile?: ChannelProfile | null
  onRefresh?: () => void
}

export const YouTubeAnalyticsDashboard: React.FC<YouTubeAnalyticsDashboardProps> = ({
  initialAnalytics,
  initialProfile,
  onRefresh
}) => {
  const [selectedChannelId, setSelectedChannelId] = useState<string>('all')
  const [selectedPeriod, setSelectedPeriod] = useState<number>(28)
  const [activeMetricTab, setActiveMetricTab] = useState<'VIEWS' | 'ENGAGEMENT' | 'SUBSCRIBERS' | 'RETENTION'>('VIEWS')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const activeChannel = useMemo(() => {
    return MANAGED_CHANNELS.find((c) => c.id === selectedChannelId) || MANAGED_CHANNELS[0]
  }, [selectedChannelId])

  const timelineData = useMemo(() => {
    return generateTimelineData(selectedChannelId, selectedPeriod)
  }, [selectedChannelId, selectedPeriod])

  // Aggregate summary stats for the current view
  const summary = useMemo(() => {
    const totalViews = timelineData.reduce((acc, p) => acc + p.views, 0)
    const totalLikes = timelineData.reduce((acc, p) => acc + p.likes, 0)
    const totalComments = timelineData.reduce((acc, p) => acc + p.comments, 0)
    const totalSubsGained = timelineData.reduce((acc, p) => acc + p.netSubs, 0)
    const avgEngagement = (timelineData.reduce((acc, p) => acc + p.engagementRate, 0) / timelineData.length).toFixed(1)
    const avgCtr = (timelineData.reduce((acc, p) => acc + p.ctr, 0) / timelineData.length).toFixed(1)
    const avgRetention = (timelineData.reduce((acc, p) => acc + p.avgRetention, 0) / timelineData.length).toFixed(1)

    return {
      totalViews,
      totalLikes,
      totalComments,
      totalSubsGained,
      avgEngagement,
      avgCtr,
      avgRetention,
      watchTimeHours: Math.round((totalViews * 4.6) / 60)
    }
  }, [timelineData])

  // Traffic sources data
  const trafficSources = useMemo(() => {
    return [
      { name: 'YouTube Search', value: 48.2 },
      { name: 'Suggested Videos', value: 26.5 },
      { name: 'Browse (Home / Feed)', value: 14.8 },
      { name: 'External & Direct', value: 7.2 },
      { name: 'Playlists & Social', value: 3.3 }
    ]
  }, [])

  // Retention curve benchmarks
  const retentionCurve = useMemo(() => {
    return [
      { progress: '0%', channelRetention: 100, benchmark: 100 },
      { progress: '10%', channelRetention: 89, benchmark: 82 },
      { progress: '25%', channelRetention: 79, benchmark: 69 },
      { progress: '50%', channelRetention: 68, benchmark: 54 },
      { progress: '75%', channelRetention: 58, benchmark: 42 },
      { progress: '90%', channelRetention: 49, benchmark: 35 },
      { progress: '100%', channelRetention: 43, benchmark: 28 }
    ]
  }, [])

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    if (onRefresh) onRefresh()
    setTimeout(() => setIsRefreshing(false), 700)
  }

  const handleExportCSV = () => {
    const headers = 'Date,Views,MovingAvg,Likes,Comments,NetSubs,CumulativeSubs,EngagementRate,CTR,Retention\n'
    const rows = timelineData
      .map(
        (d) =>
          `${d.date},${d.views},${d.movingAvg},${d.likes},${d.comments},${d.netSubs},${d.cumulativeSubs},${d.engagementRate}%,${d.ctr}%,${d.avgRetention}%`
      )
      .join('\n')

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `youtube_analytics_${selectedChannelId}_${selectedPeriod}d.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 select-none font-sans text-zinc-100">
      {/* 1. Header Toolbar & Multi-Channel Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-zinc-950/80 border border-white/10 rounded-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
              <RiYoutubeFill className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-zinc-100 font-mono tracking-tight">
                  Autonomous Channel Performance Intelligence
                </h2>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  Active
                </span>
              </div>
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span>Managed by IRIS-AI Automation Agent</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-zinc-500 tabular-nums">
                  Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Channel Switcher & Time Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Channel Selector */}
          <div className="relative">
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500/50 cursor-pointer"
            >
              {MANAGED_CHANNELS.map((ch) => (
                <option key={ch.id} value={ch.id} className="bg-zinc-950 text-zinc-200">
                  {ch.name} ({ch.handle})
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Segmented Control (Zero-pill button group) */}
          <div className="flex items-center gap-1 bg-zinc-900/80 border border-white/10 p-1 rounded-xl">
            {[
              { days: 7, label: '7D' },
              { days: 28, label: '28D' },
              { days: 90, label: '90D' }
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setSelectedPeriod(p.days)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-colors cursor-pointer ${
                  selectedPeriod === p.days
                    ? 'bg-emerald-500 text-black font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            title="Export CSV metrics report"
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 rounded-xl transition-colors cursor-pointer"
          >
            <RiDownload2Line className="w-4 h-4" />
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={handleManualRefresh}
            title="Refresh analytics data"
            className={`p-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 rounded-xl transition-colors cursor-pointer ${
              isRefreshing ? 'animate-spin text-emerald-400' : ''
            }`}
          >
            <RiRefreshLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Key High-Level Metric Cards (Tabular figures, high contrast) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total Views',
            value: summary.totalViews.toLocaleString(),
            trend: `+${activeChannel.growthRate}%`,
            positive: true,
            icon: RiEyeLine,
            color: '#10b981'
          },
          {
            label: 'Watch Time',
            value: `${summary.watchTimeHours.toLocaleString()}h`,
            trend: '+18.2%',
            positive: true,
            icon: RiTimeLine,
            color: '#06b6d4'
          },
          {
            label: 'Avg Engagement',
            value: `${summary.avgEngagement}%`,
            trend: '+1.4%',
            positive: true,
            icon: RiThumbUpLine,
            color: '#8b5cf6'
          },
          {
            label: 'Click-Through (CTR)',
            value: `${summary.avgCtr}%`,
            trend: '+0.8%',
            positive: true,
            icon: RiMagicLine,
            color: '#f59e0b'
          },
          {
            label: 'Net Subs Gained',
            value: `+${summary.totalSubsGained.toLocaleString()}`,
            trend: '+22.5%',
            positive: true,
            icon: RiUserFollowLine,
            color: '#10b981'
          },
          {
            label: 'Avg Retention',
            value: `${summary.avgRetention}%`,
            trend: '+3.1%',
            positive: true,
            icon: RiShieldCheckLine,
            color: '#ec4899'
          }
        ].map((card, idx) => {
          const Icon = card.icon
          return (
            <div
              key={idx}
              className="p-3.5 bg-zinc-950/70 border border-white/10 rounded-2xl flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-zinc-500 mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  {card.label}
                </span>
                <Icon className="w-4 h-4" style={{ color: card.color }} />
              </div>

              <div>
                <div className="text-lg sm:text-xl font-bold font-mono text-zinc-100 tabular-nums tracking-tight">
                  {card.value}
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono mt-1">
                  <span className={card.positive ? 'text-emerald-400' : 'text-red-400'}>
                    {card.trend}
                  </span>
                  <span className="text-zinc-500">vs prev {selectedPeriod}d</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Metric Focus Selection Bar */}
      <div className="flex items-center gap-1 p-1 bg-zinc-950/60 border border-white/10 rounded-xl overflow-x-auto no-scrollbar">
        {[
          { id: 'VIEWS', label: 'Views & Audience Reach' },
          { id: 'ENGAGEMENT', label: 'Engagement & CTR Rates' },
          { id: 'SUBSCRIBERS', label: 'Subscriber Growth Velocity' },
          { id: 'RETENTION', label: 'Retention Dynamics & Sources' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveMetricTab(tab.id as any)}
            className={`px-3.5 py-1.5 text-xs font-mono font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeMetricTab === tab.id
                ? 'bg-white/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Main Chart View Area (Recharts) */}
      <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
        {/* Dynamic Chart Title */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div>
            <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
              {activeMetricTab === 'VIEWS' && 'Daily Video Views & 7-Day Moving Average'}
              {activeMetricTab === 'ENGAGEMENT' && 'Engagement Rate (%) & Click-Through Rate (CTR %)'}
              {activeMetricTab === 'SUBSCRIBERS' && 'Daily Net Subscribers Gained & Cumulative Growth'}
              {activeMetricTab === 'RETENTION' && 'Audience Retention Curve vs Platform Benchmark'}
            </h3>
            <p className="text-[11px] text-zinc-500">
              {selectedChannelId === 'all' ? 'All Managed YouTube Channels Combined' : `${activeChannel.name} (${activeChannel.handle})`}
            </p>
          </div>

          <div className="text-[11px] font-mono text-zinc-400">
            {selectedPeriod} Days Data Points
          </div>
        </div>

        {/* Recharts Container */}
        <div className="w-full h-72 sm:h-80 pt-2">
          {activeMetricTab === 'VIEWS' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                  }}
                  itemStyle={{ color: '#f4f4f5', fontFamily: 'monospace' }}
                  labelStyle={{ color: '#a1a1aa', fontWeight: 600 }}
                  formatter={(value: any, name: any) => [
                    Number(value).toLocaleString(),
                    name === 'views' ? 'Daily Views' : '7-Day Moving Avg'
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(value) => (value === 'views' ? 'Daily Views' : '7-Day Trend Average')}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#viewGrad)"
                />
                <Line
                  type="monotone"
                  dataKey="movingAvg"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {activeMetricTab === 'ENGAGEMENT' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#f4f4f5', fontFamily: 'monospace' }}
                  formatter={(value: any, name: any) => [
                    `${value}%`,
                    name === 'engagementRate' ? 'Engagement Rate (Likes+Comments/Views)' : 'Click-Through Rate (CTR)'
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="engagementRate"
                  name="Engagement Rate"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#8b5cf6' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="ctr"
                  name="Click-Through Rate (CTR)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: '#f59e0b' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          {activeMetricTab === 'SUBSCRIBERS' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  tickFormatter={(val) => `+${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#f4f4f5', fontFamily: 'monospace' }}
                  formatter={(value: any, name: any) => [
                    `+${value}`,
                    name === 'netSubs' ? 'Net Daily Subscribers' : 'Subscribers'
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar
                  dataKey="netSubs"
                  name="Net Daily Subscribers Gained"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeMetricTab === 'RETENTION' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retentionCurve} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="progress"
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fontSize: 10, fill: '#a1a1aa' }}
                  tickLine={false}
                  tickFormatter={(val) => `${val}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '12px',
                    fontSize: '12px'
                  }}
                  itemStyle={{ color: '#f4f4f5', fontFamily: 'monospace' }}
                  formatter={(val: any) => [`${val}%`, 'Viewers Remaining']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="channelRetention"
                  name="IRIS-AI Channel Retention"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10b981' }}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name="YouTube Tech Median Benchmark"
                  stroke="#71717a"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 5. Two-Column Breakdown: Traffic Distribution + Channel Portfolio Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Traffic Sources Donut / Pie Chart */}
        <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-2">
              <RiPieChartLine className="text-emerald-400 w-4 h-4" />
              <span>Traffic Sources & Discovery Ingestion</span>
            </h3>
            <span className="text-[11px] text-zinc-500 font-mono">Organic Search Dominant</span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={trafficSources}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {trafficSources.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={TRAFFIC_COLORS[index % TRAFFIC_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '10px',
                    fontSize: '11px'
                  }}
                  itemStyle={{ color: '#f4f4f5' }}
                  formatter={(val: any) => [`${val}%`, 'Share']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {trafficSources.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: TRAFFIC_COLORS[idx % TRAFFIC_COLORS.length] }}
                />
                <span className="text-zinc-400 truncate">{item.name}</span>
                <span className="font-mono font-bold text-zinc-200 tabular-nums ml-auto">
                  {item.value}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Managed Channel Portfolio Summary */}
        <div className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-2">
              <RiBarChartGroupedLine className="text-cyan-400 w-4 h-4" />
              <span>IRIS-AI Multi-Channel Portfolio</span>
            </h3>
            <span className="text-[11px] text-zinc-500 font-mono">3 Active Channels</span>
          </div>

          <div className="space-y-2">
            {MANAGED_CHANNELS.filter((c) => c.id !== 'all').map((channel) => (
              <div
                key={channel.id}
                onClick={() => setSelectedChannelId(channel.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  selectedChannelId === channel.id
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-sm'
                    : 'bg-zinc-900/60 hover:bg-zinc-900 border-white/5'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-200">{channel.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{channel.handle}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {channel.niche} · {channel.publishedVideosCount} videos
                  </div>
                </div>

                <div className="text-right font-mono shrink-0">
                  <div className="text-xs font-bold text-zinc-200 tabular-nums">
                    {channel.subscribers.toLocaleString()} subs
                  </div>
                  <div className="text-[10px] text-emerald-400 tabular-nums">
                    +{channel.growthRate}% MoM
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 bg-zinc-900/40 border border-white/5 rounded-xl text-[11px] text-zinc-400 flex items-center gap-2">
            <RiMagicLine className="text-emerald-400 w-4 h-4 shrink-0" />
            <span>
              All 3 channels synchronize with automated scripting, thumbnail rendering, and scheduled publishing.
            </span>
          </div>
        </div>
      </div>

      {/* 6. Autonomous Strategic Optimization Insights */}
      <div className="p-4 bg-zinc-950/80 border border-emerald-500/20 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase">
          <RiMagicLine className="w-4 h-4" />
          <span>IRIS-AI Autonomous Growth Recommendations & Production Signals</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              title: 'Split-Screen Code Visualizers Boost Retention',
              detail: 'Videos featuring code terminals alongside live applet renders experienced +14.2% higher retention through the 3-minute mark.',
              action: 'Apply Terminal Overlay Hook'
            },
            {
              title: 'High-Demand Search Keywords Identified',
              detail: 'Organic search volume for "Gemini 2.5 Agents", "Autonomous Workflows", and "Full-Stack TypeScript" grew 38% this week.',
              action: 'Draft Next Topic Batch'
            },
            {
              title: 'Shorts-to-Longform Funnel Optimization',
              detail: 'Shorts published on Wednesdays drove 420 direct click-through subscribers to corresponding long-form architectural deep dives.',
              action: 'Schedule Wednesday Release'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-zinc-900/80 border border-white/5 rounded-xl flex flex-col justify-between gap-2.5"
            >
              <div>
                <h4 className="text-xs font-bold text-zinc-200 mb-1">{item.title}</h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">{item.detail}</p>
              </div>
              <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <span>{item.action}</span>
                <RiArrowRightUpLine className="w-3 h-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default YouTubeAnalyticsDashboard
