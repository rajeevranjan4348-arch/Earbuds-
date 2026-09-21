/**
 * Agent Harness (Repository 03: ai-boost/awesome-harness-engineering)
 * Provides execution tracing, timeout guardrails, circuit breakers,
 * failure recovery, and observability metrics for multi-agent workflows.
 */

import type { AgentExecutionTrace, SpecializedAgentRole } from './types'

export class AgentHarness {
  private activeTraces = new Map<string, AgentExecutionTrace>()
  private maxRetries = 2
  private defaultTimeoutMs = 15000

  /**
   * Starts a new tracked execution trace
   */
  public startTrace(role: SpecializedAgentRole): AgentExecutionTrace {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const trace: AgentExecutionTrace = {
      traceId,
      agentRole: role,
      status: 'running',
      startTime: Date.now(),
      steps: [],
      metrics: {
        toolCallsCount: 0,
        retryCount: 0,
        memoryAccessCount: 0,
        privacyRedactionsCount: 0
      }
    }
    this.activeTraces.set(traceId, trace)
    return trace
  }

  /**
   * Logs a step within the active trace
   */
  public logStep(traceId: string, action: string, result?: any, error?: string): void {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return

    trace.steps.push({
      stepIndex: trace.steps.length + 1,
      action,
      timestamp: Date.now(),
      result,
      error
    })
  }

  /**
   * Executes a task with timeout handling and circuit breaker recovery
   */
  public async executeWithRecovery<T>(
    traceId: string,
    actionName: string,
    fn: () => Promise<T>,
    timeoutMs = this.defaultTimeoutMs
  ): Promise<T> {
    const trace = this.activeTraces.get(traceId)
    let attempts = 0

    while (attempts <= this.maxRetries) {
      try {
        attempts++
        this.logStep(traceId, `${actionName} (Attempt ${attempts})`)

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Action "${actionName}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          )
        )

        const result = await Promise.race([fn(), timeoutPromise])
        this.logStep(traceId, `${actionName} completed`, { status: 'success' })
        return result
      } catch (err: any) {
        if (trace) trace.metrics.retryCount++
        this.logStep(traceId, `${actionName} failed`, undefined, err?.message)

        if (attempts > this.maxRetries) {
          if (trace) trace.status = 'failed'
          throw err
        }
        // Brief backoff before recovery retry
        await new Promise((resolve) => setTimeout(resolve, 300 * attempts))
      }
    }

    throw new Error(`Max retries exceeded for ${actionName}`)
  }

  /**
   * Marks a trace as completed
   */
  public completeTrace(traceId: string): AgentExecutionTrace | null {
    const trace = this.activeTraces.get(traceId)
    if (!trace) return null

    trace.endTime = Date.now()
    trace.durationMs = trace.endTime - trace.startTime
    trace.status = trace.status === 'failed' ? 'failed' : 'completed'
    return trace
  }
}

export const agentHarness = new AgentHarness()
