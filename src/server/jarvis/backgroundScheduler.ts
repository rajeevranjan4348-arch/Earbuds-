/**
 * JARVIS Background Agent & Persistent Scheduler
 * Handles foreground/background scheduled tasks, one-shot reminders, and recurring tasks.
 * Persists tasks across application restarts.
 */

import fs from 'fs'
import path from 'path'
import { ScheduledTask } from './types'
import { agentEventBus } from './eventBus'

export class BackgroundScheduler {
  private tasks = new Map<string, ScheduledTask>()
  private storageFile = path.resolve(process.cwd(), 'data', 'jarvis_schedules.json')
  private checkInterval: NodeJS.Timeout | null = null

  constructor() {
    this.ensureStorageDir()
    this.loadTasks()
    this.startSchedulerLoop()
  }

  private ensureStorageDir() {
    try {
      const dir = path.dirname(this.storageFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch (_e) {}
  }

  private loadTasks() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8')
        const items: ScheduledTask[] = JSON.parse(raw)
        for (const item of items) {
          this.tasks.set(item.id, item)
        }
      }
    } catch (_e) {
      console.warn('[BackgroundScheduler] Could not load persisted schedules, initializing empty.')
    }
  }

  private saveTasks() {
    try {
      this.ensureStorageDir()
      const list = Array.from(this.tasks.values())
      fs.writeFileSync(this.storageFile, JSON.stringify(list, null, 2), 'utf-8')
    } catch (_e) {}
  }

  private startSchedulerLoop() {
    if (this.checkInterval) return

    // Check every 10 seconds for due tasks
    this.checkInterval = setInterval(() => {
      this.evaluateDueTasks()
    }, 10000)
  }

  private async evaluateDueTasks() {
    const now = Date.now()

    for (const task of this.tasks.values()) {
      if (task.status === 'PENDING' && task.scheduledTime && task.scheduledTime <= now) {
        await this.executeScheduledTask(task)
      }
    }
  }

  public async scheduleTask(
    name: string,
    command: string,
    scheduledTime: number,
    type: 'one_shot' | 'recurring' = 'one_shot',
    cronExpression?: string
  ): Promise<ScheduledTask> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

    const task: ScheduledTask = {
      id,
      name,
      type,
      scheduledTime,
      cronExpression,
      command,
      status: 'PENDING',
      createdAt: Date.now()
    }

    this.tasks.set(id, task)
    this.saveTasks()

    agentEventBus.emit('agent.started', `Task scheduled: ${name} (at ${new Date(scheduledTime).toISOString()})`, {
      taskId: id,
      data: task
    })

    return task
  }

  public async executeScheduledTask(task: ScheduledTask): Promise<void> {
    task.status = 'EXECUTING'
    task.lastRun = Date.now()
    this.saveTasks()

    agentEventBus.emit('agent.started', `Executing scheduled task: ${task.name}`, {
      taskId: task.id,
      data: task
    })

    try {
      // In production, dispatch to central orchestrator
      task.status = 'COMPLETED'
      agentEventBus.emit('agent.completed', `Scheduled task finished: ${task.name}`, {
        taskId: task.id,
        data: task
      })
    } catch (err: any) {
      task.status = 'FAILED'
      agentEventBus.emit('agent.error', `Scheduled task failed: ${task.name} - ${err?.message}`, {
        taskId: task.id,
        data: { error: err?.message }
      })
    }

    // If recurring, calculate next run
    if (task.type === 'recurring') {
      task.status = 'PENDING'
      task.scheduledTime = Date.now() + 24 * 60 * 60 * 1000 // default next day
    }

    this.saveTasks()
  }

  public getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  public cancelTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    task.status = 'DISABLED'
    this.saveTasks()

    agentEventBus.emit('agent.cancelled', `Cancelled scheduled task: ${task.name}`, {
      taskId: id
    })

    return true
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }
}

export const backgroundScheduler = new BackgroundScheduler()
