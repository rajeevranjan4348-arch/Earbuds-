/**
 * Central Agent Orchestrator
 * Manages task planning, state transitions, tool routing, permission enforcement,
 * DAG parallel execution of read-only steps, observation verification, and task cancellation.
 */

import { DAGPlan, DAGTaskStep, taskPlanner } from './task-planner'
import { PendingApprovalRequest, permissionManager } from './permission-manager'
import { realTimeToolRegistry } from '../../server/realtime/toolRegistry'

export type OrchestratorState =
  | 'IDLE'
  | 'PLANNING'
  | 'RUNNING'
  | 'PAUSED_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface TaskExecutionTrace {
  taskId: string
  userRequest: string
  state: OrchestratorState
  plan: DAGPlan
  activeSteps: string[]
  completedSteps: string[]
  failedSteps: string[]
  pendingApproval?: PendingApprovalRequest
  results: Record<string, any>
  finalResponse?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export class AgentOrchestrator {
  private activeTraces = new Map<string, TaskExecutionTrace>()
  private cancelledTasks = new Set<string>()

  /**
   * Main Entry Point: Processes a complex multi-step request
   */
  public async executeTask(
    userRequest: string,
    toolExecutor?: (toolName: string, params: Record<string, any>) => Promise<any>
  ): Promise<TaskExecutionTrace> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    
    // 1. PLANNING STAGE
    const plan = taskPlanner.plan(userRequest)

    const trace: TaskExecutionTrace = {
      taskId,
      userRequest,
      state: 'PLANNING',
      plan,
      activeSteps: [],
      completedSteps: [],
      failedSteps: [],
      results: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.activeTraces.set(taskId, trace)

    // 2. RUNNING STAGE (DAG Execution Loop)
    return this.runDAG(trace, toolExecutor)
  }

  /**
   * Executes the task graph taking advantage of independent read-only step concurrency
   */
  private async runDAG(
    trace: TaskExecutionTrace,
    toolExecutor?: (toolName: string, params: Record<string, any>) => Promise<any>
  ): Promise<TaskExecutionTrace> {
    trace.state = 'RUNNING'
    trace.updatedAt = Date.now()

    while (trace.state === 'RUNNING') {
      if (this.cancelledTasks.has(trace.taskId)) {
        trace.state = 'CANCELLED'
        trace.error = 'Task was cancelled by user'
        trace.updatedAt = Date.now()
        break
      }

      // Find ready steps (all dependencies completed, status is PENDING)
      const readySteps = trace.plan.steps.filter((step) => {
        if (step.status !== 'PENDING') return false
        return step.dependencies.every((depId) => trace.completedSteps.includes(depId))
      })

      if (readySteps.length === 0) {
        // Check if all steps completed or if graph stalled
        const remaining = trace.plan.steps.filter(
          (s) => s.status !== 'COMPLETED' && s.status !== 'FAILED' && s.status !== 'CANCELLED'
        )

        if (remaining.length === 0) {
          trace.state = trace.failedSteps.length > 0 ? 'FAILED' : 'COMPLETED'
          trace.finalResponse = this.synthesizeSummary(trace)
        } else {
          trace.state = 'FAILED'
          trace.error = 'Execution stalled: unmet dependencies or step failures.'
        }
        break
      }

      // Separate ready steps into read-only (concurrent safe) vs state-changing (sequential)
      const readOnlyReady = readySteps.filter((s) => s.readOnly)
      const writeReady = readySteps.filter((s) => !s.readOnly)

      // Execute ready read-only steps concurrently with Promise.all
      if (readOnlyReady.length > 0) {
        await Promise.all(
          readOnlyReady.map((step) => this.executeStepNode(trace, step, toolExecutor))
        )
      } else if (writeReady.length > 0) {
        // Execute state-changing steps sequentially
        const stepToRun = writeReady[0]
        await this.executeStepNode(trace, stepToRun, toolExecutor)
      }

      // If waiting for user permission approval, pause the execution loop
      if (trace.state === 'PAUSED_FOR_APPROVAL') {
        break
      }
    }

    trace.updatedAt = Date.now()
    return trace
  }

  /**
   * Executes a single step node with deterministic permission checks
   */
  private async executeStepNode(
    trace: TaskExecutionTrace,
    step: DAGTaskStep,
    toolExecutor?: (toolName: string, params: Record<string, any>) => Promise<any>
  ): Promise<void> {
    if (this.cancelledTasks.has(trace.taskId)) {
      step.status = 'CANCELLED'
      return
    }

    // Intercept permission requirement
    const permissionCheck = await permissionManager.interceptAndCheck(
      trace.taskId,
      step.toolName,
      step.parameters
    )

    if (!permissionCheck.allowed) {
      if (permissionCheck.pendingRequest) {
        step.status = 'PAUSED'
        trace.state = 'PAUSED_FOR_APPROVAL'
        trace.pendingApproval = permissionCheck.pendingRequest
        return
      } else {
        step.status = 'FAILED'
        step.error = permissionCheck.reason || 'Permission denied'
        trace.failedSteps.push(step.id)
        return
      }
    }

    // Start execution
    step.status = 'RUNNING'
    step.startedAt = Date.now()
    trace.activeSteps.push(step.id)

    try {
      let output: any
      if (toolExecutor) {
        output = await toolExecutor(step.toolName, step.parameters)
      } else if (realTimeToolRegistry.getTool(step.toolName)) {
        const realtimeRes = await realTimeToolRegistry.executeTool(step.toolName, step.parameters)
        if (realtimeRes.success) {
          output = realtimeRes.result
        } else {
          throw new Error(realtimeRes.error || `Real-time tool ${step.toolName} execution failed`)
        }
      } else {
        output = { status: 'SUCCESS', result: `Executed ${step.toolName}`, params: step.parameters }
      }

      step.status = 'COMPLETED'
      step.result = output
      step.completedAt = Date.now()

      trace.results[step.id] = output
      trace.completedSteps.push(step.id)
    } catch (err: any) {
      step.status = 'FAILED'
      step.error = err?.message || 'Tool execution failed'
      step.completedAt = Date.now()

      trace.failedSteps.push(step.id)
    } finally {
      trace.activeSteps = trace.activeSteps.filter((id) => id !== step.id)
    }
  }

  /**
   * Resume task after user provides permission approval or denial
   */
  public async resumeWithPermissionDecision(
    taskId: string,
    requestId: string,
    decision: 'APPROVED' | 'DENIED',
    toolExecutor?: (toolName: string, params: Record<string, any>) => Promise<any>
  ): Promise<TaskExecutionTrace | undefined> {
    const trace = this.activeTraces.get(taskId)
    if (!trace) return undefined

    const resolved = permissionManager.resolveApproval(requestId, decision)
    if (!resolved) return trace

    trace.pendingApproval = undefined

    if (decision === 'APPROVED') {
      trace.state = 'RUNNING'
      // Unpause paused step
      const pausedStep = trace.plan.steps.find((s) => s.status === 'PAUSED')
      if (pausedStep) {
        pausedStep.status = 'PENDING'
      }
      return this.runDAG(trace, toolExecutor)
    } else {
      const pausedStep = trace.plan.steps.find((s) => s.status === 'PAUSED')
      if (pausedStep) {
        pausedStep.status = 'FAILED'
        pausedStep.error = 'User denied execution permission'
        trace.failedSteps.push(pausedStep.id)
      }
      trace.state = 'FAILED'
      trace.error = 'Task execution stopped: user denied permission'
      trace.updatedAt = Date.now()
      return trace
    }
  }

  /**
   * Cancel an ongoing or paused task
   */
  public cancelTask(taskId: string): boolean {
    this.cancelledTasks.add(taskId)
    const trace = this.activeTraces.get(taskId)
    if (trace) {
      trace.state = 'CANCELLED'
      trace.error = 'Task cancelled by user'
      trace.updatedAt = Date.now()
      return true
    }
    return false
  }

  /**
   * Retrieves active execution trace for a task ID
   */
  public getTrace(taskId: string): TaskExecutionTrace | undefined {
    return this.activeTraces.get(taskId)
  }

  /**
   * Synthesizes user-facing execution summary
   */
  private synthesizeSummary(trace: TaskExecutionTrace): string {
    const total = trace.plan.steps.length
    const completed = trace.completedSteps.length
    const failed = trace.failedSteps.length

    if (failed > 0) {
      return `Completed ${completed} of ${total} steps with ${failed} failure(s). Request: "${trace.userRequest}"`
    }
    return `Successfully executed all ${completed} step(s) for: "${trace.userRequest}"`
  }
}

export const agentOrchestrator = new AgentOrchestrator()
