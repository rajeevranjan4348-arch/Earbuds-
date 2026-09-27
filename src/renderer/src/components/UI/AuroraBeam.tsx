import React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../lib/utils'

export interface AuroraBeamProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
  containerClassName?: string
  colors?: string[]
  duration?: number
  blur?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  intensity?: number
  beamWidth?: string
  reverse?: boolean
  showGlow?: boolean
}

const BLUR_MAP = {
  sm: 'blur-md',
  md: 'blur-xl',
  lg: 'blur-2xl',
  xl: 'blur-3xl',
  '2xl': 'blur-[64px]',
  '3xl': 'blur-[100px]'
}

export const AuroraBeam: React.FC<AuroraBeamProps> = ({
  children,
  className,
  containerClassName,
  colors = ['#00ff41', '#10b981', '#06b6d4', '#6366f1', '#a855f7'],
  duration = 14,
  blur = '2xl',
  intensity = 0.65,
  beamWidth = '120%',
  reverse = false,
  showGlow = true,
  ...props
}) => {
  const blurClass = BLUR_MAP[blur] || BLUR_MAP['2xl']
  const dir = reverse ? -1 : 1

  return (
    <div
      className={cn(
        'relative overflow-hidden isolate rounded-2xl bg-transparent',
        containerClassName
      )}
      {...props}
    >
      {/* Background Aurora Layers */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        {/* Layer 1: Sweeping primary beam sheet */}
        <motion.div
          initial={{ rotate: -25 * dir, x: '-20%', y: '-10%', scaleY: 0.9 }}
          animate={{
            rotate: [(-25 * dir), (15 * dir), (-20 * dir), (-25 * dir)],
            x: ['-20%', '15%', '-10%', '-20%'],
            y: ['-10%', '10%', '-5%', '-10%'],
            scaleY: [0.9, 1.25, 1.05, 0.9]
          }}
          transition={{
            duration: duration,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            width: beamWidth,
            height: '180%',
            opacity: intensity,
            background: `conic-gradient(from 180deg at 50% 50%, ${colors[0]} 0deg, ${colors[1] || colors[0]} 60deg, ${colors[2] || colors[0]} 140deg, ${colors[3] || colors[1] || colors[0]} 220deg, transparent 320deg, ${colors[0]} 360deg)`
          }}
          className={cn(
            'absolute -top-[40%] -left-[10%] origin-center mix-blend-screen filter',
            blurClass
          )}
        />

        {/* Layer 2: Counter-sweeping atmospheric sheet of light */}
        <motion.div
          initial={{ rotate: 30 * dir, x: '20%', y: '10%', scaleX: 1.1 }}
          animate={{
            rotate: [(30 * dir), (-10 * dir), (25 * dir), (30 * dir)],
            x: ['20%', '-15%', '10%', '20%'],
            y: ['10%', '-10%', '5%', '10%'],
            scaleX: [1.1, 0.85, 1.2, 1.1]
          }}
          transition={{
            duration: duration * 1.35,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            width: beamWidth,
            height: '160%',
            opacity: intensity * 0.75,
            background: `linear-gradient(135deg, ${colors[1] || colors[0]} 0%, ${colors[2] || colors[0]} 35%, ${colors[3] || colors[1]} 70%, transparent 100%)`
          }}
          className={cn(
            'absolute -top-[30%] -right-[15%] origin-center mix-blend-screen filter',
            blurClass
          )}
        />

        {/* Layer 3: Central pulsing ribbon core */}
        <motion.div
          initial={{ opacity: intensity * 0.4, scale: 0.95 }}
          animate={{
            opacity: [intensity * 0.4, intensity * 0.85, intensity * 0.5, intensity * 0.4],
            scale: [0.95, 1.1, 0.98, 0.95],
            rotate: [0, 8 * dir, -6 * dir, 0]
          }}
          transition={{
            duration: duration * 0.7,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          style={{
            background: `radial-gradient(ellipse at center, ${colors[0]} 0%, ${colors[1] || colors[0]} 40%, transparent 75%)`
          }}
          className={cn(
            'absolute inset-0 m-auto h-[120%] w-[120%] mix-blend-plus-lighter filter',
            blurClass
          )}
        />

        {/* Optional Ambient Floor Glow */}
        {showGlow && (
          <div
            style={{
              background: `radial-gradient(circle at 50% 100%, ${colors[0]}22 0%, transparent 65%)`
            }}
            className="absolute inset-0 pointer-events-none"
          />
        )}
      </div>

      {/* Content wrapper */}
      <div className={cn('relative z-10', className)}>{children}</div>
    </div>
  )
}

export default AuroraBeam
