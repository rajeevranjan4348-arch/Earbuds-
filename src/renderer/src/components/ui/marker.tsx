import * as React from 'react'
import { cn } from '@/lib/utils'

export interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  role?: string
}

export const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
  ({ className, role = 'status', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role={role}
        aria-live="polite"
        className={cn('flex w-full items-center justify-center my-2', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Marker.displayName = 'Marker'

export interface MarkerContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const MarkerContent = React.forwardRef<
  HTMLDivElement,
  MarkerContentProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 backdrop-blur-md transition-all',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
MarkerContent.displayName = 'MarkerContent'
