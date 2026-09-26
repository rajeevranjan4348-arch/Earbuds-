/**
 * IRIS Verification Gate & Health Runner
 * Adapted from gstack's bin/gstack-verify-gate and lib/cso/verification.ts.
 *
 * Discovers and executes declared verification commands (typecheck, lint, test, build),
 * enforces zero false-success reporting, captures compiler/runtime errors,
 * and formulates actionable repair instructions.
 */

import { exec } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { promisify } from 'util'
import type { VerificationCheck, VerificationGateResult } from './types'

const execAsync = promisify(exec)

export class GStackVerifyGate {
  /**
   * Inspects the project package.json to determine available verification tasks
   */
  public discoverDeclaredChecks(projectDir = process.cwd()): string[] {
    const pkgPath = join(projectDir, 'package.json')
    if (!existsSync(pkgPath)) {
      return ['tsc --noEmit']
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      const checks: string[] = []

      // In order of speed and diagnostic value
      if (scripts.typecheck) checks.push('npm run typecheck')
      else if (existsSync(join(projectDir, 'tsconfig.json'))) checks.push('npx tsc --noEmit')

      if (scripts.lint) checks.push('npm run lint')
      if (scripts.test) checks.push('npm run test')
      if (scripts.build) checks.push('npm run build')

      return checks.length > 0 ? checks : ['npx tsc --noEmit']
    } catch (_e) {
      return ['npx tsc --noEmit']
    }
  }

  /**
   * Runs an individual verification command within strict timeout bounds
   */
  public async runCheck(
    name: string,
    command: string,
    projectDir = process.cwd(),
    timeoutMs = 60000
  ): Promise<VerificationCheck> {
    const startTime = Date.now()

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectDir,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024
      })

      const output = (stdout + '\n' + stderr).trim()
      const durationMs = Date.now() - startTime

      return {
        name,
        command,
        status: 'passed',
        durationMs,
        output: output.substring(0, 10000)
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime
      const rawOutput = ((err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '')).trim()
      const errors = this.extractDiagnosticErrors(rawOutput)

      return {
        name,
        command,
        status: 'failed',
        durationMs,
        output: rawOutput.substring(0, 10000),
        errors
      }
    }
  }

  /**
   * Runs the complete verification gate across discovered checks
   */
  public async runGate(options?: {
    customCommands?: string[]
    projectDir?: string
    stopOnFirstFailure?: boolean
  }): Promise<VerificationGateResult> {
    const projectDir = options?.projectDir || process.cwd()
    const commands = options?.customCommands || this.discoverDeclaredChecks(projectDir)
    const startTime = Date.now()
    const checks: VerificationCheck[] = []

    let allPassed = true
    const allErrors: string[] = []
    const recommendations: string[] = []

    for (const cmd of commands) {
      const checkName = cmd.replace(/^npm run\s+|^npx\s+/, '')
      const result = await this.runCheck(checkName, cmd, projectDir)
      checks.push(result)

      if (result.status === 'failed') {
        allPassed = false
        if (result.errors && result.errors.length > 0) {
          allErrors.push(...result.errors)
        } else {
          allErrors.push(`Command "${cmd}" failed with code: ${result.output.slice(-200)}`)
        }

        // Generate tailored repair recommendations
        if (cmd.includes('tsc') || cmd.includes('typecheck')) {
          recommendations.push('Fix reported TypeScript typing or syntax errors before committing.')
        } else if (cmd.includes('lint')) {
          recommendations.push('Run automatic linter repair or fix unescaped characters / unused variables.')
        } else if (cmd.includes('test')) {
          recommendations.push('Investigate failing test assertions and inspect input mock invariants.')
        } else if (cmd.includes('build')) {
          recommendations.push('Resolve bundler compilation errors and missing module imports.')
        }

        if (options?.stopOnFirstFailure) {
          break
        }
      }
    }

    const totalDurationMs = Date.now() - startTime

    return {
      allPassed,
      checks,
      totalDurationMs,
      failureSummary: allErrors.length > 0 ? allErrors.slice(0, 8).join('\n') : undefined,
      fixRecommendations: recommendations.length > 0 ? Array.from(new Set(recommendations)) : undefined
    }
  }

  /**
   * Extracts clean, structured compiler and test errors from raw process output
   */
  private extractDiagnosticErrors(rawOutput: string): string[] {
    const lines = rawOutput.split('\n')
    const errors: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      // TypeScript error pattern: src/foo.ts(12,5): error TS2304: Cannot find name 'bar'.
      // or src/foo.ts:12:5 - error TS2304
      if (
        /error\s+TS\d+:/i.test(trimmed) ||
        /\bTS\d+:\s+/i.test(trimmed) ||
        /\bSyntaxError:/i.test(trimmed) ||
        /\bTypeError:/i.test(trimmed) ||
        /\bReferenceError:/i.test(trimmed) ||
        /✖\s+\d+\s+problems?/i.test(trimmed) ||
        /FAIL\s+/i.test(trimmed)
      ) {
        errors.push(trimmed)
      }
    }

    return errors.slice(0, 15)
  }
}

export const gstackVerifyGate = new GStackVerifyGate()
