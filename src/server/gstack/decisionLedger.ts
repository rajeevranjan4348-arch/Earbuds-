/**
 * IRIS Engineering Decision Ledger
 * Adapted from gstack's lib/gstack-decision.ts and lib/jsonl-store.ts.
 *
 * Implements an event-sourced institutional memory for architecture decisions (ADRs),
 * technical trade-offs, and learnings, with secret interception and injection rejection.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { gstackRedactEngine } from './redactEngine'
import type { GStackDecision } from './types'

export class GStackDecisionLedger {
  private memoryFile: string
  private decisions: GStackDecision[] = []

  constructor(filePath?: string) {
    this.memoryFile = filePath || resolve(process.cwd(), '.iris-brain-memory.json')
    this.loadDecisions()
  }

  private loadDecisions() {
    if (!existsSync(this.memoryFile)) return
    try {
      const raw = readFileSync(this.memoryFile, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.gstackDecisions)) {
        this.decisions = parsed.gstackDecisions
      }
    } catch (_e) {
      // Ignored
    }
  }

  private persistDecisions() {
    try {
      let data: Record<string, any> = {}
      if (existsSync(this.memoryFile)) {
        try {
          data = JSON.parse(readFileSync(this.memoryFile, 'utf-8'))
        } catch (_e) {
          data = {}
        }
      }
      data.gstackDecisions = this.decisions
      writeFileSync(this.memoryFile, JSON.stringify(data, null, 2), 'utf-8')
    } catch (_e) {
      // Ignored
    }
  }

  /**
   * Records a new architectural or engineering decision
   */
  public recordDecision(params: {
    title: string
    decision: string
    rationale: string
    alternativesConsidered?: string[]
    scope?: GStackDecision['scope']
    author?: string
  }): { success: boolean; decision?: GStackDecision; error?: string } {
    // 1. Reject secrets in decision text
    if (
      gstackRedactEngine.hasHighTierSecrets(params.decision) ||
      gstackRedactEngine.hasHighTierSecrets(params.rationale)
    ) {
      return {
        success: false,
        error: 'Decision rejected: High-tier secret credential detected in decision payload.'
      }
    }

    const id = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const newDecision: GStackDecision = {
      id,
      kind: 'decide',
      title: params.title,
      decision: gstackRedactEngine.redact(params.decision).cleanText,
      rationale: gstackRedactEngine.redact(params.rationale).cleanText,
      alternativesConsidered: params.alternativesConsidered || [],
      scope: params.scope || 'repo',
      timestamp: new Date().toISOString(),
      author: params.author || 'IRIS Core Engine'
    }

    this.decisions.push(newDecision)
    this.persistDecisions()

    return {
      success: true,
      decision: newDecision
    }
  }

  /**
   * Supersedes an existing decision with a new decision
   */
  public supersedeDecision(
    oldDecisionId: string,
    params: {
      title: string
      decision: string
      rationale: string
      alternativesConsidered?: string[]
    }
  ): { success: boolean; decision?: GStackDecision; error?: string } {
    const old = this.decisions.find((d) => d.id === oldDecisionId)
    if (!old) {
      return { success: false, error: `Decision with ID "${oldDecisionId}" not found.` }
    }

    const newResult = this.recordDecision(params)
    if (!newResult.success || !newResult.decision) {
      return newResult
    }

    newResult.decision.supersedesId = oldDecisionId
    this.persistDecisions()

    return newResult
  }

  /**
   * Returns active, non-superseded decisions
   */
  public getActiveDecisions(): GStackDecision[] {
    const supersededIds = new Set(
      this.decisions.map((d) => d.supersedesId).filter(Boolean) as string[]
    )
    return this.decisions.filter((d) => d.kind === 'decide' && !supersededIds.has(d.id))
  }
}

export const gstackDecisionLedger = new GStackDecisionLedger()
