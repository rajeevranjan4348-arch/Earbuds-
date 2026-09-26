/**
 * IRIS gstack Skill & Tool Router
 * Centralized intent router, execution dispatcher, and observability logger.
 */

import { gstackCodeIntelligence } from './codeIntelligence'
import { gstackSpecialistReviews } from './specialistReviews'
import { gstackInvestigateEngine } from './investigateEngine'
import { gstackVerifyGate } from './verifyGate'
import { gstackShipEngine } from './shipEngine'
import { gstackRedactEngine } from './redactEngine'
import { gstackPermissionManager } from './permissionManager'
import { gstackDecisionLedger } from './decisionLedger'
import type { GStackExecutionLog } from './types'

export class GStackRouter {
  private executionLogs: GStackExecutionLog[] = []

  /**
   * Evaluates if a prompt maps to a gstack specialist skill or workflow
   */
  public matchIntent(prompt: string): {
    matched: boolean
    skill?:
      | 'repo_analysis'
      | 'autoplan'
      | 'specialist_review'
      | 'investigate'
      | 'verify_gate'
      | 'cso_security'
      | 'ship_workflow'
      | 'decision_ledger'
    subRole?: 'ceo' | 'eng' | 'design' | 'devex'
  } {
    const p = prompt.toLowerCase()

    // 1. Repository Analysis & Structure
    if (
      p.includes('analyze this repo') ||
      p.includes('analyze repository') ||
      p.includes('inspect project structure') ||
      p.includes('project dependencies') ||
      p.includes('scan codebase')
    ) {
      return { matched: true, skill: 'repo_analysis' }
    }

    // 2. Autoplan & Multi-Review Pipeline
    if (
      p.includes('autoplan') ||
      p.includes('run all reviews') ||
      p.includes('automatic review pipeline') ||
      p.includes('review this plan automatically')
    ) {
      return { matched: true, skill: 'autoplan' }
    }

    // 3. Specialist Reviews (CEO, Eng, Design, DevEx)
    if (p.includes('ceo review') || p.includes('think bigger') || p.includes('expand scope') || p.includes('strategy review')) {
      return { matched: true, skill: 'specialist_review', subRole: 'ceo' }
    }
    if (p.includes('eng review') || p.includes('architecture review') || p.includes('engineering review') || p.includes('tech review')) {
      return { matched: true, skill: 'specialist_review', subRole: 'eng' }
    }
    if (p.includes('design review') || p.includes('ux review') || p.includes('ui review') || p.includes('check design')) {
      return { matched: true, skill: 'specialist_review', subRole: 'design' }
    }
    if (p.includes('devex review') || p.includes('developer experience') || p.includes('tooling review')) {
      return { matched: true, skill: 'specialist_review', subRole: 'devex' }
    }

    // 4. Investigation & Error Diagnosis
    if (
      p.includes('investigate') ||
      p.includes('why the build is failing') ||
      p.includes('find the build problem') ||
      p.includes('diagnose error') ||
      p.includes('debug this failure') ||
      p.includes('fix this bug')
    ) {
      return { matched: true, skill: 'investigate' }
    }

    // 5. Verification Gate & Test Execution
    if (
      p.includes('run the tests') ||
      p.includes('run verification') ||
      p.includes('verify gate') ||
      p.includes('run build checks') ||
      p.includes('typecheck')
    ) {
      return { matched: true, skill: 'verify_gate' }
    }

    // 6. CSO & Security Audit
    if (
      p.includes('cso') ||
      p.includes('scan for secrets') ||
      p.includes('check security') ||
      p.includes('credential leak') ||
      p.includes('security audit')
    ) {
      return { matched: true, skill: 'cso_security' }
    }

    // 7. Ship & Release Workflow
    if (
      p.includes('ship') ||
      p.includes('ready to ship') ||
      p.includes('prepare commit') ||
      p.includes('release check')
    ) {
      return { matched: true, skill: 'ship_workflow' }
    }

    // 8. Decision Memory
    if (
      p.includes('record decision') ||
      p.includes('what did we decide') ||
      p.includes('active decisions') ||
      p.includes('architectural decision')
    ) {
      return { matched: true, skill: 'decision_ledger' }
    }

    return { matched: false }
  }

  /**
   * Executes the matched gstack skill and returns a structured response
   */
  public async executeSkill(
    skill: string,
    args: Record<string, any>
  ): Promise<{ success: boolean; resultText: string; data?: any }> {
    const startTime = Date.now()
    let success = true
    let resultText = ''
    let data: any = null
    let verificationStatus: GStackExecutionLog['verificationStatus'] = 'not_applicable'

    try {
      switch (skill) {
        case 'repo_analysis': {
          const repo = gstackCodeIntelligence.analyzeRepository(args.projectDir)
          data = repo
          resultText = `### 📦 Repository Analysis: ${repo.projectName}
- **Root Path**: \`${repo.rootPath}\`
- **Package Manager**: \`${repo.packageManager}\`
- **Source Files**: ${repo.sourceFileCount}
- **Primary Languages**: ${repo.primaryLanguages.join(', ') || 'TypeScript'}
- **Key Directories**: ${repo.keyDirectories.slice(0, 10).map((d) => `\`${d}\``).join(', ')}
- **Entry Points**: ${repo.entryPoints.map((e) => `\`${e}\``).join(', ')}
- **Declared Scripts**: ${Object.keys(repo.scripts).map((s) => `\`${s}\``).join(', ')}`
          break
        }

        case 'autoplan': {
          const planText = args.plan || args.prompt || 'Feature plan for IRIS system integration.'
          const autoplan = await gstackSpecialistReviews.runAutoplan(planText, args.projectName)
          data = autoplan
          resultText = `### 🧭 gstack Autoplan Gauntlet (Score: ${autoplan.confidenceScore}/100)
${autoplan.executiveSummary}

#### 📋 Specialist Breakdown:
- **CEO Review** (${autoplan.phases.ceoReview.score}/100): ${autoplan.phases.ceoReview.summary}
- **Engineering Review** (${autoplan.phases.engReview.score}/100): ${autoplan.phases.engReview.summary}
- **Design Review** (${autoplan.phases.designReview.score}/100): ${autoplan.phases.designReview.summary}
- **DevEx Review** (${autoplan.phases.devexReview.score}/100): ${autoplan.phases.devexReview.summary}

#### 🔒 Locked Action Plan:
${autoplan.lockedActionPlan.join('\n')}`
          break
        }

        case 'specialist_review': {
          const subRole = args.subRole || 'eng'
          let report
          if (subRole === 'ceo') {
            report = await gstackSpecialistReviews.planCeoReview(args.plan || args.prompt)
          } else if (subRole === 'design') {
            report = await gstackSpecialistReviews.planDesignReview(args.plan || args.prompt)
          } else if (subRole === 'devex') {
            report = await gstackSpecialistReviews.planDevexReview(args.plan || args.prompt)
          } else {
            report = await gstackSpecialistReviews.planEngReview(args.plan || args.prompt)
          }
          data = report
          resultText = `### 🔍 gstack ${subRole.toUpperCase()} Review (Score: ${report.score}/100)
${report.summary}

${report.findings.length > 0 ? `**Findings:**\n${report.findings.map((f) => `- [${f.severity}] **${f.title}**: ${f.description}\n  *Action*: ${f.recommendation}`).join('\n')}` : '✅ No critical issues found.'}

**Next Steps:**
${report.suggestedActionItems.map((a) => `- ${a}`).join('\n')}`
          break
        }

        case 'investigate': {
          const diagnosis = await gstackInvestigateEngine.diagnoseCurrentWorkspace()
          data = diagnosis
          verificationStatus = diagnosis.healthy ? 'passed' : 'failed'
          if (diagnosis.healthy) {
            resultText = `### 🩺 IRIS Investigation: Healthy Workspace
${diagnosis.verifyGateSummary}
No syntax, dependency, or compilation blockers detected.`
          } else {
            const r = diagnosis.report!
            resultText = `### 🚨 Investigation Diagnosis: ${r.failureLayer.toUpperCase()} Issue
- **Root Cause**: ${r.rootCause}
- **Symptom**: \`${r.symptom}\`
- **Affected Files**: ${r.affectedFiles.map((f) => `\`${f}\``).join(', ') || 'N/A'}
- **Hypothesized Repair**: ${r.hypothesizedFix}
- **Verification Command**: \`${r.suggestedVerification}\``
          }
          break
        }

        case 'verify_gate': {
          const gate = await gstackVerifyGate.runGate({ projectDir: args.projectDir })
          data = gate
          verificationStatus = gate.allPassed ? 'passed' : 'failed'
          resultText = `### 🛡️ Verification Gate Results: ${gate.allPassed ? '✅ PASSED' : '❌ FAILED'} (${gate.totalDurationMs}ms)
${gate.checks.map((c) => `- **${c.name}** (\`${c.command}\`): ${c.status === 'passed' ? '✅ Passed' : '❌ Failed'} in ${c.durationMs}ms`).join('\n')}

${gate.failureSummary ? `**Error Summary:**\n\`\`\`\n${gate.failureSummary}\n\`\`\`` : ''}
${gate.fixRecommendations ? `**Recommendations:**\n${gate.fixRecommendations.map((r) => `- ${r}`).join('\n')}` : ''}`
          break
        }

        case 'cso_security': {
          const targetText = args.text || JSON.stringify(gstackCodeIntelligence.analyzeRepository())
          const redacted = gstackRedactEngine.redact(targetText)
          data = redacted
          resultText = `### 🔐 CSO Security & Credential Audit
- **High-Tier Secret Leaks**: ${redacted.hasHighTierSecrets ? '🚨 DETECTED' : '✅ NONE DETECTED'}
- **Total Findings**: ${redacted.findings.length}
- **Masked Snippets**: ${redacted.redactedCount}

${redacted.findings.length > 0 ? `**Findings Breakdown:**\n${redacted.findings.map((f) => `- [${f.tier}] **${f.patternId}** (${f.category}): ${f.description}`).join('\n')}` : '✅ Clean: No exposed tokens, API keys, private keys, or credentials found.'}`
          break
        }

        case 'ship_workflow': {
          const ship = await gstackShipEngine.prepareShipChecklist(args.projectDir)
          data = ship
          verificationStatus = ship.verificationPassed ? 'passed' : 'failed'
          resultText = `### 🚀 gstack Ship Safety Checklist: ${ship.readyToShip ? '✅ READY TO SHIP' : '⚠️ ATTENTION NEEDED'}
- **Current Branch**: \`${ship.gitStatus.branch}\`
- **Working Tree Clean**: ${ship.gitStatus.isClean ? '✅ Yes' : '⚠️ Uncommitted changes'}
- **Verification Gate**: ${ship.verificationPassed ? '✅ Passed' : '❌ Failed'}
- **Secrets Scan**: ${ship.secretsScanClean ? '✅ Clean' : '🚨 Secrets Found'}
- **Recommended Commit**: \`${ship.recommendedCommitMessage}\`

${ship.pendingWarnings.length > 0 ? `**Warnings:**\n${ship.pendingWarnings.map((w) => `- ${w}`).join('\n')}` : ''}`
          break
        }

        case 'decision_ledger': {
          if (args.action === 'record') {
            const rec = gstackDecisionLedger.recordDecision({
              title: args.title || 'Architectural Decision',
              decision: args.decision || '',
              rationale: args.rationale || '',
              alternativesConsidered: args.alternativesConsidered,
              scope: args.scope
            })
            resultText = rec.success
              ? `✅ Recorded Architectural Decision **${rec.decision?.title}** (ID: \`${rec.decision?.id}\`).`
              : `❌ Failed to record decision: ${rec.error}`
          } else {
            const active = gstackDecisionLedger.getActiveDecisions()
            resultText = `### 🧠 Active Architectural Decisions (${active.length})
${active.map((d) => `#### [${d.scope.toUpperCase()}] ${d.title} (\`${d.id}\` - ${d.timestamp.slice(0, 10)})\n- **Decision**: ${d.decision}\n- **Rationale**: ${d.rationale}`).join('\n\n') || 'No active decisions recorded yet.'}`
          }
          break
        }

        default:
          throw new Error(`Unknown gstack skill: ${skill}`)
      }
    } catch (err: any) {
      success = false
      resultText = `❌ Error executing gstack skill "${skill}": ${err.message}`
    }

    const durationMs = Date.now() - startTime
    this.executionLogs.push({
      id: `log_${Date.now()}`,
      skill,
      tool: skill,
      durationMs,
      success,
      verificationStatus,
      timestamp: new Date().toISOString(),
      summary: resultText.slice(0, 200)
    })

    return { success, resultText, data }
  }

  public getExecutionLogs(): GStackExecutionLog[] {
    return this.executionLogs
  }
}

export const gstackRouter = new GStackRouter()
