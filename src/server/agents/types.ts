/**
 * Unified Multi-Agent Types
 * Unifies Ruflo (#08) + Agency Agents (#21) + Awesome Harness Engineering (#03)
 */

export type SpecializedAgentRole =
  | 'general'
  | 'coding'
  | 'research'
  | 'security'
  | 'architecture'
  | 'android_device'
  | 'browser'
  | 'creative_image'

export interface AgentDefinition {
  role: SpecializedAgentRole
  name: string
  description: string
  systemInstruction: string
  requiredCapabilities: string[]
  temperature: number
  maxIterations: number
}

export interface AgentExecutionTrace {
  traceId: string
  agentRole: SpecializedAgentRole
  status: 'pending' | 'running' | 'completed' | 'failed' | 'recovered'
  startTime: number
  endTime?: number
  durationMs?: number
  steps: {
    stepIndex: number
    action: string
    timestamp: number
    result?: any
    error?: string
  }[]
  metrics: {
    toolCallsCount: number
    retryCount: number
    memoryAccessCount: number
    privacyRedactionsCount: number
  }
}
