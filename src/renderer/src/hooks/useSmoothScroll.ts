/**
 * useSmoothScroll Hook
 * Provides smooth scrolling functionality with customizable easing and duration.
 */

import { useCallback, useRef, useEffect } from 'react'

// ============================================================================
// Easing Functions
// ============================================================================

type EasingFunction = (t: number) => number

// Linear easing - no easing
const linear: EasingFunction = (t) => t

// Ease out - decelerating
const easeOut: EasingFunction = (t) => 1 - Math.pow(1 - t, 3)

// Ease in - accelerating
const easeIn: EasingFunction = (t) => t * t * t

// Ease in out - accelerating then decelerating
const easeInOut: EasingFunction = (t) => 
  t < 0.5 ? 2 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// Ease out back - slight bounce at the end
const easeOutBack: EasingFunction = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// Ease in elastic - elastic bounce at the start
const easeInElastic: EasingFunction = (t) => {
  const c5 = (2 * Math.PI) / 4.5
  return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c5)
}

// Ease out elastic - elastic bounce at the end
const easeOutElastic: EasingFunction = (t) => {
  const c5 = (2 * Math.PI) / 4.5
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c5) + 1
}

// Ease out bounce - bounce at the end
const easeOutBounce: EasingFunction = (t) => {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t
  } else if (t < 2 / 2.75) {
    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
  } else if (t < 2.5 / 2.75) {
    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
  } else {
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
  }
}

// Ease in out circular - circular easing
const easeInOutCircular: EasingFunction = (t) => {
  if (t < 0.5) {
    return (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
  }
  return (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2
}

// Ease out circular - circular easing out
const easeOutCircular: EasingFunction = (t) => {
  return Math.sqrt(1 - Math.pow(t - 1, 2))
}

// Ease in sine - sine easing in
const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2)

// Ease out sine - sine easing out
const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2)

// Ease in out sine - sine easing in and out
const easeInOutSine: EasingFunction = (t) => -(Math.cos(t * Math.PI) - 1) / 2

// ============================================================================
// Easing Presets
// ============================================================================

export const EASING_FUNCTIONS = {
  linear,
  easeOut,
  easeIn,
  easeInOut,
  easeOutBack,
  easeInElastic,
  easeOutElastic,
  easeOutBounce,
  easeInOutCircular,
  easeOutCircular,
  easeInSine,
  easeOutSine,
  easeInOutSine
} as const

export type EasingType = keyof typeof EASING_FUNCTIONS

// ============================================================================
// Scroll Options
// ============================================================================

interface ScrollOptions {
  duration?: number
  easing?: EasingType | EasingFunction
  offset?: number
  onStart?: () => void
  onComplete?: () => void
  onUpdate?: (progress: number, position: number) => void
}

interface ScrollToOptions extends ScrollOptions {
  behavior?: 'smooth' | 'auto'
}

// ============================================================================
// Hook Implementation
// ============================================================================

interface UseSmoothScrollReturn {
  scrollTo: (
    target: HTMLElement | string | number,
    options?: ScrollToOptions
  ) => void
  scrollToTop: (options?: ScrollOptions) => void
  scrollToBottom: (options?: ScrollOptions) => void
  scrollBy: (amount: number, options?: ScrollOptions) => void
  scrollIntoView: (
    target: HTMLElement,
    options?: ScrollOptions & { align?: 'top' | 'center' | 'bottom' }
  ) => void
  getScrollPosition: () => { x: number; y: number }
  getScrollProgress: (element?: HTMLElement) => number
}

export function useSmoothScroll(): UseSmoothScrollReturn {
  const scrollRequests = useRef<Map<number, boolean>>(new Map())
  const requestId = useRef(0)

  // Resolve element from string selector or number (offset)
  const resolveTarget = useCallback((
    target: HTMLElement | string | number
  ): { element: HTMLElement | null; offset: number } => {
    if (typeof target === 'number') {
      return { element: null, offset: target }
    }
    
    if (typeof target === 'string') {
      const element = document.querySelector(target) as HTMLElement
      return { element, offset: 0 }
    }
    
    return { element: target as HTMLElement, offset: 0 }
  }, [])

  // Get easing function
  const getEasingFunction = useCallback((easing?: EasingType | EasingFunction): EasingFunction => {
    if (!easing) return easeOut
    if (typeof easing === 'function') return easing
    return EASING_FUNCTIONS[easing] || easeOut
  }, [])

  // Main scroll animation
  const animateScroll = useCallback((
    start: number,
    end: number,
    duration: number,
    easingFn: EasingFunction,
    onStart?: () => void,
    onComplete?: () => void,
    onUpdate?: (progress: number, position: number) => void
  ) => {
    const startTime = performance.now()
    const distance = end - start

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easingFn(progress)
      const position = start + distance * easedProgress

      window.scrollTo(0, position)

      if (onUpdate) {
        onUpdate(progress, position)
      }

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else if (onComplete) {
        onComplete()
      }
    }

    if (onStart) onStart()
    requestAnimationFrame(animate)
  }, [])

  // Scroll to specific position or element
  const scrollTo = useCallback((
    target: HTMLElement | string | number,
    options: ScrollToOptions = {}
  ) => {
    const {
      duration = 300,
      easing = 'easeOut',
      offset = 0,
      onStart,
      onComplete,
      onUpdate,
      behavior
    } = options

    // Use native smooth scroll if requested
    if (behavior === 'smooth' || behavior === 'auto') {
      const resolved = resolveTarget(target)
      if (resolved.element) {
        resolved.element.scrollIntoView({ behavior: 'smooth' })
        if (onComplete) onComplete()
        return
      } else {
        window.scrollTo({ top: resolved.offset, behavior: 'smooth' })
        if (onComplete) onComplete()
        return
      }
    }

    const resolved = resolveTarget(target)
    const start = window.pageYOffset
    let end: number

    if (resolved.element) {
      const rect = resolved.element.getBoundingClientRect()
      end = window.pageYOffset + rect.top + offset
    } else {
      end = resolved.offset
    }

    const easingFn = getEasingFunction(easing)
    animateScroll(start, end, duration, easingFn, onStart, onComplete, onUpdate)
  }, [resolveTarget, getEasingFunction, animateScroll])

  // Scroll to top
  const scrollToTop = useCallback((options: ScrollOptions = {}) => {
    const {
      duration = 300,
      easing = 'easeOut',
      onStart,
      onComplete,
      onUpdate
    } = options

    const start = window.pageYOffset
    const end = 0
    const easingFn = getEasingFunction(easing)
    animateScroll(start, end, duration, easingFn, onStart, onComplete, onUpdate)
  }, [getEasingFunction, animateScroll])

  // Scroll to bottom
  const scrollToBottom = useCallback((options: ScrollOptions = {}) => {
    const {
      duration = 300,
      easing = 'easeOut',
      onStart,
      onComplete,
      onUpdate
    } = options

    const start = window.pageYOffset
    const end = document.body.scrollHeight - window.innerHeight
    const easingFn = getEasingFunction(easing)
    animateScroll(start, end, duration, easingFn, onStart, onComplete, onUpdate)
  }, [getEasingFunction, animateScroll])

  // Scroll by amount
  const scrollBy = useCallback((
    amount: number,
    options: ScrollOptions = {}
  ) => {
    const {
      duration = 300,
      easing = 'easeOut',
      onStart,
      onComplete,
      onUpdate
    } = options

    const start = window.pageYOffset
    const end = start + amount
    const easingFn = getEasingFunction(easing)
    animateScroll(start, end, duration, easingFn, onStart, onComplete, onUpdate)
  }, [getEasingFunction, animateScroll])

  // Scroll element into view
  const scrollIntoView = useCallback((
    target: HTMLElement,
    options: ScrollOptions & { align?: 'top' | 'center' | 'bottom' } = {}
  ) => {
    const {
      duration = 300,
      easing = 'easeOut',
      offset = 0,
      align = 'top',
      onStart,
      onComplete,
      onUpdate
    } = options

    const start = window.pageYOffset
    const rect = target.getBoundingClientRect()
    let end: number

    switch (align) {
      case 'center':
        end = window.pageYOffset + rect.top - window.innerHeight / 2 + rect.height / 2 + offset
        break
      case 'bottom':
        end = window.pageYOffset + rect.bottom - window.innerHeight + offset
        break
      case 'top':
      default:
        end = window.pageYOffset + rect.top + offset
        break
    }

    const easingFn = getEasingFunction(easing)
    animateScroll(start, end, duration, easingFn, onStart, onComplete, onUpdate)
  }, [getEasingFunction, animateScroll])

  // Get current scroll position
  const getScrollPosition = useCallback(() => {
    return {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }, [])

  // Get scroll progress (0-1) for an element or the page
  const getScrollProgress = useCallback((element?: HTMLElement): number => {
    if (element) {
      const rect = element.getBoundingClientRect()
      const elementTop = rect.top + window.pageYOffset
      const elementBottom = elementTop + rect.height
      const viewportHeight = window.innerHeight
      const scrollTop = window.pageYOffset
      const docHeight = document.body.scrollHeight

      const visibleStart = scrollTop
      const visibleEnd = scrollTop + viewportHeight

      // Calculate how much of the element is visible
      const elementVisibleTop = Math.max(elementTop, visibleStart)
      const elementVisibleBottom = Math.min(elementBottom, visibleEnd)
      const visibleHeight = elementVisibleBottom - elementVisibleTop

      return Math.min(visibleHeight / rect.height, 1)
    }

    // Page scroll progress
    const scrollTop = window.pageYOffset
    const docHeight = document.body.scrollHeight - window.innerHeight
    return Math.min(scrollTop / docHeight, 1)
  }, [])

  return {
    scrollTo,
    scrollToTop,
    scrollToBottom,
    scrollBy,
    scrollIntoView,
    getScrollPosition,
    getScrollProgress
  }
}

// ============================================================================
// Smooth Scroll To Top Component
// ============================================================================

interface ScrollToTopProps {
  duration?: number
  easing?: EasingType
  offset?: number
  className?: string
  children?: React.ReactNode
  onClick?: () => void
}

export function ScrollToTopButton({
  duration = 300,
  easing = 'easeOut',
  offset = 0,
  className = '',
  children,
  onClick
}: ScrollToTopProps) {
  const { scrollToTop } = useSmoothScroll()

  const handleClick = () => {
    scrollToTop({ duration, easing, offset })
    if (onClick) onClick()
  }

  return (
    <button onClick={handleClick} className={className}>
      {children || 'Scroll to Top'}
    </button>
  )
}

// ============================================================================
// Auto Hide Scroll To Top Button
// ============================================================================

interface AutoScrollToTopProps extends Omit<ScrollToTopProps, 'onClick'> {
  threshold?: number
}

export function AutoScrollToTopButton({
  threshold = 100,
  ...props
}: AutoScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false)
  const { scrollToTop, getScrollPosition } = useSmoothScroll()

  useEffect(() => {
    const handleScroll = () => {
      const { y } = getScrollPosition()
      setIsVisible(y > threshold)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [getScrollPosition, threshold])

  if (!isVisible) return null

  return (
    <ScrollToTopButton {...props} onClick={() => scrollToTop()} />
  )
}

// ============================================================================
// Export Types
// ============================================================================

export { EASING_FUNCTIONS }
export type { EasingFunction, EasingType, ScrollOptions, ScrollToOptions }
