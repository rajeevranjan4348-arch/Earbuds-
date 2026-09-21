/**
 * Autonomous Android Agent Loop
 * Synthesized from:
 * - Android Agent (adev0x/android-agent - AgentLoop)
 * - OpenDroid (yashab-cyber/opendroid - PlanManager & ActionRisk)
 *
 * Implements the full Observe -> Reason -> Act cycle:
 * 1. Checks Accessibility permission (reports clear status if missing)
 * 2. Executes each step in the TaskPlan sequentially
 * 3. Observes pre/post screen changes
 * 4. Intercepts sensitive/irreversible actions and pauses for confirmation
 * 5. Recovers from stuck states (stuck counter + adaptive heuristics)
 * 6. Returns structured outcomes to AI chat & voice synthesis
 */

import {
  AgentExecutionResult,
  PendingConfirmation,
  PlanStep,
  ScreenChangeComparison,
  ScreenState,
  TaskPlan
} from './types'
import { accessibilityService } from './accessibilityService'
import { actionExecutor } from './actionExecutor'
import { taskPlanner } from './taskPlanner'

export class AgentLoop {
  private static instance: AgentLoop
  private activePlan: TaskPlan | null = null
  private pendingConfirmation: PendingConfirmation | null = null
  private stuckCounter = 0
  private maxStuckThreshold = 2

  private constructor() {
    this.stuckCounter = 0
  }

  public static getInstance(): AgentLoop {
    if (!AgentLoop.instance) {
      AgentLoop.instance = new AgentLoop()
    }
    return AgentLoop.instance
  }

  public getActivePlan(): TaskPlan | null {
    return this.activePlan
  }

  public getPendingConfirmation(): PendingConfirmation | null {
    return this.pendingConfirmation
  }

  public hasPendingConfirmation(): boolean {
    return this.pendingConfirmation !== null
  }

  /**
   * Executes a full natural-language task autonomously.
   */
  public async executeTask(userPrompt: string): Promise<AgentExecutionResult> {
    // 1. Verify Android Accessibility permissions
    const perm = await accessibilityService.checkPermission()
    if (!perm.granted) {
      return {
        success: false,
        status: 'PERMISSION_REQUIRED',
        goal: userPrompt,
        summary: 'Android Accessibility Service permission is required.',
        spokenResponse:
          'Accessibility service permission is needed to control Android apps. Please enable IRIS in your device Accessibility Settings.',
        displayText:
          '⚠️ Accessibility Permission Required: Please enable the IRIS Accessibility Service in Android Settings > Accessibility to allow screen control and app navigation.',
        stepsExecuted: 0,
        totalSteps: 0,
        error: 'ACCESSIBILITY_PERMISSION_MISSING'
      }
    }

    // 2. Plan the sequence of actions
    const plan = await taskPlanner.planTask(userPrompt)
    this.activePlan = plan
    this.stuckCounter = 0

    return this.runExecutionLoop(plan)
  }

  /**
   * Handles user confirmation response (e.g. "yes", "confirm", "proceed" vs "no", "cancel").
   */
  public async handleConfirmationResponse(approved: boolean): Promise<AgentExecutionResult> {
    if (!this.pendingConfirmation || !this.activePlan) {
      return {
        success: false,
        status: 'FAILED',
        goal: 'Confirmation',
        summary: 'No active action awaiting confirmation.',
        spokenResponse: 'There is no pending action waiting for confirmation.',
        displayText: 'No pending action waiting for confirmation.',
        stepsExecuted: 0,
        totalSteps: 0
      }
    }

    const conf = this.pendingConfirmation
    const plan = this.activePlan
    this.pendingConfirmation = null

    if (!approved) {
      plan.status = 'cancelled'
      this.activePlan = null
      return {
        success: true,
        status: 'CANCELLED',
        goal: plan.goal,
        summary: `Action "${conf.description}" was cancelled by user.`,
        spokenResponse: 'Action cancelled. I will not proceed with that operation.',
        displayText: `⛔ Operation cancelled: ${conf.description}`,
        stepsExecuted: plan.currentStepIndex,
        totalSteps: plan.steps.length
      }
    }

    // Approved: mark current step approved and resume execution loop from this step
    const currentStep = plan.steps[conf.stepIndex]
    if (currentStep) {
      currentStep.status = 'running'
    }

    console.log(`[AgentLoop] User confirmed action: "${conf.description}". Resuming plan...`)
    return this.runExecutionLoop(plan, conf.stepIndex)
  }

  /**
   * Main execution loop iterating through planned steps.
   */
  private async runExecutionLoop(
    plan: TaskPlan,
    startStepIndex = 0
  ): Promise<AgentExecutionResult> {
    plan.status = 'executing'
    let stepsRun = startStepIndex

    for (let i = startStepIndex; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      plan.currentStepIndex = i

      // 1. Safety Check: If step requires confirmation, halt and ask user
      if (step.requiresConfirmation && step.status !== 'running') {
        const conf: PendingConfirmation = {
          id: `conf_${Date.now()}`,
          stepIndex: i,
          action: step.action,
          description: step.description,
          reason: step.action.params?.reason || 'Sensitive action requiring user consent.',
          createdAt: Date.now()
        }

        this.pendingConfirmation = conf
        plan.status = 'awaiting_confirmation'
        plan.pendingConfirmation = conf
        step.status = 'awaiting_confirmation'

        const prompt = `I am about to: ${step.description}. ${conf.reason} Would you like me to proceed?`

        return {
          success: true,
          status: 'AWAITING_CONFIRMATION',
          goal: plan.goal,
          summary: `Paused for confirmation: ${step.description}`,
          spokenResponse: prompt,
          displayText: `🔒 **Security Confirmation Required**\n\n${conf.reason}\n\n*Reply with **"Yes / Confirm"** to proceed, or **"Cancel"** to abort.*`,
          stepsExecuted: stepsRun,
          totalSteps: plan.steps.length,
          pendingConfirmation: conf
        }
      }

      // 2. Execute step
      step.status = 'running'
      const outcome = await actionExecutor.executeAction(step.action)

      step.result = outcome.result
      step.screenChange = outcome.change.level

      if (outcome.change.level === 'NONE') {
        this.stuckCounter++
      } else {
        this.stuckCounter = 0
      }

      // 3. Stuck Recovery Heuristic
      if (this.stuckCounter >= this.maxStuckThreshold) {
        console.warn(
          `[AgentLoop] Stuck detected (${this.stuckCounter} consecutive no-op actions). Attempting recovery scroll...`
        )
        await accessibilityService.dispatchScroll('down')
        this.stuckCounter = 0
      }

      if (!outcome.success && step.action.type !== 'wait_for_element') {
        step.status = 'failed'
        step.error = outcome.error
        plan.status = 'failed'
        plan.error = outcome.error

        return {
          success: false,
          status: 'FAILED',
          goal: plan.goal,
          summary: `Step failed: ${step.description}`,
          spokenResponse: `I ran into an issue while trying to ${step.description}.`,
          displayText: `❌ Failed at step ${i + 1}/${plan.steps.length}: ${step.description}`,
          stepsExecuted: stepsRun + 1,
          totalSteps: plan.steps.length,
          error: outcome.error
        }
      }

      step.status = 'completed'
      stepsRun++
    }

    plan.status = 'completed'
    this.activePlan = null

    const finalScreen = await accessibilityService.getScreenState()
    const summary = this.buildCompletionSummary(plan, finalScreen)

    return {
      success: true,
      status: 'SUCCESS',
      goal: plan.goal,
      summary,
      spokenResponse: summary,
      displayText: `✅ **Task Completed**\n\n${summary}`,
      stepsExecuted: stepsRun,
      totalSteps: plan.steps.length,
      screenState: finalScreen
    }
  }

  private buildCompletionSummary(plan: TaskPlan, screen: ScreenState): string {
    const goalLower = plan.goal.toLowerCase()
    if (goalLower.includes('youtube')) {
      const query = plan.goal.replace(/.*(?:search youtube for|youtube)\s*/i, '').trim()
      return query ? `Opened YouTube and searched for "${query}".` : 'Opened YouTube.'
    }
    if (goalLower.includes('maps')) {
      const query = plan.goal.replace(/.*(?:search for|maps)\s*/i, '').trim()
      return query ? `Opened Google Maps and located "${query}".` : 'Opened Google Maps.'
    }
    if (goalLower.includes('settings')) {
      return 'Opened Android Settings and displayed options.'
    }
    if (goalLower.includes('scroll')) {
      return 'Scrolled the Android screen.'
    }
    if (goalLower.includes('back')) {
      return 'Navigated back.'
    }
    if (goalLower.includes('home')) {
      return 'Returned to the Android Home screen.'
    }
    return `Completed task: ${plan.goal}`
  }
}

export const agentLoop = AgentLoop.getInstance()
