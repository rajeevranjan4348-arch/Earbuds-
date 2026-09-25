import React from 'react'
import LatticeLoader from './LatticeLoader'

export interface ThinkingIndicatorProps {
  statusText?: string
  voiceState?: string
  className?: string
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  statusText = 'Thinking...',
  voiceState,
  className = ''
}) => {
  const isWorking =
    voiceState === 'THINKING' ||
    voiceState === 'TOOL_EXECUTION' ||
    voiceState === 'thinking' ||
    voiceState === 'tool_execution' ||
    voiceState === 'generating' ||
    voiceState === 'processing_audio' ||
    voiceState === 'transcribing' ||
    !voiceState

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl bg-neutral-900/80 border border-emerald-500/20 backdrop-blur-md shadow-lg shadow-emerald-950/20 ${className}`}>
      <LatticeLoader
        status={isWorking ? 'working' : 'done'}
        label={statusText || 'Thinking'}
        doneLabel="Done"
        errorLabel="Failed"
        pattern="orbit"
        grid={3}
        shape="round"
        doneColor="#22c55e"
        errorColor="#ef4444"
        cellSize={6}
        gap={2}
        fontSize={14}
        step={90}
        idleOpacity={0.15}
        glow={true}
        glowColor="rgba(34, 197, 94, 0.4)"
        showTimer
        color="#f5f5f5"
      />
    </div>
  )
}

export default ThinkingIndicator
