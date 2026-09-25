/**
 * DAG Task Planner Engine
 * Decomposes multi-step user requests into Directed Acyclic Graphs (DAGs) with explicit dependencies.
 * Identifies read-only operations to allow concurrent execution while maintaining strict sequential order for dependent steps.
 */

import { RiskLevel, permissionManager } from './permission-manager'

export type TaskStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED'

export interface DAGTaskStep {
  id: string
  toolName: string
  description: string
  parameters: Record<string, any>
  dependencies: string[] // List of step IDs that must complete before this step can run
  readOnly: boolean // True if operation does not mutate state, allowing concurrent execution
  riskLevel: RiskLevel
  status: TaskStepStatus
  result?: any
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface DAGPlan {
  id: string
  userRequest: string
  goal: string
  steps: DAGTaskStep[]
  createdAt: number
  updatedAt: number
}

export class TaskPlanner {
  /**
   * Identifies whether a tool operation is strictly read-only
   */
  public isReadOnlyTool(toolName: string, params: Record<string, any> = {}): boolean {
    const lower = toolName.toLowerCase()
    
    // Explicit read-only keyword patterns
    if (
      lower.includes('search') ||
      lower.includes('query') ||
      lower.includes('read') ||
      lower.includes('get') ||
      lower.includes('fetch') ||
      lower.includes('list') ||
      lower.includes('inspect') ||
      lower.includes('check') ||
      lower.includes('weather') ||
      lower.includes('maps') ||
      lower.includes('ocr') ||
      lower.includes('retrieve')
    ) {
      // Exclude state-changing operations
      if (
        !lower.includes('delete') &&
        !lower.includes('write') &&
        !lower.includes('update') &&
        !lower.includes('send') &&
        !lower.includes('set')
      ) {
        return true
      }
    }

    return false
  }

  /**
   * Plans a DAG task graph from a user prompt
   */
  public plan(userRequest: string): DAGPlan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const steps: DAGTaskStep[] = []
    const p = userRequest.toLowerCase()

    // Example multi-step intent decomposition
    // Check for chained actions using conjunctions (and, then, after, before, also)
    const subCommands = userRequest
      .split(/\s+(?:and then|then|and|after that)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)

    if (subCommands.length > 1) {
      let previousStepId: string | null = null

      for (let i = 0; i < subCommands.length; i++) {
        const cmd = subCommands[i]
        const stepId = `step_${i + 1}`
        const toolName = this.inferToolForCommand(cmd)
        const readOnly = this.isReadOnlyTool(toolName)
        const riskLevel = permissionManager.evaluateRisk(toolName, { query: cmd })

        // Read-only steps at the start or without prior output dependency don't depend on previous
        // State-changing steps depend on previous steps
        const dependencies: string[] = []
        if (previousStepId && !readOnly) {
          dependencies.push(previousStepId)
        }

        steps.push({
          id: stepId,
          toolName,
          description: cmd,
          parameters: { query: cmd, prompt: cmd },
          dependencies,
          readOnly,
          riskLevel,
          status: 'PENDING'
        })

        // Track previous step for non-concurrent chain
        previousStepId = stepId
      }
    } else {
      // Single action or simple request
      const toolName = this.inferToolForCommand(userRequest)
      const readOnly = this.isReadOnlyTool(toolName)
      const riskLevel = permissionManager.evaluateRisk(toolName, { query: userRequest })

      steps.push({
        id: 'step_1',
        toolName,
        description: userRequest,
        parameters: { query: userRequest, prompt: userRequest },
        dependencies: [],
        readOnly,
        riskLevel,
        status: 'PENDING'
      })
    }

    return {
      id: planId,
      userRequest,
      goal: userRequest,
      steps,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }

  /**
   * Inters tool name from natural language command text
   */
  private inferToolForCommand(command: string): string {
    const cmd = command.toLowerCase()

    if (cmd.includes('delete file') || cmd.includes('remove file')) return 'delete_file'
    if (cmd.includes('search') || cmd.includes('google') || cmd.includes('find on web')) return 'web_search'
    if (cmd.includes('weather')) return 'get_weather'
    if (cmd.includes('map') || cmd.includes('direction') || cmd.includes('location')) return 'maps_search'
    if (cmd.includes('open') || cmd.includes('launch')) return 'open_app'
    if (cmd.includes('terminal') || cmd.includes('run command') || cmd.includes('exec')) return 'terminal_exec'
    if (cmd.includes('ocr') || cmd.includes('scan document') || cmd.includes('read image')) return 'paddle_ocr_extract'
    if (cmd.includes('send message') || cmd.includes('text')) return 'send_message'
    if (cmd.includes('send email') || cmd.includes('mail')) return 'send_email'
    if (cmd.includes('note') || cmd.includes('remember')) return 'save_note'

    return 'ai_reasoning'
  }
}

export const taskPlanner = new TaskPlanner()
