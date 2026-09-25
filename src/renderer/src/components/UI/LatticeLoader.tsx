import React, { useEffect, useState } from 'react'
import './LatticeLoader.css'

export interface LatticeLoaderProps {
  status?: 'working' | 'done' | 'error' | 'idle'
  label?: string
  doneLabel?: string
  errorLabel?: string
  pattern?: 'orbit' | 'pulse' | 'wave'
  grid?: number
  shape?: 'square' | 'round'
  doneColor?: string
  errorColor?: string
  cellSize?: number
  gap?: number
  fontSize?: number
  step?: number
  idleOpacity?: number
  glow?: boolean
  glowColor?: string
  showTimer?: boolean
  color?: string
  className?: string
}

export const LatticeLoader: React.FC<LatticeLoaderProps> = ({
  status = 'working',
  label = 'Thinking',
  doneLabel = 'Done in',
  errorLabel = 'Failed after',
  pattern = 'orbit',
  grid = 3,
  shape = 'round',
  doneColor = '#22c55e',
  errorColor = '#ef4444',
  cellSize = 6,
  gap = 2,
  fontSize = 14,
  step = 90,
  idleOpacity = 0.15,
  glow = false,
  glowColor = '',
  showTimer = true,
  color = '#f5f5f5',
  className = ''
}) => {
  const [elapsed, setElapsed] = useState<number>(0)
  const [activeCell, setActiveCell] = useState<number>(0)

  useEffect(() => {
    let timer: any = null
    if (status === 'working') {
      const startTime = Date.now()
      timer = setInterval(() => {
        setElapsed((Date.now() - startTime) / 1000)
      }, 100)
    } else {
      setElapsed(0)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [status])

  useEffect(() => {
    let animTimer: any = null
    if (status === 'working') {
      animTimer = setInterval(() => {
        setActiveCell((prev) => (prev + 1) % (grid * grid))
      }, step)
    }
    return () => {
      if (animTimer) clearInterval(animTimer)
    }
  }, [status, grid, step])

  const totalCells = grid * grid
  const cells = Array.from({ length: totalCells })

  const currentColor =
    status === 'done' ? doneColor : status === 'error' ? errorColor : color

  const displayLabel =
    status === 'done'
      ? doneLabel
      : status === 'error'
      ? errorLabel
      : label

  return (
    <div
      className={`lattice-loader ${className}`}
      data-shape={shape}
      data-glow={glow ? 'true' : undefined}
      style={
        {
          '--ll-n': grid,
          '--ll-cell': `${cellSize}px`,
          '--ll-gap': `${gap}px`,
          '--ll-font': `${fontSize}px`,
          '--ll-color': currentColor,
          '--ll-mark': doneColor,
          '--ll-idle': idleOpacity,
          '--ll-glow': glowColor || currentColor
        } as React.CSSProperties
      }
    >
      <div
        className={`lattice-loader__grid ${
          status === 'working' ? 'lattice-loader__grid--animating' : ''
        }`}
      >
        <div className="lattice-loader__layer lattice-loader__run">
          {cells.map((_, i) => {
            const isActive = status === 'working' && i === activeCell
            return (
              <div
                key={i}
                className="lattice-loader__cell"
                style={{
                  opacity: isActive
                    ? 1
                    : status === 'done' || status === 'error'
                    ? 0.9
                    : idleOpacity,
                  transform: isActive ? 'scale(1.2)' : 'scale(1)'
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="lattice-loader__label">
        <span>{displayLabel}</span>
        {showTimer && status === 'working' && (
          <span className="lattice-loader__timer">{elapsed.toFixed(1)}s</span>
        )}
      </div>
    </div>
  )
}

export default LatticeLoader
