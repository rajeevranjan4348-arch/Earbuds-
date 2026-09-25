/**
 * Deterministic Permission Manager
 * Intercepts sensitive tool calls (file system deletions, messaging, shell commands, etc.)
 * and requires explicit user 'Allow' or 'Deny' input via UI before execution.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ApprovalState = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED'

export interface PermissionPolicy {
  rememberChoice?: 'ONCE' | 'SESSION' | 'ALWAYS'
}

export interface PendingApprovalRequest {
  id: string
  taskId: string
  actionName: string
  toolName: string
  parameters: Record<string, any>
  riskLevel: RiskLevel
  reason: string
  state: ApprovalState
  requestedAt: number
  expiresAt: number
  timeoutMs: number
}

export class PermissionManager {
  private pendingApprovals = new Map<string, PendingApprovalRequest>()
  private sessionGrants = new Set<string>() // toolNames or actionIds allowed for session
  private sessionDenials = new Set<string>() // toolNames or actionIds denied for session
  private defaultTimeoutMs = 60000 // 60 seconds

  /**
   * Deterministically evaluates risk level based on tool name and parameters
   */
  public evaluateRisk(toolName: string, params: Record<string, any> = {}): RiskLevel {
    const lower = toolName.toLowerCase()
    const strParams = JSON.stringify(params).toLowerCase()

    // 1. CRITICAL: Destructive operations, table drops, rm -rf, credentials, system wipe
    if (
      lower.includes('delete_database') ||
      lower.includes('drop_table') ||
      lower.includes('wipe') ||
      strParams.includes('rm -rf') ||
      strParams.includes('format ') ||
      strParams.includes('drop database') ||
      strParams.includes('passwd') ||
      strParams.includes('private_key')
    ) {
      return 'CRITICAL'
    }

    // 2. HIGH: File deletion, shell execution, sending messages, sending emails, payments, app uninstalls
    if (
      lower.includes('delete_file') ||
      lower.includes('remove_file') ||
      lower.includes('unlink') ||
      lower.includes('terminal_exec') ||
      lower.includes('shell') ||
      lower.includes('send_message') ||
      lower.includes('send_email') ||
      lower.includes('adb_install') ||
      lower.includes('adb_uninstall') ||
      lower.includes('publish') ||
      lower.includes('transfer') ||
      lower.includes('payment')
    ) {
      return 'HIGH'
    }

    // 3. MEDIUM: Creating/modifying files, launching apps, system settings changes, media control
    if (
      lower.includes('open_app') ||
      lower.includes('launch') ||
      lower.includes('create_file') ||
      lower.includes('write_file') ||
      lower.includes('modify_setting') ||
      lower.includes('media_control')
    ) {
      return 'MEDIUM'
    }

    // 4. LOW: Read-only operations, search, weather, maps, reading notes/memories, OCR, inspection
    return 'LOW'
  }

  /**
   * Checks whether an action requires explicit human confirmation
   */
  public requiresConfirmation(toolName: string, riskLevel: RiskLevel): boolean {
    if (this.sessionDenials.has(toolName)) {
      return true
    }
    if (this.sessionGrants.has(toolName)) {
      // Session grant bypasses HIGH and MEDIUM, but NEVER bypasses CRITICAL
      return riskLevel === 'CRITICAL'
    }
    // High and Critical risk levels ALWAYS require confirmation by default
    return riskLevel === 'HIGH' || riskLevel === 'CRITICAL'
  }

  /**
   * Creates and registers a pending human-in-the-loop approval request
   */
  public requestApproval(
    taskId: string,
    actionName: string,
    toolName: string,
    parameters: Record<string, any>,
    riskLevel: RiskLevel,
    reason?: string
  ): PendingApprovalRequest {
    const id = `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const timeoutMs = this.defaultTimeoutMs

    const request: PendingApprovalRequest = {
      id,
      taskId,
      actionName,
      toolName,
      parameters,
      riskLevel,
      reason: reason || `Approval required to execute high-risk action: ${actionName} (${toolName})`,
      state: 'PENDING',
      requestedAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
      timeoutMs
    }

    this.pendingApprovals.set(id, request)

    // Set auto-expire timer
    setTimeout(() => {
      const current = this.pendingApprovals.get(id)
      if (current && current.state === 'PENDING') {
        current.state = 'EXPIRED'
      }
    }, timeoutMs)

    return request
  }

  /**
   * Resolves an approval request with user decision (Allow or Deny)
   */
  public resolveApproval(
    requestId: string,
    decision: 'APPROVED' | 'DENIED',
    policy?: PermissionPolicy
  ): boolean {
    const request = this.pendingApprovals.get(requestId)
    if (!request) return false

    if (request.state !== 'PENDING') return false

    request.state = decision

    if (policy?.rememberChoice === 'SESSION') {
      if (decision === 'APPROVED') {
        this.sessionGrants.add(request.toolName)
      } else {
        this.sessionDenials.add(request.toolName)
      }
    }

    return true
  }

  /**
   * List all currently pending approval requests
   */
  public getPendingApprovals(): PendingApprovalRequest[] {
    const now = Date.now()
    return Array.from(this.pendingApprovals.values()).filter(
      (req) => req.state === 'PENDING' && req.expiresAt > now
    )
  }

  /**
   * Get specific approval request by ID
   */
  public getApprovalRequest(id: string): PendingApprovalRequest | undefined {
    return this.pendingApprovals.get(id)
  }

  /**
   * Clear session permission grants/denials
   */
  public clearSessionGrants(): void {
    this.sessionGrants.clear()
    this.sessionDenials.clear()
  }

  /**
   * Intercepts tool execution and returns true if permitted to proceed, or throws/returns request if approval required.
   */
  public async interceptAndCheck(
    taskId: string,
    toolName: string,
    params: Record<string, any>
  ): Promise<{ allowed: boolean; pendingRequest?: PendingApprovalRequest; reason?: string }> {
    const riskLevel = this.evaluateRisk(toolName, params)

    if (this.sessionDenials.has(toolName)) {
      return { allowed: false, reason: `Execution denied: tool '${toolName}' was blocked for this session.` }
    }

    if (!this.requiresConfirmation(toolName, riskLevel)) {
      return { allowed: true }
    }

    // High or Critical operation requires user approval
    const pending = this.requestApproval(
      taskId,
      `Execute tool '${toolName}'`,
      toolName,
      params,
      riskLevel
    )

    return {
      allowed: false,
      pendingRequest: pending,
      reason: `User authorization required for ${riskLevel} risk tool '${toolName}'`
    }
  }
}

export const permissionManager = new PermissionManager()
