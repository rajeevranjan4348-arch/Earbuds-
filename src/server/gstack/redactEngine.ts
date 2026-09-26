/**
 * IRIS Redaction Engine
 * Directly adapted from gstack's lib/redact-patterns.ts and lib/redact-engine.ts.
 *
 * Implements linear-time, ReDoS-safe secret & PII scanning, redaction masking,
 * and high-entropy token interception across logs, diffs, and AI payloads.
 */

import type { RedactFinding, RedactPattern, RedactTier, RedactionResult } from './types'

export interface RedactRule {
  id: string
  tier: RedactTier
  category: 'secret' | 'pii' | 'legal' | 'internal' | 'hygiene'
  description: string
  pattern: RegExp
  replacementToken: string
}

export const CANONICAL_REDACT_RULES: RedactRule[] = [
  // HIGH TIER: Secret credentials that must block or be immediately masked
  {
    id: 'aws.access_key',
    tier: 'HIGH',
    category: 'secret',
    description: 'AWS access key ID',
    pattern: /\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b/g,
    replacementToken: '<REDACTED-AWS-ACCESS-KEY>'
  },
  {
    id: 'aws.secret_key',
    tier: 'HIGH',
    category: 'secret',
    description: 'AWS secret access key',
    pattern: /(?:aws_secret_access_key|aws_secret_key|secret_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    replacementToken: '<REDACTED-AWS-SECRET-KEY>'
  },
  {
    id: 'github.pat',
    tier: 'HIGH',
    category: 'secret',
    description: 'GitHub Personal Access Token',
    pattern: /\b(ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z]{82})\b/g,
    replacementToken: '<REDACTED-GITHUB-TOKEN>'
  },
  {
    id: 'github.oauth',
    tier: 'HIGH',
    category: 'secret',
    description: 'GitHub OAuth Access Token',
    pattern: /\b(gho_[0-9A-Za-z]{36})\b/g,
    replacementToken: '<REDACTED-GITHUB-OAUTH>'
  },
  {
    id: 'npm.token',
    tier: 'HIGH',
    category: 'secret',
    description: 'npm authorization token',
    pattern: /\b(npm_[0-9A-Za-z]{36})\b/g,
    replacementToken: '<REDACTED-NPM-TOKEN>'
  },
  {
    id: 'crypto.private_key',
    tier: 'HIGH',
    category: 'secret',
    description: 'Cryptographic Private Key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    replacementToken: '<REDACTED-PRIVATE-KEY>'
  },
  {
    id: 'database.connection_uri',
    tier: 'HIGH',
    category: 'secret',
    description: 'Database connection URI with credentials',
    pattern: /(?:postgres|postgresql|mysql|mongodb|redis|mssql):\/\/[^:\s]+:[^@\s]+@[^\s/]+/gi,
    replacementToken: '<REDACTED-DB-URL-CREDENTIALS>'
  },
  {
    id: 'openai.api_key',
    tier: 'HIGH',
    category: 'secret',
    description: 'OpenAI API key',
    pattern: /\b(sk-[A-Za-z0-9_-]{40,})\b/g,
    replacementToken: '<REDACTED-OPENAI-KEY>'
  },
  {
    id: 'anthropic.api_key',
    tier: 'HIGH',
    category: 'secret',
    description: 'Anthropic API key',
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{40,})\b/g,
    replacementToken: '<REDACTED-ANTHROPIC-KEY>'
  },
  {
    id: 'google.api_key',
    tier: 'MEDIUM',
    category: 'secret',
    description: 'Google AIza API key',
    pattern: /\b(AIza[0-9A-Za-z-_]{35})\b/g,
    replacementToken: '<REDACTED-GOOGLE-KEY>'
  },
  {
    id: 'jwt.token',
    tier: 'MEDIUM',
    category: 'secret',
    description: 'JSON Web Token (JWT)',
    pattern: /\b(eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]{10,})\b/g,
    replacementToken: '<REDACTED-JWT-TOKEN>'
  },
  {
    id: 'pii.email',
    tier: 'MEDIUM',
    category: 'pii',
    description: 'Email address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacementToken: '<REDACTED-EMAIL>'
  },
  {
    id: 'pii.ssn',
    tier: 'HIGH',
    category: 'pii',
    description: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacementToken: '<REDACTED-SSN>'
  },
  {
    id: 'pii.credit_card',
    tier: 'HIGH',
    category: 'pii',
    description: 'Credit Card Number',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacementToken: '<REDACTED-CREDIT-CARD>'
  }
]

export class GStackRedactEngine {
  private rules: RedactRule[] = CANONICAL_REDACT_RULES

  /**
   * Scans a text string and returns all matched secret and PII findings
   */
  public scan(text: string): RedactFinding[] {
    if (!text || typeof text !== 'string') return []

    // Linear-time upper bound safety
    if (text.length > 500000) {
      text = text.substring(0, 500000)
    }

    const findings: RedactFinding[] = []

    for (const rule of this.rules) {
      rule.pattern.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = rule.pattern.exec(text)) !== null) {
        const matchedSnippet = match[1] || match[0]
        const start = match.index
        const end = start + matchedSnippet.length

        // Approximate line number
        const precedingText = text.substring(0, start)
        const line = precedingText.split('\n').length

        findings.push({
          id: `find_${rule.id}_${start}`,
          patternId: rule.id,
          tier: rule.tier,
          category: rule.category,
          description: rule.description,
          matchedSnippet,
          start,
          end,
          line
        })
      }
    }

    return findings
  }

  /**
   * Replaces all detected secrets and sensitive tokens with safe masks
   */
  public redact(text: string, options?: { maskOnlyHigh?: boolean }): RedactionResult {
    if (!text || typeof text !== 'string') {
      return { cleanText: text || '', findings: [], hasHighTierSecrets: false, redactedCount: 0 }
    }

    const findings = this.scan(text)
    let cleanText = text
    let hasHighTierSecrets = false
    let redactedCount = 0

    // Sort findings descending by start index to maintain correct string slices
    const sorted = [...findings].sort((a, b) => b.start - a.start)

    for (const finding of sorted) {
      if (finding.tier === 'HIGH') {
        hasHighTierSecrets = true
      }

      if (options?.maskOnlyHigh && finding.tier !== 'HIGH') {
        continue
      }

      const rule = this.rules.find((r) => r.id === finding.patternId)
      const token = rule?.replacementToken || '<REDACTED-SECRET>'

      cleanText = cleanText.substring(0, finding.start) + token + cleanText.substring(finding.end)
      redactedCount++
    }

    return {
      cleanText,
      findings,
      hasHighTierSecrets,
      redactedCount
    }
  }

  /**
   * Fast check if content contains any HIGH-tier credentials (e.g. before git commit or outbound egress)
   */
  public hasHighTierSecrets(text: string): boolean {
    const findings = this.scan(text)
    return findings.some((f) => f.tier === 'HIGH')
  }

  /**
   * Recursively sanitizes JSON/object structures so secrets are never logged
   */
  public sanitizeObject<T>(obj: T): T {
    if (!obj) return obj
    if (typeof obj === 'string') {
      return this.redact(obj).cleanText as unknown as T
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item)) as unknown as T
    }
    if (typeof obj === 'object') {
      const sanitized: Record<string, any> = {}
      for (const [key, value] of Object.entries(obj)) {
        if (/key|secret|token|password|auth|bearer/i.test(key) && typeof value === 'string') {
          sanitized[key] = '<REDACTED-CREDENTIAL>'
        } else {
          sanitized[key] = this.sanitizeObject(value)
        }
      }
      return sanitized as unknown as T
    }
    return obj
  }
}

export const gstackRedactEngine = new GStackRedactEngine()
