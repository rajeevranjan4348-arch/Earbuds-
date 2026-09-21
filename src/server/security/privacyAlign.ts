/**
 * PrivacyAlign Engine (Repository 19: ServiceNow/PrivacyAlign)
 * PII Detection, Data Minimization, Output Redaction, and Privacy Policy Enforcement
 * Guarantees no sensitive user secrets, credentials, or personal identifiers
 * are leaked to external APIs, logs, or third-party models.
 */

export interface PIIDetectionResult {
  hasPII: boolean
  redactedText: string
  detectedTypes: string[]
  itemCount: number
}

export interface PrivacyEvaluation {
  allowed: boolean
  reason?: string
  minimizedText: string
  detectedViolations: string[]
}

export class PrivacyAlignEngine {
  // Common PII and Secret patterns
  private patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    phone: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    apiKey:
      /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36}|xox[baprs]-[0-9a-zA-Z]{10,})\b/g,
    jwtToken: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    passwordField:
      /(?:password|passwd|pwd|secret|auth_token|bearer)\s*[:=]\s*["']?([^"'\s,;]+)["']?/gi
  }

  /**
   * Scans text and redacts PII / sensitive data
   */
  public sanitize(text: string, preserveContext = true): PIIDetectionResult {
    if (!text || typeof text !== 'string') {
      return { hasPII: false, redactedText: '', detectedTypes: [], itemCount: 0 }
    }

    let redacted = text
    const detected: string[] = []
    let totalItems = 0

    // 1. API Keys & Secrets (High Priority)
    if (this.patterns.apiKey.test(redacted)) {
      detected.push('API_KEY')
      redacted = redacted.replace(this.patterns.apiKey, (match) => {
        totalItems++
        return preserveContext ? `[REDACTED_API_KEY_${match.slice(0, 4)}...]` : '[REDACTED_SECRET]'
      })
    }

    // 2. Passwords and credentials in key-value format
    if (this.patterns.passwordField.test(redacted)) {
      detected.push('CREDENTIAL')
      redacted = redacted.replace(this.patterns.passwordField, (full, val) => {
        totalItems++
        return full.replace(val, '[REDACTED_CREDENTIAL]')
      })
    }

    // 3. JWT Tokens
    if (this.patterns.jwtToken.test(redacted)) {
      detected.push('AUTH_TOKEN')
      redacted = redacted.replace(this.patterns.jwtToken, () => {
        totalItems++
        return '[REDACTED_AUTH_TOKEN]'
      })
    }

    // 4. Credit Cards
    if (this.patterns.creditCard.test(redacted)) {
      detected.push('CREDIT_CARD')
      redacted = redacted.replace(this.patterns.creditCard, () => {
        totalItems++
        return '[REDACTED_CREDIT_CARD]'
      })
    }

    // 5. Social Security Numbers
    if (this.patterns.ssn.test(redacted)) {
      detected.push('SSN')
      redacted = redacted.replace(this.patterns.ssn, () => {
        totalItems++
        return '[REDACTED_SSN]'
      })
    }

    // 6. Emails
    if (this.patterns.email.test(redacted)) {
      detected.push('EMAIL')
      redacted = redacted.replace(this.patterns.email, (email) => {
        totalItems++
        const parts = email.split('@')
        return preserveContext
          ? `[USER_${parts[0].slice(0, 2)}***@${parts[1]}]`
          : '[REDACTED_EMAIL]'
      })
    }

    // 7. Phone Numbers
    if (this.patterns.phone.test(redacted)) {
      detected.push('PHONE')
      redacted = redacted.replace(this.patterns.phone, () => {
        totalItems++
        return '[REDACTED_PHONE]'
      })
    }

    return {
      hasPII: detected.length > 0,
      redactedText: redacted,
      detectedTypes: Array.from(new Set(detected)),
      itemCount: totalItems
    }
  }

  /**
   * Evaluates if data can be safely dispatched to an external API/model
   */
  public evaluatePrivacy(
    content: string,
    target: 'external_llm' | 'web_search' | 'external_tool' | 'persistent_memory'
  ): PrivacyEvaluation {
    const scan = this.sanitize(content)
    const violations: string[] = []

    if (scan.detectedTypes.includes('API_KEY') || scan.detectedTypes.includes('CREDENTIAL')) {
      violations.push('Direct API keys or credentials detected in payload')
    }

    if (scan.detectedTypes.includes('CREDIT_CARD') || scan.detectedTypes.includes('SSN')) {
      violations.push('High-risk financial/identity identifiers detected')
    }

    if (
      target === 'web_search' &&
      (scan.detectedTypes.includes('EMAIL') || scan.detectedTypes.includes('PHONE'))
    ) {
      violations.push('Personal identifiers cannot be queried over public search engines')
    }

    const allowed = violations.length === 0

    return {
      allowed,
      reason: violations.length > 0 ? violations.join('; ') : undefined,
      minimizedText: scan.redactedText,
      detectedViolations: violations
    }
  }
}

export const privacyAlign = new PrivacyAlignEngine()
