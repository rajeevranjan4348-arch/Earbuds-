import React from 'react'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  variant?: 'pulse' | 'shimmer' | 'wave'
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  borderRadius,
  variant = 'shimmer'
}) => {
  const style: React.CSSProperties = {
    width: width !== undefined ? width : undefined,
    height: height !== undefined ? height : undefined,
    borderRadius: borderRadius !== undefined ? borderRadius : undefined
  }

  const animationClass =
    variant === 'pulse'
      ? 'animate-pulse bg-zinc-800/70'
      : 'relative overflow-hidden bg-zinc-900/80 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.8s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent'

  return (
    <div
      className={`rounded-lg border border-white/5 ${animationClass} ${className}`}
      style={style}
    />
  )
}

export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`bg-zinc-950/60 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-lg ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex flex-col gap-2">
            <Skeleton className="w-32 h-4 rounded" />
            <Skeleton className="w-20 h-3 rounded" />
          </div>
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>

      <div className="flex flex-col gap-2.5 py-1">
        <Skeleton className="w-full h-3.5 rounded" />
        <Skeleton className="w-4/5 h-3.5 rounded" />
        <Skeleton className="w-2/3 h-3.5 rounded" />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <Skeleton className="w-24 h-4 rounded" />
        <Skeleton className="w-12 h-4 rounded" />
      </div>
    </div>
  )
}

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 sm:p-6 overflow-hidden animate-in fade-in duration-300">
      {/* Top Banner / Stats Header Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-zinc-950/50 border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <Skeleton className="w-16 h-3 rounded" />
              <Skeleton className="w-24 h-6 rounded-md" />
            </div>
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
          </div>
        ))}
      </div>

      {/* Main Grid Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-4 bg-zinc-950/50 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <Skeleton className="w-40 h-5 rounded" />
            <Skeleton className="w-24 h-7 rounded-lg" />
          </div>
          <Skeleton className="w-full flex-1 min-h-[220px] rounded-xl" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Skeleton className="w-full h-12 rounded-lg" />
            <Skeleton className="w-full h-12 rounded-lg" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </div>
  )
}

export const WorkspaceSkeleton: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col gap-5 p-4 sm:p-6 overflow-hidden animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="w-36 h-6 rounded" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-20 h-8 rounded-lg" />
          <Skeleton className="w-24 h-8 rounded-lg" />
        </div>
      </div>

      {/* Content Feed Rows */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-zinc-950/40 border border-white/5 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <Skeleton className="w-1/3 h-4 rounded" />
                <Skeleton className="w-3/4 h-3 rounded" />
              </div>
            </div>
            <Skeleton className="w-16 h-5 rounded-full shrink-0" />
            <Skeleton className="w-20 h-4 rounded shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

export const ModuleViewSkeleton: React.FC<{ title?: string }> = ({ title = 'Loading Module Data' }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-2xl gap-6">
      <div className="relative flex items-center justify-center">
        <Skeleton className="w-16 h-16 rounded-2xl" />
        <div className="absolute inset-0 rounded-2xl border border-emerald-500/20 animate-ping pointer-events-none" />
      </div>

      <div className="flex flex-col items-center gap-2 max-w-sm text-center">
        <div className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">{title}</div>
        <p className="text-xs text-zinc-500">Retrieving system states & neural weight cache...</p>
      </div>

      <div className="w-64 max-w-full flex flex-col gap-2">
        <Skeleton className="w-full h-2 rounded-full" />
        <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
          <span>INITIALIZING</span>
          <span>SYNCING</span>
        </div>
      </div>
    </div>
  )
}

export default Skeleton
