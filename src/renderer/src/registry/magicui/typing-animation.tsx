import * as React from 'react'
import { motion, type MotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface TypingAnimationProps extends React.HTMLAttributes<HTMLElement> {
  children?: string
  text?: string
  className?: string
  duration?: number
  delay?: number
  as?: React.ElementType
  startOnView?: boolean
  cursor?: boolean
}

const motionComponents: Record<string, any> = {
  span: motion.span,
  div: motion.div,
  p: motion.p,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3
}

export function TypingAnimation({
  children,
  text,
  className,
  duration = 50,
  delay = 0,
  as: Component = 'span',
  startOnView = false,
  cursor = true,
  ...props
}: TypingAnimationProps) {
  const fullText = text || children || ''
  const [displayedText, setDisplayedText] = React.useState<string>('')
  const [started, setStarted] = React.useState(!startOnView)
  const elementRef = React.useRef<HTMLElement>(null)

  const MotionComponent =
    typeof Component === 'string' && motionComponents[Component]
      ? motionComponents[Component]
      : motion.span

  React.useEffect(() => {
    if (!startOnView) {
      setStarted(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (elementRef.current) {
      observer.observe(elementRef.current)
    }

    return () => observer.disconnect()
  }, [startOnView])

  React.useEffect(() => {
    if (!started) return

    const timeout = setTimeout(() => {
      let i = 0
      setDisplayedText('')
      const typingInterval = setInterval(() => {
        if (i < fullText.length) {
          setDisplayedText(fullText.substring(0, i + 1))
          i++
        } else {
          clearInterval(typingInterval)
        }
      }, duration)

      return () => clearInterval(typingInterval)
    }, delay)

    return () => clearTimeout(timeout)
  }, [fullText, duration, delay, started])

  return (
    <MotionComponent
      ref={elementRef}
      className={cn('inline-block font-sans tracking-tight', className)}
      {...(props as MotionProps)}
    >
      {displayedText}
      {cursor && (
        <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-emerald-400 animate-pulse align-middle" />
      )}
    </MotionComponent>
  )
}

export default TypingAnimation
