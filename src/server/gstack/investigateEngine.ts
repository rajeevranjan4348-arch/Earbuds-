/**
 * IRIS Investigation & Debugging Engine
 * Adapted from gstack's /investigate skill and root-cause analysis logic.
 *
 * Decomposes errors, stack traces, and build failures into failure layers,
 * isolates root causes, and formulates verifiable, minimal repair hypotheses.
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { gstackVerifyGate } from './verifyGate'
import type { InvestigateReport } from './types'

export class GStackInvestigateEngine {
  /**
   * Diagnoses an error message, stack trace, or build failure
   */
  public async investigateFailure(
    errorMessageOrTrace: string,
    context?: { filePath?: string; command?: string }
  ): Promise<InvestigateReport> {
    const raw = errorMessageOrTrace || ''
    const lower = raw.toLowerCase()

    let failureLayer: InvestigateReport['failureLayer'] = 'runtime'
    let rootCause = 'Unknown error condition'
    const affectedFiles: string[] = []
    let hypothesizedFix = 'Review stack trace and inspect variables.'

    // 1. Determine failure layer
    if (
      lower.includes('cannot find module') ||
      lower.includes('err_module_not_found') ||
      lower.includes('enoent') ||
      lower.includes('not found') ||
      lower.includes('package not installed')
    ) {
      failureLayer = 'dependency'
      rootCause = 'Missing required package dependency or incorrect relative import path.'
      hypothesizedFix = 'Install the missing npm package or correct the relative import path.'
    } else if (
      lower.includes('ts') && (lower.includes('error ts') || lower.includes('cannot find name') || lower.includes('type')) ||
      lower.includes('syntaxerror') ||
      lower.includes('unexpected token')
    ) {
      failureLayer = 'build_syntax'
      rootCause = 'TypeScript compilation or syntax error violating static typing contracts.'
      hypothesizedFix = 'Align interface types, add missing imports, or correct syntax formatting.'
    } else if (
      lower.includes('econnrefused') ||
      lower.includes('etimedout') ||
      lower.includes('eacces') ||
      lower.includes('eperm') ||
      lower.includes('port') && lower.includes('already in use')
    ) {
      failureLayer = 'environment'
      rootCause = 'Operating system, network socket, or process permission environment conflict.'
      hypothesizedFix = 'Ensure the target port is free and required environment variables are set.'
    } else if (
      lower.includes('assertionerror') ||
      lower.includes('expected') && lower.includes('received')
    ) {
      failureLayer = 'logic_invariant'
      rootCause = 'Behavioral divergence between expected business logic and observed output.'
      hypothesizedFix = 'Update logic assertions or correct data transformation pipeline.'
    }

    // 2. Extract affected file paths from trace
    const fileMatches = raw.match(/(?:[a-zA-Z0-9_\-\.\/]+)\.(?:ts|tsx|js|jsx|json|html|css):(\d+)?/g)
    if (fileMatches) {
      for (const m of fileMatches) {
        const cleanPath = m.split(':')[0]
        if (!cleanPath.includes('node_modules') && !affectedFiles.includes(cleanPath)) {
          affectedFiles.push(cleanPath)
        }
      }
    }

    if (context?.filePath && !affectedFiles.includes(context.filePath)) {
      affectedFiles.unshift(context.filePath)
    }

    // 3. Inspect target file if available
    let stackTraceDetails = raw.substring(0, 1000)
    if (affectedFiles.length > 0 && existsSync(affectedFiles[0])) {
      try {
        const fileContent = readFileSync(resolve(affectedFiles[0]), 'utf-8')
        const lines = fileContent.split('\n')
        stackTraceDetails += `\n[Inspected Context in ${affectedFiles[0]}]: ${lines.slice(0, 20).join('\n')}`
      } catch (_e) {
        // Ignored
      }
    }

    return {
      symptom: raw.slice(0, 250),
      failureLayer,
      rootCause,
      affectedFiles,
      stackTraceDetails,
      hypothesizedFix,
      suggestedVerification: 'Run gstackVerifyGate.runGate() to verify whether the fix clears the diagnostic barrier.'
    }
  }

  /**
   * Runs the full investigate -> verify cycle on the current project
   */
  public async diagnoseCurrentWorkspace(): Promise<{
    healthy: boolean
    report?: InvestigateReport
    verifyGateSummary: string
  }> {
    const gateResult = await gstackVerifyGate.runGate({ stopOnFirstFailure: true })

    if (gateResult.allPassed) {
      return {
        healthy: true,
        verifyGateSummary: `All ${gateResult.checks.length} verification checks passed cleanly in ${gateResult.totalDurationMs}ms.`
      }
    }

    const failedCheck = gateResult.checks.find((c) => c.status === 'failed')
    const errorOutput = failedCheck?.errors?.join('\n') || failedCheck?.output || 'Unknown build failure'

    const report = await this.investigateFailure(errorOutput, { command: failedCheck?.command })

    return {
      healthy: false,
      report,
      verifyGateSummary: `Check "${failedCheck?.name}" failed in ${failedCheck?.durationMs}ms.`
    }
  }
}

export const gstackInvestigateEngine = new GStackInvestigateEngine()
