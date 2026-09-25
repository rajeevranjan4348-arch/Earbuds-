/**
 * Google Workspace Activity Log Store
 * Maintains a persistent, timestamped audit log of all file imports,
 * automatic and manual synchronizations, global searches, and indexing events.
 */

import fs from 'fs'
import path from 'path'

export interface WorkspaceActivityItem {
  id: string
  userId: string
  action: 'import' | 'sync' | 'search' | 'auto_sync' | 'delete' | 'export'
  service: 'drive' | 'docs' | 'sheets' | 'slides' | 'gmail' | 'calendar' | 'tasks' | 'all'
  fileId?: string
  fileName: string
  fileType?: string
  mimeType?: string
  status: 'success' | 'failed' | 'in_progress' | 'queued'
  sizeBytes?: number
  chunksIndexed?: number
  pageCount?: number
  details?: string
  errorMessage?: string
  timestamp: number
  durationMs?: number
  source: 'voice' | 'chat' | 'auto_sync' | 'ui' | 'api'
}

export class WorkspaceActivityLogger {
  private static instance: WorkspaceActivityLogger
  private logDir: string
  private logFile: string
  private activities: WorkspaceActivityItem[] = []
  private isLoaded = false

  private constructor() {
    this.logDir = path.join(process.cwd(), 'data', 'workspace')
    this.logFile = path.join(this.logDir, 'activity_log.json')
    this.initStorage()
  }

  public static getInstance(): WorkspaceActivityLogger {
    if (!WorkspaceActivityLogger.instance) {
      WorkspaceActivityLogger.instance = new WorkspaceActivityLogger()
    }
    return WorkspaceActivityLogger.instance
  }

  private initStorage() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      this.loadLogs()
    } catch (e) {
      console.warn('[WorkspaceActivityLog] Storage init notice:', e)
    }
  }

  private loadLogs() {
    if (this.isLoaded) return
    try {
      if (fs.existsSync(this.logFile)) {
        const raw = fs.readFileSync(this.logFile, 'utf8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.activities = parsed
        }
      }
      this.isLoaded = true
    } catch (err) {
      console.warn('[WorkspaceActivityLog] Load failed:', err)
      this.isLoaded = true
    }
  }

  private saveLogs() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      fs.writeFileSync(this.logFile, JSON.stringify(this.activities.slice(0, 500), null, 2), 'utf8')
    } catch (err) {
      console.error('[WorkspaceActivityLog] Save failed:', err)
    }
  }

  public log(
    entry: Omit<WorkspaceActivityItem, 'id' | 'timestamp'> & { timestamp?: number }
  ): WorkspaceActivityItem {
    this.loadLogs()
    const item: WorkspaceActivityItem = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || Date.now(),
      ...entry
    }

    this.activities.unshift(item)
    // Keep last 500 records
    if (this.activities.length > 500) {
      this.activities = this.activities.slice(0, 500)
    }

    this.saveLogs()
    return item
  }

  public getActivities(filter?: {
    userId?: string
    service?: string
    action?: string
    status?: string
    limit?: number
  }): WorkspaceActivityItem[] {
    this.loadLogs()
    let result = [...this.activities]

    if (filter?.userId && filter.userId !== 'all') {
      result = result.filter((a) => a.userId === filter.userId || a.userId === 'usr_primary')
    }
    if (filter?.service && filter.service !== 'all') {
      result = result.filter((a) => a.service === filter.service)
    }
    if (filter?.action && filter.action !== 'all') {
      result = result.filter((a) => a.action === filter.action)
    }
    if (filter?.status && filter.status !== 'all') {
      result = result.filter((a) => a.status === filter.status)
    }

    const limit = filter?.limit || 100
    return result.slice(0, limit)
  }

  public clearLogs(userId?: string): void {
    if (userId && userId !== 'all') {
      this.activities = this.activities.filter((a) => a.userId !== userId)
    } else {
      this.activities = []
    }
    this.saveLogs()
  }
}

export const workspaceActivityLogger = WorkspaceActivityLogger.getInstance()
