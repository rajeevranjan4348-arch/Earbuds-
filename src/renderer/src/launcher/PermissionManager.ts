import { SensitiveActionRequest } from './types'

type ConfirmationListener = (request: SensitiveActionRequest | null) => void

export class PermissionManager {
  private activeRequest: SensitiveActionRequest | null = null
  private listeners: Set<ConfirmationListener> = new Set()

  public subscribe(listener: ConfirmationListener): () => void {
    this.listeners.add(listener)
    listener(this.activeRequest)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.activeRequest))
  }

  /**
   * Requests explicit user confirmation for a sensitive or destructive action
   */
  public requestConfirmation(request: SensitiveActionRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this.activeRequest = {
        ...request,
        onConfirm: async () => {
          this.activeRequest = null
          this.notify()
          try {
            await request.onConfirm()
            resolve(true)
          } catch (err) {
            console.error('[PermissionManager] Action failed after confirmation:', err)
            resolve(false)
          }
        },
        onCancel: () => {
          this.activeRequest = null
          this.notify()
          request.onCancel?.()
          resolve(false)
        }
      }
      this.notify()
    })
  }

  public getPendingRequest(): SensitiveActionRequest | null {
    return this.activeRequest
  }

  public cancelPending() {
    if (this.activeRequest) {
      this.activeRequest.onCancel?.()
      this.activeRequest = null
      this.notify()
    }
  }
}

export const permissionManager = new PermissionManager()
