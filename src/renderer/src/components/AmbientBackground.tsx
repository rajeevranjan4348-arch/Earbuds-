import React from 'react'
import { motion } from 'framer-motion'

export const AmbientBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Deep Dark Base */}
      <div className="absolute inset-0 bg-[#07070c]" />

      {/* Radiant Gradient Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, 30, 0],
          opacity: [0.15, 0.28, 0.15]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-[20%] -left-[10%] w-[650px] h-[650px] rounded-full bg-gradient-to-br from-emerald-500/30 via-teal-600/20 to-transparent blur-[140px]"
      />

      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          x: [0, -40, 0],
          y: [0, 60, 0],
          opacity: [0.12, 0.24, 0.12]
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        className="absolute top-[35%] -right-[15%] w-[700px] h-[700px] rounded-full bg-gradient-to-bl from-indigo-500/25 via-cyan-500/20 to-transparent blur-[150px]"
      />

      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          x: [0, 30, 0],
          y: [0, -40, 0],
          opacity: [0.1, 0.22, 0.1]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
        className="absolute -bottom-[20%] left-[25%] w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-emerald-600/20 via-blue-600/15 to-transparent blur-[160px]"
      />

      {/* Cyber Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.25) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px'
        }}
      />

      {/* Radial vignette mask */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#07070c_80%)]" />
    </div>
  )
}

export default AmbientBackground
