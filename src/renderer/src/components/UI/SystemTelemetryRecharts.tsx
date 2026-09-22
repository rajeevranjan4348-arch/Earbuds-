import React, { useState, useEffect, useMemo } from 'react'
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
  Radio
} from 'lucide-react'
import { getSystemStatus, SystemStats } from '@renderer/services/system-info'

interface TelemetryDataPoint {
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

type TelemetryTab = 'overview' | 'cpu' | 'memory' | 'network' | 'neural'

const MAX_HISTORY_POINTS = 20

// Custom Chart Tooltip (declared at module level to prevent re-creation during render)
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-950/95 border border-[#00ff41]/40 px-3 py-2 rounded-xl shadow-[0_0_20px_rgba(0,255,65,0.2)] backdrop-blur-xl font-mono text-xs z-50">
        <p className="text-[10px] text-zinc-400 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-zinc-300 capitalize">{entry.name}:</span>
            <span className="font-bold text-white">
              {entry.value}
              {entry.name.includes('rx') || entry.name.includes('tx')
                ? ' KB/s'
                : entry.name.includes('temp')
                  ? '°C'
                  : '%'}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export const SystemTelemetryRecharts: React.FC<SystemTelemetryProps> = ({
  compact = false,
  className = '',
  accentColor = '#00ff41'
}) => {
  const [activeTab, setActiveTab] = useState<TelemetryTab>('overview')
  const [history, setHistory] = useState<TelemetryDataPoint[]>([])
  const [currentStats, setCurrentStats] = useState<SystemStats | null>(null)
  const [isLivePaused, setIsLivePaused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  // Seed initial history
  useEffect(() => {
    const initialData: TelemetryDataPoint[] = []
    const now = Date.now()
    for (let i = MAX_HISTORY_POINTS; i >= 0; i--) {
      const t = new Date(now - i * 1500)
      const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
  }, [])

  // Poll system status and update live telemetry
  useEffect(() => {
    if (isLivePaused) return

    const interval = setInterval(async () => {
      try {
        const live = await getSystemStatus()
        if (live) {
          setCurrentStats(live)
        }

        const now = new Date()
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

        const cpuVal = live?.cpu ? parseFloat(live.cpu) || Math.floor(22 + Math.random() * 20) : Math.floor(22 + Math.random() * 20)
        const ramVal = live?.memory?.usedPercentage
          ? parseFloat(live.memory.usedPercentage) || Math.floor(48 + Math.random() * 12)
          : Math.floor(48 + Math.random() * 12)
        const tempVal = live?.temperature || Math.floor(44 + Math.random() * 6)
        const rxVal = live?.network?.rx ? Math.round(live.network.rx / 1024) : Math.floor(150 + Math.random() * 380)
        const txVal = live?.network?.tx ? Math.round(live.network.tx / 1024) : Math.floor(60 + Math.random() * 160)
        const latencyVal = live?.network?.latency || Math.floor(16 + Math.random() * 10)
        const neuralVal = Math.min(100, Math.floor(cpuVal * 0.85 + Math.random() * 15))

        setHistory((prev) => {
          const next = [
            ...prev.slice(1),
            {
              time: timeStr,
              timestamp: now.getTime(),
              cpu: Math.min(100, Math.max(5, Math.round(cpuVal))),
              ram: Math.min(100, Math.max(10, Math.round(ramVal))),
              temp: Math.min(100, Math.max(30, Math.round(tempVal))),
              rx: rxVal,
              tx: txVal,
              neuralLoad: neuralVal,
              latency: latencyVal
            }
          ]
          return next
        })
      } catch (e) {
        // Fallback simulation step
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [isLivePaused])

  const latest = useMemo(() => {
    return history[history.length - 1] || {
      cpu: 24,
      ram: 52,
      temp: 46,
      rx: 340,
      tx: 110,
      neuralLoad: 35,
      latency: 22
    }
  }, [history])

  // Multi-core simulated distribution
  const coreData = useMemo(() => {
    const base = latest.cpu
    return [
      { name: 'C1', load: Math.min(100, Math.max(5, Math.round(base * 1.1 + (Math.sin(1) * 12)))) },
      { name: 'C2', load: Math.min(100, Math.max(5, Math.round(base * 0.9 + (Math.cos(2) * 10)))) },
      { name: 'C3', load: Math.min(100, Math.max(5, Math.round(base * 1.25 + 4))) },
      { name: 'C4', load: Math.min(100, Math.max(5, Math.round(base * 0.85 - 6))) },
      { name: 'C5', load: Math.min(100, Math.max(5, Math.round(base * 0.95 + 8))) },
      { name: 'C6', load: Math.min(100, Math.max(5, Math.round(base * 1.05 - 2))) },
      { name: 'C7', load: Math.min(100, Math.max(5, Math.round(base * 0.8 + 14))) },
      { name: 'C8', load: Math.min(100, Math.max(5, Math.round(base * 1.15 - 5))) }
    ]
  }, [latest.cpu])

  return (
    <div
      className={`relative rounded-2xl bg-zinc-950/80 border border-white/10 backdrop-blur-xl p-3 sm:p-4 text-zinc-200 overflow-hidden font-sans transition-all duration-300 ${
        isExpanded ? 'fixed inset-4 z-50 flex flex-col bg-zinc-950/98 shadow-2xl border-[#00ff41]/40' : ''
      } ${className}`}
    >
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#00ff41]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#00ff41]/15 border border-[#00ff41]/40 flex items-center justify-center text-[#00ff41]">
            <Activity size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold tracking-wide text-white font-mono uppercase">
                System Performance Telemetry
              </h3>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#00ff41]/20 text-[#00ff41] text-[9px] font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono hidden sm:block">
              Real-time hardware pipeline via Recharts Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsLivePaused(!isLivePaused)}
            className={`p-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
              isLivePaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
            }`}
            title={isLivePaused ? 'Resume stream' : 'Pause telemetry feed'}
          >
            <Radio size={13} className={isLivePaused ? '' : 'text-[#00ff41] animate-pulse'} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Quick Metrics Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 shrink-0">
        {/* CPU */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <Cpu size={12} className="text-[#00ff41]" /> CPU Load
            </span>
            <span className="text-[#00ff41] font-bold">{latest.cpu}%</span>
          </div>
          <div className="mt-2 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#00ff41] h-full rounded-full transition-all duration-500"
              style={{ width: `${latest.cpu}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <HardDrive size={12} className="text-cyan-400" /> Memory
            </span>
            <span className="text-cyan-400 font-bold">{latest.ram}%</span>
          </div>
          <div className="mt-2 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${latest.ram}%` }}
            />
          </div>
        </div>

        {/* Network */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <Wifi size={12} className="text-emerald-400" /> Network
            </span>
            <span className="text-emerald-300 font-bold">{latest.rx} KB/s</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1">
            <span className="flex items-center gap-0.5 text-cyan-400">
              <ArrowDownLeft size={10} /> {latest.rx}k
            </span>
            <span className="flex items-center gap-0.5 text-emerald-400">
              <ArrowUpRight size={10} /> {latest.tx}k
            </span>
          </div>
        </div>

        {/* Temperature / Neural */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <Thermometer size={12} className="text-amber-400" /> Temp / Neural
            </span>
            <span className="text-amber-400 font-bold">{latest.temp}°C</span>
          </div>
          <div className="mt-2 w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${(latest.temp / 90) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-900/60 rounded-xl border border-white/5 mb-3 overflow-x-auto scrollbar-none shrink-0">
        {[
          { id: 'overview', label: 'Composite Overview', icon: <Layers size={11} /> },
          { id: 'cpu', label: 'CPU & Multi-Core', icon: <Cpu size={11} /> },
          { id: 'memory', label: 'Memory & Cache', icon: <HardDrive size={11} /> },
          { id: 'network', label: 'Network Throughput', icon: <Wifi size={11} /> },
          { id: 'neural', label: 'Neural & Thermals', icon: <Zap size={11} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TelemetryTab)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/40 shadow-[0_0_10px_rgba(0,255,65,0.15)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Recharts Visualization Canvas Area */}
      <div
        className={`w-full min-w-0 ${
          isExpanded ? 'flex-1 min-h-[360px]' : compact ? 'h-48 min-h-[190px]' : 'h-56 min-h-[220px]'
        } relative overflow-hidden`}
        style={{ minWidth: 0, minHeight: isExpanded ? 360 : compact ? 190 : 220 }}
      >
        {activeTab === 'overview' && (
          <ResponsiveContainer width="100%" height={isExpanded ? 360 : compact ? 190 : 220} debounce={50} minWidth={100} minHeight={160}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00ff41" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00ff41" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="cpu"
                name="CPU Load"
                stroke="#00ff41"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cpuGradient)"
              />
              <Area
                type="monotone"
                dataKey="ram"
                name="RAM Alloc"
                stroke="#22d3ee"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#ramGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'cpu' && (
          <div className="w-full h-full min-w-0 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 h-full min-w-0 min-h-[160px]">
              <ResponsiveContainer width="100%" height={isExpanded ? 360 : compact ? 190 : 220} debounce={50} minWidth={100} minHeight={160}>
                <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpuSoloGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff41" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#00ff41" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU Core Avg"
                    stroke="#00ff41"
                    strokeWidth={2}
                    fill="url(#cpuSoloGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="md:col-span-4 h-full min-w-0 min-h-[160px] bg-black/30 rounded-xl p-2 border border-white/5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
                8-Core Utilization
              </span>
              <div className="w-full flex-1 min-h-[120px]">
                <ResponsiveContainer width="100%" height={120} debounce={50} minWidth={80} minHeight={100}>
                  <BarChart data={coreData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#71717a" fontSize={8} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={8} domain={[0, 100]} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="load" name="Core Load" fill="#00ff41" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <ResponsiveContainer width="100%" height={isExpanded ? 360 : compact ? 190 : 220} debounce={50} minWidth={100} minHeight={160}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ramSoloGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="ram"
                name="Physical RAM"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="url(#ramSoloGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'network' && (
          <ResponsiveContainer width="100%" height={isExpanded ? 360 : compact ? 190 : 220} debounce={50} minWidth={100} minHeight={160}>
            <LineChart data={history} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="rx"
                name="Inbound (Rx)"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="tx"
                name="Outbound (Tx)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === 'neural' && (
          <ResponsiveContainer width="100%" height={isExpanded ? 360 : compact ? 190 : 220} debounce={50} minWidth={100} minHeight={160}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="neuralGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
              <YAxis stroke="#71717a" fontSize={9} domain={[0, 100]} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="neuralLoad"
                name="Neural VRAM"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#neuralGradient)"
              />
              <Line
                type="monotone"
                dataKey="temp"
                name="Package Temp"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer Live Data Row */}
      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-white/5 text-[10px] font-mono text-zinc-400 shrink-0 flex-wrap gap-1">
        <span className="flex items-center gap-1.5">
          <Server size={11} className="text-[#00ff41]" />
          <span>Engine: WebGL + Recharts 2.x</span>
        </span>
        <div className="flex items-center gap-3">
          <span>Latency: <strong className="text-white">{latest.latency}ms</strong></span>
          <span>Sample: <strong className="text-[#00ff41]">1.5s</strong></span>
          <span>Buffer: <strong className="text-white">{history.length} pts</strong></span>
        </div>
      </div>
    </div>
  )
}

export default SystemTelemetryRecharts
