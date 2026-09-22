/**
 * Listening + Plan Execution Engine
 * Orchestrates the full loop: Understand -> Plan -> Check Permissions -> Execute -> Verify -> Recover -> Continue -> Complete.
 */

import { GoogleGenAI } from '@google/genai'
import type { TaskMemory, ExecutionPlan, PlanStep, TaskStatus, TaskTraceEvent } from './types'
import { toolRegistry } from '../../tools/toolRegistry'
import { stepVerifier } from './stepVerifier'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (geminiClient) return geminiClient
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!key) return null
  try {
    geminiClient = new GoogleGenAI({ apiKey: key })
    return geminiClient
  } catch (_e) {
    return null
  }
}

export class ExecutionEngine {
  /**
   * Resolves dynamic template variables in parameters (e.g. {{step_1.output.0.title}})
   */
  private resolveParameters(
    parameters: Record<string, any>,
    stepOutputs: Record<string, any>
  ): Record<string, any> {
    const resolved: Record<string, any> = {}

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
        // Simple template resolution
        let valStr = value
        for (const [stepKey, output] of Object.entries(stepOutputs)) {
          const stepPrefix = `{{${stepKey}.output`
          if (valStr.includes(stepPrefix)) {
            // Check if looking for first element title
            if (Array.isArray(output) && output.length > 0) {
              const first = output[0]
              const title = first?.title || first?.name || first?.topic || JSON.stringify(first)
              valStr = valStr.replace(new RegExp(`\\{\\{${stepKey}\\.output.*?\\}\\}`, 'g'), title)
            } else if (typeof output === 'object' && output !== null) {
              const title = output.title || output.topic || output.query || JSON.stringify(output)
              valStr = valStr.replace(new RegExp(`\\{\\{${stepKey}\\.output.*?\\}\\}`, 'g'), title)
            }
          }
        }
        // Clean any leftover template syntax
        resolved[key] = valStr.replace(/\{\{.*?\}\}/g, '').trim() || value
      } else {
        resolved[key] = value
      }
    }

    return resolved
  }

  /**
   * Adds an execution trace entry to task memory
   */
  private logTrace(
    task: TaskMemory,
    level: 'info' | 'warn' | 'error' | 'success',
    message: string,
    details?: any,
    stepIndex?: number,
    toolName?: string
  ) {
    const trace: TaskTraceEvent = {
      timestamp: Date.now(),
      level,
      message,
      stepIndex,
      toolName,
      details
    }
    task.traces.push(trace)
    task.updatedAt = Date.now()
  }

  /**
   * Executes a single step with timeouts, verification, and error recovery
   */
  public async executeStep(
    task: TaskMemory,
    step: PlanStep
  ): Promise<{ success: boolean; output?: any; error?: string; pausedForConfirmation?: boolean }> {
    // 1. Permission and confirmation check
    if (step.requiresConfirmation && step.status !== 'waiting_confirmation') {
      step.status = 'waiting_confirmation'
      task.status = 'waiting_confirmation'
      task.pendingConfirmation = {
        stepIndex: step.stepIndex,
        stepId: step.stepId,
        toolName: step.toolName,
        reason: step.confirmationReason || `Step "${step.name}" requires user authorization.`,
        parameters: step.parameters
      }
      this.logTrace(
        task,
        'warn',
        `Step ${step.stepIndex} requires user confirmation: ${task.pendingConfirmation.reason}`,
        step.parameters,
        step.stepIndex,
        step.toolName
      )
      return { success: false, pausedForConfirmation: true }
    }

    step.status = 'running'
    step.startTime = Date.now()
    this.logTrace(
      task,
      'info',
      `Executing Step ${step.stepIndex}/${task.plan?.steps.length || 1}: "${step.name}" via tool "${step.toolName}"`,
      step.parameters,
      step.stepIndex,
      step.toolName
    )

    // 2. Resolve parameter templates from previous outputs
    const resolvedArgs = this.resolveParameters(step.parameters, task.stepOutputs)

    let rawOutput: any = null
    let executionError: string | null = null

    try {
      rawOutput = await toolRegistry.callTool(step.toolName, resolvedArgs)
    } catch (err: any) {
      executionError = err?.message || 'Tool execution encountered an exception'
      this.logTrace(task, 'error', `Tool execution error: ${executionError}`, err, step.stepIndex, step.toolName)
    }

    // 3. Step Output Verification
    step.status = 'verifying'
    const verification = stepVerifier.verify(step, rawOutput)

    if (verification.valid) {
      step.status = 'completed'
      step.endTime = Date.now()
      step.durationMs = step.endTime - (step.startTime || step.endTime)
      step.output = verification.recoveredOutput || rawOutput
      task.stepOutputs[`step_${step.stepIndex}`] = step.output

      this.logTrace(
        task,
        'success',
        `Step ${step.stepIndex} verified successfully (${step.durationMs}ms)`,
        step.output,
        step.stepIndex,
        step.toolName
      )

      return { success: true, output: step.output }
    }

    // 4. Self-Healing & Error Recovery Loop
    step.retryCount++
    this.logTrace(
      task,
      'warn',
      `Step ${step.stepIndex} verification failed: ${verification.reason}. Attempting self-healing recovery (attempt ${step.retryCount})...`,
      verification,
      step.stepIndex,
      step.toolName
    )

    const fallback = verification.suggestedFallback || step.fallbackStrategy

    if (fallback && step.retryCount <= (fallback.maxRetries || 2)) {
      task.status = 'healing'

      // Recovery Action A: Alternative Tool
      if (fallback.action === 'alternative_tool' && fallback.alternativeTool) {
        this.logTrace(
          task,
          'info',
          `Switching to alternative fallback tool "${fallback.alternativeTool}"`,
          null,
          step.stepIndex,
          fallback.alternativeTool
        )
        step.toolName = fallback.alternativeTool
        return this.executeStep(task, step)
      }

      // Recovery Action B: Modified Arguments Retry
      if (fallback.action === 'retry') {
        if (fallback.modifiedArgs) {
          step.parameters = { ...step.parameters, ...fallback.modifiedArgs }
        }
        return this.executeStep(task, step)
      }
    }

    // If recovery exhausted
    step.status = 'failed'
    step.endTime = Date.now()
    step.error = verification.reason || executionError || 'Step failed verification after retries.'
    task.status = 'failed'
    task.error = step.error

    this.logTrace(
      task,
      'error',
      `Step ${step.stepIndex} unrecoverably failed: ${step.error}`,
      null,
      step.stepIndex,
      step.toolName
    )

    return { success: false, error: step.error }
  }

  /**
   * Synthesizes final conversational and visual response from all executed step outputs
   */
  public async synthesizeFinalResponse(task: TaskMemory): Promise<{
    spokenText: string
    displayText: string
    artifacts?: any[]
  }> {
    const plan = task.plan
    const totalSteps = plan?.steps.length || 0
    const completedSteps = plan?.steps.filter((s) => s.status === 'completed' || s.status === 'recovered').length || 0

    const artifacts: any[] = []
    const stepSummaries: string[] = []

    for (const step of plan?.steps || []) {
      if (step.output) {
        // Collect artifacts (images, diagrams, scripts, locations)
        if (step.toolName === 'generate_flux_image' && step.output.imageUrl) {
          artifacts.push({ type: 'image', url: step.output.imageUrl, prompt: step.parameters.prompt })
        }
        if (step.toolName === 'generate_diagram' && step.output.diagramCode) {
          artifacts.push({ type: 'diagram', code: step.output.diagramCode, title: step.output.title })
        }
        if (step.toolName === 'youtube_create_video_job' && step.output.jobId) {
          artifacts.push({ type: 'youtube_job', job: step.output })
        }
        if (step.toolName === 'get_live_location') {
          artifacts.push({ type: 'location', data: step.output })
        }

        stepSummaries.push(`- **${step.name}**: ${typeof step.output === 'string' ? step.output.slice(0, 120) : step.output.message || 'Completed successfully'}`)
      }
    }

    // High quality synthesis via Gemini if available
    const gemini = getGemini()
    if (gemini && completedSteps > 0) {
      try {
        const prompt = `You are IRIS, an advanced autonomous AI assistant.
Synthesize a concise, helpful response for the user after executing their plan.

User Request: "${task.rawInput}"
Executed Plan Summary: "${plan?.summary || task.rawInput}"
Completed Steps: ${completedSteps} of ${totalSteps}
Step Outputs:
${JSON.stringify(task.stepOutputs, null, 2)}

Provide two outputs in JSON format:
1. "spokenText": A natural, concise verbal response suitable for voice speech synthesis (1-2 sentences, no markdown, no URLs).
2. "displayText": A structured, polished markdown summary of the result.`

        const candidateModels = [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
          'gemini-2.5-pro'
        ]

        let responseText = ''
        for (const modelCandidate of candidateModels) {
          try {
            const res = await gemini.models.generateContent({
              model: modelCandidate,
              contents: [{ text: prompt }],
              config: { responseMimeType: 'application/json' }
            })
            if (res.text) {
              responseText = res.text
              break
            }
          } catch (_mErr) {
            // Try next model candidate
          }
        }

        if (responseText) {
          const parsed = JSON.parse(responseText)
          return {
            spokenText: parsed.spokenText || `I completed your request with ${completedSteps} verified actions.`,
            displayText: parsed.displayText || stepSummaries.join('\n'),
            artifacts
          }
        }
      } catch (_e) {
        // Fall back to rule synthesis
      }
    }

    // Default synthesis
    const spoken = completedSteps === totalSteps
      ? `Task completed. All ${completedSteps} steps have been executed and verified.`
      : `Executed ${completedSteps} of ${totalSteps} steps.`

    const display = `### Plan Execution Summary\n\n${stepSummaries.join('\n\n')}\n\n**Status:** ${completedSteps}/${totalSteps} steps completed successfully.`

    return { spokenText: spoken, displayText: display, artifacts }
  }

  /**
   * Runs the complete execution plan sequentially with real-time state updates
   */
  public async runPlan(task: TaskMemory): Promise<TaskMemory> {
    if (!task.plan || task.plan.steps.length === 0) {
      task.status = 'failed'
      task.error = 'No steps in execution plan'
      return task
    }

    task.status = 'executing'
    this.logTrace(task, 'info', `Beginning plan execution with ${task.plan.steps.length} steps.`)

    const startTime = Date.now()

    for (let i = task.currentStepIndex; i < task.plan.steps.length; i++) {
      const step = task.plan.steps[i]
      task.currentStepIndex = i

      const stepRes = await this.executeStep(task, step)

      if (stepRes.pausedForConfirmation) {
        // Stop and wait for external user confirmation call
        return task
      }

      if (!stepRes.success) {
        task.status = 'failed'
        task.error = stepRes.error || `Failed at step ${step.stepIndex}`
        const synth = await this.synthesizeFinalResponse(task)
        task.finalResponse = {
          spokenText: `I encountered an issue with ${step.name}.`,
          displayText: `⚠️ **Execution stopped at Step ${step.stepIndex} (${step.name})**\n\n${task.error}`,
          completedSteps: i,
          totalSteps: task.plan.steps.length,
          executionDurationMs: Date.now() - startTime
        }
        return task
      }
    }

    // All steps succeeded
    task.status = 'completed'
    const durationMs = Date.now() - startTime
    this.logTrace(task, 'success', `All plan steps executed and verified in ${durationMs}ms.`)

    const synthesis = await this.synthesizeFinalResponse(task)
    task.finalResponse = {
      spokenText: synthesis.spokenText,
      displayText: synthesis.displayText,
      artifacts: synthesis.artifacts,
      completedSteps: task.plan.steps.length,
      totalSteps: task.plan.steps.length,
      executionDurationMs: durationMs
    }

    return task
  }
}

export const executionEngine = new ExecutionEngine()
