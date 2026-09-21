/**
 * Cybersecurity Engine (Repository 02: Anthropic-Cybersecurity-Skills)
 * Defensive cybersecurity analysis, prompt injection prevention, SSRF guards,
 * and secure validation for agent tool execution and inputs.
 */

export interface SecurityCheckResult {
  safe: boolean
  threatType?:
    | 'PROMPT_INJECTION'
    | 'SSRF_RISK'
    | 'PATH_TRAVERSAL'
    | 'COMMAND_INJECTION'
    | 'UNAUTHORIZED_SECRET_ACCESS'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reason?: string
}

export class CybersecurityEngine {
  // Common prompt injection attack signatures
  private injectionPatterns = [
    /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
    /disregard\s+(?:all\s+)?(?:system|developer|prior)\s+rules/i,
    /you\s+are\s+now\s+(?:unrestricted|DAN|jailbroken|godmode)/i,
    /bypass\s+(?:all\s+)?safety\s+(?:filters|guidelines|guardrails)/i,
    /reveal\s+(?:your\s+)?(?:system\s+prompt|master\s+key|api\s+key|internal\s+instructions)/i,
    /drop\s+database|delete\s+from\s+users|--\s*select/i
  ]

  // Restricted hosts for SSRF prevention (private networks, loopbacks, metadata endpoints)
  private privateIpRanges = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // AWS / GCP / Cloud metadata IP
    /^0\.0\.0\.0/,
    /^localhost$/i,
    /\.internal$/i,
    /\.local$/i
  ]

  /**
   * Evaluates input prompt for prompt injection or jailbreak attempts
   */
  public evaluatePromptInjection(input: string): SecurityCheckResult {
    if (!input || typeof input !== 'string') {
      return { safe: true, severity: 'LOW' }
    }

    for (const pattern of this.injectionPatterns) {
      if (pattern.test(input)) {
        return {
          safe: false,
          threatType: 'PROMPT_INJECTION',
          severity: 'HIGH',
          reason: 'Potential adversarial prompt injection or system override detected.'
        }
      }
    }

    return { safe: true, severity: 'LOW' }
  }

  /**
   * Validates target URL against SSRF (Server-Side Request Forgery) attacks
   * Blocks internal endpoints, loopbacks, cloud metadata services
   */
  public validateUrlForSSRF(targetUrl: string): SecurityCheckResult {
    try {
      const parsed = new URL(targetUrl)

      // Only allow http and https protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          safe: false,
          threatType: 'SSRF_RISK',
          severity: 'CRITICAL',
          reason: `Disallowed URL protocol: ${parsed.protocol}. Only http/https permitted.`
        }
      }

      const hostname = parsed.hostname

      for (const range of this.privateIpRanges) {
        if (range.test(hostname)) {
          return {
            safe: false,
            threatType: 'SSRF_RISK',
            severity: 'CRITICAL',
            reason: `Target host "${hostname}" resolves to a restricted internal or link-local address.`
          }
        }
      }

      return { safe: true, severity: 'LOW' }
    } catch (_err) {
      return {
        safe: false,
        threatType: 'SSRF_RISK',
        severity: 'MEDIUM',
        reason: 'Malformed URL provided.'
      }
    }
  }

  /**
   * Validates file path to prevent directory traversal
   */
  public validateFilePath(filePath: string): SecurityCheckResult {
    if (!filePath || typeof filePath !== 'string') {
      return {
        safe: false,
        threatType: 'PATH_TRAVERSAL',
        severity: 'HIGH',
        reason: 'Invalid file path'
      }
    }

    if (filePath.includes('../') || filePath.includes('..\\') || filePath.includes('\0')) {
      return {
        safe: false,
        threatType: 'PATH_TRAVERSAL',
        severity: 'CRITICAL',
        reason: 'Path traversal characters (..) detected in file path'
      }
    }

    // Sensitive system paths
    const sensitivePaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/var/run/secrets',
      '/root/.ssh',
      'C:\\Windows\\System32'
    ]
    if (sensitivePaths.some((p) => filePath.toLowerCase().includes(p.toLowerCase()))) {
      return {
        safe: false,
        threatType: 'UNAUTHORIZED_SECRET_ACCESS',
        severity: 'CRITICAL',
        reason: 'Access to operating system credential stores is strictly forbidden'
      }
    }

    return { safe: true, severity: 'LOW' }
  }
}

export const cybersecurity = new CybersecurityEngine()
