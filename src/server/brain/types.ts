/**
 * Advanced AI Brain - Core Data Contracts
 * Defines Task priorities, states, specialized agent contracts,
 * task graph structures, and self-verification payloads.
 */

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export type TaskStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'RUNNING'
  | 'WAITING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED'
  | 'CANCELLED'

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'RECOVERED'

export type SpecializedAgentRole =
  | 'Research Agent'
  | 'Coding Agent'
  | 'Browser Agent'
  | 'File Agent'
  | 'Vision Agent'
  | 'Android Agent'
  | 'Voice Agent'

export interface BrainTask {
  taskId: string
  description: string
  priority: TaskPriority
  dependencies: string[] // taskIds that must complete before this can run
  status: TaskStatus
  assignedAgent: SpecializedAgentRole
  requiredTools: string[]
  attempts: number
  maxAttempts: number
  result?: any
  error?: string
  verificationStatus?: VerificationStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  executionDurationMs?: number
  // Parameters for execution
  parameters?: Record<string, any>
  // Safe retry & alternative tools
  retrySafe?: boolean
  alternativeTools?: string[]
  verificationRules?: {
    type: 'non_empty' | 'schema' | 'status_ok' | 'custom'
    expectedFields?: string[]
    customRule?: string
  }
}

export interface TaskGraph {
  graphId: string
  userId: string
  originalRequest: string
  goal?: string
  understanding: {
    intent: string
    category: string
    urgency: TaskPriority
    detectedEntities: Record<string, any>
    estimatedComplexity: 'SIMPLE' | 'COMPOUND' | 'MULTI_STAGE'
  }
  tasks: BrainTask[]
  priority: TaskPriority
  status: TaskStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  finalSynthesis?: string
  contextMemory?: Record<string, any>
  retrievedMemories?: string[]
}

export interface VerificationEvaluation {
  passed: boolean
  verificationStatus: VerificationStatus
  reason?: string
  safeToRetry: boolean
  correctedParameters?: Record<string, any>
  alternativeTool?: string
  suggestedAction?: 'RETRY' | 'ALTERNATIVE_TOOL' | 'FAIL' | 'USER_CLARIFICATION'
}

export interface BrainContext {
  userId: string
  userPreferences: string[]
  relevantMemories: string[]
  recentTaskHistory: {
    taskId: string
    goal: string
    status: TaskStatus
    summary?: string
  }[]
  systemStatus: Record<string, any>
}
