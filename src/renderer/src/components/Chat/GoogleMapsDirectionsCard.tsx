import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Navigation,
  Clock,
  Milestone,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Car,
  Footprints,
  Bike,
  Bus
} from 'lucide-react'

export interface DirectionsItem {
  summary: string
  distance: string
  duration: string
  startAddress: string
  endAddress: string
  steps: {
    instructions: string
    distance: string
    duration: string
  }[]
  overviewPolyline?: string
}

interface GoogleMapsDirectionsCardProps {
  directions: DirectionsItem
}

export const GoogleMapsDirectionsCard: React.FC<GoogleMapsDirectionsCardProps> = ({
  directions
}) => {
  const [showAllSteps, setShowAllSteps] = useState(false)

  if (!directions) return null

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    directions.startAddress
  )}&destination=${encodeURIComponent(directions.endAddress)}`

  return (
    <div className="flex flex-col gap-2 my-2.5 w-full rounded-2xl bg-zinc-900/90 border border-emerald-500/25 p-3.5 shadow-lg">
      {/* Route Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Car size={14} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <span>{directions.duration}</span>
              <span className="text-zinc-500 font-normal">({directions.distance})</span>
            </h4>
            <span className="text-[10px] font-mono text-emerald-400">
              {directions.summary || 'Fastest Route'}
            </span>
          </div>
        </div>

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/25 transition-all cursor-pointer"
        >
          <span>Open Map</span>
          <ExternalLink size={10} />
        </a>
      </div>

      {/* Start and Destination Addresses */}
      <div className="flex flex-col gap-1.5 py-1 text-[11px] font-mono">
        <div className="flex items-start gap-2 text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0" />
          <span className="truncate">{directions.startAddress}</span>
        </div>
        <div className="flex items-start gap-2 text-zinc-200 font-medium">
          <div className="w-2 h-2 rounded-full bg-rose-400 mt-1 shrink-0" />
          <span className="truncate">{directions.endAddress}</span>
        </div>
      </div>

      {/* Turn-by-Turn Steps */}
      {directions.steps && directions.steps.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowAllSteps(!showAllSteps)}
            className="w-full flex items-center justify-between text-[10px] font-mono text-zinc-400 hover:text-emerald-300 py-1 cursor-pointer transition-colors"
          >
            <span>
              {showAllSteps
                ? 'Hide turn-by-turn guidance'
                : `View ${directions.steps.length} turn-by-turn steps`}
            </span>
            {showAllSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <AnimatePresence>
            {showAllSteps && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-1.5 pt-1.5 max-h-48 overflow-y-auto custom-scrollbar"
              >
                {directions.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-1.5 rounded-lg bg-black/40 text-[11px] text-zinc-300 font-sans"
                  >
                    <span className="text-[10px] font-mono text-emerald-400/80 font-bold shrink-0 mt-0.5">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 leading-tight">
                      <span>{step.instructions}</span>
                      <span className="text-[10px] font-mono text-zinc-500 ml-1.5">
                        ({step.distance})
                      </span>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

export default GoogleMapsDirectionsCard
