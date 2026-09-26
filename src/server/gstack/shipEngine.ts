/**
 * IRIS Shipping & Release Safety Engine
 * Adapted from gstack's /ship skill, lib/worktree.ts, and bin/gstack-redact-prepush.
 *
 * Enforces pre-commit / pre-push verification gates, secret leakage audits,
 * branch safety checks, and conventional commit preparation.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { gstackVerifyGate } from './verifyGate'
import { gstackRedactEngine } from './redactEngine'
import { gstackPermissionManager } from './permissionManager'
import type { ShipChecklist } from './types'

const execAsync = promisify(exec)

export class GStackShipEngine {
  /**
   * Evaluates if the current repository state is clean, verified, and safe to ship
   */
  public async prepareShipChecklist(projectDir = process.cwd()): Promise<ShipChecklist> {
    const warnings: string[] = []

    // 1. Inspect git status
    let branch = 'unknown'
    let isClean = false
    const untrackedFiles: string[] = []
    const modifiedFiles: string[] = []
    const stagedFiles: string[] = []

    try {
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir })
      branch = branchOut.trim()

      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: projectDir })
      const lines = statusOut.split('\n').filter(Boolean)

      for (const line of lines) {
        const code = line.substring(0, 2)
        const file = line.substring(3).trim()

        if (code === '??') {
          untrackedFiles.push(file)
        } else if (code.includes('M') || code.includes('D')) {
          modifiedFiles.push(file)
        } else if (code.startsWith('A') || code.startsWith('M')) {
          stagedFiles.push(file)
        }
      }

      isClean = lines.length === 0
    } catch (_e) {
      warnings.push('Git repository not detected or git command unavailable in environment.')
    }

    // 2. Run Verification Gate
    let verificationPassed = false
    try {
      const gateResult = await gstackVerifyGate.runGate({ projectDir, stopOnFirstFailure: true })
      verificationPassed = gateResult.allPassed
      if (!verificationPassed) {
        warnings.push(`Verification gate failed: ${gateResult.failureSummary || 'Errors reported during checks.'}`)
      }
    } catch (e: any) {
      warnings.push(`Verification gate encountered execution error: ${e.message}`)
    }

    // 3. Scan for leaked secrets across git diff
    let secretsScanClean = true
    try {
      const { stdout: diffOut } = await execAsync('git diff HEAD', { cwd: projectDir }).catch(() => ({ stdout: '' }))
      if (diffOut) {
        const findings = gstackRedactEngine.scan(diffOut)
        const highTierFindings = findings.filter((f) => f.tier === 'HIGH')
        if (highTierFindings.length > 0) {
          secretsScanClean = false
          warnings.push(`BLOCKER: ${highTierFindings.length} HIGH-tier credentials found in git diff! Must be redacted before committing.`)
        }
      }
    } catch (_e) {
      // Ignored
    }

    // 4. Formulate conventional commit message recommendation
    let recommendedCommitMessage = 'chore: upgrade features and verify system integrity'
    if (modifiedFiles.length > 0 || stagedFiles.length > 0) {
      const changed = [...stagedFiles, ...modifiedFiles]
      if (changed.some((f) => f.includes('server') || f.includes('api'))) {
        recommendedCommitMessage = 'feat(backend): update service endpoints and system workflows'
      } else if (changed.some((f) => f.includes('component') || f.includes('UI'))) {
        recommendedCommitMessage = 'feat(ui): refine interface presentation and responsive views'
      }
    }

    const readyToShip = verificationPassed && secretsScanClean && !warnings.some((w) => w.startsWith('BLOCKER'))

    return {
      readyToShip,
      gitStatus: {
        branch,
        isClean,
        untrackedFiles,
        modifiedFiles,
        stagedFiles
      },
      verificationPassed,
      secretsScanClean,
      recommendedCommitMessage,
      pendingWarnings: warnings
    }
  }

  /**
   * Prepares a commit with human authorization gate
   */
  public async commitChangesWithAuthorization(
    message: string,
    projectDir = process.cwd()
  ): Promise<{ success: boolean; message: string; requiresApproval?: boolean }> {
    const checklist = await this.prepareShipChecklist(projectDir)

    if (!checklist.secretsScanClean) {
      return {
        success: false,
        message: 'Commit blocked: Unredacted secrets detected in working tree diff.'
      }
    }

    // Require authorization via PermissionManager
    const permEval = gstackPermissionManager.evaluateOperation(
      'git_commit',
      `Commit to branch ${checklist.gitStatus.branch}`,
      `Commit message: "${message}"`
    )

    if (permEval.requiresConfirmation) {
      return {
        success: false,
        requiresApproval: true,
        message: `Commit requires user authorization. Request ID: ${permEval.request?.id}`
      }
    }

    try {
      await execAsync('git add .', { cwd: projectDir })
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: projectDir })
      return {
        success: true,
        message: `Successfully created commit: "${message}" on branch ${checklist.gitStatus.branch}`
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Git commit failed: ${err.message}`
      }
    }
  }
}

export const gstackShipEngine = new GStackShipEngine()
