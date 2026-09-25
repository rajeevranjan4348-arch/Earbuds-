/**
 * ExternalContentBoundary
 * Prompt-Injection Defense Layer
 * Sanitizes and wraps untrusted webpage, search, document, or API content
 * to ensure external data NEVER overrides system instructions or safety rules.
 */

export interface BoundedContent {
  sanitizedContent: string
  injectionAttemptsDetected: number
  warnings: string[]
  isSafe: boolean
}

export class ExternalContentBoundary {
  private injectionPatterns = [
    /ignore\s+(?:all\s+)?previous\s+instructions/gi,
    /override\s+(?:system|developer)\s+instructions/gi,
    /disregard\s+prior\s+prompts/gi,
    /you\s+are\s+now\s+a\s+/gi,
    /send\s+(?:this|secret|api_key|token|password)\s+to/gi,
    /execute\s+(?:command|tool|script|code)/gi,
    /system_prompt\s*=/gi,
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript:/gi
  ]

  /**
   * Sanitizes untrusted external content and wraps it in secure data boundaries
   */
  public sanitize(content: string, sourceName = 'External Source'): BoundedContent {
    if (!content) {
      return {
        sanitizedContent: '',
        injectionAttemptsDetected: 0,
        warnings: [],
        isSafe: true
      }
    }

    let sanitized = content
    let injectionCount = 0
    const warnings: string[] = []

    // 1. Detect and defuse prompt injection vectors
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(sanitized)) {
        injectionCount++
        warnings.push(`Defused potential prompt-injection pattern in ${sourceName}`)
        sanitized = sanitized.replace(pattern, '[DEFUSED_INJECTION_PATTERN]')
      }
    }

    // 2. Escape HTML / Script execution tags
    sanitized = sanitized
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')

    // 3. Encapsulate in strict untrusted data boundary XML tags
    const boundedContent = `<untrusted_external_data source="${this.escapeAttribute(
      sourceName
    )}">\n${sanitized.trim()}\n</untrusted_external_data>`

    return {
      sanitizedContent: boundedContent,
      injectionAttemptsDetected: injectionCount,
      warnings,
      isSafe: injectionCount === 0
    }
  }

  private escapeAttribute(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

export const externalContentBoundary = new ExternalContentBoundary()
