import * as React from 'react'
import { cn } from '@/lib/utils'

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end' | 'center'
  className?: string
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ align = 'start', className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex w-full items-end gap-2.5',
          align === 'end' ? 'flex-row-reverse justify-start' : 'flex-row justify-start',
          align === 'center' && 'justify-center',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Message.displayName = 'Message'

export interface MessageAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const MessageAvatar = React.forwardRef<
  HTMLDivElement,
  MessageAvatarProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex shrink-0 items-center justify-center select-none', className)}
      {...props}
    >
      {children}
    </div>
  )
})
MessageAvatar.displayName = 'MessageAvatar'

export interface MessageContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const MessageContent = React.forwardRef<
  HTMLDivElement,
  MessageContentProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex max-w-[80%] flex-col gap-1', className)}
      {...props}
    >
      {children}
    </div>
  )
})
MessageContent.displayName = 'MessageContent'

export interface MessageFooterProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export const MessageFooter = React.forwardRef<
  HTMLDivElement,
  MessageFooterProps
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'px-1 text-[11px] text-zinc-500 select-none font-medium',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
MessageFooter.displayName = 'MessageFooter'
