/**
 * VoiceToastService - Centralized Toast Notification Dispatcher for Processed Voice Commands
 *
 * Integrates directly with VoiceCommandProcessor, VoiceSessionManager, VoiceCommandRouter,
 * and VoiceService to broadcast visual feedback when a voice command is successfully parsed,
 * confirmed, or executed.
 */

export interface VoiceCommandToastItem {
  id: string
  command: string
  intent: string
  actionExecuted?: string
  response?: string
  status?: 'success' | 'executing' | 'info' | 'confirmed'
  targetTab?: string
  timestamp: number
  durationMs?: number
}

export type VoiceToastListener = (toast: VoiceCommandToastItem) => void

class VoiceToastService {
  private listeners: Set<VoiceToastListener> = new Set()

  public subscribe(listener: VoiceToastListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Broadcasts a voice command success toast across all subscribers and DOM events
   */
  public emit(
    item: Omit<VoiceCommandToastItem, 'id' | 'timestamp'> & { id?: string; timestamp?: number }
  ): VoiceCommandToastItem {
    const toast: VoiceCommandToastItem = {
      id: item.id || `vcmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: item.timestamp || Date.now(),
      durationMs: item.durationMs || 3500,
      status: item.status || 'success',
      ...item
    }

    // 1. Notify direct service subscribers
    this.listeners.forEach((fn) => {
      try {
        fn(toast)
      } catch (err) {
        console.warn('[VoiceToastService] Listener error:', err)
      }
    })

    // 2. Dispatch custom DOM event for decoupled subscribers
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris:voice-command-processed', {
          detail: toast
        })
      )
    }

    return toast
  }
}

export const voiceToastService = new VoiceToastService()

/**
 * Convenience helper to dispatch voice command toast from anywhere in the codebase
 */
export function notifyVoiceCommandProcessed(
  command: string,
  options: {
    intent?: string
    actionExecuted?: string
    response?: string
    status?: 'success' | 'executing' | 'info' | 'confirmed'
    targetTab?: string
    durationMs?: number
  } = {}
) {
  return voiceToastService.emit({
    command,
    intent: options.intent || 'VOICE_COMMAND',
    actionExecuted: options.actionExecuted,
    response: options.response,
    status: options.status || 'success',
    targetTab: options.targetTab,
    durationMs: options.durationMs
  })
}
