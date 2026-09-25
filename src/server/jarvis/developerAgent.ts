/**
 * JARVIS Developer & Terminal Agent
 * Provides safe terminal command execution, codebase analysis,
 * linting, typechecking, patching, and verification.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { permissionManager } from './permissionManager'
import { agentEventBus } from './eventBus'

const execAsync = promisify(exec)

export interface TerminalExecutionResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  riskLevel: string
  cancelled?: boolean
}

export class DeveloperAgent {
  /**
   * Executes a terminal command safely with risk analysis and timeout
   */
  public async executeTerminal(
    command: string,
    options?: {
      cwd?: string
      timeoutMs?: number
      signal?: AbortSignal
      isUserApproved?: boolean
    }
  ): Promise<TerminalExecutionResult> {
    const risk = permissionManager.evaluateRisk('terminal_execute', { command })
    const requiresConf = permissionManager.requiresConfirmation('terminal_execute', risk)

    if (requiresConf && !options?.isUserApproved) {
      throw new Error(`Terminal command requires explicit confirmation: "${command}" [Risk: ${risk}]`)
    }

    const start = Date.now()
    agentEventBus.emit('tool.started', `Terminal: ${command}`, { data: { command, risk } })

    try {
      const child = await execAsync(command, {
        cwd: options?.cwd || process.cwd(),
        timeout: options?.timeoutMs || 25000,
        signal: options?.signal,
        env: { ...process.env, PAGER: 'cat' }
      })

      const durationMs = Date.now() - start
      const result: TerminalExecutionResult = {
        command,
        exitCode: 0,
        stdout: child.stdout.slice(0, 10000),
        stderr: child.stderr.slice(0, 2000),
        durationMs,
        riskLevel: risk
      }

      agentEventBus.emit('tool.completed', `Terminal command succeeded (${durationMs}ms)`, {
        data: result
      })

      return result
    } catch (err: any) {
      const durationMs = Date.now() - start
      const result: TerminalExecutionResult = {
        command,
        exitCode: err.code || 1,
        stdout: (err.stdout || '').slice(0, 5000),
        stderr: (err.stderr || err.message || '').slice(0, 2000),
        durationMs,
        riskLevel: risk,
        cancelled: err.name === 'AbortError'
      }

      agentEventBus.emit('tool.failed', `Terminal command failed: ${err.message}`, {
        data: result
      })

      return result
    }
  }

  /**
   * Runs project verification suite (typecheck or lint)
   */
  public async runVerificationSuite(type: 'typecheck' | 'lint' = 'typecheck'): Promise<{
    passed: boolean
    output: string
    durationMs: number
  }> {
    const cmd = type === 'typecheck' ? 'npm run typecheck' : 'npm run lint'
    const res = await this.executeTerminal(cmd, { isUserApproved: true })

    return {
      passed: res.exitCode === 0,
      output: res.stdout || res.stderr,
      durationMs: res.durationMs
    }
  }
}

export const developerAgent = new DeveloperAgent()
