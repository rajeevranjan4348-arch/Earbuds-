import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, ShieldCheck, Activity } from 'lucide-react'

export interface ConfidenceMeterProps {
  confidence: number // 0 to 100
  isTranscribing?: boolean
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({
  confidence,
  isTranscribing = false,
  className = '',
  showLabel = true,
  size = 'md'
}) => {
  // Normalize confidence percentage between 0 and 100
  const normalizedConfidence = Math.min(100, Math.max(0, Math.round(confidence)))

  // Color mapping based on accuracy threshold
  const getColorScheme = (score: number) => {
    if (score >= 85) {
      return {
        barColor: 'bg-emerald-500',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-500/30',
        glowColor: 'shadow-emerald-500/20',
        badgeBg: 'bg-emerald-950/40',
        statusText: 'High Accuracy',
        Icon: CheckCircle2
      }
    } else if (score >= 65) {
      return {
        barColor: 'bg-amber-500',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-500/30',
        glowColor: 'shadow-amber-500/20',
        badgeBg: 'bg-amber-950/40',
        statusText: 'Good Accuracy',
        Icon: ShieldCheck
      }
    } else {
      return {
        barColor: 'bg-rose-500',
        textColor: 'text-rose-400',
        borderColor: 'border-rose-500/30',
        glowColor: 'shadow-rose-500/20',
        badgeBg: 'bg-rose-950/40',
        statusText: 'Low Audio Signal',
        Icon: AlertCircle
      }
    }
  }

  const { barColor, textColor, borderColor, glowColor, badgeBg, statusText, Icon } =
    getColorScheme(normalizedConfidence)

  const heightClass = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'
  const textClass = size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-sm' : 'text-xs'

  return (
    <div
      className={`flex flex-col gap-1.5 px-3 py-2 rounded-xl border ${borderColor} ${badgeBg} backdrop-blur-md shadow-lg ${glowColor} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Activity className={`w-3.5 h-3.5 ${textColor} ${isTranscribing ? 'animate-pulse' : ''}`} />
          {showLabel && (
            <span className={`font-mono font-medium ${textColor} ${textClass}`}>
              Confidence
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono">
          <Icon className={`w-3.5 h-3.5 ${textColor}`} />
          <span className={`font-bold ${textColor} ${textClass}`}>
            {normalizedConfidence}%
          </span>
          <span className="text-[10px] text-neutral-400 hidden sm:inline">
            ({statusText})
          </span>
        </div>
      </div>

      {/* Visual Bar Indicator */}
      <div className={`w-full bg-neutral-800/80 rounded-full overflow-hidden ${heightClass}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${normalizedConfidence}%` }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`h-full rounded-full ${barColor} shadow-sm`}
        />
      </div>
    </div>
  )
}

export default ConfidenceMeter
