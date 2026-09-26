/**
 * IRIS — Confirmation Engine
 * Safeguards user privacy and device safety by requiring explicit human-in-the-loop
 * approval for consequential actions (calls, messages, deletions, sensitive settings).
 */

import { ConfirmationRequest, RiskLevel } from './types'

type ConfirmationHandler = (request: ConfirmationRequest) => void

class ConfirmationEngine {
  private activeRequest: ConfirmationRequest | null = null
  private handler: ConfirmationHandler | null = null
  private listeners: Set<(req: ConfirmationRequest | null) => void> = new Set()

  /**
   * Request human approval for a high-risk or consequential action
   */
  public async requestApproval(options: {
    action: string
    target: string
    reason: string
    consequences: string
    riskLevel?: RiskLevel
    metadata?: Record<string, any>
  }): Promise<boolean> {
    const id = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const riskLevel = options.riskLevel || 'high'

    return new Promise((resolve) => {
      const request: ConfirmationRequest = {
        id,
        action: options.action,
        target: options.target,
        reason: options.reason,
        consequences: options.consequences,
        riskLevel,
        metadata: options.metadata,
        resolve: (approved: boolean) => {
          this.activeRequest = null
          this.notify()
          resolve(approved)
        }
      }

      this.activeRequest = request
      this.notify()

      // Also dispatch custom DOM event for UI dialogs
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('iris:permission-dialog-open', {
            detail: {
              id,
              action: options.action,
              target: options.target,
              reason: options.reason,
              consequences: options.consequences,
              riskLevel,
              onApprove: () => request.resolve(true),
              onDeny: () => request.resolve(false)
            }
          })
        )
      }
    })
  }

  public getActiveRequest(): ConfirmationRequest | null {
    return this.activeRequest
  }

  public respond(id: string, approved: boolean) {
    if (this.activeRequest && this.activeRequest.id === id) {
      this.activeRequest.resolve(approved)
    }
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.activeRequest)
      } catch (_e) {}
    })
  }

  public subscribe(fn: (req: ConfirmationRequest | null) => void): () => void {
    this.listeners.add(fn)
    fn(this.activeRequest)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const confirmationEngine = new ConfirmationEngine()
