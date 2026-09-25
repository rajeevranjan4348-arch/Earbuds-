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
  status:
    | 'pending'
    | 'running'
    | 'waiting_confirmation'
    | 'verifying'
    | 'completed'
    | 'failed'
    | 'recovered'
    | 'skipped'
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
  status:
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
  ): Promise<{
    success: boolean
    task: TaskMemoryData
    spokenResponse: string
    displayText: string
  }> {
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
        traces: [
          { timestamp: Date.now(), level: 'error', message: err.message || 'Execution error' }
        ],
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

  /**
   * Advanced AI Brain: Central Agent Orchestrator execution
   */
  public async executeBrainTask(
    prompt: string,
    userId: string = 'default_user',
    context?: Record<string, any>
  ): Promise<any> {
    try {
      const res = await fetch('/api/brain/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId, context })
      })
      return await res.json()
    } catch (err) {
      console.error('[AgentClientService] Brain execution error:', err)
      throw err
    }
  }

  /**
   * Advanced AI Brain: Lists persisted task graphs
   */
  public async fetchBrainTasks(userId?: string): Promise<any[]> {
    try {
      const url = userId
        ? `/api/brain/tasks?userId=${encodeURIComponent(userId)}`
        : '/api/brain/tasks'
      const res = await fetch(url)
      const data = await res.json()
      return data.graphs || []
    } catch (_e) {
      return []
    }
  }

  /**
   * Advanced AI Brain: Fetches a single task graph by ID
   */
  public async fetchBrainTask(graphId: string): Promise<any> {
    try {
      const res = await fetch(`/api/brain/task/${encodeURIComponent(graphId)}`)
      const data = await res.json()
      return data.graph || null
    } catch (_e) {
      return null
    }
  }

  /**
   * Advanced AI Brain: Continues/resumes unfinished tasks after restart or interruption
   */
  public async resumeBrainTasks(): Promise<{ success: boolean; resumedCount: number }> {
    try {
      const res = await fetch('/api/brain/resume', { method: 'POST' })
      return await res.json()
    } catch (_e) {
      return { success: false, resumedCount: 0 }
    }
  }

  /**
   * Central TaskOrchestrator: Executes multi-agent pipeline with status tracking and verification
   */
  public async executeTaskOrchestrator(
    prompt: string,
    userId: string = 'default_user',
    context?: Record<string, any>
  ): Promise<any> {
    try {
      const res = await fetch('/api/orchestrator/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId, context })
      })
      return await res.json()
    } catch (err) {
      console.error('[AgentClientService] Orchestrator execution error:', err)
      throw err
    }
  }

  /**
   * Long-Term Memory: Semantic vector retrieval
   */
  public async queryVectorMemory(
    query: string,
    options?: { userId?: string; topK?: number; minSimilarity?: number }
  ): Promise<any[]> {
    try {
      const res = await fetch('/api/memory/vector/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...options })
      })
      const data = await res.json()
      return data.results || []
    } catch (_e) {
      return []
    }
  }

  /**
   * Agent Registry: Lists all registered specialized agents
   */
  public async fetchRegisteredAgents(): Promise<any[]> {
    try {
      const res = await fetch('/api/agents/registry')
      const data = await res.json()
      return data.agents || []
    } catch (_e) {
      return []
    }
  }
}

export const agentClientService = new AgentClientService()
