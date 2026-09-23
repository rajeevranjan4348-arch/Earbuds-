import React, { useEffect, useState } from 'react'
import { motion, useSpring } from 'framer-motion'

export const CursorGlow: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const springX = useSpring(0, { damping: 28, stiffness: 220 })
  const springY = useSpring(0, { damping: 28, stiffness: 220 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      springX.set(e.clientX)
      springY.set(e.clientY)
      if (!isVisible) setIsVisible(true)
    }

    const handleMouseLeave = () => setIsVisible(false)
    const handleMouseEnter = () => setIsVisible(true)

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [isVisible, springX, springY])

  if (!isVisible) return null

  return (
    <motion.div
      className="fixed pointer-events-none z-30 transform -translate-x-1/2 -translate-y-1/2 hidden md:block"
      style={{
        left: springX,
        top: springY
      }}
    >
      <div className="w-80 h-80 rounded-full bg-emerald-500/10 blur-[90px] mix-blend-screen" />
    </motion.div>
  )
}

export default CursorGlow
