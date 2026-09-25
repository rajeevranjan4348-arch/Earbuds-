/**
 * useSmoothTransitions Hook
 * Provides smooth page/route transitions for Iris application.
 * Integrates with React Router and Framer Motion for seamless navigation.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, Variants, Transition } from 'framer-motion'

// ============================================================================
// Transition Types
// ============================================================================

export type TransitionType = 
  | 'fade'
  | 'slide'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'scale'
  | 'scaleFade'
  | 'crossfade'
  | 'zoom'
  | 'flip'

export type TransitionDirection = 'forward' | 'backward' | 'neutral'

interface TransitionConfig {
  type: TransitionType
  duration: number
  ease: [number, number, number, number] | string
  direction?: TransitionDirection
}

// ============================================================================
// Transition Presets
// ============================================================================

const TRANSITION_PRESETS: Record<TransitionType, TransitionConfig> = {
  fade: {
    type: 'fade',
    duration: 0.2,
    ease: [0.25, 0.1, 0.25, 1]
  },
  slide: {
    type: 'slide',
    duration: 0.3,
    ease: [0.16, 1, 0.3, 1]
  },
  slideLeft: {
    type: 'slideLeft',
    duration: 0.3,
    ease: [0.16, 1, 0.3, 1]
  },
  slideRight: {
    type: 'slideRight',
    duration: 0.3,
    ease: [0.16, 1, 0.3, 1]
  },
  slideUp: {
    type: 'slideUp',
    duration: 0.3,
    ease: [0.16, 1, 0.3, 1]
  },
  slideDown: {
    type: 'slideDown',
    duration: 0.3,
    ease: [0.16, 1, 0.3, 1]
  },
  scale: {
    type: 'scale',
    duration: 0.25,
    ease: [0.25, 0.1, 0.25, 1]
  },
  scaleFade: {
    type: 'scaleFade',
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1]
  },
  crossfade: {
    type: 'crossfade',
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1]
  },
  zoom: {
    type: 'zoom',
    duration: 0.35,
    ease: [0.7, 0, 0.84, 0]
  },
  flip: {
    type: 'flip',
    duration: 0.4,
    ease: [0.16, 1, 0.3, 1]
  }
}

// ============================================================================
// Transition Variants
// ============================================================================

const getTransitionVariants = (
  type: TransitionType,
  direction: TransitionDirection = 'neutral'
): { enter: Variants; exit: Variants; shared?: Variants } => {
  const isForward = direction === 'forward'
  const isBackward = direction === 'backward'

  switch (type) {
    case 'fade':
      return {
        enter: { opacity: 1 },
        exit: { opacity: 0 }
      }

    case 'slide':
    case 'slideLeft':
      return {
        enter: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: isForward ? -100 : 100 }
      }

    case 'slideRight':
      return {
        enter: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: isForward ? 100 : -100 }
      }

    case 'slideUp':
      return {
        enter: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: isForward ? -100 : 100 }
      }

    case 'slideDown':
      return {
        enter: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: isForward ? 100 : -100 }
      }

    case 'scale':
      return {
        enter: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 }
      }

    case 'scaleFade':
      return {
        enter: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.9 }
      }

    case 'crossfade':
      return {
        enter: { opacity: 1 },
        exit: { opacity: 0 },
        shared: { opacity: 1 }
      }

    case 'zoom':
      return {
        enter: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.1 }
      }

    case 'flip':
      return {
        enter: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: isForward ? -180 : 180 }
      }

    default:
      return {
        enter: { opacity: 1 },
        exit: { opacity: 0 }
      }
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

interface UseSmoothTransitionsOptions {
  initialType?: TransitionType
  initialDirection?: TransitionDirection
}

interface UseSmoothTransitionsReturn {
  transitionType: TransitionType
  setTransitionType: (type: TransitionType) => void
  transitionDirection: TransitionDirection
  setTransitionDirection: (direction: TransitionDirection) => void
  getTransition: (overrides?: Partial<Transition>) => Transition
  pageTransition: (
    type?: TransitionType,
    direction?: TransitionDirection,
    duration?: number
  ) => {
    initial: string
    animate: string
    exit: string
    transition: Transition
    variants: Variants
  }
  createTransitionComponent: <T>(
    Component: React.ComponentType<T>,
    type?: TransitionType,
    direction?: TransitionDirection
  ) => React.ComponentType<T>
}

export function useSmoothTransitions(options: UseSmoothTransitionsOptions = {}): UseSmoothTransitionsReturn {
  const { 
    initialType = 'fade', 
    initialDirection = 'neutral' 
  } = options
  
  const [transitionType, setTransitionType] = useState<TransitionType>(initialType)
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>(initialDirection)
  const transitionHistory = useRef<TransitionDirection[]>([])

  // Track navigation history for direction detection
  const pushDirection = useCallback((direction: TransitionDirection) => {
    transitionHistory.current.push(direction)
    if (transitionHistory.current.length > 10) {
      transitionHistory.current.shift()
    }
  }, [])

  // Get transition configuration
  const getTransition = useCallback((overrides?: Partial<Transition>): Transition => {
    const config = TRANSITION_PRESETS[transitionType] || TRANSITION_PRESETS.fade
    return {
      duration: overrides?.duration ?? config.duration,
      ease: overrides?.ease ?? config.ease,
      ...overrides
    }
  }, [transitionType])

  // Create page transition props
  const pageTransition = useCallback((
    type: TransitionType = transitionType,
    direction: TransitionDirection = transitionDirection,
    duration?: number
  ) => {
    const variants = getTransitionVariants(type, direction)
    
    return {
      initial: 'exit',
      animate: 'enter',
      exit: 'exit',
      transition: {
        ...getTransition({ duration }),
        // Ensure smooth transitions
        type: 'tween' as const
      },
      variants: variants.enter
    }
  }, [transitionType, transitionDirection, getTransition])

  // Create a transition-enabled component wrapper
  const createTransitionComponent = useCallback(<T>(
    Component: React.ComponentType<T>,
    type: TransitionType = transitionType,
    direction: TransitionDirection = transitionDirection
  ): React.ComponentType<T> => {
    const WrappedComponent: React.ComponentType<T> = (props: T) => {
      const transitionProps = pageTransition(type, direction)
      
      return (
        <motion.div
          key={JSON.stringify(props)}
          {...transitionProps}
        >
          <Component {...props} />
        </motion.div>
      )
    }
    
    WrappedComponent.displayName = `Transitional(${Component.displayName || Component.name || 'Component'})`
    
    return WrappedComponent
  }, [pageTransition, transitionType, transitionDirection])

  return {
    transitionType,
    setTransitionType,
    transitionDirection,
    setTransitionDirection: (direction: TransitionDirection) => {
      pushDirection(direction)
      setTransitionDirection(direction)
    },
    getTransition,
    pageTransition,
    createTransitionComponent
  }
}

// ============================================================================
// Transition Context for Global State
// ============================================================================

import { createContext, useContext } from 'react'

interface TransitionContextType {
  transitionType: TransitionType
  setTransitionType: (type: TransitionType) => void
  transitionDirection: TransitionDirection
  setTransitionDirection: (direction: TransitionDirection) => void
}

const TransitionContext = createContext<TransitionContextType | null>(null)

export interface TransitionProviderProps {
  children: React.ReactNode
  defaultType?: TransitionType
}

export function TransitionProvider({ 
  children, 
  defaultType = 'fade' 
}: TransitionProviderProps) {
  const [transitionType, setTransitionType] = useState<TransitionType>(defaultType)
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>('neutral')

  return (
    <TransitionContext.Provider value={{
      transitionType,
      setTransitionType,
      transitionDirection,
      setTransitionDirection
    }}>
      {children}
    </TransitionContext.Provider>
  )
}

export function useTransitionContext(): TransitionContextType {
  const context = useContext(TransitionContext)
  if (!context) {
    throw new Error('useTransitionContext must be used within a TransitionProvider')
  }
  return context
}

// ============================================================================
// Pre-built Transition Components
// ============================================================================

export function FadeTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

export function SlideTransition({ 
  children, 
  direction = 'right' 
}: { 
  children: React.ReactNode 
  direction?: 'left' | 'right' | 'up' | 'down' 
}) {
  const variants = {
    left: { initial: { x: -100, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 100, opacity: 0 } },
    right: { initial: { x: 100, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -100, opacity: 0 } },
    up: { initial: { y: 100, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -100, opacity: 0 } },
    down: { initial: { y: -100, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 100, opacity: 0 } }
  }

  return (
    <motion.div
      initial={variants[direction || 'right'].initial}
      animate={variants[direction || 'right'].animate}
      exit={variants[direction || 'right'].exit}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function ScaleTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  )
}

export function ZoomTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.35, ease: [0.7, 0, 0.84, 0] }}
    >
      {children}
    </motion.div>
  )
}

// ============================================================================
// Smooth Route Transition Component
// ============================================================================

interface RouteTransitionProps {
  children: React.ReactNode
  type?: TransitionType
  direction?: TransitionDirection
  key?: string
}

export function RouteTransition({
  children,
  type = 'fade',
  direction = 'neutral',
  key
}: RouteTransitionProps) {
  const variants = getTransitionVariants(type, direction)

  return (
    <motion.div
      key={key || type + direction}
      initial="exit"
      animate="enter"
      exit="exit"
      variants={variants.enter}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ============================================================================
// Export Types
// ============================================================================

export type { Variants, Transition }
