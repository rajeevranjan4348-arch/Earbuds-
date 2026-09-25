/**
 * JARVIS Deterministic Permission & Safety Engine
 * Enforces risk classification, human-in-the-loop approvals, and session-based authorization.
 */

import {
  ApprovalState,
  PendingApprovalRequest,
  PermissionPolicy,
  RiskLevel
} from './types'
import { agentEventBus } from './eventBus'

export class PermissionManager {
  private pendingApprovals = new Map<string, PendingApprovalRequest>()
  private sessionGrants = new Set<string>() // toolName or actionId
  private permanentDenials = new Set<string>()
  private defaultTimeoutMs = 60000 // 60 seconds

  /**
   * Deterministically evaluates risk level based on tool name and parameters
   */
  public evaluateRisk(toolName: string, params: Record<string, any>): RiskLevel {
    const lower = toolName.toLowerCase()
    const strParams = JSON.stringify(params).toLowerCase()

    // 1. CRITICAL: Destructive file/DB operations, credentials, terminal rm -rf
    if (
      lower.includes('delete_database') ||
      lower.includes('drop_table') ||
      strParams.includes('rm -rf') ||
      strParams.includes('format ') ||
      lower.includes('erase') ||
      strParams.includes('passwd') ||
      strParams.includes('private_key')
    ) {
      return 'CRITICAL'
    }

    // 2. HIGH: Shell execution, messages, email, file deletion, APK install, payments
    if (
      lower.includes('terminal_exec') ||
      lower.includes('shell') ||
      lower.includes('send_message') ||
      lower.includes('send_email') ||
      lower.includes('delete_file') ||
      lower.includes('adb_install') ||
      lower.includes('adb_uninstall') ||
      lower.includes('publish') ||
      lower.includes('transfer')
    ) {
      return 'HIGH'
    }

    // 3. MEDIUM: Opening apps, creating files, changing settings, controlling media
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

    // 4. LOW: Reading info, search, weather, maps, notes read, memory read, OCR
    return 'LOW'
  }

  /**
   * Checks whether an action requires explicit human confirmation
   */
  public requiresConfirmation(toolName: string, riskLevel: RiskLevel): boolean {
    if (this.permanentDenials.has(toolName)) {
      return true
    }
    if (this.sessionGrants.has(toolName)) {
      // Session grant allows MEDIUM and HIGH, but NEVER bypasses CRITICAL
      return riskLevel === 'CRITICAL'
    }
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
      reason: reason || `Approval required to execute high-risk operation: ${actionName}`,
      state: 'PENDING',
      requestedAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
      timeoutMs
    }

    this.pendingApprovals.set(id, request)

    agentEventBus.emit('permission.requested', `Approval requested: ${actionName}`, {
      taskId,
      toolName,
      data: request
    })

    // Auto-expire timer
    setTimeout(() => {
      const current = this.pendingApprovals.get(id)
      if (current && current.state === 'PENDING') {
        current.state = 'EXPIRED'
        agentEventBus.emit('permission.denied', `Approval expired for: ${actionName}`, {
          taskId,
          toolName,
          data: current
        })
      }
    }, timeoutMs)

    return request
  }

  /**
   * Resolves an approval request with user decision
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

    if (decision === 'APPROVED') {
      if (policy === 'ALWAYS_ALLOW_SESSION') {
        this.sessionGrants.add(request.toolName)
      }
      agentEventBus.emit('permission.granted', `User approved action: ${request.actionName}`, {
        taskId: request.taskId,
        toolName: request.toolName,
        data: request
      })
    } else {
      if (policy === 'NEVER_ALLOW') {
        this.permanentDenials.add(request.toolName)
      }
      agentEventBus.emit('permission.denied', `User rejected action: ${request.actionName}`, {
        taskId: request.taskId,
        toolName: request.toolName,
        data: request
      })
    }

    return true
  }

  public getPendingApprovals(): PendingApprovalRequest[] {
    const now = Date.now()
    return Array.from(this.pendingApprovals.values()).filter(
      (r) => r.state === 'PENDING' && r.expiresAt > now
    )
  }

  public getApproval(requestId: string): PendingApprovalRequest | undefined {
    return this.pendingApprovals.get(requestId)
  }

  public clearSessionGrants() {
    this.sessionGrants.clear()
  }
}

export const permissionManager = new PermissionManager()
