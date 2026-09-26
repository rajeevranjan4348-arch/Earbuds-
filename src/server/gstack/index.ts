/**
 * IRIS x gstack Integration Layer
 * Unified export of gstack-adapted capabilities:
 * - Code intelligence & repository scanning
 * - 3-tier linear-time secret & PII redaction engine
 * - Verification gate & pre-flight health checker
 * - Specialist review roles (CEO, Eng, Design, DevEx) & Autoplan
 * - Investigation & root-cause diagnostic engine
 * - Shipping & release safety engine
 * - Permission manager & staging guard
 * - Event-sourced architectural decision ledger
 * - Unified gstack router & observability logging
 */

export * from './types'
export * from './redactEngine'
export * from './permissionManager'
export * from './verifyGate'
export * from './codeIntelligence'
export * from './specialistReviews'
export * from './investigateEngine'
export * from './shipEngine'
export * from './decisionLedger'
export * from './gstackRouter'
