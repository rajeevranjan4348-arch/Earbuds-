/**
 * IRIS — Agent Runtime Coordinator
 * 
 * Manages active task runtime state, execution timeouts, cancellation tokens,
 * step status events, and hooks into Iris Core & Tool Router.
 */

import { AgentExecutionPlan, PlanTaskStep, AgentExecutionResult } from './types'
import { androidToolRouter } from './AndroidToolRouter'
import { irisPlanner } from './IrisPlanner'
import { irisCommandParser } from './IrisCommandParser'
import { irisActionConfirmation } from './IrisActionConfirmation'
import { verificationEngine } from './VerificationEngine'

export interface RuntimeTaskOptions {
  timeoutMs?: number
  onStepProgress?: (step: PlanTaskStep) => void
  onStatusChange?: (status: string) => void
}

export class IrisAgentRuntime {
  private static instance: IrisAgentRuntime
  private activeControllers: Map<string, AbortController> = new Map()

  public static getInstance(): IrisAgentRuntime {
    if (!IrisAgentRuntime.instance) {
      IrisAgentRuntime.instance = new IrisAgentRuntime()
    }
    return IrisAgentRuntime.instance
  }

  /**
   * Executes a user natural language prompt with timeout, cancellation, and step progress tracking
   */
  public async executeCommand(
    prompt: string,
    options: RuntimeTaskOptions = {}
  ): Promise<AgentExecutionResult> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const controller = new AbortController()
    this.activeControllers.set(taskId, controller)

    const timeoutMs = options.timeoutMs || 30000
    const timeoutTimer = setTimeout(() => {
      controller.abort('TASK_TIMEOUT')
    }, timeoutMs)

    try {
      options.onStatusChange?.('Parsing intent...')
      const intent = irisCommandParser.parse(prompt)

      // Permission & Safety Check
      const confirmCheck = await irisActionConfirmation.requireConfirmationIfNeeded(
        intent.intent,
        intent.parameters
      )

      if (!confirmCheck.approved) {
        return {
          taskId,
          success: false,
          summary: `Action stopped: User declined confirmation. ${confirmCheck.reason || ''}`,
          stepsExecuted: 0,
          totalSteps: 1,
          finalStateHash: '',
          durationMs: 0
        }
      }

      options.onStatusChange?.('Formulating plan...')
      const plan = irisPlanner.createPlan(intent)

      let stepsDone = 0
      for (let i = 0; i < plan.steps.length; i++) {
        if (controller.signal.aborted) {
          throw new Error(controller.signal.reason || 'Task cancelled by user.')
        }

        const step = plan.steps[i]
        step.status = 'running'
        options.onStepProgress?.(step)

        const result = await androidToolRouter.executeIntent({
          ...intent,
          intent: step.action as any,
          parameters: step.parameters || intent.parameters
        })

        if (controller.signal.aborted) {
          throw new Error(controller.signal.reason || 'Task cancelled by user.')
        }

        if (result.success) {
          step.status = 'completed'
          step.result = result.output
          step.verificationStatus = 'verified'
          stepsDone++
          options.onStepProgress?.(step)
        } else {
          step.status = 'failed'
          step.error = result.output
          options.onStepProgress?.(step)

          return {
            taskId,
            success: false,
            summary: `Execution failed at step ${i + 1} (${step.description}): ${result.output}`,
            stepsExecuted: stepsDone,
            totalSteps: plan.steps.length,
            finalStateHash: '',
            durationMs: Date.now() - plan.createdAt
          }
        }
      }

      return {
        taskId,
        success: true,
        summary: plan.steps[plan.steps.length - 1]?.result || 'Command executed successfully.',
        stepsExecuted: stepsDone,
        totalSteps: plan.steps.length,
        finalStateHash: 'hash_success',
        durationMs: Date.now() - plan.createdAt
      }
    } catch (err: any) {
      return {
        taskId,
        success: false,
        summary: `Task execution aborted: ${err.message || String(err)}`,
        stepsExecuted: 0,
        totalSteps: 0,
        finalStateHash: 'hash_aborted',
        durationMs: 0
      }
    } finally {
      clearTimeout(timeoutTimer)
      this.activeControllers.delete(taskId)
    }
  }

  /**
   * Cancels a running task
   */
  public cancelTask(taskId: string, reason = 'User requested cancellation'): boolean {
    const controller = this.activeControllers.get(taskId)
    if (controller) {
      controller.abort(reason)
      this.activeControllers.delete(taskId)
      return true
    }
    return false
  }

  /**
   * Cancels all active runtime tasks
   */
  public cancelAllTasks(reason = 'System reset'): void {
    for (const [id, controller] of this.activeControllers.entries()) {
      controller.abort(reason)
      this.activeControllers.delete(id)
    }
  }
}

export const irisAgentRuntime = IrisAgentRuntime.getInstance()
