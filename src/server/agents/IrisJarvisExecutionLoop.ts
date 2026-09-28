/**
 * IRIS JARVIS EXECUTION LOOP
 *
 * UI-agnostic control plane:
 * Understand -> Plan -> Permission -> Execute -> Verify -> Recover -> Respond
 *
 * Reuses the existing IrisAgentRuntime and accepts the ToolRegistry caller as a dependency.
 * Sensitive Android actions never bypass explicit permission.
 * CI verification is required before this change is considered shipped.
 */

import { irisAgentRuntime, type IrisPlanStep } from './IrisAgentRuntime'

export interface JarvisExecutionOptions {
  userId?: string
  approveSensitive?: boolean
}

export type JarvisToolCaller = (name: string, args: Record<string, any>) => Promise<any>

function extractAndroidTarget(command: string): string {
  const match = command.match(/\b(?:open|launch|start)\s+(?:the\s+)?([a-z0-9][a-z0-9 ._-]{1,60}?)(?:\s+(?:app|please|now))?(?:[.!?]|$)/i)
  return match?.[1]?.trim() || command.trim()
}

function extractRepository(command: string): string {
  const url = command.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/i)?.[0]
  if (url) return url
  const repo = command.match(/\b[\w.-]+\/[\w.-]+\b/)?.[0]
  return repo || 'workspace'
}

function buildToolArgs(step: IrisPlanStep, command: string, userId: string) {
  switch (step.tool) {
    case 'web_search':
      return { query: command, category: 'general', limit: 5 }
    case 'memory_store':
      return { userId, content: command, category: 'fact', namespace: 'default', importance: 3 }
    case 'generate_flux_image':
      return { prompt: command }
    case 'github_project_control':
      return { action: 'diagnose', repoOrPath: extractRepository(command), targetIssue: command }
    case 'android_companion_hub':
      return { category: 'app', action: 'launch', target: extractAndroidTarget(command) }
    default:
      return {}
  }
}

function isExternalVerificationPending(result: any): boolean {
  return Boolean(result && (result.status === 'dispatched' || result.status === 'not_executed' || result.status === 'awaiting_bridge' || result.status === 'adapter_required'))
}

function verifyResult(result: any): true | 'pending' | false {
  if (isExternalVerificationPending(result)) return 'pending'
  if (result === undefined || result === null) return false
  if (Array.isArray(result)) return result.length > 0
  return true
}

export class IrisJarvisExecutionLoop {
  async execute(command: string, options: JarvisExecutionOptions = {}, callTool: JarvisToolCaller) {
    const normalized = command.trim()
    if (!normalized) throw new Error('Jarvis command cannot be empty')

    const task = irisAgentRuntime.createTask(normalized)
    irisAgentRuntime.planTask(task.id)

    const results = await irisAgentRuntime.execute(
      task.id,
      async (step) => {
        if (!step.tool) return { status: 'model_response_required', command: normalized }
        return callTool(step.tool, buildToolArgs(step, normalized, options.userId || 'default'))
      },
      {
        requirePermission: async (step) => {
          if (step.permission === 'sensitive' || step.permission === 'admin') return options.approveSensitive === true
          return true
        },
        verify: async (_step, result) => verifyResult(result),
        recover: async () => true
      }
    )

    const latest = irisAgentRuntime.getTask(task.id)
    return {
      taskId: task.id,
      status: latest?.status || 'failed',
      command: normalized,
      steps: latest?.steps || [],
      results
    }
  }
}

export const irisJarvisExecutionLoop = new IrisJarvisExecutionLoop()
