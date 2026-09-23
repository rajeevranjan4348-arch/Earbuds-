/**
 * Advanced AI Brain - Long-Term Memory & Context Retrieval
 * Integrates user preferences, factual memories, previous task histories,
 * and contextual grounding into task planning and agent execution.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BrainContext, TaskGraph, BrainTask } from '../types'

const MEMORY_FILE = resolve(process.cwd(), '.iris-brain-memory.json')

export interface TaskMemoryRecord {
  graphId: string
  goal: string
  completedAt: number
  summary: string
  keyFindings: string[]
  toolsUsed: string[]
  entities: Record<string, any>
}

export class BrainMemoryManager {
  private taskHistory: TaskMemoryRecord[] = []

  constructor() {
    this.load()
  }

  private load() {
    try {
      if (existsSync(MEMORY_FILE)) {
        const raw = readFileSync(MEMORY_FILE, 'utf-8')
        this.taskHistory = JSON.parse(raw)
      }
    } catch (_e) {
      this.taskHistory = []
    }
  }

  private save() {
    try {
      writeFileSync(MEMORY_FILE, JSON.stringify(this.taskHistory.slice(-100), null, 2), 'utf-8')
    } catch (_e) {}
  }

  /**
   * Records completed task execution to long-term memory
   */
  public recordTaskCompletion(graph: TaskGraph) {
    if (graph.status !== 'COMPLETED') return

    const keyFindings: string[] = []
    const toolsUsed = new Set<string>()

    for (const task of graph.tasks) {
      task.requiredTools.forEach((t) => toolsUsed.add(t))
      if (task.result) {
        if (typeof task.result === 'string') {
          keyFindings.push(task.result.slice(0, 150))
        } else if (task.result.summary) {
          keyFindings.push(String(task.result.summary).slice(0, 150))
        } else if (task.result.title) {
          keyFindings.push(`${task.result.title}: ${task.result.snippet || ''}`.slice(0, 150))
        }
      }
    }

    const record: TaskMemoryRecord = {
      graphId: graph.graphId,
      goal: graph.goal,
      completedAt: Date.now(),
      summary: graph.finalSynthesis ? graph.finalSynthesis.slice(0, 300) : graph.originalRequest,
      keyFindings: keyFindings.slice(0, 5),
      toolsUsed: Array.from(toolsUsed),
      entities: graph.understanding.detectedEntities
    }

    this.taskHistory.unshift(record)
    this.save()
  }

  /**
   * Retrieves relevant previous task contexts given a new user request
   */
  public findRelevantTaskHistory(prompt: string, limit: number = 3): TaskMemoryRecord[] {
    const tokens = prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    if (tokens.length === 0) return []

    const scored = this.taskHistory.map((rec) => {
      const text = `${rec.goal} ${rec.summary} ${rec.keyFindings.join(' ')}`.toLowerCase()
      let matches = 0
      for (const t of tokens) {
        if (text.includes(t)) matches++
      }
      return { rec, score: matches }
    })

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.rec)
  }

  /**
   * Assembles a structured BrainContext for planning
   */
  public buildContext(prompt: string, userId: string = 'default_user'): BrainContext {
    const relevantTasks = this.findRelevantTaskHistory(prompt)

    const recentTaskHistory = relevantTasks.map((t) => ({
      taskId: t.graphId,
      goal: t.goal,
      status: 'COMPLETED' as const,
      summary: t.summary
    }))

    const relevantMemories = relevantTasks.flatMap((t) => t.keyFindings)

    return {
      userId,
      userPreferences: [
        'Voice-first concise articulation',
        'Direct executable solutions',
        'Strict zero-slop UI integrity'
      ],
      relevantMemories,
      recentTaskHistory,
      systemStatus: {
        timestamp: new Date().toISOString(),
        activeTasks: 0
      }
    }
  }
}

export const brainMemoryManager = new BrainMemoryManager()
