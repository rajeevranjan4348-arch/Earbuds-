/**
 * IRIS — Agent Task Planner
 * Decomposes high-level instructions into multi-step execution plans,
 * enforcing permission checks, risk evaluation, and step-by-step verification.
 */

import { AgentExecutionPlan, PlanTaskStep, ParsedCommandIntent } from './types'
import { androidToolRouter } from './AndroidToolRouter'
import { verificationEngine } from './VerificationEngine'

export class IrisPlanner {
  /**
   * Formulates a multi-step execution plan from a parsed command intent
   */
  public createPlan(intent: ParsedCommandIntent): AgentExecutionPlan {
    const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const steps: PlanTaskStep[] = []

    if (intent.intent === 'app_launch') {
      steps.push({
        id: `${id}_step_1`,
        index: 0,
        description: `Resolve and launch ${intent.target}`,
        tool: intent.tool,
        action: 'launch_app',
        parameters: intent.parameters,
        riskLevel: intent.risk_level,
        requiresConfirmation: false,
        status: 'pending'
      })
    } else if (intent.intent === 'phone_call') {
      steps.push({
        id: `${id}_step_1`,
        index: 0,
        description: `Verify contact details for ${intent.target}`,
        tool: 'contacts',
        action: 'resolve_contact',
        parameters: intent.parameters,
        requiredPermission: 'contacts',
        riskLevel: 'low',
        requiresConfirmation: false,
        status: 'pending'
      })
      steps.push({
        id: `${id}_step_2`,
        index: 1,
        description: `Initiate phone call to ${intent.target}`,
        tool: 'phone',
        action: 'dial',
        parameters: intent.parameters,
        requiredPermission: 'calls',
        riskLevel: 'high',
        requiresConfirmation: true,
        status: 'pending'
      })
    } else if (intent.intent === 'send_message') {
      steps.push({
        id: `${id}_step_1`,
        index: 0,
        description: `Draft message to ${intent.target}`,
        tool: 'messages',
        action: 'draft',
        parameters: intent.parameters,
        requiredPermission: 'contacts',
        riskLevel: 'low',
        requiresConfirmation: false,
        status: 'pending'
      })
      steps.push({
        id: `${id}_step_2`,
        index: 1,
        description: `Transmit message to ${intent.target}`,
        tool: 'messages',
        action: 'send',
        parameters: intent.parameters,
        requiredPermission: 'messaging',
        riskLevel: 'high',
        requiresConfirmation: true,
        status: 'pending'
      })
    } else {
      steps.push({
        id: `${id}_step_1`,
        index: 0,
        description: `Execute ${intent.intent}`,
        tool: intent.tool,
        action: intent.intent,
        parameters: intent.parameters,
        requiredPermission: intent.required_permissions[0],
        riskLevel: intent.risk_level,
        requiresConfirmation: intent.requires_confirmation,
        status: 'pending'
      })
    }

    return {
      id,
      userPrompt: intent.rawPrompt,
      intent,
      steps,
      currentStepIndex: 0,
      status: 'planning',
      createdAt: Date.now()
    }
  }

  /**
   * Execute an execution plan step by step
   */
  public async executePlan(plan: AgentExecutionPlan): Promise<{ success: boolean; response: string }> {
    plan.status = 'executing'

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]
      plan.currentStepIndex = i
      step.status = 'running'

      try {
        const res = await androidToolRouter.executeIntent(plan.intent)
        if (res.success) {
          step.status = 'completed'
          step.result = res.output
          step.verificationStatus = 'verified'
        } else {
          step.status = 'failed'
          step.error = res.output
          plan.status = 'failed'
          return { success: false, response: res.output }
        }
      } catch (err: any) {
        step.status = 'failed'
        step.error = err.message
        plan.status = 'failed'
        return { success: false, response: `Step failed: ${err.message}` }
      }
    }

    plan.status = 'completed'
    plan.completedAt = Date.now()
    const lastStep = plan.steps[plan.steps.length - 1]
    return { success: true, response: lastStep?.result || 'Action completed successfully.' }
  }
}

export const irisPlanner = new IrisPlanner()
