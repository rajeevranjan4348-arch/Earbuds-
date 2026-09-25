/**
 * useSmoothAnimations Hook
 * Provides smooth, polished animations for Iris UI elements.
 * Integrates with Framer Motion for fluid transitions.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, Variants, Transition, HTMLMotionProps } from 'framer-motion'

// ============================================================================
// Animation Presets
// ============================================================================

export type SmoothMode = 'instant' | 'smooth' | 'natural' | 'cinematic'

export interface SmoothConfig {
  mode: SmoothMode
  duration: number
  delay: number
  ease: [number, number, number, number] | string
}

// Smooth mode configurations
const SMOOTH_MODES: Record<SmoothMode, SmoothConfig> = {
  instant: {
    mode: 'instant',
    duration: 0,
    delay: 0,
    ease: [0, 0, 1, 1]
  },
  smooth: {
    mode: 'smooth',
    duration: 0.2,
    delay: 0,
    ease: [0.25, 0.1, 0.25, 1]
  },
  natural: {
    mode: 'natural',
    duration: 0.3,
    delay: 0.05,
    ease: [0.16, 1, 0.3, 1]
  },
  cinematic: {
    mode: 'cinematic',
    duration: 0.5,
    delay: 0.1,
    ease: [0.7, 0, 0.84, 0]
  }
}

// ============================================================================
// Animation Variants
// ============================================================================

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 }
}

export const slideUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

export const slideDownVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 }
}

export const slideLeftVariants: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 }
}

export const slideRightVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 }
}

export const scaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 }
}

export const scaleUpVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 }
}

export const bounceVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
}

export const pulseVariants: Variants = {
  normal: { scale: 1 },
  pulse: { scale: [1, 1.05, 1], opacity: [1, 0.9, 1] }
}

export const shakeVariants: Variants = {
  normal: { x: 0 },
  shake: { 
    x: [0, -5, 5, -5, 5, 0],
    transition: { duration: 0.3 }
  }
}

export const rippleVariants: Variants = {
  normal: { scale: 1 },
  ripple: { 
    scale: [1, 1.1, 1],
    opacity: [1, 0.8, 1],
    transition: { duration: 0.4 }
  }
}

// ============================================================================
// Transition Presets
// ============================================================================

const getTransition = (mode: SmoothMode): Transition => {
  const config = SMOOTH_MODES[mode]
  return {
    duration: config.duration,
    delay: config.delay,
    ease: config.ease
  }
}

export const smoothTransition = (mode: SmoothMode = 'smooth'): Transition => {
  return getTransition(mode)
}

export const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 25
}

// ============================================================================
// Hook Implementation
// ============================================================================

interface UseSmoothAnimationsOptions {
  initialMode?: SmoothMode
  animateOnMount?: boolean
}

interface UseSmoothAnimationsReturn {
  smoothMode: SmoothMode
  setSmoothMode: (mode: SmoothMode) => void
  getTransition: (overrides?: Partial<Transition>) => Transition
  animate: <T>(
    variants: Variants,
    initial?: string,
    animate?: string,
    exit?: string,
    transition?: Transition,
    onAnimationComplete?: () => void
  ) => HTMLMotionProps<T>
  fadeIn: (customTransition?: Transition) => HTMLMotionProps<'div'>
  slideUp: (customTransition?: Transition) => HTMLMotionProps<'div'>
  slideDown: (customTransition?: Transition) => HTMLMotionProps<'div'>
  slideLeft: (customTransition?: Transition) => HTMLMotionProps<'div'>
  slideRight: (customTransition?: Transition) => HTMLMotionProps<'div'>
  scaleIn: (customTransition?: Transition) => HTMLMotionProps<'div'>
  bounceIn: (customTransition?: Transition) => HTMLMotionProps<'div'>
  pulse: (isActive: boolean, customTransition?: Transition) => HTMLMotionProps<'div'>
  shake: (isActive: boolean, customTransition?: Transition) => HTMLMotionProps<'div'>
  ripple: (isActive: boolean, customTransition?: Transition) => HTMLMotionProps<'div'>
}

export function useSmoothAnimations(options: UseSmoothAnimationsOptions = {}): UseSmoothAnimationsReturn {
  const { initialMode = 'smooth', animateOnMount = true } = options
  const [smoothMode, setSmoothMode] = useState<SmoothMode>(initialMode)
  const animationCount = useRef(0)

  // Get transition based on current mode
  const getTransition = useCallback((overrides?: Partial<Transition>): Transition => {
    const base = SMOOTH_MODES[smoothMode]
    return {
      duration: overrides?.duration ?? base.duration,
      delay: overrides?.delay ?? base.delay,
      ease: overrides?.ease ?? base.ease,
      ...overrides
    }
  }, [smoothMode])

  // Animate helper that applies smooth transitions
  const animate = useCallback(<T>(
    variants: Variants,
    initial: string = 'hidden',
    animate: string = 'visible',
    exit: string = 'hidden',
    transition?: Transition,
    onAnimationComplete?: () => void
  ): HTMLMotionProps<T> => {
    animationCount.current++
    const currentCount = animationCount.current

    return {
      variants,
      initial,
      animate: animateOnMount ? animate : initial,
      exit,
      transition: transition ?? getTransition(),
      onAnimationComplete: () => {
        if (animationCount.current === currentCount && onAnimationComplete) {
          onAnimationComplete()
        }
      }
    }
  }, [smoothMode, animateOnMount, getTransition])

  // Pre-built animation helpers
  const fadeIn = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(fadeVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const slideUp = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(slideUpVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const slideDown = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(slideDownVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const slideLeft = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(slideLeftVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const slideRight = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(slideRightVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const scaleIn = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(scaleVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const bounceIn = useCallback((customTransition?: Transition): HTMLMotionProps<'div'> => {
    return animate(bounceVariants, 'hidden', 'visible', 'hidden', customTransition)
  }, [animate])

  const pulse = useCallback((isActive: boolean, customTransition?: Transition): HTMLMotionProps<'div'> => {
    return {
      variants: pulseVariants,
      initial: 'normal',
      animate: isActive ? 'pulse' : 'normal',
      transition: customTransition ?? { duration: 1, repeat: Infinity },
      loop: isActive ? Infinity : 0
    }
  }, [])

  const shake = useCallback((isActive: boolean, customTransition?: Transition): HTMLMotionProps<'div'> => {
    return {
      variants: shakeVariants,
      initial: 'normal',
      animate: isActive ? 'shake' : 'normal',
      transition: customTransition ?? getTransition('smooth')
    }
  }, [getTransition])

  const ripple = useCallback((isActive: boolean, customTransition?: Transition): HTMLMotionProps<'div'> => {
    return {
      variants: rippleVariants,
      initial: 'normal',
      animate: isActive ? 'ripple' : 'normal',
      transition: customTransition ?? getTransition('natural')
    }
  }, [getTransition])

  return {
    smoothMode,
    setSmoothMode,
    getTransition,
    animate,
    fadeIn,
    slideUp,
    slideDown,
    slideLeft,
    slideRight,
    scaleIn,
    bounceIn,
    pulse,
    shake,
    ripple
  }
}

// ============================================================================
// Stagger Animation Helper
// ============================================================================

export function staggerContainer(delayChildren?: number, staggerChildren?: number): HTMLMotionProps<'div'> {
  return {
    initial: 'hidden',
    animate: 'visible',
    variants: {
      visible: {
        transition: {
          staggerChildren: staggerChildren ?? 0.05,
          delayChildren: delayChildren ?? 0
        }
      }
    }
  }
}

export function staggerItem(index?: number): HTMLMotionProps<'div'> {
  return {
    variants: {
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.3,
          delay: index !== undefined ? index * 0.05 : 0,
          ease: [0.16, 1, 0.3, 1]
        }
      }
    }
  }
}

// ============================================================================
// Smooth Scroll Helper
// ============================================================================

export function useSmoothScroll() {
  const scrollTo = useCallback((target: HTMLElement | null, options?: { duration?: number, offset?: number }) => {
    if (!target) return

    const duration = options?.duration ?? 300
    const offset = options?.offset ?? 0
    const start = window.pageYOffset
    const end = target.getBoundingClientRect().top + window.pageYOffset - offset
    const distance = end - start

    let startTime: number | null = null

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease out cubic
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      window.scrollTo(0, start + distance * easeOutCubic)

      if (progress < 1) {
        window.requestAnimationFrame(animate)
      }
    }

    window.requestAnimationFrame(animate)
  }, [])

  return { scrollTo }
}

// ============================================================================
// Smooth Hover Effects
// ============================================================================

export function useSmoothHover() {
  const [isHovered, setIsHovered] = useState(false)

  const hoverProps = {
    onHoverStart: () => setIsHovered(true),
    onHoverEnd: () => setIsHovered(false),
    whileHover: { scale: 1.02 },
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
  }

  return { isHovered, hoverProps }
}

// ============================================================================
// Smooth Tap Effects
// ============================================================================

export function useSmoothTap() {
  const tapProps = {
    whileTap: { scale: 0.98 },
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }
  }

  return { tapProps }
}

// ============================================================================
// Smooth Focus Effects
// ============================================================================

export function useSmoothFocus() {
  const [isFocused, setIsFocused] = useState(false)

  const focusProps = {
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    animate: {
      scale: isFocused ? 1.01 : 1,
      boxShadow: isFocused 
        ? '0 0 0 3px rgba(16, 185, 129, 0.2)' 
        : '0 0 0 0 rgba(16, 185, 129, 0)'
    },
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
  }

  return { isFocused, focusProps }
}

// ============================================================================
// Export all animation variants for direct use
// ============================================================================

export {
  fadeVariants,
  slideUpVariants,
  slideDownVariants,
  slideLeftVariants,
  slideRightVariants,
  scaleVariants,
  scaleUpVariants,
  bounceVariants,
  pulseVariants,
  shakeVariants,
  rippleVariants,
  springTransition
}

export type { Variants, Transition }
