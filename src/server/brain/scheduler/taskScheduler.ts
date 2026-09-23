/**
 * Advanced AI Brain - Task Graph & Priority Scheduler
 * Manages DAG dependency resolution, priority queuing (CRITICAL > HIGH > NORMAL > LOW),
 * and progressive execution with concurrency safety.
 */

import type { BrainTask, TaskGraph, TaskPriority, TaskStatus } from '../types'
import { brainAgentRegistry } from '../agents/specializedAgents'
import { brainSelfVerifier } from '../verification/selfVerifier'

const PRIORITY_SCORES: Record<TaskPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
}

export class TaskScheduler {
  /**
   * Evaluates which tasks in the graph are ready to execute.
   * A task is ready if:
   * 1. Its status is QUEUED or PLANNING
   * 2. All tasks in its `dependencies` list have status COMPLETED
   */
  public getReadyTasks(graph: TaskGraph): BrainTask[] {
    const completedTaskIds = new Set(
      graph.tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.taskId)
    )

    const ready = graph.tasks.filter((task) => {
      if (task.status !== 'QUEUED' && task.status !== 'PLANNING') {
        return false
      }
      return task.dependencies.every((depId) => completedTaskIds.has(depId))
    })

    // Sort by priority (highest priority first)
    return ready.sort((a, b) => {
      const scoreA = PRIORITY_SCORES[a.priority] || 2
      const scoreB = PRIORITY_SCORES[b.priority] || 2
      if (scoreA !== scoreB) {
        return scoreB - scoreA
      }
      return a.createdAt - b.createdAt
    })
  }

  /**
   * Injects outputs from completed dependencies into downstream task parameters
   */
  public resolveTaskContext(task: BrainTask, graph: TaskGraph): Record<string, any> {
    const context: Record<string, any> = { ...task.parameters }

    for (const depId of task.dependencies) {
      const depTask = graph.tasks.find((t) => t.taskId === depId)
      if (depTask?.result) {
        context[`dep_${depId}_output`] = depTask.result
        // If query/prompt is empty, inherit from previous task summary or text
        if (!context.query && depTask.result?.summary) {
          context.query = depTask.result.summary
        }
        if (!context.prompt && depTask.result?.analysis) {
          context.prompt = depTask.result.analysis
        }
      }
    }

    return context
  }

  /**
   * Executes a single task through agent selection, verification, and recovery
   */
  public async executeTaskNode(task: BrainTask, graph: TaskGraph): Promise<BrainTask> {
    task.status = 'RUNNING'
    task.updatedAt = Date.now()

    const agent = brainAgentRegistry.get(task.assignedAgent)
    if (!agent) {
      task.status = 'FAILED'
      task.error = `No specialized agent registered for role "${task.assignedAgent}".`
      task.updatedAt = Date.now()
      return task
    }

    const resolvedParams = this.resolveTaskContext(task, graph)
    task.parameters = resolvedParams

    let attemptDone = false

    while (!attemptDone) {
      task.attempts++
      const startTime = Date.now()

      // Backoff if prescribed
      if (task.parameters?._retryBackoffMs) {
        await new Promise((r) => setTimeout(r, Math.min(task.parameters._retryBackoffMs, 3000)))
      }

      const execResult = await agent.execute(task, graph.contextMemory)
      task.executionDurationMs = Date.now() - startTime

      // Step Verification
      task.status = 'VERIFYING'
      const verification = brainSelfVerifier.verify(task, execResult.output, execResult.error)

      if (verification.passed) {
        task.status = 'COMPLETED'
        task.verificationStatus = 'VERIFIED'
        task.result = execResult.output
        task.error = undefined
        task.completedAt = Date.now()
        task.updatedAt = Date.now()
        attemptDone = true
      } else {
        // Recovery evaluation
        if (verification.suggestedAction === 'ALTERNATIVE_TOOL' && verification.alternativeTool) {
          task.requiredTools = [verification.alternativeTool, ...task.requiredTools]
          task.parameters = verification.correctedParameters || task.parameters
          task.verificationStatus = 'RECOVERED'
          // Next loop iteration will run with alternative tool
        } else if (verification.suggestedAction === 'RETRY' && verification.safeToRetry) {
          task.parameters = verification.correctedParameters || task.parameters
          task.verificationStatus = 'PENDING'
          // Next loop iteration will retry
        } else {
          // Failed and not retryable or exceeded limit
          task.status = 'FAILED'
          task.verificationStatus = 'FAILED'
          task.error = verification.reason || execResult.error || 'Self-verification check failed.'
          task.updatedAt = Date.now()
          attemptDone = true
        }
      }
    }

    return task
  }

  /**
   * Executes the entire graph until completion, failure, or pause
   */
  public async runGraph(graph: TaskGraph, onTaskUpdate?: (task: BrainTask) => void): Promise<TaskGraph> {
    graph.status = 'RUNNING'
    graph.updatedAt = Date.now()

    let hasUnfinished = true

    while (hasUnfinished) {
      const readyTasks = this.getReadyTasks(graph)

      if (readyTasks.length === 0) {
        // Check if all are finished or if graph is blocked
        const unfinished = graph.tasks.filter(
          (t) => t.status !== 'COMPLETED' && t.status !== 'FAILED' && t.status !== 'CANCELLED'
        )

        if (unfinished.length === 0) {
          // All done!
          const anyFailed = graph.tasks.some((t) => t.status === 'FAILED')
          graph.status = anyFailed ? 'FAILED' : 'COMPLETED'
          graph.completedAt = Date.now()
          hasUnfinished = false
        } else {
          // Deadlock or waiting
          graph.status = 'FAILED'
          hasUnfinished = false
        }
        break
      }

      // Execute ready tasks sequentially in priority order
      for (const task of readyTasks) {
        await this.executeTaskNode(task, graph)
        onTaskUpdate?.(task)

        // If a CRITICAL task fails, pause or fail remaining dependent tasks
        if (task.status === 'FAILED' && task.priority === 'CRITICAL') {
          graph.status = 'FAILED'
          hasUnfinished = false
          break
        }
      }
    }

    graph.updatedAt = Date.now()
    return graph
  }
}

export const taskScheduler = new TaskScheduler()
