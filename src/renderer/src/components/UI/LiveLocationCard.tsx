import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  MapPin,
  Navigation,
  Compass,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Radio,
  AlertTriangle
} from 'lucide-react'
import { useLiveLocation } from '../../services/locationService'

interface LiveLocationCardProps {
  className?: string
  compact?: boolean
}

export const LiveLocationCard: React.FC<LiveLocationCardProps> = ({
  className = '',
  compact = false
}) => {
  const {
    location,
    status,
    errorMessage,
    isTracking,
    requestFix,
    startTracking,
    stopTracking,
    formatCoordinates,
    getMapsUrl
  } = useLiveLocation()

  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await requestFix()
    setIsRefreshing(false)
  }

  const handleToggleTracking = () => {
    if (isTracking) {
      stopTracking()
    } else {
      startTracking()
    }
  }

  const handleCopy = () => {
    if (!location) return
    const text = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formattedCoords = location
    ? formatCoordinates(location.latitude, location.longitude)
    : 'STANDBY — NO SATELLITE FIX'

  const isLocked = status === 'active' && Boolean(location)
  const isPending = status === 'requesting' || isRefreshing

  if (compact) {
    return (
      <div
        className={`p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={`h-7 w-7 rounded-lg flex items-center justify-center border ${
              isLocked
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-zinc-800/40 border-white/5 text-zinc-500'
            }`}
          >
            <MapPin size={14} className={isLocked ? 'animate-pulse' : ''} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-bold text-zinc-200">
              {location?.city ? `${location.city}, ${location.country || ''}` : 'Spatial Telemetry'}
            </span>
            <span className="text-[8px] font-mono text-zinc-500">
              {location ? formattedCoords : 'Offline'}
            </span>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isPending}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-cyan-400 border border-white/5 transition-colors cursor-pointer"
          title="Refresh GPS Fix"
        >
          <RefreshCw size={12} className={isPending ? 'animate-spin text-cyan-400' : ''} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-zinc-950/70 border border-white/10 backdrop-blur-xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3 group hover:border-cyan-500/30 transition-all duration-300 ${className}`}
    >
      {/* Background Subtle Radar Glow */}
      <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-colors" />

      {/* Header */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-8 w-8 rounded-xl flex items-center justify-center border transition-all duration-300 ${
              isLocked
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                : 'bg-zinc-900/60 border-white/5 text-zinc-500'
            }`}
          >
            <Navigation size={15} className={isLocked ? 'rotate-45 text-cyan-400' : ''} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[8px] tracking-[0.2em] text-white/50 uppercase font-light">
                Spatial Matrix
              </span>
              {location?.source && (
                <span className="text-[7px] font-mono px-1 rounded bg-white/5 text-zinc-400 uppercase">
                  {location.source}
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-tight text-white/90">
              Live Location Access
            </span>
          </div>
        </div>

        {/* Lock Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full border text-[8px] font-mono tracking-widest uppercase font-semibold flex items-center gap-1.5 transition-all ${
              isLocked
                ? isTracking
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : isPending
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 animate-pulse'
                  : 'border-white/5 bg-white/2 text-zinc-500'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLocked
                  ? isTracking
                    ? 'bg-cyan-400 animate-ping'
                    : 'bg-emerald-400'
                  : isPending
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-zinc-600'
              }`}
            />
            {isPending
              ? 'ACQUIRING...'
              : isLocked
                ? isTracking
                  ? 'LIVE TRACKING'
                  : 'GPS LOCKED'
                : 'STANDBY'}
          </span>
        </div>
      </div>

      {/* Main Place / Address Display */}
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col gap-1 z-10">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-mono tracking-wider text-zinc-400 uppercase flex items-center gap-1">
            <Compass size={11} className="text-cyan-400" /> Current Coordinates
          </span>
          {location && (
            <span className="text-[8px] font-mono text-zinc-500">
              Accuracy: ±{Math.round(location.accuracy || 10)}m
            </span>
          )}
        </div>

        <div className="font-mono text-xs sm:text-sm font-semibold tracking-wide text-cyan-300 select-all">
          {formattedCoords}
        </div>

        {location?.displayName && (
          <div
            className="text-[10px] text-zinc-400 font-sans truncate"
            title={location.displayName}
          >
            {location.displayName}
          </div>
        )}

        {errorMessage && status !== 'active' && (
          <div className="flex items-center gap-1.5 text-[9px] text-amber-400/90 font-mono mt-1 pt-1 border-t border-white/5">
            <AlertTriangle size={11} className="shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Telemetry Metrics Sub-grid */}
      {location && (
        <div className="grid grid-cols-3 gap-1.5 z-10">
          <div className="p-1.5 rounded-lg bg-white/3 border border-white/5 flex flex-col">
            <span className="text-[7px] font-mono text-zinc-500 uppercase">Altitude</span>
            <span className="text-[10px] font-mono font-semibold text-zinc-200">
              {location.altitude ? `${Math.round(location.altitude)}m` : 'Sea Level'}
            </span>
          </div>
          <div className="p-1.5 rounded-lg bg-white/3 border border-white/5 flex flex-col">
            <span className="text-[7px] font-mono text-zinc-500 uppercase">Velocity</span>
            <span className="text-[10px] font-mono font-semibold text-zinc-200">
              {location.speed ? `${(location.speed * 3.6).toFixed(1)} km/h` : '0.0 km/h'}
            </span>
          </div>
          <div className="p-1.5 rounded-lg bg-white/3 border border-white/5 flex flex-col">
            <span className="text-[7px] font-mono text-zinc-500 uppercase">Bearing</span>
            <span className="text-[10px] font-mono font-semibold text-zinc-200">
              {location.heading ? `${Math.round(location.heading)}°` : '0° N'}
            </span>
          </div>
        </div>
      )}

      {/* Controls & Quick Actions */}
      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/5 z-10">
        <div className="flex items-center gap-1.5">
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleToggleTracking}
            className={`cursor-pointer px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 ${
              isTracking
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-white/5'
            }`}
          >
            <Radio size={11} className={isTracking ? 'animate-pulse text-cyan-400' : ''} />
            {isTracking ? 'Tracking: ON' : 'Live Track'}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleRefresh}
            disabled={isPending}
            className="cursor-pointer px-2 py-1 rounded-lg font-mono text-[9px] text-zinc-400 hover:text-cyan-300 bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center gap-1 disabled:opacity-50"
            title="Request High Precision Fix"
          >
            <RefreshCw size={10} className={isPending ? 'animate-spin text-cyan-400' : ''} />
            Fix
          </motion.button>
        </div>

        <div className="flex items-center gap-1">
          {location && (
            <>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={handleCopy}
                className="cursor-pointer p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-white/5 transition-colors"
                title="Copy Coordinates"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </motion.button>

              <motion.a
                whileTap={{ scale: 0.94 }}
                href={getMapsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 border border-white/5 hover:border-cyan-500/30 transition-colors"
                title="Open in Google Maps"
              >
                <ExternalLink size={12} />
              </motion.a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
