/**
 * IRIS Permission Manager & Staging Guard
 * Adapted from gstack's lib/staging-guard.ts and lib/tracker-guard.ts.
 *
 * Enforces human-in-the-loop authorization gates for sensitive, destructive,
 * or irreversible operations.
 */

export interface PermissionRequest {
  id: string
  actionType:
    | 'modify_file'
    | 'delete_file'
    | 'destructive_command'
    | 'git_commit'
    | 'git_push'
    | 'external_message'
    | 'credential_change'
  target: string
  description: string
  details?: Record<string, any>
  status: 'pending' | 'approved' | 'denied'
  createdAt: string
  resolvedAt?: string
}

export class GStackPermissionManager {
  private requests = new Map<string, PermissionRequest>()
  private autoApproveSafeReads = true

  // Destructive command triggers
  private destructivePatterns: RegExp[] = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+|\s+-r)/i, // rm -rf, rm -r
    /\bgit\s+reset\s+--hard\b/i,
    /\bgit\s+clean\s+-[a-zA-Z]*f/i,
    /\bgit\s+push\b/i,
    /\bdrop\s+(database|table|schema)\b/i,
    /\bmkfs\b/i,
    /\bdd\s+if=/i,
    /\bshutdown\b/i,
    /\breboot\b/i
  ]

  /**
   * Checks whether a command contains destructive operations
   */
  public isDestructiveCommand(command: string): boolean {
    if (!command) return false
    return this.destructivePatterns.some((pattern) => pattern.test(command))
  }

  /**
   * Evaluates an operation and returns whether it can proceed immediately
   * or requires explicit user authorization.
   */
  public evaluateOperation(
    actionType: PermissionRequest['actionType'],
    target: string,
    description: string,
    details?: Record<string, any>
  ): { requiresConfirmation: boolean; request?: PermissionRequest; reason?: string } {
    // 1. Destructive shell commands ALWAYS require explicit user confirmation
    if (actionType === 'destructive_command') {
      const req = this.createRequest(actionType, target, description, details)
      return {
        requiresConfirmation: true,
        request: req,
        reason: `Destructive command detected: "${target}". Explicit confirmation is required.`
      }
    }

    // 2. Git push or commit publication
    if (actionType === 'git_push') {
      const req = this.createRequest(actionType, target, description, details)
      return {
        requiresConfirmation: true,
        request: req,
        reason: `Remote repository push to target "${target}" requires explicit approval.`
      }
    }

    // 3. Deleting files or directories
    if (actionType === 'delete_file') {
      const req = this.createRequest(actionType, target, description, details)
      return {
        requiresConfirmation: true,
        request: req,
        reason: `Deleting file/directory "${target}" is destructive and requires user authorization.`
      }
    }

    // 4. Overwriting sensitive system configurations (.env, production configs, firestore.rules)
    if (
      actionType === 'modify_file' &&
      (target.includes('.env') || target.includes('credentials') || target.includes('secret'))
    ) {
      const req = this.createRequest(actionType, target, description, details)
      return {
        requiresConfirmation: true,
        request: req,
        reason: `Modifying sensitive file "${target}" requires explicit authorization.`
      }
    }

    // Default safe execution
    return {
      requiresConfirmation: false
    }
  }

  /**
   * Creates a pending permission request record
   */
  public createRequest(
    actionType: PermissionRequest['actionType'],
    target: string,
    description: string,
    details?: Record<string, any>
  ): PermissionRequest {
    const id = `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const request: PermissionRequest = {
      id,
      actionType,
      target,
      description,
      details,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    this.requests.set(id, request)
    return request
  }

  /**
   * Resolves a permission request with approval or denial
   */
  public resolveRequest(id: string, approved: boolean): PermissionRequest | null {
    const req = this.requests.get(id)
    if (!req) return null
    req.status = approved ? 'approved' : 'denied'
    req.resolvedAt = new Date().toISOString()
    return req
  }

  public getPendingRequests(): PermissionRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending')
  }
}

export const gstackPermissionManager = new GStackPermissionManager()
