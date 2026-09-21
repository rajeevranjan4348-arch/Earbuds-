/**
 * Listening + Plan Execution Agent Types
 * Comprehensive data contracts for TaskMemory, ExecutionPlan, PlanStep, and Verification.
 */

export type GoalCategory =
  | 'single_step'
  | 'multi_step'
  | 'information_query'
  | 'clarification_needed'
  | 'conversational'

export type TaskStatus =
  | 'created'
  | 'analyzing'
  | 'clarification_needed'
  | 'planning'
  | 'waiting_confirmation'
  | 'executing'
  | 'verifying'
  | 'healing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'running'
  | 'waiting_confirmation'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'recovered'
  | 'skipped'

export interface VerificationCriteria {
  type: 'non_empty' | 'schema' | 'status_ok' | 'custom'
  expectedFields?: string[]
  rules?: string
}

export interface FallbackStrategy {
  action: 'retry' | 'alternative_tool' | 'ai_fallback' | 'skip' | 'ask_user'
  alternativeTool?: string
  modifiedArgs?: Record<string, any>
  maxRetries?: number
}

export interface PlanStep {
  stepId: string
  stepIndex: number
  name: string
  goal: string
  toolName: string
  parameters: Record<string, any>
  parameterTemplates?: Record<string, string>
  requiresConfirmation: boolean
  confirmationReason?: string
  verificationCriteria: VerificationCriteria
  fallbackStrategy?: FallbackStrategy
  status: StepStatus
  output?: any
  error?: string
  retryCount: number
  startTime?: number
  endTime?: number
  durationMs?: number
}

export interface ExecutionPlan {
  planId: string
  taskId: string
  goal: string
  category: GoalCategory
  summary: string
  steps: PlanStep[]
  estimatedDurationMs: number
  requiresUserApproval: boolean
  createdAt: number
}

export interface TaskTraceEvent {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  stepIndex?: number
  toolName?: string
  details?: any
}

export interface TaskMemory {
  taskId: string
  userId: string
  rawInput: string
  cleanedInput: string
  inputType: 'voice' | 'text'
  status: TaskStatus
  category?: GoalCategory
  createdAt: number
  updatedAt: number
  plan?: ExecutionPlan
  currentStepIndex: number
  stepOutputs: Record<string, any>
  traces: TaskTraceEvent[]
  clarificationQuestion?: string
  pendingConfirmation?: {
    stepIndex: number
    stepId: string
    toolName: string
    reason: string
    parameters: Record<string, any>
  }
  finalResponse?: {
    spokenText: string
    displayText: string
    artifacts?: any[]
    completedSteps: number
    totalSteps: number
    executionDurationMs: number
  }
  error?: string
  contextMemory?: Record<string, any>
}

export interface IntentAnalysisResult {
  cleanedInput: string
  category: GoalCategory
  primaryGoal: string
  entities: Record<string, any>
  suggestedTools: string[]
  confidence: number
  isAmbiguous: boolean
  clarificationQuestion?: string
  contextReferences?: string[]
}

export interface StepVerificationResult {
  valid: boolean
  reason?: string
  recoveredOutput?: any
  suggestedFallback?: FallbackStrategy
}
