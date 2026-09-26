/**
 * IRIS x gstack Integration Layer — Shared Types
 * Adapted from garrytan/gstack architecture and specialist skill models.
 */

export type SpecialistRole = 'ceo' | 'eng' | 'design' | 'devex'

export interface SpecialistFinding {
  id: string
  role: SpecialistRole
  title: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NIT'
  description: string
  recommendation: string
  codeLocation?: {
    file: string
    line?: number
  }
}

export interface ReviewReport {
  role: SpecialistRole
  summary: string
  score: number // 1 - 100
  findings: SpecialistFinding[]
  suggestedActionItems: string[]
  timestamp: string
}

export interface AutoplanResult {
  projectName: string
  timestamp: string
  phases: {
    ceoReview: ReviewReport
    engReview: ReviewReport
    designReview: ReviewReport
    devexReview: ReviewReport
  }
  executiveSummary: string
  lockedActionPlan: string[]
  confidenceScore: number
}

export type RedactTier = 'HIGH' | 'MEDIUM' | 'LOW'
export type RedactCategory = 'secret' | 'pii' | 'legal' | 'internal' | 'hygiene'

export interface RedactFinding {
  id: string
  patternId: string
  tier: RedactTier
  category: RedactCategory
  description: string
  matchedSnippet: string
  start: number
  end: number
  line?: number
}

export interface RedactionResult {
  cleanText: string
  findings: RedactFinding[]
  hasHighTierSecrets: boolean
  redactedCount: number
}

export interface VerificationCheck {
  name: string
  command: string
  status: 'passed' | 'failed' | 'skipped'
  durationMs: number
  output: string
  errors?: string[]
}

export interface VerificationGateResult {
  allPassed: boolean
  checks: VerificationCheck[]
  totalDurationMs: number
  failureSummary?: string
  fixRecommendations?: string[]
}

export interface InvestigateReport {
  symptom: string
  failureLayer: 'environment' | 'dependency' | 'build_syntax' | 'runtime' | 'logic_invariant'
  rootCause: string
  affectedFiles: string[]
  stackTraceDetails?: string
  hypothesizedFix: string
  suggestedVerification: string
  repairedSuccessfully?: boolean
}

export interface ShipChecklist {
  readyToShip: boolean
  gitStatus: {
    branch: string
    isClean: boolean
    untrackedFiles: string[]
    modifiedFiles: string[]
    stagedFiles: string[]
  }
  verificationPassed: boolean
  secretsScanClean: boolean
  recommendedCommitMessage: string
  pendingWarnings: string[]
}

export interface GStackDecision {
  id: string
  kind: 'decide' | 'supersede' | 'redact'
  title: string
  decision: string
  rationale: string
  alternativesConsidered: string[]
  scope: 'repo' | 'branch' | 'issue' | 'architecture'
  supersedesId?: string
  timestamp: string
  author: string
}

export interface GStackExecutionLog {
  id: string
  skill: string
  tool: string
  durationMs: number
  success: boolean
  verificationStatus?: 'passed' | 'failed' | 'not_applicable'
  timestamp: string
  summary: string
}
