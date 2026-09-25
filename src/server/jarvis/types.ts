/**
 * JARVIS Core Architecture - Types & Contracts
 * Complete specification for central agent orchestrator, task graph DAG,
 * permission engine, tool registry 2.0, diagnostics, background scheduler,
 * screen awareness, and multi-device context.
 */

// ==========================================
// 1. RISK & PERMISSION LEVELS
// ==========================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type ApprovalState = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED'

export type PermissionPolicy = 'ALWAYS_ALLOW_SESSION' | 'ALWAYS_ASK' | 'NEVER_ALLOW'

export interface PendingApprovalRequest {
  id: string
  taskId: string
  actionName: string
  toolName: string
  parameters: Record<string, any>
  riskLevel: RiskLevel
  reason: string
  state: ApprovalState
  requestedAt: number
  expiresAt: number
  timeoutMs: number
}

// ==========================================
// 2. TOOL REGISTRY 2.0
// ==========================================

export type ToolCategory =
  | 'system'
  | 'file'
  | 'browser'
  | 'phone'
  | 'media'
  | 'communication'
  | 'developer'
  | 'memory'
  | 'research'
  | 'location'
  | 'document'
  | 'automation'
  | 'ocr'

export interface ToolDefinition2 {
  name: string
  description: string
  category: ToolCategory
  inputSchema: Record<string, any>
  outputSchema?: Record<string, any>
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  requiresPermission: boolean
  readOnly: boolean
  timeoutMs: number
  canRunInBackground?: boolean
  execute: (args: Record<string, any>, context?: JarvisExecutionContext) => Promise<any>
  verify?: (args: Record<string, any>, output: any) => Promise<{ passed: boolean; reason?: string }>
}

export interface JarvisExecutionContext {
  taskId: string
  userId: string
  signal?: AbortSignal
  deviceTarget?: 'desktop' | 'android' | 'any'
  currentProject?: string
}

// ==========================================
// 3. TASK GRAPH & DAG SCHEDULING
// ==========================================

export type TaskStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PAUSED'
  | 'CANCELLED'

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'

export interface JarvisPlanStep {
  stepId: string
  name: string
  tool: string
  arguments: Record<string, any>
  dependencies: string[] // stepIds that must complete before this runs
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  readOnly: boolean
  status: TaskStatus
  output?: any
  error?: string
  durationMs?: number
  retryCount?: number
  maxRetries?: number
  verification?: {
    passed: boolean
    reason?: string
  }
}

export interface JarvisTaskGraph {
  taskId: string
  userRequest: string
  intent: string
  category: ToolCategory | 'general'
  status: TaskStatus
  priority: TaskPriority
  steps: JarvisPlanStep[]
  createdAt: number
  startedAt?: number
  completedAt?: number
  requiresConfirmation: boolean
  cancellationRequested?: boolean
  resultSummary?: string
  spokenSummary?: string
  error?: string
  traceLog: string[]
}

// ==========================================
// 4. OBSERVABILITY & AGENT EVENTS
// ==========================================

export type AgentEventType =
  | 'agent.started'
  | 'agent.thinking'
  | 'agent.plan.created'
  | 'tool.started'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.granted'
  | 'permission.denied'
  | 'agent.retrying'
  | 'agent.cancelled'
  | 'agent.completed'
  | 'agent.error'
  | 'voice.started'
  | 'voice.stopped'
  | 'memory.updated'

export interface AgentEventPayload {
  type: AgentEventType
  taskId?: string
  stepId?: string
  toolName?: string
  message: string
  data?: any
  timestamp: number
}

// ==========================================
// 5. SYSTEM DIAGNOSTICS
// ==========================================

export type DiagnosticItemStatus = 'OK' | 'WARNING' | 'ERROR'

export interface DiagnosticCheckResult {
  name: string
  category: 'audio' | 'ai' | 'hardware' | 'network' | 'storage' | 'system'
  status: DiagnosticItemStatus
  message: string
  details?: Record<string, any>
  latencyMs?: number
  actionableFix?: string
}

export interface SystemDiagnosticsReport {
  timestamp: number
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL'
  checks: DiagnosticCheckResult[]
  healthyCount: number
  warningCount: number
  errorCount: number
}

// ==========================================
// 6. BACKGROUND SCHEDULER
// ==========================================

export interface ScheduledTask {
  id: string
  name: string
  type: 'one_shot' | 'recurring'
  cronExpression?: string
  scheduledTime?: number
  command: string
  taskPayload?: Record<string, any>
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'DISABLED'
  lastRun?: number
  nextRun?: number
  createdAt: number
}

// ==========================================
// 7. SCREEN AWARENESS & COMPUTER USE
// ==========================================

export interface ScreenContext {
  activeWindow: string
  applicationName: string
  dimensions: { width: number; height: number }
  screenshotAvailable: boolean
  screenshotBase64?: string
  detectedText?: string
  detectedElements?: Array<{
    id: string
    type: 'button' | 'input' | 'text' | 'link' | 'image'
    label: string
    coordinates: [number, number, number, number] // [x, y, width, height]
  }>
}

export interface ComputerAction {
  action: 'click' | 'double_click' | 'right_click' | 'type' | 'key' | 'scroll' | 'focus' | 'launch'
  coordinates?: [number, number]
  text?: string
  keyCombo?: string
  scrollDelta?: { x: number; y: number }
  windowTitle?: string
}
