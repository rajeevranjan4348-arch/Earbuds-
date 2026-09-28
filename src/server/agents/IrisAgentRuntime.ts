/**
 * IRIS Agent Runtime
 *
 * Unified runtime for planning, permissions, verification, streaming lifecycle,
 * memory boundaries, cancellation, recovery and task timelines.
 *
 * This is intentionally UI-agnostic. Existing UI/voice/android adapters can
 * subscribe to lifecycle events without owning a second orchestration system.
 */

export type IrisTaskStatus =
  | 'queued'
  | 'planning'
  | 'awaiting_permission'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'recovering'
  | 'awaiting_external'

export type IrisPermissionLevel = 'public' | 'standard' | 'sensitive' | 'admin'

export interface IrisPlanStep {
  id: string
  title: string
  tool?: string
  permission: IrisPermissionLevel
  verify?: string
}

export interface IrisTask {
  id: string
  input: string
  status: IrisTaskStatus
  steps: IrisPlanStep[]
  currentStep: number
  createdAt: string
  updatedAt: string
  error?: string
}

export interface IrisRuntimeEvent {
  taskId: string
  type:
    | 'task'
    | 'plan'
    | 'permission'
    | 'tool'
    | 'verification'
    | 'voice'
    | 'recovery'
    | 'error'
  status: IrisTaskStatus | 'info'
  message: string
  timestamp: string
  data?: Record<string, unknown>
}

type Listener = (event: IrisRuntimeEvent) => void

const MAX_TASKS = 100

function now() {
  return new Date().toISOString()
}

function id(prefix: string) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

export class IrisAgentRuntime {
  private tasks = new Map<string, IrisTask>()
  private listeners = new Set<Listener>()
  private activeExecutions = new Map<string, AbortController>()
  private stopped = false

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: IrisRuntimeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // A UI/telemetry subscriber must never break agent execution.
      }
    }
  }

  private saveTask(task: IrisTask) {
    task.updatedAt = now()
    this.tasks.set(task.id, task)

    while (this.tasks.size > MAX_TASKS) {
      const oldest = this.tasks.keys().next().value
      if (oldest) this.tasks.delete(oldest)
      else break
    }

    try {
      if (typeof globalThis.localStorage !== 'undefined') {
        localStorage.setItem('iris-agent-tasks', JSON.stringify(Array.from(this.tasks.values())))
      }
    } catch {
      // Persistence is best-effort on server/runtime hosts without localStorage.
    }
  }

  private makePlan(input: string): IrisPlanStep[] {
    const text = input.toLowerCase().trim()
    const steps: IrisPlanStep[] = []

    if (containsAny(text, ['search', 'latest', 'news', 'find online', 'web'])) {
      steps.push({
        id: id('step'),
        title: 'Search current web knowledge',
        tool: 'web_search',
        permission: 'standard',
        verify: 'search_results'
      })
    }

    if (containsAny(text, ['youtube', 'whatsapp', 'chrome', 'instagram', 'telegram', 'spotify', 'open app'])) {
      steps.push({
        id: id('step'),
        title: 'Control the requested Android/app target',
        tool: 'android_companion_hub',
        permission: 'sensitive',
        verify: 'target_app_visible'
      })
    }

    if (containsAny(text, ['remember', 'save this', 'my preference', 'memory'])) {
      steps.push({
        id: id('step'),
        title: 'Store the requested durable memory',
        tool: 'memory_store',
        permission: 'standard',
        verify: 'memory_saved'
      })
    }

    if (containsAny(text, ['image', 'draw', 'generate a picture', 'create an image'])) {
      steps.push({
        id: id('step'),
        title: 'Generate the requested image',
        tool: 'generate_flux_image',
        permission: 'standard',
        verify: 'image_created'
      })
    }

    if (containsAny(text, ['code', 'fix', 'bug', 'error', 'repository', 'github'])) {
      steps.push({
        id: id('step'),
        title: 'Inspect and verify the requested code task',
        tool: 'github_project_control',
        permission: 'standard',
        verify: 'verification_gate'
      })
    }

    if (steps.length === 0) {
      steps.push({
        id: id('step'),
        title: 'Process the request with the primary Iris model',
        permission: 'standard',
        verify: 'response_ready'
      })
    }

    return steps
  }

  createTask(input: string): IrisTask {
    const task: IrisTask = {
      id: id('task'),
      input: input.trim(),
      status: 'queued',
      steps: [],
      currentStep: -1,
      createdAt: now(),
      updatedAt: now()
    }

    this.saveTask(task)
    this.emit({
      taskId: task.id,
      type: 'task',
      status: task.status,
      message: 'Task queued',
      timestamp: now()
    })
    return task
  }

  planTask(taskId: string): IrisTask {
    const task = this.requireTask(taskId)
    if (this.stopped) throw new Error('Iris emergency stop is active')

    task.status = 'planning'
    task.steps = this.makePlan(task.input)
    task.currentStep = -1
    this.saveTask(task)

    this.emit({
      taskId,
      type: 'plan',
      status: task.status,
      message: 'Execution plan created',
      timestamp: now(),
      data: { stepCount: task.steps.length, steps: task.steps }
    })

    return task
  }

  async execute<T>(
    taskId: string,
    action: (step: IrisPlanStep, signal: AbortSignal) => Promise<T>,
    options: {
      requirePermission?: (step: IrisPlanStep) => Promise<boolean> | boolean
      verify?: (step: IrisPlanStep, result: T) => Promise<boolean | 'pending'> | boolean | 'pending'
      recover?: (step: IrisPlanStep, error: unknown) => Promise<boolean> | boolean
    } = {}
  ): Promise<T[]> {
    const task = this.requireTask(taskId)
    if (!task.steps.length) this.planTask(taskId)

    const controller = new AbortController()
    this.activeExecutions.set(taskId, controller)
    const results: T[] = []

    try {
      for (let index = 0; index < task.steps.length; index++) {
        if (this.stopped || controller.signal.aborted) {
          task.status = 'cancelled'
          this.saveTask(task)
          this.emit({
            taskId,
            type: 'task',
            status: task.status,
            message: 'Task cancelled',
            timestamp: now()
          })
          throw new Error('Task cancelled')
        }

        const step = task.steps[index]
        task.currentStep = index

        if (step.permission === 'sensitive' || step.permission === 'admin') {
          task.status = 'awaiting_permission'
          this.saveTask(task)
          this.emit({
            taskId,
            type: 'permission',
            status: task.status,
            message: 'Permission required before sensitive action',
            timestamp: now(),
            data: { stepId: step.id, permission: step.permission, tool: step.tool }
          })

          const allowed = options.requirePermission ? await options.requirePermission(step) : false
          if (!allowed) {
            task.status = 'failed'
            task.error = 'Permission denied'
            this.saveTask(task)
            throw new Error('Permission denied for ' + step.title)
          }
        }

        task.status = 'executing'
        this.saveTask(task)
        this.emit({
          taskId,
          type: 'tool',
          status: task.status,
          message: step.title,
          timestamp: now(),
          data: { stepId: step.id, tool: step.tool }
        })

        let result: T
        try {
          result = await action(step, controller.signal)
        } catch (error) {
          task.status = 'recovering'
          this.saveTask(task)
          this.emit({
            taskId,
            type: 'recovery',
            status: task.status,
            message: 'Action failed; recovery path started',
            timestamp: now(),
            data: { stepId: step.id }
          })

          const recovered = options.recover ? await options.recover(step, error) : false
          if (!recovered) throw error
          result = await action(step, controller.signal)
        }

        task.status = 'verifying'
        this.saveTask(task)
        this.emit({
          taskId,
          type: 'verification',
          status: task.status,
          message: 'Verifying action result',
          timestamp: now(),
          data: { stepId: step.id, verification: step.verify }
        })

        const verified = options.verify ? await options.verify(step, result) : true
        if (verified === 'pending') {
          task.status = 'awaiting_external'
          task.error = undefined
          this.saveTask(task)
          this.emit({
            taskId,
            type: 'verification',
            status: task.status,
            message: 'External adapter must report completion before this task can finish',
            timestamp: now(),
            data: { stepId: step.id, tool: step.tool }
          })
          results.push(result)
          return results
        }

        if (!verified) {
          task.status = 'failed'
          task.error = 'Action verification failed'
          this.saveTask(task)
          throw new Error('Verification failed for ' + step.title)
        }

        results.push(result)
      }

      task.status = 'completed'
      this.saveTask(task)
      this.emit({
        taskId,
        type: 'task',
        status: task.status,
        message: 'Task completed and verified',
        timestamp: now()
      })
      return results
    } catch (error) {
      if (task.status !== 'cancelled') {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : String(error)
        this.saveTask(task)
        this.emit({
          taskId,
          type: 'error',
          status: task.status,
          message: task.error,
          timestamp: now()
        })
      }
      throw error
    } finally {
      this.activeExecutions.delete(taskId)
    }
  }

  cancel(taskId: string) {
    const controller = this.activeExecutions.get(taskId)
    if (controller) controller.abort()

    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'cancelled'
      this.saveTask(task)
    }

    this.emit({
      taskId,
      type: 'task',
      status: 'cancelled',
      message: 'Task cancelled',
      timestamp: now()
    })
  }

  emergencyStop(reason = 'User initiated emergency halt') {
    this.stopped = true
    for (const controller of this.activeExecutions.values()) controller.abort()
    for (const task of this.tasks.values()) {
      if (task.status === 'executing' || task.status === 'planning' || task.status === 'awaiting_permission' || task.status === 'awaiting_external') {
        task.status = 'cancelled'
        task.error = reason
        task.updatedAt = now()
      }
    }

    this.emit({
      taskId: 'system',
      type: 'task',
      status: 'cancelled',
      message: 'All active Iris tasks stopped',
      timestamp: now(),
      data: { reason }
    })
  }

  resume() {
    this.stopped = false
    this.emit({
      taskId: 'system',
      type: 'recovery',
      status: 'info',
      message: 'Iris runtime resumed',
      timestamp: now()
    })
  }

  getTask(taskId: string) {
    return this.tasks.get(taskId)
  }

  getTasks() {
    return Array.from(this.tasks.values())
  }

  getActiveTasks() {
    return this.getTasks().filter((task) =>
      ['queued', 'planning', 'awaiting_permission', 'executing', 'verifying', 'recovering', 'awaiting_external'].includes(task.status)
    )
  }

  private requireTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error('Iris task not found: ' + taskId)
    return task
  }
}

export const irisAgentRuntime = new IrisAgentRuntime()
