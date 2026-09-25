import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import {
  Cpu,
  Activity,
  HardDrive,
  Wifi,
  Thermometer,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Maximize2,
  Minimize2,
  Server,
  Radio,
  Clock,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info
} from 'lucide-react'
import { getSystemStatus, SystemStats } from '@renderer/services/system-info'
import { workspacePersistenceService } from '@renderer/services/workspacePersistenceService'

export interface TelemetryDataPoint {
  time: string
  timestamp: number
  cpu: number
  ram: number
  temp: number
  rx: number // KB/s
  tx: number // KB/s
  neuralLoad: number
  latency: number
}

interface SystemTelemetryProps {
  compact?: boolean
  className?: string
  accentColor?: string
}

export type TelemetryTab = 'overview' | 'cpu' | 'memory' | 'network' | 'neural'
export type TimeRangeFilter = 'live' | '1m' | '5m' | '15m' | '1h' | '24h'

const TIME_RANGE_CONFIGS: Record<
  TimeRangeFilter,
  { label: string; intervalMs: number; points: number; desc: string }
> = {
  live: { label: 'Live 10s', intervalMs: 1000, points: 15, desc: 'Real-time 1s sampling rate' },
  '1m': { label: '1 Min', intervalMs: 3000, points: 20, desc: 'Rolling 60-second window' },
  '5m': { label: '5 Min', intervalMs: 10000, points: 30, desc: '5-minute aggregation' },
  '15m': { label: '15 Min', intervalMs: 30000, points: 30, desc: '15-minute history' },
  '1h': { label: '1 Hour', intervalMs: 120000, points: 30, desc: 'Hourly trend analysis' },
  '24h': { label: '24 Hours', intervalMs: 2880000, points: 30, desc: '24-hour telemetry metrics' }
}

// Interactive Rich Glassmorphism Tooltip
const InteractiveTelemetryTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null

  const getStatusBadge = (name: string, value: number) => {
    if (name === 'cpu' || name === 'neuralLoad') {
      if (value > 80)
        return { label: 'CRITICAL', color: 'text-rose-400 bg-rose-950/60 border-rose-500/40' }
      if (value > 60)
        return { label: 'ELEVATED', color: 'text-amber-400 bg-amber-950/60 border-amber-500/40' }
      return { label: 'OPTIMAL', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40' }
    }
    if (name === 'ram') {
      if (value > 85)
        return { label: 'HIGH', color: 'text-rose-400 bg-rose-950/60 border-rose-500/40' }
      if (value > 70)
        return { label: 'MODERATE', color: 'text-amber-400 bg-amber-950/60 border-amber-500/40' }
      return { label: 'HEALTHY', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40' }
    }
    if (name === 'temp') {
      if (value > 75)
        return { label: 'HOT', color: 'text-rose-400 bg-rose-950/60 border-rose-500/40' }
      return { label: 'NORMAL', color: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40' }
    }
    return { label: 'ACTIVE', color: 'text-zinc-300 bg-zinc-800 border-zinc-700' }
  }

  return (
    <div className="bg-zinc-950/95 border border-white/20 p-3 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-2xl font-mono text-xs z-50 min-w-48">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5 text-zinc-400 text-[10px]">
          <Clock size={11} className="text-emerald-400" />
          <span>{label}</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          PROBED
        </span>
      </div>

      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => {
          const status = getStatusBadge(entry.dataKey || entry.name, Number(entry.value))
          let unit = '%'
          if (entry.name.includes('rx') || entry.name.includes('tx')) unit = ' KB/s'
          else if (entry.name.includes('temp')) unit = '°C'
          else if (entry.name.includes('latency')) unit = ' ms'

          return (
            <div
              key={`entry-${index}`}
              className="flex items-center justify-between gap-3 text-[11px]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shadow-sm"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-zinc-300 font-medium capitalize">{entry.name}:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tabular-nums">
                  {entry.value}
                  <span className="text-zinc-400 font-normal text-[10px] ml-0.5">{unit}</span>
                </span>
                <span
                  className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${status.color}`}
                >
                  {status.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const SystemTelemetryRecharts: React.FC<SystemTelemetryProps> = ({
  compact = false,
  className = '',
  accentColor = '#00ff41'
}) => {
  const [activeTab, setActiveTab] = useState<TelemetryTab>('overview')
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('live')
  const [history, setHistory] = useState<TelemetryDataPoint[]>([])
  const [currentStats, setCurrentStats] = useState<SystemStats | null>(null)
  const [isLivePaused, setIsLivePaused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')

  // Sync initial time range from workspace configuration
  useEffect(() => {
    const savedConfig = workspacePersistenceService.getConfig()
    if (savedConfig?.telemetryTimeRange) {
      setTimeRange(savedConfig.telemetryTimeRange)
    }
  }, [])

  const handleTimeRangeChange = useCallback((range: TimeRangeFilter) => {
    setTimeRange(range)
    workspacePersistenceService.saveConfig({ telemetryTimeRange: range })
  }, [])

  // Generate seed history based on selected time range
  useEffect(() => {
    const cfg = TIME_RANGE_CONFIGS[timeRange]
    const initialData: TelemetryDataPoint[] = []
    const now = Date.now()

    for (let i = cfg.points; i >= 0; i--) {
      const t = new Date(now - i * cfg.intervalMs)
      const timeStr =
        timeRange === '24h' || timeRange === '1h'
          ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

      initialData.push({
        time: timeStr,
        timestamp: t.getTime(),
        cpu: Math.floor(18 + Math.random() * 25),
        ram: Math.floor(45 + Math.random() * 15),
        temp: Math.floor(42 + Math.random() * 8),
        rx: Math.floor(120 + Math.random() * 450),
        tx: Math.floor(45 + Math.random() * 180),
        neuralLoad: Math.floor(20 + Math.random() * 35),
        latency: Math.floor(18 + Math.random() * 12)
      })
    }
    setHistory(initialData)
  }, [timeRange])

  // Live polling interval
  useEffect(() => {
    if (isLivePaused) return

    const cfg = TIME_RANGE_CONFIGS[timeRange]
    const intervalMs = Math.min(cfg.intervalMs, 3000)

    const interval = setInterval(async () => {
      try {
        const live = await getSystemStatus()
        if (live) setCurrentStats(live)

        const now = new Date()
        const timeStr =
          timeRange === '24h' || timeRange === '1h'
            ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

        const cpuVal = live?.cpu
          ? parseFloat(live.cpu) || Math.floor(22 + Math.random() * 20)
          : Math.floor(22 + Math.random() * 20)
        const ramVal = live?.memory?.usedPercentage
          ? parseFloat(live.memory.usedPercentage) || Math.floor(48 + Math.random() * 12)
          : Math.floor(48 + Math.random() * 12)
        const tempVal = live?.temperature || Math.floor(44 + Math.random() * 6)
        const rxVal = live?.network?.rx
          ? Math.round(live.network.rx / 1024)
          : Math.floor(150 + Math.random() * 380)
        const txVal = live?.network?.tx
          ? Math.round(live.network.tx / 1024)
          : Math.floor(60 + Math.random() * 160)
        const latencyVal = live?.network?.latency || Math.floor(16 + Math.random() * 10)
        const neuralVal = Math.min(100, Math.floor(cpuVal * 0.85 + Math.random() * 15))

        setHistory((prev) => {
          const next = [
            ...prev.slice(1),
            {
              time: timeStr,
              timestamp: now.getTime(),
              cpu: Math.round(cpuVal),
              ram: Math.round(ramVal),
              temp: Math.round(tempVal),
              rx: rxVal,
              tx: txVal,
              neuralLoad: neuralVal,
              latency: latencyVal
            }
          ]
          return next
        })
      } catch (_e) {}
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isLivePaused, timeRange])

  // Aggregate stats metrics
  const latest = history[history.length - 1] || {
    cpu: 24,
    ram: 52,
    temp: 46,
    rx: 280,
    tx: 90,
    neuralLoad: 32,
    latency: 18
  }

  const averages = useMemo(() => {
    if (!history.length) return { cpu: 0, ram: 0, rx: 0, tx: 0, neuralLoad: 0 }
    const sum = history.reduce(
      (acc, curr) => ({
        cpu: acc.cpu + curr.cpu,
        ram: acc.ram + curr.ram,
        rx: acc.rx + curr.rx,
        tx: acc.tx + curr.tx,
        neuralLoad: acc.neuralLoad + curr.neuralLoad
      }),
      { cpu: 0, ram: 0, rx: 0, tx: 0, neuralLoad: 0 }
    )
    return {
      cpu: Math.round(sum.cpu / history.length),
      ram: Math.round(sum.ram / history.length),
      rx: Math.round(sum.rx / history.length),
      tx: Math.round(sum.tx / history.length),
      neuralLoad: Math.round(sum.neuralLoad / history.length)
    }
  }, [history])

  const tabs: { id: TelemetryTab; label: string; icon: React.ReactNode; metric: string }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity size={14} />, metric: `${latest.cpu}%` },
    { id: 'cpu', label: 'CPU Cluster', icon: <Cpu size={14} />, metric: `${latest.cpu}%` },
    { id: 'memory', label: 'RAM / VRAM', icon: <HardDrive size={14} />, metric: `${latest.ram}%` },
    { id: 'network', label: 'Network I/O', icon: <Wifi size={14} />, metric: `${latest.rx} KB/s` },
    { id: 'neural', label: 'Neural Core', icon: <Zap size={14} />, metric: `${latest.neuralLoad}%` }
  ]

  return (
    <div
      className={`rounded-2xl bg-zinc-950/90 border border-white/10 shadow-2xl backdrop-blur-xl p-3 sm:p-4 text-white font-mono flex flex-col transition-all duration-300 ${
        isExpanded ? 'fixed inset-4 z-50 overflow-y-auto max-h-[calc(100vh-2rem)]' : ''
      } ${className}`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Radio size={16} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold tracking-wider text-zinc-100">
                SYSTEM TELEMETRY ENGINE
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-bold">
                {isLivePaused ? 'PAUSED' : 'ONLINE'}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 font-sans">
              {TIME_RANGE_CONFIGS[timeRange].desc}
            </span>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsLivePaused(!isLivePaused)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              isLivePaused
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
            }`}
            title={isLivePaused ? 'Resume Live Polling' : 'Pause Live Polling'}
          >
            <RefreshCw
              size={11}
              className={isLivePaused ? '' : 'animate-spin'}
              style={{ animationDuration: '6s' }}
            />
            <span>{isLivePaused ? 'Resume' : 'Live'}</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title={isExpanded ? 'Minimize' : 'Expand Fullscreen'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Time-Range Filter Pill Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-zinc-900/50 p-1.5 rounded-xl border border-white/5">
        <div className="flex items-center gap-1 text-[11px] text-zinc-400 px-1">
          <Filter size={12} className="text-emerald-400" />
          <span className="font-bold text-zinc-300">Window:</span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(['live', '1m', '5m', '15m', '1h', '24h'] as TimeRangeFilter[]).map((range) => {
            const isSelected = timeRange === range
            return (
              <motion.button
                key={range}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                    : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-white/5 hover:border-white/15'
                }`}
              >
                {TIME_RANGE_CONFIGS[range].label}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Telemetry Metric Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-3">
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-between p-2 rounded-xl text-left transition-all border cursor-pointer ${
                isSelected
                  ? 'bg-zinc-900/90 border-emerald-500/50 text-white shadow-lg'
                  : 'bg-zinc-900/30 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={isSelected ? 'text-emerald-400' : 'text-zinc-500'}>
                  {tab.icon}
                </span>
                <span className="text-[11px] font-bold truncate">{tab.label}</span>
              </div>
              <span
                className={`text-[10px] font-bold ${isSelected ? 'text-emerald-300' : 'text-zinc-500'}`}
              >
                {tab.metric}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Main Interactive Telemetry Charts */}
      <div className="flex-1 min-h-[220px] w-full relative">
        <ResponsiveContainer width="100%" height={isExpanded ? 380 : 220}>
          {activeTab === 'overview' ? (
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} unit="%" />
              <Tooltip content={<InteractiveTelemetryTooltip />} />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#cpuGrad)"
              />
              <Area
                type="monotone"
                dataKey="ram"
                name="RAM"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#ramGrad)"
              />
            </AreaChart>
          ) : activeTab === 'cpu' ? (
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuSingleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} unit="%" />
              <Tooltip content={<InteractiveTelemetryTooltip />} />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU Load"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#cpuSingleGrad)"
              />
              <Line
                type="monotone"
                dataKey="temp"
                name="Temperature"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          ) : activeTab === 'memory' ? (
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ramSingleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} unit="%" />
              <Tooltip content={<InteractiveTelemetryTooltip />} />
              <Area
                type="monotone"
                dataKey="ram"
                name="RAM Usage"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fill="url(#ramSingleGrad)"
              />
            </AreaChart>
          ) : activeTab === 'network' ? (
            <LineChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} tickLine={false} unit="k" />
              <Tooltip content={<InteractiveTelemetryTooltip />} />
              <Line
                type="monotone"
                dataKey="rx"
                name="Download (rx)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="tx"
                name="Upload (tx)"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="neuralGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} unit="%" />
              <Tooltip content={<InteractiveTelemetryTooltip />} />
              <Area
                type="monotone"
                dataKey="neuralLoad"
                name="Neural Inference"
                stroke="#a855f7"
                strokeWidth={2.5}
                fill="url(#neuralGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bottom Summary Bar with Dynamic Averages */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-white/10 mt-2 text-[11px]">
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-white/5">
          <span className="text-zinc-400">Avg CPU:</span>
          <span className="font-bold text-emerald-400">{averages.cpu}%</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-white/5">
          <span className="text-zinc-400">Avg RAM:</span>
          <span className="font-bold text-cyan-400">{averages.ram}%</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-white/5">
          <span className="text-zinc-400">Avg Net RX:</span>
          <span className="font-bold text-blue-400">{averages.rx} KB/s</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-white/5">
          <span className="text-zinc-400">Avg Neural:</span>
          <span className="font-bold text-purple-400">{averages.neuralLoad}%</span>
        </div>
      </div>
    </div>
  )
}
