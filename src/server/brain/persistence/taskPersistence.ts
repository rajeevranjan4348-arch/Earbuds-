/**
 * Advanced AI Brain - Task Persistence & Crash Recovery
 * Ensures all tasks and graphs survive:
 * - App restart
 * - Temporary network failure
 * - Tool failure
 * - Device interruption
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TaskGraph, BrainTask, TaskStatus } from '../types'

const PERSISTENCE_FILE = resolve(process.cwd(), '.iris-brain-tasks.json')

export class BrainTaskPersistence {
  private graphs = new Map<string, TaskGraph>()

  constructor() {
    this.loadFromDisk()
  }

  private loadFromDisk() {
    try {
      if (existsSync(PERSISTENCE_FILE)) {
        const raw = readFileSync(PERSISTENCE_FILE, 'utf-8')
        const parsed = JSON.parse(raw) as TaskGraph[]
        if (Array.isArray(parsed)) {
          for (const g of parsed) {
            this.graphs.set(g.graphId, g)
          }
        }
      }
    } catch (err) {
      console.warn('[BrainPersistence] Could not load persisted task graphs:', err)
    }
  }

  public saveGraph(graph: TaskGraph) {
    this.graphs.set(graph.graphId, graph)
    this.flushToDisk()
  }

  public getGraph(graphId: string): TaskGraph | undefined {
    return this.graphs.get(graphId)
  }

  public getAllGraphs(userId?: string): TaskGraph[] {
    const all = Array.from(this.graphs.values())
    const filtered = userId ? all.filter((g) => g.userId === userId) : all
    return filtered.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Identifies any graphs that were not finished when server stopped
   */
  public getUnfinishedGraphs(): TaskGraph[] {
    const unfinishedStatuses: TaskStatus[] = ['QUEUED', 'PLANNING', 'RUNNING', 'WAITING', 'PAUSED']
    return Array.from(this.graphs.values()).filter((g) => unfinishedStatuses.includes(g.status))
  }

  /**
   * Prepares interrupted tasks for seamless resumption:
   * Resets mid-flight 'RUNNING' or 'VERIFYING' tasks to 'QUEUED' so they execute cleanly
   */
  public prepareForRecovery(graph: TaskGraph): TaskGraph {
    for (const task of graph.tasks) {
      if (task.status === 'RUNNING' || task.status === 'VERIFYING') {
        task.status = 'QUEUED'
        task.updatedAt = Date.now()
      }
    }
    graph.status = 'QUEUED'
    graph.updatedAt = Date.now()
    this.saveGraph(graph)
    return graph
  }

  private flushToDisk() {
    try {
      const array = Array.from(this.graphs.values()).slice(-100)
      writeFileSync(PERSISTENCE_FILE, JSON.stringify(array, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[BrainPersistence] Failed to flush tasks to disk:', err)
    }
  }
}

export const brainTaskPersistence = new BrainTaskPersistence()
