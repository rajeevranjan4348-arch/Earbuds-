/**
 * Base Agent and Specialized Agent Registry System
 * Defines the core abstract Agent contract with standard interfaces for:
 * - Task Execution
 * - Self-Verification
 * - Error Recovery & Parameter Correction
 */

import type { BrainTask, SpecializedAgentRole, TaskPriority } from '../brain/types'

export interface AgentExecutionContext {
  graphId?: string
  userId: string
  contextMemory?: Record<string, any>
  dependencyResults?: Record<string, any>
  abortSignal?: AbortSignal
}

export interface AgentExecutionResult {
  success: boolean
  output?: any
  error?: string
  toolUsed?: string
  metrics?: {
    durationMs: number
    tokensUsed?: number
    itemsProcessed?: number
  }
}

export interface AgentVerificationResult {
  passed: boolean
  reason: string
  safeToRetry: boolean
  suggestedAction?: 'RETRY' | 'ALTERNATIVE_TOOL' | 'FAIL'
  alternativeTool?: string
  correctedParameters?: Record<string, any>
}

/**
 * Base abstract Agent class providing standardized lifecycle for all specialized agents
 */
export abstract class BaseAgent {
  public abstract readonly name: string
  public abstract readonly role: SpecializedAgentRole
  public abstract readonly description: string
  public abstract readonly capabilities: string[]
  public abstract readonly supportedTools: string[]
  public readonly maxRetries: number = 3

  /**
   * Execute task logic using specialized toolchains and model guidance
   */
  public abstract execute(
    task: BrainTask,
    context?: AgentExecutionContext
  ): Promise<AgentExecutionResult>

  /**
   * Perform automated self-verification to validate the result before marking task complete
   */
  public abstract verify(task: BrainTask, result: any): Promise<AgentVerificationResult>

  /**
   * Common recovery logic when a task fails
   */
  public async recover(
    task: BrainTask,
    error: string,
    output?: any
  ): Promise<{
    action: 'RETRY' | 'ALTERNATIVE_TOOL' | 'FAIL'
    alternativeTool?: string
    correctedParameters?: Record<string, any>
  }> {
    const errLower = error.toLowerCase()

    // 1. Exceeded attempts
    if (task.attempts >= (task.maxAttempts || this.maxRetries)) {
      return { action: 'FAIL' }
    }

    // 2. Alternative tool available
    if (task.alternativeTools && task.alternativeTools.length > 0) {
      const alt = task.alternativeTools.find((t) => !task.requiredTools.includes(t))
      if (alt) {
        return {
          action: 'ALTERNATIVE_TOOL',
          alternativeTool: alt
        }
      }
    }

    // 3. Transient rate-limit or network timeout
    if (
      errLower.includes('timeout') ||
      errLower.includes('rate limit') ||
      errLower.includes('429') ||
      errLower.includes('503') ||
      errLower.includes('econnreset')
    ) {
      return {
        action: 'RETRY',
        correctedParameters: { ...task.parameters, _backoffMs: 1500 }
      }
    }

    // 4. Input formatting / syntax error
    if (errLower.includes('invalid argument') || errLower.includes('missing parameter')) {
      return {
        action: 'RETRY',
        correctedParameters: { ...task.parameters, query: task.description }
      }
    }

    return { action: 'FAIL' }
  }
}

/**
 * Central Registry System for Specialized Agents
 */
export class AgentRegistry {
  private static instance: AgentRegistry
  private agents: Map<SpecializedAgentRole, BaseAgent> = new Map()

  private constructor() {
    // Singleton private constructor
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry()
    }
    return AgentRegistry.instance
  }

  /**
   * Register a specialized agent
   */
  public register(agent: BaseAgent): void {
    this.agents.set(agent.role, agent)
  }

  /**
   * Retrieve an agent by role
   */
  public get(role: SpecializedAgentRole): BaseAgent | undefined {
    return this.agents.get(role)
  }

  /**
   * Check if an agent is registered
   */
  public has(role: SpecializedAgentRole): boolean {
    return this.agents.has(role)
  }

  /**
   * List all registered specialized agents
   */
  public list(): BaseAgent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Select the most appropriate specialized agent based on task description and required tools
   */
  public selectBestAgent(description: string, requiredTools: string[] = []): BaseAgent {
    const descLower = description.toLowerCase()

    // 1. Tool-based exact match
    if (
      requiredTools.some((t) =>
        ['codebase_search', 'read_code', 'write_code', 'symbol_lookup'].includes(t)
      )
    ) {
      const coding = this.get('Coding Agent')
      if (coding) return coding
    }

    if (
      requiredTools.some((t) => ['browser_navigate', 'browser_extract', 'browse_url'].includes(t))
    ) {
      const browser = this.get('Browser Agent')
      if (browser) return browser
    }

    if (requiredTools.some((t) => ['file_read', 'file_write', 'file_list'].includes(t))) {
      const file = this.get('File Agent')
      if (file) return file
    }

    if (
      requiredTools.some((t) => ['vision_inspect', 'generate_image', 'render_diagram'].includes(t))
    ) {
      const vision = this.get('Vision Agent')
      if (vision) return vision
    }

    if (requiredTools.some((t) => ['android_action', 'launch_app', 'device_intent'].includes(t))) {
      const android = this.get('Android Agent')
      if (android) return android
    }

    if (requiredTools.some((t) => ['synthesize_voice', 'voice_dialogue'].includes(t))) {
      const voice = this.get('Voice Agent')
      if (voice) return voice
    }

    // 2. Keyword heuristic selection
    if (
      descLower.includes('code') ||
      descLower.includes('typescript') ||
      descLower.includes('function') ||
      descLower.includes('refactor') ||
      descLower.includes('bug') ||
      (descLower.includes('file') && descLower.includes('.ts'))
    ) {
      return this.get('Coding Agent') || this.getDefaultAgent()
    }

    if (
      descLower.includes('website') ||
      descLower.includes('browse') ||
      descLower.includes('url') ||
      descLower.includes('http') ||
      descLower.includes('scrape')
    ) {
      return this.get('Browser Agent') || this.getDefaultAgent()
    }

    if (
      descLower.includes('image') ||
      descLower.includes('diagram') ||
      descLower.includes('flux') ||
      descLower.includes('draw') ||
      descLower.includes('visual')
    ) {
      return this.get('Vision Agent') || this.getDefaultAgent()
    }

    if (
      descLower.includes('android') ||
      descLower.includes('phone') ||
      descLower.includes('app') ||
      descLower.includes('mobile') ||
      descLower.includes('apk')
    ) {
      return this.get('Android Agent') || this.getDefaultAgent()
    }

    if (
      descLower.includes('speak') ||
      descLower.includes('voice') ||
      descLower.includes('audio') ||
      descLower.includes('pronounce')
    ) {
      return this.get('Voice Agent') || this.getDefaultAgent()
    }

    if (
      descLower.includes('write file') ||
      descLower.includes('read directory') ||
      descLower.includes('delete file')
    ) {
      return this.get('File Agent') || this.getDefaultAgent()
    }

    // Default to Research Agent for general knowledge, search, and queries
    return this.get('Research Agent') || this.getDefaultAgent()
  }

  private getDefaultAgent(): BaseAgent {
    const research = this.get('Research Agent')
    if (research) return research
    const first = this.agents.values().next().value
    if (first) return first
    throw new Error('No agents registered in AgentRegistry')
  }
}

export const agentRegistry = AgentRegistry.getInstance()
