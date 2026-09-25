/**
 * ExternalContentBoundary Utility
 * Prompt-Injection Defense Layer: Sanitizes untrusted external webpage data,
 * defuses instruction-override patterns, and wraps content safely before passing to AI model.
 */

export interface SanitizedBoundaryOutput {
  sanitizedText: string
  boundedPrompt: string
  injectionDetected: boolean
  warnings: string[]
}

export class ExternalContentBoundary {
  private injectionPatterns = [
    /ignore\s+(?:all\s+)?previous\s+instructions/gi,
    /override\s+(?:system|developer)\s+instructions/gi,
    /disregard\s+prior\s+prompts/gi,
    /you\s+are\s+now\s+a\s+/gi,
    /send\s+(?:this|secret|api_key|token|password)\s+to/gi,
    /execute\s+(?:command|tool|script|code)/gi,
    /system_prompt\s*=/gi
  ]

  public sanitizeAndBound(rawContent: string, sourceName = 'Web Document'): SanitizedBoundaryOutput {
    if (!rawContent) {
      return {
        sanitizedText: '',
        boundedPrompt: `<untrusted_data source="${sourceName}"></untrusted_data>`,
        injectionDetected: false,
        warnings: []
      }
    }

    let text = rawContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')

    let injectionCount = 0
    const warnings: string[] = []

    for (const pattern of this.injectionPatterns) {
      if (pattern.test(text)) {
        injectionCount++
        warnings.push(`Defused prompt-injection vector matching pattern: ${pattern.source}`)
        text = text.replace(pattern, '[DEFUSED_INJECTION_PATTERN]')
      }
    }

    const cleanSource = sourceName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const boundedPrompt = `<untrusted_external_content source="${cleanSource}">\n${text.trim()}\n</untrusted_external_content>`

    return {
      sanitizedText: text.trim(),
      boundedPrompt,
      injectionDetected: injectionCount > 0,
      warnings
    }
  }
}

export const externalContentBoundary = new ExternalContentBoundary()
