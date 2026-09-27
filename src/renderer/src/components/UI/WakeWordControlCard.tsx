import React from 'react'
import { WakeWordSettingsModule } from './WakeWordSettingsModule'

interface WakeWordControlCardProps {
  compact?: boolean
  className?: string
}

export const WakeWordControlCard: React.FC<WakeWordControlCardProps> = ({
  compact = false,
  className = ''
}) => {
  return <WakeWordSettingsModule className={className} compact={compact} />
}

export default WakeWordControlCard
