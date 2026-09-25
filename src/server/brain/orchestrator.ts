/**
 * Advanced AI Brain - Central Agent Orchestrator
 *
 * Implements the full pipeline:
 * USER REQUEST
 * → UNDERSTAND
 * → RETRIEVE MEMORY
 * → BUILD CONTEXT
 * → PLAN TASK
 * → CREATE TASK GRAPH
 * → SELECT AGENT
 * → SELECT TOOLS
 * → EXECUTE
 * → VERIFY
 * → RECOVER IF NEEDED
 * → SAVE STATE
 * → RESPOND
 */

import { GoogleGenAI } from '@google/genai'
import type { TaskGraph, BrainTask, TaskStatus, TaskPriority } from './types'
import { taskPlanner } from './planner/taskPlanner'
import { taskScheduler } from './scheduler/taskScheduler'
import { brainMemoryManager } from './memory/brainMemory'
import { brainTaskPersistence } from './persistence/taskPersistence'

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

export interface BrainOrchestratorResponse {
  graphId: string
  status: TaskStatus
  priority: TaskPriority
  tasksCount: number
  completedTasks: number
  failedTasks: number
  tasks: {
    taskId: string
    description: string
    priority: TaskPriority
    status: TaskStatus
    assignedAgent: string
    verificationStatus?: string
    error?: string
    durationMs?: number
  }[]
  responseText: string
  spokenText: string
  durationMs: number
}

export class CentralAgentOrchestrator {
  private isRecovering = false

  constructor() {
    // Automatically check and recover unfinished tasks on startup
    this.continueUnfinishedTasks().catch((err) => {
      console.warn('[CentralAgentOrchestrator] Initial unfinished task recovery warning:', err)
    })
  }

  /**
   * Primary entry point: Executes the entire 13-stage Advanced AI Brain pipeline
   */
  public async processRequest(
    userPrompt: string,
    userId: string = 'default_user',
    contextMemory?: Record<string, any>
  ): Promise<BrainOrchestratorResponse> {
    const startTime = Date.now()

    // 1. UNDERSTAND → 2. RETRIEVE MEMORY → 3. BUILD CONTEXT → 4. PLAN TASK → 5. CREATE TASK GRAPH
    const graph = await taskPlanner.plan(userPrompt, userId, contextMemory)

    // SAVE INITIAL STATE
    brainTaskPersistence.saveGraph(graph)

    // 6. SELECT AGENT & 7. SELECT TOOLS are bound into the task graph by planner
    // 8. EXECUTE → 9. VERIFY → 10. RECOVER IF NEEDED → 11. SAVE STATE
    await taskScheduler.runGraph(graph, (updatedTask) => {
      // Periodic state saving on task completion or transition
      brainTaskPersistence.saveGraph(graph)
    })

    // 12. RESPOND (Synthesize grounded final response)
    const finalSynthesis = await this.synthesizeResponse(graph)
    graph.finalSynthesis = finalSynthesis
    brainTaskPersistence.saveGraph(graph)

    // Save to long-term memory
    brainMemoryManager.recordTaskCompletion(graph)

    const completedCount = graph.tasks.filter((t) => t.status === 'COMPLETED').length
    const failedCount = graph.tasks.filter((t) => t.status === 'FAILED').length

    return {
      graphId: graph.graphId,
      status: graph.status,
      priority: graph.priority,
      tasksCount: graph.tasks.length,
      completedTasks: completedCount,
      failedTasks: failedCount,
      tasks: graph.tasks.map((t) => ({
        taskId: t.taskId,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedAgent: t.assignedAgent,
        verificationStatus: t.verificationStatus,
        error: t.error,
        durationMs: t.executionDurationMs
      })),
      responseText: finalSynthesis,
      spokenText: finalSynthesis.slice(0, 300).replace(/[*#`_]/g, ''),
      durationMs: Date.now() - startTime
    }
  }

  /**
   * Generates a coherent, factual response grounded in the results of all tasks
   */
  private async synthesizeResponse(graph: TaskGraph): Promise<string> {
    const resultsSummary: string[] = []

    for (const task of graph.tasks) {
      if (task.status === 'COMPLETED' && task.result) {
        if (typeof task.result === 'string') {
          resultsSummary.push(`- [${task.assignedAgent}] ${task.description}: ${task.result}`)
        } else if (task.result.summary) {
          resultsSummary.push(
            `- [${task.assignedAgent}] ${task.description}: ${task.result.summary}`
          )
        } else if (task.result.content) {
          resultsSummary.push(
            `- [${task.assignedAgent}] ${task.description}: ${String(task.result.content).slice(0, 500)}`
          )
        } else if (task.result.analysis) {
          resultsSummary.push(
            `- [${task.assignedAgent}] ${task.description}: ${task.result.analysis}`
          )
        } else {
          resultsSummary.push(
            `- [${task.assignedAgent}] ${task.description}: ${JSON.stringify(task.result).slice(0, 300)}`
          )
        }
      } else if (task.status === 'FAILED') {
        resultsSummary.push(
          `- [${task.assignedAgent} FAILED] ${task.description}: Error - ${task.error || 'Unknown error'}`
        )
      }
    }

    const ai = getGemini()
    if (ai && resultsSummary.length > 0) {
      try {
        const prompt = `You are IRIS, an advanced neural operating intelligence.
User Goal: "${graph.originalRequest}"
Tasks Executed & Verified:
${resultsSummary.join('\n')}

Synthesize an articulate, complete, helpful final response answering the user's goal directly based on the verified execution results above. Keep tone intelligent, clear, and direct.`

        const resp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ text: prompt }]
        })

        if (resp.text) {
          return resp.text.trim()
        }
      } catch (_e) {}
    }

    // Fallback synthesis
    if (resultsSummary.length === 0) {
      return `Processed your request regarding "${graph.originalRequest}". No actionable data was returned.`
    }

    return resultsSummary.join('\n\n')
  }

  /**
   * Resumes all unfinished tasks after server restart, network glitch, or tool failure
   */
  public async continueUnfinishedTasks(): Promise<{ resumedCount: number }> {
    if (this.isRecovering) return { resumedCount: 0 }
    this.isRecovering = true

    try {
      const unfinished = brainTaskPersistence.getUnfinishedGraphs()
      if (unfinished.length === 0) {
        return { resumedCount: 0 }
      }

      console.info(
        `[CentralAgentOrchestrator] Resuming ${unfinished.length} unfinished task graph(s)...`
      )

      for (const graph of unfinished) {
        brainTaskPersistence.prepareForRecovery(graph)
        // Run graph
        taskScheduler
          .runGraph(graph, () => {
            brainTaskPersistence.saveGraph(graph)
          })
          .then((completedGraph) => {
            this.synthesizeResponse(completedGraph).then((synthesis) => {
              completedGraph.finalSynthesis = synthesis
              brainTaskPersistence.saveGraph(completedGraph)
              brainMemoryManager.recordTaskCompletion(completedGraph)
            })
          })
          .catch((err) => {
            console.warn(
              `[CentralAgentOrchestrator] Graph recovery failed for ${graph.graphId}:`,
              err
            )
          })
      }

      return { resumedCount: unfinished.length }
    } finally {
      this.isRecovering = false
    }
  }

  /**
   * Retrieves single task graph by ID
   */
  public getGraph(graphId: string): TaskGraph | undefined {
    return brainTaskPersistence.getGraph(graphId)
  }

  /**
   * Lists all recent task graphs
   */
  public listGraphs(userId?: string): TaskGraph[] {
    return brainTaskPersistence.getAllGraphs(userId)
  }
}

export const centralAgentOrchestrator = new CentralAgentOrchestrator()
