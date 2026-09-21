/**
 * IRIS Listening + Plan Execution Agent Client Service
 * Coordinates voice/text user requests with the backend plan execution engine,
 * handling step traces, confirmations, and synthesized voice/display responses.
 */

export interface PlanStepItem {
  stepId: string
  stepIndex: number
  name: string
  goal: string
  toolName: string
  parameters: Record<string, any>
  requiresConfirmation: boolean
  confirmationReason?: string
  status: 'pending' | 'running' | 'waiting_confirmation' | 'verifying' | 'completed' | 'failed' | 'recovered' | 'skipped'
  output?: any
  error?: string
  retryCount: number
  durationMs?: number
}

export interface ExecutionPlanData {
  planId: string
  taskId: string
  goal: string
  category: string
  summary: string
  steps: PlanStepItem[]
  estimatedDurationMs: number
  requiresUserApproval: boolean
}

export interface TaskMemoryData {
  taskId: string
  userId: string
  rawInput: string
  cleanedInput: string
  inputType: 'voice' | 'text'
  status: 'created' | 'analyzing' | 'clarification_needed' | 'planning' | 'waiting_confirmation' | 'executing' | 'verifying' | 'healing' | 'completed' | 'failed' | 'cancelled'
  category?: string
  createdAt: number
  updatedAt: number
  plan?: ExecutionPlanData
  currentStepIndex: number
  stepOutputs: Record<string, any>
  traces: Array<{
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'success'
    message: string
    stepIndex?: number
    toolName?: string
    details?: any
  }>
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
}

type AgentTaskListener = (task: TaskMemoryData) => void

class AgentClientService {
  private activeTask: TaskMemoryData | null = null
  private listeners: Set<AgentTaskListener> = new Set()

  /**
   * Subscribes to real-time plan execution updates
   */
  public subscribe(listener: AgentTaskListener): () => void {
    this.listeners.add(listener)
    if (this.activeTask) {
      listener(this.activeTask)
    }
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(task: TaskMemoryData) {
    this.activeTask = task
    this.listeners.forEach((fn) => {
      try {
        fn(task)
      } catch (_e) {}
    })
  }

  public getActiveTask(): TaskMemoryData | null {
    return this.activeTask
  }

  /**
   * Executes a voice or text command through the Smart Listening + Plan Execution Agent
   */
  public async executeListeningPlan(
    input: string,
    inputType: 'voice' | 'text' = 'text',
    contextMemory?: Record<string, any>
  ): Promise<{ success: boolean; task: TaskMemoryData; spokenResponse: string; displayText: string }> {
    try {
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          inputType,
          userId: 'usr_iris_primary',
          context: contextMemory
        })
      })

      const data = await response.json()
      if (data.task) {
        this.notify(data.task)
        const spoken =
          data.task.finalResponse?.spokenText ||
          data.task.clarificationQuestion ||
          (data.task.status === 'waiting_confirmation'
            ? data.task.pendingConfirmation?.reason || 'This action requires your confirmation.'
            : 'Plan execution completed.')

        const display =
          data.task.finalResponse?.displayText ||
          data.task.error ||
          (data.task.plan ? `**Plan:** ${data.task.plan.summary}` : input)

        return {
          success: data.success,
          task: data.task,
          spokenResponse: spoken,
          displayText: display
        }
      }

      throw new Error(data.error || 'Agent plan execution failed')
    } catch (err: any) {
      console.error('[AgentClientService] Execution error:', err)
      const errorTask: TaskMemoryData = {
        taskId: `err_${Date.now()}`,
        userId: 'usr_iris_primary',
        rawInput: input,
        cleanedInput: input,
        inputType,
        status: 'failed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        currentStepIndex: 0,
        stepOutputs: {},
        traces: [{ timestamp: Date.now(), level: 'error', message: err.message || 'Execution error' }],
        error: err.message || 'Agent connection error',
        finalResponse: {
          spokenText: 'I encountered an issue executing that plan.',
          displayText: `⚠️ **Agent Error:** ${err.message || 'Connection error'}`,
          completedSteps: 0,
          totalSteps: 0,
          executionDurationMs: 0
        }
      }
      this.notify(errorTask)
      return {
        success: false,
        task: errorTask,
        spokenResponse: errorTask.finalResponse!.spokenText,
        displayText: errorTask.finalResponse!.displayText
      }
    }
  }

  /**
   * Confirms a sensitive plan step waiting for user permission
   */
  public async confirmStep(
    taskId: string,
    approved: boolean,
    notes?: string
  ): Promise<{ success: boolean; task: TaskMemoryData }> {
    try {
      const response = await fetch(`/api/agent/task/${encodeURIComponent(taskId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes })
      })
      const data = await response.json()
      if (data.task) {
        this.notify(data.task)
        return { success: data.success, task: data.task }
      }
      throw new Error(data.error || 'Failed to confirm task step')
    } catch (err: any) {
      console.error('[AgentClientService] Confirmation error:', err)
      throw err
    }
  }

  /**
   * Cancels a running task
   */
  public async cancelTask(taskId: string, reason?: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/agent/task/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      const data = await response.json()
      if (data.task) {
        this.notify(data.task)
      }
      return Boolean(data.success)
    } catch (err) {
      console.error('[AgentClientService] Cancel error:', err)
      return false
    }
  }

  /**
   * Fetches recent tasks
   */
  public async fetchRecentTasks(): Promise<TaskMemoryData[]> {
    try {
      const res = await fetch('/api/agent/tasks')
      const data = await res.json()
      return data.tasks || []
    } catch (_e) {
      return []
    }
  }
}

export const agentClientService = new AgentClientService()
