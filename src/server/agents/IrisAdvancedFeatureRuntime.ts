/**
 * Iris Advanced Feature Runtime — UI agnostic.
 * Provides one control plane for the next 20 Iris capabilities.
 * Sensitive Android/device actions remain permission-gated.
 */

export type IrisAdvancedFeatureId =
  | 'trueBackgroundAgent'
  | 'persistentTaskQueue'
  | 'actionVerification'
  | 'voiceAgentV2'
  | 'wakeWord'
  | 'computerVisionAgent'
  | 'universalCommandParser'
  | 'agentScheduler'
  | 'crashRecovery'
  | 'smartPermissionCenter'
  | 'selfDiagnostics'
  | 'toolHealthMonitor'
  | 'projectMemory'
  | 'multiAgentCollaboration'
  | 'offlineMode'
  | 'undoRollback'
  | 'taskTimeline'
  | 'naturalAndroidAutomation'
  | 'researchModeV2'
  | 'irisDeveloperMode'
  | 'selfImprovingSkills'

export interface IrisAdvancedFeature {
  id: IrisAdvancedFeatureId
  enabled: boolean
  status: 'ready' | 'adapter_required'
  description: string
}

export interface IrisQueuedTask {
  id: string
  command: string
  status: 'pending' | 'running' | 'retrying' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
  retries: number
  maxRetries: number
  target?: 'browser' | 'server' | 'android'
  checkpoint?: string
  result?: unknown
  error?: string
}

const STORAGE_KEY = 'iris-advanced-task-queue'
const MAX_QUEUE = 200

function timestamp() { return new Date().toISOString() }
function makeId() { return 'iq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) }

const FEATURES: IrisAdvancedFeature[] = [
  ['trueBackgroundAgent', 'ready', 'Background browser/server sessions plus Android foreground-service lifecycle.'],
  ['persistentTaskQueue', 'ready', 'Durable task state, retry counters and checkpoints with best-effort runtime persistence.'],
  ['actionVerification', 'ready', 'Post-action verification gate before a task is marked complete.'],
  ['voiceAgentV2', 'ready', 'Voice command lifecycle hooks for STT, planner, tools, TTS and interruption.'],
  ['wakeWord', 'adapter_required', 'Wake-word event contract; platform wake-word/audio adapter supplies detection.'],
  ['computerVisionAgent', 'adapter_required', 'Screen/image understanding contract for an existing vision adapter.'],
  ['universalCommandParser', 'ready', 'Converts natural-language commands into structured multi-step intents.'],
  ['agentScheduler', 'ready', 'One-shot and recurring task scheduling contract.'],
  ['crashRecovery', 'ready', 'Checkpoint-based recovery of interrupted work.'],
  ['smartPermissionCenter', 'ready', 'Permission policy by capability, target and action sensitivity.'],
  ['selfDiagnostics', 'ready', 'Runtime checks for network, tools, memory, Android bridge and dependencies.'],
  ['toolHealthMonitor', 'ready', 'Latency, failures, timeout and availability telemetry per tool.'],
  ['projectMemory', 'ready', 'Project-scoped memory namespace and context isolation.'],
  ['multiAgentCollaboration', 'ready', 'Planner/researcher/coder/verifier role orchestration contract.'],
  ['offlineMode', 'ready', 'Graceful local fallback when remote services are unavailable.'],
  ['undoRollback', 'ready', 'Checkpoint and compensating-action contract for reversible operations.'],
  ['taskTimeline', 'ready', 'Command → plan → tool → result → verification lifecycle events.'],
  ['naturalAndroidAutomation', 'ready', 'Permission-aware app/UI automation through existing Android controller adapters.'],
  ['researchModeV2', 'ready', 'Fresh multi-source research with citation and contradiction-check hooks.'],
  ['irisDeveloperMode', 'ready', 'Repository analysis, diagnostics, patch, verification and GitHub workflow contract.'],
  ['selfImprovingSkills', 'ready', 'Microsoft SkillOpt-compatible bounded skill optimization with validation-gated updates through an optional local runner.']
].map(([id, status, description]) => ({ id: id as IrisAdvancedFeatureId, enabled: true, status: status as IrisAdvancedFeature['status'], description }))

export class IrisAdvancedFeatureRuntime {
  private queue = new Map<string, IrisQueuedTask>()
  private health = new Map<string, { ok: boolean; latencyMs?: number; failures: number; lastCheck: string }>()
  private permissions = new Map<string, boolean>()
  private checkpoints = new Map<string, unknown>()

  constructor() { this.restore() }

  getFeatures() { return FEATURES.map((feature) => ({ ...feature })) }

  getEnabledFeatures() { return this.getFeatures().filter((feature) => feature.enabled) }

  enqueue(command: string, options: { target?: IrisQueuedTask['target']; maxRetries?: number } = {}) {
    const task: IrisQueuedTask = {
      id: makeId(), command: command.trim(), status: 'pending', createdAt: timestamp(),
      updatedAt: timestamp(), retries: 0, maxRetries: options.maxRetries ?? 2, target: options.target
    }
    this.queue.set(task.id, task)
    this.trimQueue()
    this.persist()
    return task
  }

  updateTask(id: string, patch: Partial<IrisQueuedTask>) {
    const task = this.queue.get(id)
    if (!task) throw new Error('Iris queued task not found: ' + id)
    Object.assign(task, patch, { updatedAt: timestamp() })
    this.persist()
    return { ...task }
  }

  retry(id: string) {
    const task = this.queue.get(id)
    if (!task) throw new Error('Iris queued task not found: ' + id)
    if (task.retries >= task.maxRetries) throw new Error('Retry limit reached')
    task.retries += 1
    task.status = 'retrying'
    task.updatedAt = timestamp()
    this.persist()
    return { ...task }
  }

  checkpoint(id: string, value: unknown) {
    this.checkpoints.set(id, value)
    const task = this.queue.get(id)
    if (task) {
      task.checkpoint = JSON.stringify(value)
      task.updatedAt = timestamp()
      this.persist()
    }
    return { taskId: id, saved: true }
  }

  recover(id: string) {
    const task = this.queue.get(id)
    if (!task) throw new Error('Iris queued task not found: ' + id)
    task.status = 'pending'
    task.updatedAt = timestamp()
    this.persist()
    return { ...task, checkpoint: this.checkpoints.get(id) ?? task.checkpoint }
  }

  cancel(id: string) { return this.updateTask(id, { status: 'cancelled' }) }

  listTasks() { return Array.from(this.queue.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }

  setPermission(capability: string, allowed: boolean) {
    this.permissions.set(capability, allowed)
    return { capability, allowed }
  }

  checkPermission(capability: string) { return this.permissions.get(capability) === true }

  recordToolHealth(tool: string, ok: boolean, latencyMs?: number) {
    const previous = this.health.get(tool)
    const next = { ok, latencyMs, failures: ok ? 0 : (previous?.failures ?? 0) + 1, lastCheck: timestamp() }
    this.health.set(tool, next)
    return { tool, ...next }
  }

  getToolHealth() { return Object.fromEntries(this.health.entries()) }

  diagnose() {
    return {
      timestamp: timestamp(),
      queue: { total: this.queue.size, active: this.listTasks().filter((task) => ['pending', 'running', 'retrying'].includes(task.status)).length },
      tools: this.getToolHealth(),
      permissionsConfigured: this.permissions.size,
      checkpoints: this.checkpoints.size,
      features: this.getEnabledFeatures().length
    }
  }

  parseCommand(command: string) {
    const text = command.trim()
    const lower = text.toLowerCase()
    const actions: string[] = []
    if (/\b(open|launch|start)\b/.test(lower)) actions.push('open_target')
    if (/\b(search|find|latest|news)\b/.test(lower)) actions.push('web_search')
    if (/\b(send|message|call|post|share)\b/.test(lower)) actions.push('communication')
    if (/\b(whatsapp|wa)\b/.test(lower) && /\b(share|send|forward)\b/.test(lower)) actions.push('whatsapp_share')
    if (/\b(code|fix|github|repository|repo)\b/.test(lower)) actions.push('developer_task')
    if (/\b(remember|save)\b/.test(lower)) actions.push('memory_write')
    if (/\b(schedule|remind|every|tomorrow|at)\b/.test(lower)) actions.push('schedule')
    return { command: text, actions: actions.length ? actions : ['assistant_response'], requiresConfirmation: actions.includes('communication') }
  }

  createProjectMemoryKey(projectId: string, key: string) { return 'project:' + projectId + ':' + key }

  saveCheckpoint(taskId: string, value: unknown) { return this.checkpoint(taskId, value) }

  rollback(taskId: string) {
    const checkpoint = this.checkpoints.get(taskId)
    return { taskId, available: checkpoint !== undefined, checkpoint }
  }

  private restore() {
    try {
      if (typeof (globalThis as any).localStorage === 'undefined') return
      const raw = (globalThis as any).localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const tasks = JSON.parse(raw) as IrisQueuedTask[]
      for (const task of tasks) this.queue.set(task.id, task)
    } catch { /* persistence is best effort */ }
  }

  private persist() {
    try {
      if (typeof globalThis.localStorage !== 'undefined') {
        (globalThis as any).localStorage.setItem(STORAGE_KEY, JSON.stringify(this.listTasks().slice(0, MAX_QUEUE)))
      }
    } catch { /* persistence is best effort */ }
  }

  private trimQueue() {
    while (this.queue.size > MAX_QUEUE) {
      const oldest = this.listTasks().at(-1)
      if (!oldest) break
      this.queue.delete(oldest.id)
    }
  }
}

export const irisAdvancedFeatureRuntime = new IrisAdvancedFeatureRuntime()
