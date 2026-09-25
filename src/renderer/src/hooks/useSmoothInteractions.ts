/**
 * useSmoothInteractions Hook
 * Provides smooth, polished interactions for UI elements.
 * Handles hover, focus, tap, and loading states with smooth transitions.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, Variants, Transition, HTMLMotionProps } from 'framer-motion'

// ============================================================================
// Interaction State Types
// ============================================================================

export type InteractionState = 
  | 'idle'
  | 'hover'
  | 'focus'
  | 'active'
  | 'loading'
  | 'success'
  | 'error'
  | 'disabled'

export type InteractionEvent = 
  | 'hoverStart'
  | 'hoverEnd'
  | 'focusStart'
  | 'focusEnd'
  | 'tapStart'
  | 'tapEnd'
  | 'loadingStart'
  | 'loadingEnd'
  | 'success'
  | 'error'
  | 'disable'
  | 'enable'

// ============================================================================
// Interaction Animation Presets
// ============================================================================

const buttonVariants: Variants = {
  idle: { scale: 1, opacity: 1 },
  hover: { scale: 1.02, opacity: 1 },
  focus: { scale: 1.01, boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.3)' },
  active: { scale: 0.98, opacity: 0.9 },
  loading: { scale: 0.98, opacity: 0.7 },
  success: { scale: 1.02, opacity: 1 },
  error: { scale: 1, opacity: 1 },
  disabled: { scale: 1, opacity: 0.5, cursor: 'not-allowed' }
}

const cardVariants: Variants = {
  idle: { scale: 1, y: 0, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' },
  hover: { scale: 1.01, y: -2, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.15)' },
  focus: { scale: 1.01, y: -2, boxShadow: '0 10px 20px -5px rgba(16, 185, 129, 0.2)' },
  active: { scale: 0.99, y: 0, boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)' },
  loading: { scale: 1, y: 0, opacity: 0.8 },
  success: { scale: 1.02, y: -4, boxShadow: '0 12px 20px -5px rgba(16, 185, 129, 0.3)' },
  error: { scale: 1, y: 0, boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)' },
  disabled: { scale: 1, y: 0, opacity: 0.5, cursor: 'not-allowed' }
}

const inputVariants: Variants = {
  idle: { scale: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  hover: { scale: 1, borderColor: 'rgba(255, 255, 255, 0.2)' },
  focus: { scale: 1.01, borderColor: 'rgba(16, 185, 129, 0.5)', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.1)' },
  active: { scale: 0.995 },
  loading: { scale: 1, opacity: 0.7 },
  success: { scale: 1, borderColor: 'rgba(16, 185, 129, 0.5)' },
  error: { scale: 1, borderColor: 'rgba(239, 68, 68, 0.5)' },
  disabled: { scale: 1, opacity: 0.5, cursor: 'not-allowed' }
}

const iconVariants: Variants = {
  idle: { scale: 1, rotate: 0 },
  hover: { scale: 1.1, rotate: 0 },
  focus: { scale: 1.15, rotate: 0 },
  active: { scale: 0.95, rotate: 0 },
  loading: { scale: 1, rotate: 360, transition: { duration: 1, repeat: Infinity, ease: 'linear' } },
  success: { scale: 1.2, rotate: 0 },
  error: { scale: 1, rotate: 0 },
  disabled: { scale: 1, opacity: 0.5, cursor: 'not-allowed' }
}

const loadingVariants: Variants = {
  idle: { opacity: 0, scale: 0.8 },
  loading: { 
    opacity: [0.5, 1, 0.5], 
    scale: [0.8, 1, 0.8],
    transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' }
  }
}

const progressVariants: Variants = {
  idle: { scaleX: 0 },
  loading: { scaleX: [0.3, 0.6, 0.3], transition: { duration: 1.5, repeat: Infinity } },
  complete: { scaleX: 1 }
}

// ============================================================================
// Transition Configurations
// ============================================================================

const TRANSITIONS: Record<string, Transition> = {
  fast: { duration: 0.1, ease: [0.25, 0.1, 0.25, 1] },
  normal: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
  smooth: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  slow: { duration: 0.4, ease: [0.7, 0, 0.84, 0] },
  spring: { type: 'spring' as const, stiffness: 400, damping: 25 },
  bounce: { type: 'spring' as const, stiffness: 300, damping: 15 },
  elastic: { type: 'spring' as const, stiffness: 200, damping: 10 }
}

// ============================================================================
// Hook Implementation
// ============================================================================

interface UseSmoothInteractionsOptions {
  variantType?: 'button' | 'card' | 'input' | 'icon' | 'custom'
  customVariants?: Variants
  initialState?: InteractionState
  transitionType?: keyof typeof TRANSITIONS
}

interface UseSmoothInteractionsReturn {
  state: InteractionState
  variants: Variants
  transition: Transition
  motionProps: HTMLMotionProps<'div'>
  isIdle: boolean
  isHovered: boolean
  isFocused: boolean
  isActive: boolean
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  isDisabled: boolean
  handleHoverStart: () => void
  handleHoverEnd: () => void
  handleFocusStart: () => void
  handleFocusEnd: () => void
  handleTapStart: () => void
  handleTapEnd: () => void
  startLoading: () => void
  stopLoading: () => void
  showSuccess: () => void
  showError: () => void
  disable: () => void
  enable: () => void
  reset: () => void
}

export function useSmoothInteractions(options: UseSmoothInteractionsOptions = {}): UseSmoothInteractionsReturn {
  const {
    variantType = 'button',
    customVariants,
    initialState = 'idle',
    transitionType = 'normal'
  } = options

  const [state, setState] = useState<InteractionState>(initialState)
  const transitionRef = useRef<Transition>(TRANSITIONS[transitionType])

  // Get variants based on type
  const getVariants = useCallback((): Variants => {
    switch (variantType) {
      case 'button': return buttonVariants
      case 'card': return cardVariants
      case 'input': return inputVariants
      case 'icon': return iconVariants
      case 'custom': return customVariants || {}
      default: return buttonVariants
    }
  }, [variantType, customVariants])

  // Get current transition
  const transition = useMemo(() => {
    return TRANSITIONS[transitionType] || TRANSITIONS.normal
  }, [transitionType])

  // State getters
  const isIdle = state === 'idle'
  const isHovered = state === 'hover'
  const isFocused = state === 'focus'
  const isActive = state === 'active'
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  const isError = state === 'error'
  const isDisabled = state === 'disabled'

  // State setters
  const handleHoverStart = useCallback(() => {
    if (!isDisabled && !isLoading) setState('hover')
  }, [isDisabled, isLoading])

  const handleHoverEnd = useCallback(() => {
    if (!isDisabled && !isLoading && !isActive && !isFocused) setState('idle')
  }, [isDisabled, isLoading, isActive, isFocused])

  const handleFocusStart = useCallback(() => {
    if (!isDisabled && !isLoading) setState('focus')
  }, [isDisabled, isLoading])

  const handleFocusEnd = useCallback(() => {
    if (!isDisabled && !isLoading && !isActive && !isHovered) setState('idle')
  }, [isDisabled, isLoading, isActive, isHovered])

  const handleTapStart = useCallback(() => {
    if (!isDisabled && !isLoading) setState('active')
  }, [isDisabled, isLoading])

  const handleTapEnd = useCallback(() => {
    if (!isDisabled && !isLoading) setState('hover')
  }, [isDisabled, isLoading])

  const startLoading = useCallback(() => {
    if (!isDisabled) setState('loading')
  }, [isDisabled])

  const stopLoading = useCallback(() => {
    if (!isDisabled) setState('idle')
  }, [isDisabled])

  const showSuccess = useCallback(() => {
    if (!isDisabled) setState('success')
  }, [isDisabled])

  const showError = useCallback(() => {
    if (!isDisabled) setState('error')
  }, [isDisabled])

  const disable = useCallback(() => {
    setState('disabled')
  }, [])

  const enable = useCallback(() => {
    setState('idle')
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
  }, [initialState])

  // Motion props
  const motionProps: HTMLMotionProps<'div'> = {
    variants: getVariants(),
    initial: initialState,
    animate: state,
    transition,
    whileHover: isHovered ? 'hover' : undefined,
    whileFocus: isFocused ? 'focus' : undefined,
    whileTap: isActive ? 'active' : undefined
  }

  return {
    state,
    variants: getVariants(),
    transition,
    motionProps,
    isIdle,
    isHovered,
    isFocused,
    isActive,
    isLoading,
    isSuccess,
    isError,
    isDisabled,
    handleHoverStart,
    handleHoverEnd,
    handleFocusStart,
    handleFocusEnd,
    handleTapStart,
    handleTapEnd,
    startLoading,
    stopLoading,
    showSuccess,
    showError,
    disable,
    enable,
    reset
  }
}

// ============================================================================
// Pre-built Interactive Components
// ============================================================================

interface SmoothButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  onClick?: () => void | Promise<void>
}

export function SmoothButton({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  onClick,
  disabled,
  className = '',
  ...props
}: SmoothButtonProps) {
  const {
    state,
    motionProps,
    startLoading,
    stopLoading,
    isLoading: internalLoading
  } = useSmoothInteractions({ variantType: 'button' })

  const [internalIsLoading, setInternalIsLoading] = useState(false)
  const loadingState = isLoading || internalIsLoading

  const handleClick = async (e: React.MouseEvent) => {
    if (disabled || loadingState) return
    
    if (onClick) {
      setInternalIsLoading(true)
      startLoading()
      try {
        await onClick()
      } finally {
        setInternalIsLoading(false)
        stopLoading()
      }
    }
    props.onClick?.(e)
  }

  const getVariantClasses = () => {
    const base = 'flex items-center justify-center gap-2 rounded-lg font-medium transition-colors'
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg'
    }
    const variants = {
      primary: 'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700',
      secondary: 'bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700',
      ghost: 'bg-transparent text-zinc-200 hover:bg-zinc-800/50 active:bg-zinc-800/80'
    }
    
    return `${base} ${sizes[size]} ${variants[variant]} ${className}`
  }

  return (
    <motion.button
      {...motionProps}
      className={getVariantClasses()}
      onClick={handleClick}
      disabled={disabled || loadingState}
      {...props}
    >
      {loadingState ? (
        <motion.div
          variants={loadingVariants}
          initial="idle"
          animate="loading"
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
        />
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  )
}

interface SmoothCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hoverable' | 'interactive'
  onClick?: () => void
}

export function SmoothCard({
  children,
  variant = 'default',
  onClick,
  className = '',
  ...props
}: SmoothCardProps) {
  const { motionProps } = useSmoothInteractions({ variantType: 'card' })

  const handleClick = () => {
    if (onClick && variant === 'interactive') {
      onClick()
    }
  }

  const getVariantClasses = () => {
    const base = 'rounded-xl bg-zinc-900/50 border border-white/5 transition-colors'
    const variants = {
      default: 'cursor-default',
      hoverable: 'cursor-pointer hover:border-white/10',
      interactive: 'cursor-pointer hover:border-emerald-500/30 active:bg-zinc-800/50'
    }
    
    return `${base} ${variants[variant]} ${className}`
  }

  if (variant === 'interactive') {
    return (
      <motion.div
        {...motionProps}
        className={getVariantClasses()}
        onClick={handleClick}
        {...props}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      {...motionProps}
      className={getVariantClasses()}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// ============================================================================
// Loading States
// ============================================================================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-3',
    lg: 'w-8 h-8 border-4'
  }

  return (
    <motion.div
      variants={loadingVariants}
      initial="idle"
      animate="loading"
      className={`${sizes[size]} border-current border-t-transparent rounded-full ${className}`}
    />
  )
}

interface ProgressBarProps {
  progress?: number
  indeterminate?: boolean
  className?: string
}

export function ProgressBar({ progress, indeterminate = false, className = '' }: ProgressBarProps) {
  const [internalProgress, setInternalProgress] = useState(0)

  useEffect(() => {
    if (indeterminate) {
      const interval = setInterval(() => {
        setInternalProgress(prev => (prev >= 100 ? 0 : prev + 10))
      }, 200)
      return () => clearInterval(interval)
    }
  }, [indeterminate])

  const displayProgress = progress !== undefined ? progress : internalProgress

  return (
    <motion.div
      className={`w-full h-1 bg-zinc-800 rounded-full overflow-hidden ${className}`}
    >
      <motion.div
        className="h-full bg-emerald-500"
        initial={{ width: 0 }}
        animate={{ width: `${displayProgress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </motion.div>
  )
}

// ============================================================================
// Export Types
// ============================================================================

export type { Variants, Transition }
export { TRANSITIONS, buttonVariants, cardVariants, inputVariants, iconVariants }
