/**
 * Central Task Manager for Listening + Plan Execution Agent
 * Manages task lifecycles, execution states, user authorizations, and context history.
 */

import type { TaskMemory, TaskStatus } from './types'
import { intentClassifier } from './intentClassifier'
import { planGenerator } from './planGenerator'
import { executionEngine } from './executionEngine'

export class TaskManager {
  private tasks = new Map<string, TaskMemory>()

  /**
   * Generates a unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  }

  /**
   * Primary entry point: Listens to voice transcript or text, analyzes intent,
   * generates plan, and executes through the agent loop.
   */
  public async listenAndExecute(
    rawInput: string,
    inputType: 'voice' | 'text' = 'text',
    userId: string = 'default_user',
    contextMemory?: Record<string, any>
  ): Promise<TaskMemory> {
    const taskId = this.generateTaskId()
    const now = Date.now()

    const task: TaskMemory = {
      taskId,
      userId,
      rawInput,
      cleanedInput: '',
      inputType,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      currentStepIndex: 0,
      stepOutputs: {},
      traces: [],
      contextMemory
    }

    this.tasks.set(taskId, task)

    // 1. SMART LISTENING & INTENT CLASSIFICATION
    task.status = 'analyzing'
    const intent = await intentClassifier.analyzeIntent(rawInput, contextMemory)
    task.cleanedInput = intent.cleanedInput
    task.category = intent.category

    // If request is ambiguous or missing required information
    if (intent.isAmbiguous || intent.category === 'clarification_needed') {
      task.status = 'clarification_needed'
      task.clarificationQuestion =
        intent.clarificationQuestion || "Could you clarify what you'd like me to accomplish?"
      task.finalResponse = {
        spokenText: task.clarificationQuestion,
        displayText: `❓ **Clarification needed:**\n\n${task.clarificationQuestion}`,
        completedSteps: 0,
        totalSteps: 0,
        executionDurationMs: Date.now() - now
      }
      return task
    }

    // 2. DYNAMIC PLAN GENERATION
    task.status = 'planning'
    const plan = await planGenerator.generatePlan(taskId, intent)
    task.plan = plan

    // 3. EXECUTE PLAN
    const executedTask = await executionEngine.runPlan(task)
    this.tasks.set(taskId, executedTask)
    return executedTask
  }

  /**
   * Resumes execution for a task waiting for user authorization
   */
  public async confirmTaskStep(
    taskId: string,
    approved: boolean,
    userNotes?: string
  ): Promise<TaskMemory> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`)
    }

    if (task.status !== 'waiting_confirmation' || !task.plan) {
      return task
    }

    if (!approved) {
      task.status = 'cancelled'
      task.error = userNotes || 'Action cancelled by user authorization decline.'
      task.pendingConfirmation = undefined
      return task
    }

    // Mark step confirmed and continue
    const currentStep = task.plan.steps[task.currentStepIndex]
    if (currentStep) {
      currentStep.requiresConfirmation = false
      currentStep.status = 'pending'
    }
    task.pendingConfirmation = undefined

    const executedTask = await executionEngine.runPlan(task)
    this.tasks.set(taskId, executedTask)
    return executedTask
  }

  /**
   * Cancels a running task
   */
  public cancelTask(taskId: string, reason?: string): TaskMemory | null {
    const task = this.tasks.get(taskId)
    if (!task) return null

    task.status = 'cancelled'
    task.error = reason || 'Task cancelled by user request.'
    task.updatedAt = Date.now()
    return task
  }

  /**
   * Retrieves task by ID
   */
  public getTask(taskId: string): TaskMemory | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Lists recent tasks for a user
   */
  public listTasks(userId?: string, limit: number = 20): TaskMemory[] {
    const list = Array.from(this.tasks.values())
    const filtered = userId ? list.filter((t) => t.userId === userId) : list
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
  }
}

export const taskManager = new TaskManager()
