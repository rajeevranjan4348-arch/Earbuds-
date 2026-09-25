/**
 * Central TaskOrchestrator Service
 * Manages the multi-agent pipeline:
 * 1. Understand request
 * 2. Retrieve vector long-term memory
 * 3. Build rich context
 * 4. Plan tasks (DAG)
 * 5. Priority management (CRITICAL > HIGH > NORMAL > LOW)
 * 6. Select specialized agent from AgentRegistry
 * 7. Execute task node
 * 8. Automated self-verification
 * 9. Error recovery & parameter repair
 * 10. Persist state across restarts
 * 11. Cross-session continuity via LongTermMemory vector database
 * 12. Synthesize final response
 */

import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import type {
  BrainTask,
  TaskGraph,
  TaskPriority,
  TaskStatus,
  SpecializedAgentRole
} from '../brain/types'
import { agentRegistry, BaseAgent } from './BaseAgent'
import './specializedAgents' // Ensure all specialized agents are registered
import { longTermMemory } from './LongTermMemory'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
    if (key) {
      geminiClient = new GoogleGenAI({ apiKey: key })
    }
  }
  return geminiClient
}

export interface OrchestrationResult {
  graphId: string
  status: TaskStatus
  priority: TaskPriority
  tasksCount: number
  completedTasks: number
  failedTasks: number
  tasks: Array<{
    taskId: string
    description: string
    priority: TaskPriority
    status: TaskStatus
    assignedAgent: SpecializedAgentRole
    verificationStatus?: string
    durationMs?: number
    error?: string
  }>
  responseText: string
  spokenText: string
  durationMs: number
}

export class TaskOrchestrator {
  private static instance: TaskOrchestrator
  private activeGraphs: Map<string, TaskGraph> = new Map()
  private storageDir: string
  private stateFile: string
  private isLoaded: boolean = false

  private readonly PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
    CRITICAL: 4,
    HIGH: 3,
    NORMAL: 2,
    LOW: 1
  }

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'orchestrator')
    this.stateFile = path.join(this.storageDir, 'task_orchestrator_state.json')
    this.initStorage()
  }

  public static getInstance(): TaskOrchestrator {
    if (!TaskOrchestrator.instance) {
      TaskOrchestrator.instance = new TaskOrchestrator()
    }
    return TaskOrchestrator.instance
  }

  private initStorage(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
      this.loadStateFromDisk()
    } catch (err) {
      console.warn('[TaskOrchestrator] Storage init notice:', err)
    }
  }

  private loadStateFromDisk(): void {
    if (this.isLoaded) return
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf8')
        const graphs: TaskGraph[] = JSON.parse(raw)
        if (Array.isArray(graphs)) {
          for (const g of graphs) {
            this.activeGraphs.set(g.graphId, g)
          }
        }
      }
      this.isLoaded = true
    } catch (err) {
      console.warn('[TaskOrchestrator] Error loading state from disk:', err)
      this.isLoaded = true
    }
  }

  private persistState(): void {
    try {
      const graphs = Array.from(this.activeGraphs.values())
      fs.writeFileSync(this.stateFile, JSON.stringify(graphs, null, 2), 'utf8')
    } catch (err) {
      console.warn('[TaskOrchestrator] Persist error:', err)
    }
  }

  /**
   * Main Pipeline Entry Point:
   * Process a user text or voice command through the entire agent pipeline
   */
  public async processRequest(
    userPrompt: string,
    userId: string = 'default_user',
    contextMemory: Record<string, any> = {}
  ): Promise<OrchestrationResult> {
    const startTime = Date.now()

    // 1. Understand request
    const understanding = this.analyzeRequest(userPrompt)

    // 2. Retrieve vector Long-Term Memory context
    const vectorMemories = await longTermMemory.retrieveContext(userPrompt, {
      userId,
      topK: 4,
      minSimilarity: 0.28
    })

    const continuityContext = vectorMemories
      .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
      .join('\n')

    // 3. Plan task graph (DAG)
    const graph = await this.planTaskGraph(userPrompt, userId, understanding, continuityContext)
    this.activeGraphs.set(graph.graphId, graph)
    this.persistState()

    // 4. Execute graph respecting dependencies and priority
    await this.executeGraph(graph)

    // 5. Synthesize final response
    const finalSynthesis = await this.synthesizeResponse(graph)
    graph.finalSynthesis = finalSynthesis.displayText
    graph.completedAt = Date.now()
    graph.updatedAt = Date.now()
    this.persistState()

    // 6. Cross-session continuity: record successful task outcome in vector Long-Term Memory
    if (graph.status === 'COMPLETED') {
      await longTermMemory.recordTaskSuccess(
        graph.graphId,
        userPrompt,
        finalSynthesis.displayText.slice(0, 500),
        userId,
        { tasksCount: graph.tasks.length }
      )
    }

    return {
      graphId: graph.graphId,
      status: graph.status,
      priority: graph.priority,
      tasksCount: graph.tasks.length,
      completedTasks: graph.tasks.filter((t) => t.status === 'COMPLETED').length,
      failedTasks: graph.tasks.filter((t) => t.status === 'FAILED').length,
      tasks: graph.tasks.map((t) => ({
        taskId: t.taskId,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedAgent: t.assignedAgent,
        verificationStatus: t.verificationStatus,
        durationMs: t.executionDurationMs,
        error: t.error
      })),
      responseText: finalSynthesis.displayText,
      spokenText: finalSynthesis.spokenText,
      durationMs: Date.now() - startTime
    }
  }

  /**
   * Request understanding & heuristic intent classification
   */
  private analyzeRequest(prompt: string) {
    const lower = prompt.toLowerCase()
    let category = 'GENERAL'
    let urgency: TaskPriority = 'NORMAL'

    if (
      lower.includes('urgent') ||
      lower.includes('critical') ||
      lower.includes('error') ||
      lower.includes('fail')
    ) {
      urgency = 'CRITICAL'
    } else if (lower.includes('quick') || lower.includes('fast') || lower.includes('now')) {
      urgency = 'HIGH'
    }

    if (
      lower.includes('code') ||
      lower.includes('function') ||
      lower.includes('bug') ||
      lower.includes('refactor')
    ) {
      category = 'CODING'
    } else if (
      lower.includes('search') ||
      lower.includes('who is') ||
      lower.includes('what is') ||
      lower.includes('news')
    ) {
      category = 'RESEARCH'
    } else if (lower.includes('browse') || lower.includes('website') || lower.includes('http')) {
      category = 'BROWSER'
    } else if (
      lower.includes('file') ||
      lower.includes('document') ||
      lower.includes('save') ||
      lower.includes('directory')
    ) {
      category = 'FILE'
    } else if (lower.includes('image') || lower.includes('draw') || lower.includes('diagram')) {
      category = 'VISION'
    } else if (lower.includes('android') || lower.includes('phone') || lower.includes('app')) {
      category = 'ANDROID'
    }

    return {
      intent: prompt.slice(0, 100),
      category,
      urgency,
      detectedEntities: {},
      estimatedComplexity:
        prompt.split(/\s+/).length > 20 ? ('MULTI_STAGE' as const) : ('SIMPLE' as const)
    }
  }

  /**
   * Plans the Task Graph (DAG) with priorities, dependencies, and agent assignments
   */
  private async planTaskGraph(
    userPrompt: string,
    userId: string,
    understanding: any,
    continuityContext: string
  ): Promise<TaskGraph> {
    const graphId = `graph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const now = Date.now()

    let tasks: BrainTask[] = []
    const ai = getGemini()

    if (ai) {
      try {
        tasks = await this.planWithGemini(userPrompt, graphId, continuityContext, understanding)
      } catch (err) {
        console.warn(
          '[TaskOrchestrator] Gemini planner fallback to deterministic DAG planner:',
          err
        )
        tasks = this.planDeterministic(userPrompt, graphId, understanding)
      }
    } else {
      tasks = this.planDeterministic(userPrompt, graphId, understanding)
    }

    return {
      graphId,
      userId,
      originalRequest: userPrompt,
      understanding,
      tasks,
      priority: understanding.urgency,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
      contextMemory: {},
      retrievedMemories: continuityContext ? [continuityContext] : []
    }
  }

  /**
   * Deterministic DAG planner when LLM is unavailable or for rapid execution
   */
  private planDeterministic(userPrompt: string, graphId: string, understanding: any): BrainTask[] {
    const now = Date.now()
    const descLower = userPrompt.toLowerCase()
    const tasks: BrainTask[] = []

    if (understanding.category === 'RESEARCH') {
      const t1Id = `${graphId}_t1`
      const t2Id = `${graphId}_t2`

      tasks.push({
        taskId: t1Id,
        description: `Gather factual sources and data for: ${userPrompt}`,
        priority: 'HIGH',
        dependencies: [],
        status: 'QUEUED',
        assignedAgent: 'Research Agent',
        requiredTools: ['search_web'],
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      })

      tasks.push({
        taskId: t2Id,
        description: `Synthesize research findings into comprehensive answer for user`,
        priority: 'NORMAL',
        dependencies: [t1Id],
        status: 'QUEUED',
        assignedAgent: 'Voice Agent',
        requiredTools: ['voice_dialogue'],
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      })
    } else if (understanding.category === 'CODING') {
      const t1Id = `${graphId}_t1`
      tasks.push({
        taskId: t1Id,
        description: `Inspect codebase symbols and analyze logic for: ${userPrompt}`,
        priority: 'HIGH',
        dependencies: [],
        status: 'QUEUED',
        assignedAgent: 'Coding Agent',
        requiredTools: ['codebase_search'],
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      })
    } else {
      // General agent assignment
      const bestAgent = agentRegistry.selectBestAgent(userPrompt)
      tasks.push({
        taskId: `${graphId}_t1`,
        description: userPrompt,
        priority: understanding.urgency,
        dependencies: [],
        status: 'QUEUED',
        assignedAgent: bestAgent.role,
        requiredTools: bestAgent.supportedTools.slice(0, 2),
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      })
    }

    return tasks
  }

  /**
   * Gemini-powered structured DAG task graph planning
   */
  private async planWithGemini(
    userPrompt: string,
    graphId: string,
    continuityContext: string,
    understanding: any
  ): Promise<BrainTask[]> {
    const ai = getGemini()!
    const availableAgents = agentRegistry.list().map((a) => ({
      name: a.name,
      role: a.role,
      capabilities: a.capabilities,
      tools: a.supportedTools
    }))

    const prompt = `You are the master Task Graph Planner of IRIS AI Brain.
Create a minimal, high-efficiency Directed Acyclic Graph (DAG) of executable tasks to solve the user's request.

Available Specialized Agents:
${JSON.stringify(availableAgents, null, 2)}

Long-Term Context:
${continuityContext || 'No previous session context.'}

User Request: "${userPrompt}"

Output strictly valid JSON with this format:
{
  "tasks": [
    {
      "stepIndex": 1,
      "description": "Precise task description",
      "priority": "CRITICAL" | "HIGH" | "NORMAL" | "LOW",
      "assignedAgent": "Exact Agent Role",
      "requiredTools": ["tool_name"],
      "dependencies": [] // Array of prior stepIndex numbers (e.g. [1])
    }
  ]
}`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })

    const raw = response.text || ''
    const parsed = JSON.parse(raw)
    const now = Date.now()

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return this.planDeterministic(userPrompt, graphId, understanding)
    }

    const stepIdMap = new Map<number, string>()
    parsed.tasks.forEach((t: any, idx: number) => {
      const stepNum = t.stepIndex ?? idx + 1
      stepIdMap.set(stepNum, `${graphId}_t${stepNum}`)
    })

    return parsed.tasks.map((t: any, idx: number) => {
      const stepNum = t.stepIndex ?? idx + 1
      const taskId = stepIdMap.get(stepNum) || `${graphId}_t${stepNum}`
      const rawDeps: number[] = Array.isArray(t.dependencies) ? t.dependencies : []
      const mappedDeps = rawDeps.map((d) => stepIdMap.get(d)).filter(Boolean) as string[]

      const agentRole: SpecializedAgentRole = agentRegistry.has(t.assignedAgent)
        ? t.assignedAgent
        : agentRegistry.selectBestAgent(t.description).role

      return {
        taskId,
        description: t.description || `Task step ${stepNum}`,
        priority: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(t.priority)
          ? t.priority
          : 'NORMAL') as TaskPriority,
        dependencies: mappedDeps,
        status: 'QUEUED' as TaskStatus,
        assignedAgent: agentRole,
        requiredTools: Array.isArray(t.requiredTools) ? t.requiredTools : [],
        attempts: 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  /**
   * Executes a task graph respecting DAG dependencies and priority order
   */
  public async executeGraph(graph: TaskGraph): Promise<TaskGraph> {
    graph.status = 'RUNNING'
    graph.updatedAt = Date.now()
    this.persistState()

    let hasUnfinished = true

    while (hasUnfinished) {
      const readyTasks = this.getReadyTasks(graph)

      if (readyTasks.length === 0) {
        const unfinished = graph.tasks.filter(
          (t) => t.status !== 'COMPLETED' && t.status !== 'FAILED' && t.status !== 'CANCELLED'
        )

        if (unfinished.length === 0) {
          const anyFailed = graph.tasks.some((t) => t.status === 'FAILED')
          graph.status = anyFailed ? 'FAILED' : 'COMPLETED'
          hasUnfinished = false
          break
        } else {
          // Deadlock or waiting
          console.warn('[TaskOrchestrator] Graph stalled on dependencies:', graph.graphId)
          graph.status = 'FAILED'
          hasUnfinished = false
          break
        }
      }

      // Sort ready tasks by priority weight (CRITICAL > HIGH > NORMAL > LOW)
      readyTasks.sort(
        (a, b) => this.PRIORITY_WEIGHTS[b.priority] - this.PRIORITY_WEIGHTS[a.priority]
      )

      for (const task of readyTasks) {
        await this.executeTaskNode(task, graph)

        if (task.status === 'FAILED' && task.priority === 'CRITICAL') {
          graph.status = 'FAILED'
          hasUnfinished = false
          break
        }
      }

      this.persistState()
    }

    return graph
  }

  /**
   * Retrieves ready tasks whose dependencies have completed
   */
  private getReadyTasks(graph: TaskGraph): BrainTask[] {
    const completedIds = new Set(
      graph.tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.taskId)
    )

    return graph.tasks.filter((task) => {
      if (task.status !== 'QUEUED' && task.status !== 'PLANNING') {
        return false
      }
      return task.dependencies.every((dep) => completedIds.has(dep))
    })
  }

  /**
   * Executes an individual task node through the agent registry, verification, and recovery
   */
  private async executeTaskNode(task: BrainTask, graph: TaskGraph): Promise<void> {
    const agent =
      agentRegistry.get(task.assignedAgent) || agentRegistry.selectBestAgent(task.description)
    task.status = 'RUNNING'
    task.updatedAt = Date.now()

    // Aggregate results from dependent tasks
    const dependencyResults: Record<string, any> = {}
    for (const depId of task.dependencies) {
      const depTask = graph.tasks.find((t) => t.taskId === depId)
      if (depTask?.result) {
        dependencyResults[depId] = depTask.result
      }
    }

    // Retrieve specialized agent vector memory for this task
    try {
      const agentContext = await longTermMemory.retrieveContextForAgent(
        task.assignedAgent,
        task.description,
        graph.userId
      )
      if (agentContext) {
        task.parameters = { ...task.parameters, _agentLongTermContext: agentContext }
      }
    } catch (_e) {}

    let attemptDone = false

    while (!attemptDone) {
      task.attempts++
      const startTime = Date.now()

      // 1. Execute
      const execResult = await agent.execute(task, {
        graphId: graph.graphId,
        userId: graph.userId,
        dependencyResults,
        contextMemory: graph.contextMemory
      })

      task.executionDurationMs = Date.now() - startTime

      // 2. Automated Self-Verification
      task.status = 'VERIFYING'
      const verification = await agent.verify(task, execResult.output)

      if (verification.passed && execResult.success) {
        task.status = 'COMPLETED'
        task.verificationStatus = 'VERIFIED'
        task.result = execResult.output
        task.error = undefined
        task.completedAt = Date.now()
        task.updatedAt = Date.now()
        attemptDone = true

        // Record recovered execution knowledge into vector memory
        if (task.attempts > 1) {
          await longTermMemory.recordTaskFailureRecovery(
            task.taskId,
            task.error || 'Transient execution hurdle',
            `Succeeded on attempt ${task.attempts} using ${task.assignedAgent}`,
            graph.userId
          )
        }
      } else {
        // 3. Error Recovery
        const errorMsg = execResult.error || verification.reason || 'Verification failed'
        const recovery = await agent.recover(task, errorMsg, execResult.output)

        if (recovery.action === 'ALTERNATIVE_TOOL' && recovery.alternativeTool) {
          task.requiredTools = [recovery.alternativeTool, ...task.requiredTools]
          task.parameters = recovery.correctedParameters || task.parameters
          task.verificationStatus = 'RECOVERED'
        } else if (recovery.action === 'RETRY') {
          task.parameters = recovery.correctedParameters || task.parameters
          task.verificationStatus = 'PENDING'
        } else {
          task.status = 'FAILED'
          task.verificationStatus = 'FAILED'
          task.error = errorMsg
          task.updatedAt = Date.now()
          attemptDone = true
        }
      }
    }
  }

  /**
   * Synthesize cohesive response from all task outputs
   */
  private async synthesizeResponse(
    graph: TaskGraph
  ): Promise<{ displayText: string; spokenText: string }> {
    const completed = graph.tasks.filter((t) => t.status === 'COMPLETED' && t.result)

    if (completed.length === 0) {
      const failed = graph.tasks.find((t) => t.status === 'FAILED')
      const msg = failed?.error || 'The agent task could not be completed.'
      return { displayText: `⚠️ Task Notice: ${msg}`, spokenText: msg }
    }

    const ai = getGemini()
    if (ai) {
      try {
        const summaries = completed
          .map((t) => `Task: ${t.description}\nResult: ${JSON.stringify(t.result).slice(0, 1500)}`)
          .join('\n\n')

        const prompt = `Synthesize a concise, clear, and direct response for the user's original request:
Original Request: "${graph.originalRequest}"

Completed Agent Results:
${summaries}

Provide:
1. Direct response answering the user clearly
2. Key points if needed
Keep it natural, accurate, and ready for display and voice speech.`

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt
        })

        const text = resp.text?.trim() || ''
        const spoken = text.replace(/[*#_`]/g, '').slice(0, 300)
        return { displayText: text, spokenText: spoken }
      } catch (_e) {}
    }

    // Fallback synthesis
    const parts = completed.map((t) => {
      if (t.result?.summary) return t.result.summary
      if (typeof t.result === 'string') return t.result
      return `Completed ${t.description}`
    })

    const combined = parts.join('\n\n')
    return {
      displayText: combined,
      spokenText: combined.replace(/[*#_`]/g, '').slice(0, 300)
    }
  }

  /**
   * Retrieves a task graph by ID
   */
  public getGraph(graphId: string): TaskGraph | undefined {
    return this.activeGraphs.get(graphId)
  }

  /**
   * Lists all task graphs
   */
  public listGraphs(userId?: string): TaskGraph[] {
    const list = Array.from(this.activeGraphs.values())
    if (userId) {
      return list.filter((g) => g.userId === userId)
    }
    return list.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Resumes and recovers unfinished tasks across sessions or restarts
   */
  public async resumeUnfinishedTasks(): Promise<{ success: boolean; resumedCount: number }> {
    let count = 0
    for (const graph of this.activeGraphs.values()) {
      if (graph.status === 'RUNNING' || graph.status === 'QUEUED') {
        count++
        this.executeGraph(graph).catch((err) => {
          console.warn('[TaskOrchestrator] Resume execution error:', err)
        })
      }
    }
    return { success: true, resumedCount: count }
  }

  /**
   * Cancels a running task graph
   */
  public cancelGraph(graphId: string, reason?: string): boolean {
    const graph = this.activeGraphs.get(graphId)
    if (!graph) return false

    graph.status = 'CANCELLED'
    graph.tasks.forEach((t) => {
      if (t.status === 'RUNNING' || t.status === 'QUEUED') {
        t.status = 'CANCELLED'
        t.error = reason || 'Cancelled by user'
      }
    })
    graph.updatedAt = Date.now()
    this.persistState()
    return true
  }
}

export const taskOrchestrator = TaskOrchestrator.getInstance()
