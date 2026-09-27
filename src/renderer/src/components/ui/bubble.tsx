import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const bubbleVariants = cva(
  'relative inline-block max-w-prose rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-emerald-600 text-white font-normal shadow-sm border border-emerald-500/30 selection:bg-emerald-900',
        muted:
          'bg-zinc-800/90 text-zinc-100 border border-white/10 shadow-sm backdrop-blur-md',
        accent:
          'bg-[#00ff41]/15 text-emerald-300 border border-[#00ff41]/30 shadow-[0_0_15px_rgba(0,255,65,0.15)]',
        outline:
          'bg-transparent border border-white/15 text-zinc-200 hover:border-white/25',
        secondary:
          'bg-zinc-900/90 text-zinc-300 border border-zinc-700/50'
      },
      size: {
        sm: 'px-3 py-1.5 text-xs rounded-xl',
        default: 'px-4 py-2.5 text-sm rounded-2xl',
        lg: 'px-5 py-3 text-base rounded-3xl'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface BubbleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bubbleVariants> {
  className?: string
}

export const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(bubbleVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Bubble.displayName = 'Bubble'

export interface BubbleContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const BubbleContent = React.forwardRef<
  HTMLDivElement,
  BubbleContentProps
>(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('break-words', className)} {...props}>
      {children}
    </div>
  )
})
BubbleContent.displayName = 'BubbleContent'

export interface BubbleGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const BubbleGroup = React.forwardRef<HTMLDivElement, BubbleGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-1.5', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
BubbleGroup.displayName = 'BubbleGroup'

export interface BubbleReactionsProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const BubbleReactions = React.forwardRef<
  HTMLDivElement,
  BubbleReactionsProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'absolute -bottom-2.5 right-2 flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 px-2 py-0.5 text-xs shadow-md backdrop-blur-sm select-none',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
BubbleReactions.displayName = 'BubbleReactions'
