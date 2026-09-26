/**
 * Advanced AI Brain - Self-Task Planning & Task Graph Generator
 * Pipeline:
 * USER REQUEST → UNDERSTAND → RETRIEVE MEMORY → BUILD CONTEXT → PLAN TASK → CREATE TASK GRAPH
 */

import { GoogleGenAI } from '@google/genai'
import type { TaskGraph, BrainTask, TaskPriority, SpecializedAgentRole } from '../types'
import { brainMemoryManager } from '../memory/brainMemory'
import { brainAgentRegistry } from '../agents/specializedAgents'

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

export class TaskPlanner {
  /**
   * Plans a structured task graph from a user request, with memory context
   */
  public async plan(
    userPrompt: string,
    userId: string = 'default_user',
    contextMemory?: Record<string, any>
  ): Promise<TaskGraph> {
    const graphId = `graph_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = Date.now()

    // 1. UNDERSTAND & RETRIEVE MEMORY & BUILD CONTEXT
    const brainContext = brainMemoryManager.buildContext(userPrompt, userId)
    const urgency = this.detectUrgency(userPrompt)
    const entities = this.extractEntities(userPrompt)

    const understanding = {
      intent: userPrompt.trim(),
      category: this.detectCategory(userPrompt),
      urgency,
      detectedEntities: entities,
      estimatedComplexity: this.estimateComplexity(userPrompt)
    }

    // 2. PLAN TASK & CREATE TASK GRAPH
    let tasks: BrainTask[] = []

    const ai = getGemini()
    if (ai) {
      try {
        tasks = await this.planWithGemini(userPrompt, graphId, brainContext, understanding)
      } catch (err) {
        console.warn('[BrainPlanner] Gemini planning fallback to deterministic DAG planner:', err)
        tasks = this.planDeterministic(userPrompt, graphId, understanding)
      }
    } else {
      tasks = this.planDeterministic(userPrompt, graphId, understanding)
    }

    // Sanity check tasks
    if (tasks.length === 0) {
      tasks = [this.createFallbackTask(userPrompt, graphId, urgency)]
    }

    return {
      graphId,
      userId,
      originalRequest: userPrompt,
      goal: userPrompt.trim(),
      understanding,
      tasks,
      priority: urgency,
      status: 'PLANNING',
      createdAt: now,
      updatedAt: now,
      contextMemory,
      retrievedMemories: brainContext.relevantMemories
    }
  }

  private detectUrgency(prompt: string): TaskPriority {
    const p = prompt.toLowerCase()
    if (p.includes('urgent') || p.includes('critical') || p.includes('immediately') || p.includes('emergency') || p.includes('asap')) {
      return 'CRITICAL'
    }
    if (p.includes('important') || p.includes('priority') || p.includes('quick') || p.includes('fast')) {
      return 'HIGH'
    }
    if (p.includes('when possible') || p.includes('low priority') || p.includes('whenever')) {
      return 'LOW'
    }
    return 'NORMAL'
  }

  private detectCategory(prompt: string): string {
    const p = prompt.toLowerCase()
    if (p.includes('code') || p.includes('function') || p.includes('bug')) return 'software_engineering'
    if (p.includes('paper') || p.includes('research') || p.includes('why') || p.includes('what is')) return 'academic_research'
    if (p.includes('app') || p.includes('phone') || p.includes('android')) return 'device_automation'
    if (p.includes('diagram') || p.includes('chart') || p.includes('image')) return 'visual_creative'
    if (p.includes('file') || p.includes('directory')) return 'filesystem'
    return 'general_intelligence'
  }

  private estimateComplexity(prompt: string): 'SIMPLE' | 'COMPOUND' | 'MULTI_STAGE' {
    const p = prompt.toLowerCase()
    const andCount = (p.match(/\band\b|\bthen\b|\bafter that\b|\balso\b/g) || []).length
    if (andCount >= 2 || p.length > 150) return 'MULTI_STAGE'
    if (andCount === 1 || p.length > 70) return 'COMPOUND'
    return 'SIMPLE'
  }

  private extractEntities(prompt: string): Record<string, any> {
    const entities: Record<string, any> = {}
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/i)
    if (urlMatch) entities.url = urlMatch[0]

    const emailMatch = prompt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i)
    if (emailMatch) entities.email = emailMatch[0]

    const filePathMatch = prompt.match(/(?:[\w-]+\/)+[\w-]+\.\w+/i)
    if (filePathMatch) entities.filePath = filePathMatch[0]

    return entities
  }

  /**
   * Generates optimal DAG tasks using Gemini 3.8 Flash
   */
  private async planWithGemini(
    prompt: string,
    graphId: string,
    context: any,
    understanding: any
  ): Promise<BrainTask[]> {
    const ai = getGemini()!
    const systemPrompt = `You are the Task Planning Engine of an Advanced AI Brain.
Decompose the user's request into a directed acyclic graph (DAG) of actionable sub-tasks.
Each task must be assigned to exactly one specialized agent:
- "Research Agent" (web search, scientific studies, fact retrieval)
- "Coding Agent" (codebase search, AST symbol lookup, refactoring)
- "Browser Agent" (live URL visit, reader parsing, link following)
- "File Agent" (read, write, inspect files)
- "Vision Agent" (diagrams, images, OCR)
- "Android Agent" (launch app, tap, device actions)
- "Voice Agent" (dialogue phrasing, spoken response)

Each task MUST specify:
- description: clear, actionable objective
- priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
- dependencies: array of 0-based task index strings like ["0"] or [] for root tasks
- assignedAgent: one of the 7 roles above
- requiredTools: array of tool names (e.g. ["search_web"], ["codebase_search"], ["file_read"], ["android_open_app"])
- retrySafe: boolean (false if sensitive deletion or payment)

Return ONLY valid JSON matching this schema:
{
  "tasks": [
    {
      "description": string,
      "priority": "CRITICAL" | "HIGH" | "NORMAL" | "LOW",
      "dependencies": string[], // indices of dependencies, e.g. ["0"]
      "assignedAgent": string,
      "requiredTools": string[],
      "retrySafe": boolean
    }
  ]
}`

    const candidateModels = [
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ]

    let response: any = null
    for (const modelCandidate of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelCandidate,
          contents: [
            { text: systemPrompt },
            { text: `User Request: "${prompt}"\nRelevant Memories: ${JSON.stringify(context.relevantMemories)}` }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        })
        if (response?.text) break
      } catch (_err) {
        // Continue to next model candidate
      }
    }

    const parsed = JSON.parse(response.text || '{}')
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error('Gemini planner returned empty tasks array.')
    }

    const tasks: BrainTask[] = []
    const now = Date.now()

    parsed.tasks.forEach((t: any, index: number) => {
      const taskId = `${graphId}_t${index + 1}`
      // Remap index dependencies to actual taskIds
      const deps: string[] = []
      if (Array.isArray(t.dependencies)) {
        t.dependencies.forEach((d: any) => {
          const depIdx = Number(d)
          if (!isNaN(depIdx) && depIdx >= 0 && depIdx < index) {
            deps.push(`${graphId}_t${depIdx + 1}`)
          }
        })
      }

      tasks.push({
        taskId,
        description: t.description || `Task ${index + 1}`,
        priority: t.priority || understanding.urgency,
        dependencies: deps,
        status: 'QUEUED',
        assignedAgent: brainAgentRegistry.selectAgentForGoal(t.description, t.assignedAgent),
        requiredTools: Array.isArray(t.requiredTools) && t.requiredTools.length > 0 ? t.requiredTools : ['search_web'],
        attempts: 0,
        maxAttempts: 3,
        retrySafe: t.retrySafe !== false,
        createdAt: now,
        updatedAt: now,
        verificationRules: {
          type: 'non_empty'
        }
      })
    })

    return tasks
  }

  /**
   * Deterministic rule-based DAG planner (Zero external latency fallback)
   */
  private planDeterministic(prompt: string, graphId: string, understanding: any): BrainTask[] {
    const now = Date.now()
    const p = prompt.toLowerCase()
    const tasks: BrainTask[] = []

    // 1. Android App launch
    if (p.startsWith('open ') || p.startsWith('launch ') || p.includes('on my phone') || p.includes('android app')) {
      const appName = prompt.replace(/^(open|launch|start)\s+/i, '').replace(/on my phone|app/gi, '').trim()
      tasks.push({
        taskId: `${graphId}_t1`,
        description: `Resolve package and launch application "${appName}"`,
        priority: understanding.urgency,
        dependencies: [],
        status: 'QUEUED',
        assignedAgent: 'Android Agent',
        requiredTools: ['android_open_app', 'android_resolve_package'],
        attempts: 0,
        maxAttempts: 3,
        parameters: { appName },
        retrySafe: true,
        createdAt: now,
        updatedAt: now
      })
      return tasks
    }

    // 2. Multi-step Web Search + Synthesize
    if (understanding.estimatedComplexity === 'MULTI_STAGE' || p.includes('research') || p.includes('compare')) {
      const t1Id = `${graphId}_t1`
      const t2Id = `${graphId}_t2`

      tasks.push({
        taskId: t1Id,
        description: `Gather factual sources and data for: ${prompt}`,
        priority: 'HIGH',
        dependencies: [],
        status: 'QUEUED',
        assignedAgent: 'Research Agent',
        requiredTools: ['search_web'],
        attempts: 0,
        maxAttempts: 3,
        parameters: { query: prompt },
        retrySafe: true,
        createdAt: now,
        updatedAt: now
      })

      tasks.push({
        taskId: t2Id,
        description: `Synthesize research findings into comprehensive answer for user`,
        priority: understanding.urgency,
        dependencies: [t1Id],
        status: 'QUEUED',
        assignedAgent: 'Voice Agent',
        requiredTools: ['voice_format_dialogue'],
        attempts: 0,
        maxAttempts: 2,
        parameters: { text: prompt },
        retrySafe: true,
        createdAt: now,
        updatedAt: now
      })

      return tasks
    }

    // 3. Single default task
    tasks.push(this.createFallbackTask(prompt, graphId, understanding.urgency))
    return tasks
  }

  private createFallbackTask(prompt: string, graphId: string, priority: TaskPriority): BrainTask {
    const role = brainAgentRegistry.selectAgentForGoal(prompt)
    const agent = brainAgentRegistry.get(role)

    return {
      taskId: `${graphId}_t1`,
      description: prompt.trim(),
      priority,
      dependencies: [],
      status: 'QUEUED',
      assignedAgent: role,
      requiredTools: agent?.defaultTools || ['search_web'],
      attempts: 0,
      maxAttempts: 3,
      retrySafe: true,
      parameters: { query: prompt, prompt },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      verificationRules: {
        type: 'non_empty'
      }
    }
  }
}

export const taskPlanner = new TaskPlanner()
