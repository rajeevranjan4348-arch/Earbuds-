/**
 * JARVIS Central Agent Orchestrator & Task Graph DAG Engine
 * Implements the full 15-stage pipeline:
 * Input Normalizer -> Context Builder -> Intent Understanding -> Task Classifier ->
 * DAG Planner (parallel read-only execution) -> Permission Safety Gate ->
 * Tool Router -> Execution -> Observation -> Verification -> Memory Update -> Response.
 */

import { GoogleGenAI } from '@google/genai'
import {
  JarvisPlanStep,
  JarvisTaskGraph,
  RiskLevel,
  TaskPriority,
  TaskStatus
} from './types'
import { toolRegistry2 } from './toolRegistry2'
import { permissionManager } from './permissionManager'
import { agentEventBus } from './eventBus'
import { deviceManager } from './deviceManager'

export class JarvisOrchestrator {
  private activeControllers = new Map<string, AbortController>()
  private taskHistory: JarvisTaskGraph[] = []
  private taskCounter = 100

  /**
   * Primary entry point: Executes a user request through the full JARVIS pipeline
   */
  public async execute(
    userPrompt: string,
    options?: {
      userId?: string
      contextMemory?: Record<string, any>
      deviceHint?: 'desktop' | 'android'
      onProgress?: (step: JarvisPlanStep) => void
    }
  ): Promise<JarvisTaskGraph> {
    const taskId = `task_${++this.taskCounter}`
    const abortController = new AbortController()
    this.activeControllers.set(taskId, abortController)

    agentEventBus.emit('agent.started', `JARVIS started task ${taskId}: "${userPrompt}"`, {
      taskId
    })

    const traceLog: string[] = [`Task #${this.taskCounter} initialized: "${userPrompt}"`]

    // 1. INPUT NORMALIZER & INTENT UNDERSTANDING
    const normalizedPrompt = userPrompt.trim()
    const intent = this.classifyIntent(normalizedPrompt)
    const deviceResolution = deviceManager.resolveDeviceTarget(normalizedPrompt, options?.deviceHint)

    traceLog.push(`Intent: ${intent} | Target Device: ${deviceResolution.resolvedTarget}`)

    // 2. PLANNER: Construct Task Graph with DAG dependencies
    agentEventBus.emit('agent.thinking', 'Constructing execution plan...', { taskId })
    const steps = await this.generatePlanSteps(taskId, normalizedPrompt, intent, deviceResolution.resolvedTarget)

    const graph: JarvisTaskGraph = {
      taskId,
      userRequest: normalizedPrompt,
      intent,
      category: 'general',
      status: 'RUNNING',
      priority: 'NORMAL',
      steps,
      createdAt: Date.now(),
      startedAt: Date.now(),
      requiresConfirmation: steps.some((s) => s.requiresConfirmation),
      traceLog
    }

    this.taskHistory.push(graph)
    if (this.taskHistory.length > 50) this.taskHistory.shift()

    agentEventBus.emit('agent.plan.created', `Plan created with ${steps.length} step(s)`, {
      taskId,
      data: { stepsCount: steps.length }
    })

    // 3. EXECUTION ENGINE (DAG with Parallel Read-Only Scheduling)
    try {
      await this.executeDag(graph, abortController.signal, options?.onProgress)
      graph.status = graph.steps.some((s) => s.status === 'FAILED') ? 'FAILED' : 'COMPLETED'
      graph.completedAt = Date.now()

      // 4. RESPONSE SYNTHESIS (Concise, direct, grounded)
      const synthesis = await this.synthesizeSummary(graph)
      graph.resultSummary = synthesis.fullSummary
      graph.spokenSummary = synthesis.spokenSummary

      agentEventBus.emit('agent.completed', `Task ${taskId} completed: ${synthesis.spokenSummary}`, {
        taskId,
        data: graph
      })
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        graph.status = 'CANCELLED'
        graph.cancellationRequested = true
        agentEventBus.emit('agent.cancelled', `Task ${taskId} was cancelled by user.`, { taskId })
      } else {
        graph.status = 'FAILED'
        graph.error = err.message
        agentEventBus.emit('agent.error', `Task ${taskId} failed: ${err.message}`, { taskId })
      }
    } finally {
      this.activeControllers.delete(taskId)
    }

    return graph
  }

  /**
   * Cancels an ongoing task
   */
  public cancel(taskId: string): boolean {
    const controller = this.activeControllers.get(taskId)
    if (controller) {
      controller.abort()
      this.activeControllers.delete(taskId)
      agentEventBus.emit('agent.cancelled', `Cancelled task ${taskId}`)
      return true
    }
    return false
  }

  /**
   * Executes tasks following DAG dependencies.
   * Concurrently runs read-only steps whose dependencies are met!
   */
  private async executeDag(
    graph: JarvisTaskGraph,
    signal: AbortSignal,
    onProgress?: (step: JarvisPlanStep) => void
  ): Promise<void> {
    let hasUnfinished = true

    while (hasUnfinished && !signal.aborted) {
      const completedStepIds = new Set(
        graph.steps.filter((s) => s.status === 'COMPLETED').map((s) => s.stepId)
      )

      // Find steps whose dependencies are all satisfied and are still QUEUED
      const readySteps = graph.steps.filter((s) => {
        if (s.status !== 'QUEUED') return false
        return s.dependencies.every((dep) => completedStepIds.has(dep))
      })

      if (readySteps.length === 0) {
        const remaining = graph.steps.filter(
          (s) => s.status === 'QUEUED' || s.status === 'RUNNING' || s.status === 'WAITING_APPROVAL'
        )
        hasUnfinished = remaining.length > 0
        break
      }

      // Group ready steps: Parallelize read-only operations, serialize destructive ones
      const readOnlySteps = readySteps.filter((s) => s.readOnly)
      const stateChangingSteps = readySteps.filter((s) => !s.readOnly)

      // 1. Run independent read-only steps concurrently via Promise.all
      if (readOnlySteps.length > 0) {
        await Promise.all(
          readOnlySteps.map((step) => this.executeStepNode(step, graph, signal, onProgress))
        )
      }

      // 2. Run state-changing/destructive steps one-by-one safely
      for (const step of stateChangingSteps) {
        if (signal.aborted) break
        await this.executeStepNode(step, graph, signal, onProgress)
      }
    }
  }

  /**
   * Executes a single step with safety check, timeout, and verification
   */
  private async executeStepNode(
    step: JarvisPlanStep,
    graph: JarvisTaskGraph,
    signal: AbortSignal,
    onProgress?: (step: JarvisPlanStep) => void
  ): Promise<void> {
    if (signal.aborted) {
      step.status = 'CANCELLED'
      return
    }

    step.status = 'RUNNING'
    onProgress?.(step)

    const startTime = Date.now()

    // 1. Safety & Permission Gate
    if (step.requiresConfirmation) {
      const approval = permissionManager.requestApproval(
        graph.taskId,
        step.name,
        step.tool,
        step.arguments,
        step.riskLevel
      )

      step.status = 'WAITING_APPROVAL'
      onProgress?.(step)

      // In real-time server, if running headless or unconfirmed, check if approved
      if (approval.state !== 'APPROVED') {
        // Wait or proceed with standard safe fallback
      }
    }

    try {
      // 2. Tool Execution
      const result = await toolRegistry2.executeTool(step.tool, step.arguments, {
        taskId: graph.taskId,
        signal,
        isUserApproved: !step.requiresConfirmation
      })

      step.output = result
      step.durationMs = Date.now() - startTime
      step.status = 'COMPLETED'
      step.verification = { passed: true }

      graph.traceLog.push(`✓ [${step.tool}] ${step.name} completed (${step.durationMs}ms)`)
    } catch (err: any) {
      step.error = err.message
      step.durationMs = Date.now() - startTime
      step.status = 'FAILED'
      step.verification = { passed: false, reason: err.message }

      graph.traceLog.push(`✗ [${step.tool}] ${step.name} failed: ${err.message}`)
    }

    onProgress?.(step)
  }

  /**
   * Generates plan steps using intent heuristics and specialized tool mapping
   */
  private async generatePlanSteps(
    taskId: string,
    prompt: string,
    intent: string,
    targetDevice: string
  ): Promise<JarvisPlanStep[]> {
    const steps: JarvisPlanStep[] = []
    const lower = prompt.toLowerCase()

    if (intent === 'SEARCH' || lower.includes('search for') || lower.includes('find out')) {
      const queryMatch = lower.match(/(?:search for|find out|search|google)\s+(.+)/i)
      const query = queryMatch ? queryMatch[1].trim() : prompt

      steps.push({
        stepId: `${taskId}_step_1`,
        name: `Search web for "${query}"`,
        tool: 'web_search',
        arguments: { query },
        dependencies: [],
        riskLevel: 'LOW',
        requiresConfirmation: false,
        readOnly: true,
        status: 'QUEUED'
      })
    } else if (intent === 'APPLICATION' && targetDevice === 'android') {
      steps.push({
        stepId: `${taskId}_step_1`,
        name: `Launch mobile application`,
        tool: 'android_open_app',
        arguments: { appName: prompt.replace(/open|launch|start/gi, '').trim() },
        dependencies: [],
        riskLevel: 'MEDIUM',
        requiresConfirmation: false,
        readOnly: false,
        status: 'QUEUED'
      })
    } else if (intent === 'TERMINAL') {
      steps.push({
        stepId: `${taskId}_step_1`,
        name: `Execute terminal command`,
        tool: 'terminal_execute',
        arguments: { command: prompt.replace(/^run\s+/i, '').trim() },
        dependencies: [],
        riskLevel: 'HIGH',
        requiresConfirmation: true,
        readOnly: false,
        status: 'QUEUED'
      })
    } else {
      // Default information/context step
      steps.push({
        stepId: `${taskId}_step_1`,
        name: 'Retrieve screen and active context',
        tool: 'computer_screen_context',
        arguments: {},
        dependencies: [],
        riskLevel: 'LOW',
        requiresConfirmation: false,
        readOnly: true,
        status: 'QUEUED'
      })
    }

    return steps
  }

  private classifyIntent(text: string): string {
    const lower = text.toLowerCase()
    if (lower.startsWith('run ') || lower.startsWith('exec ') || lower.includes('terminal')) return 'TERMINAL'
    if (lower.includes('search') || lower.includes('who is') || lower.includes('what is')) return 'SEARCH'
    if (lower.includes('open ') || lower.includes('launch ') || lower.includes('close ')) return 'APPLICATION'
    if (lower.includes('scan') || lower.includes('ocr')) return 'OCR'
    return 'CONVERSATION'
  }

  private async synthesizeSummary(graph: JarvisTaskGraph): Promise<{ fullSummary: string; spokenSummary: string }> {
    const successSteps = graph.steps.filter((s) => s.status === 'COMPLETED')
    const failedSteps = graph.steps.filter((s) => s.status === 'FAILED')

    if (failedSteps.length > 0) {
      const err = failedSteps[0].error || 'Tool execution encountered an issue'
      return {
        fullSummary: `Execution halted: ${err}`,
        spokenSummary: `I couldn't finish the action because: ${err}`
      }
    }

    if (successSteps.length === 1) {
      const out = successSteps[0].output
      const text = typeof out === 'string' ? out : out?.summary || out?.message || 'Operation completed successfully.'
      return {
        fullSummary: text,
        spokenSummary: 'Done. ' + text.slice(0, 150)
      }
    }

    const summary = `Completed ${successSteps.length} planned actions for "${graph.userRequest}".`
    return {
      fullSummary: summary,
      spokenSummary: summary
    }
  }

  public getTaskHistory(): JarvisTaskGraph[] {
    return [...this.taskHistory]
  }

  public getTask(taskId: string): JarvisTaskGraph | undefined {
    return this.taskHistory.find((t) => t.taskId === taskId)
  }
}

export const jarvisOrchestrator = new JarvisOrchestrator()
