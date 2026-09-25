/**
 * VoiceCommandRouter - Voice Command to Action Execution with Safety Layer
 *
 * Rules:
 * - Uses the same tool/action system as text commands (no isolated engine).
 * - Safety confirmation layer for potentially consequential actions.
 * - Supports natural spoken commands (e.g. "open YouTube", "search for...", "remember this", "stop").
 * - Handles cancellation and confirmation flow.
 */

import { SensitiveActionPayload, VoiceTurnMessage } from './VoiceTypes'
import { VoiceCommandService, CommandExecutionResult } from './VoiceCommandService'
import { voiceCommandProcessor } from '../voiceCommandProcessor'
import { voiceService } from '../voiceService'

export interface VoiceCommandRouterOptions {
  onConfirmationRequired: (payload: SensitiveActionPayload) => void
  onStopSpeaking: () => void
  onCloseVoiceMode?: () => void
  onRepeatLastAnswer?: () => void
}

export class VoiceCommandRouter {
  private commandService: VoiceCommandService
  private pendingConfirmation: SensitiveActionPayload | null = null

  constructor(options: VoiceCommandRouterOptions) {
    this.commandService = new VoiceCommandService({
      onConfirmationRequired: (payload) => {
        this.pendingConfirmation = payload
        options.onConfirmationRequired(payload)
      },
      onStopSpeaking: options.onStopSpeaking,
      onCloseVoiceMode: options.onCloseVoiceMode,
      onRepeatLastAnswer: options.onRepeatLastAnswer
    })
  }

  public getPendingConfirmation(): SensitiveActionPayload | null {
    return this.pendingConfirmation
  }

  public clearPendingConfirmation(): void {
    this.pendingConfirmation = null
  }

  /**
   * Evaluates and routes spoken commands.
   * If a confirmation is currently pending, checks for user confirmation ("yes", "proceed", "cancel").
   */
  public async routeCommand(
    text: string,
    context?: {
      onSpeakConfirmation?: (msg: string) => void
      onExecuteAi?: (query: string) => Promise<string | void>
    }
  ): Promise<CommandExecutionResult> {
    const clean = text.trim()
    const lower = clean.toLowerCase()

    // 1. Pending confirmation resolution
    if (this.pendingConfirmation) {
      if (/^(yes|confirm|proceed|do it|sure|okay|go ahead|yep)$/i.test(lower)) {
        const payload = this.pendingConfirmation
        this.pendingConfirmation = null
        try {
          await payload.onConfirm()
          context?.onSpeakConfirmation?.(`Confirmed and executed: ${payload.title}`)
          return { type: 'handled', message: `Confirmed: ${payload.title}` }
        } catch (err: any) {
          return { type: 'handled', message: `Error executing action: ${err?.message}` }
        }
      }

      if (/^(no|cancel|stop|abort|don't|do not)$/i.test(lower)) {
        const payload = this.pendingConfirmation
        this.pendingConfirmation = null
        payload.onCancel()
        context?.onSpeakConfirmation?.('Action cancelled.')
        return { type: 'handled', message: 'Action cancelled.' }
      }
    }

    // 2. Immediate spoken system control & navigation
    const result = this.commandService.evaluateSpokenIntent(clean)
    if (result.type === 'handled') {
      if (result.message && context?.onSpeakConfirmation) {
        context.onSpeakConfirmation(result.message)
      }
      return result
    }

    if (result.type === 'confirmation_required') {
      this.pendingConfirmation = result.payload
      return result
    }

    // 3. Spoken commands mapped directly to VoiceCommandProcessor & TaskOrchestrator
    const processorResult = await voiceCommandProcessor.processCommand(clean, {
      navigate: (tab) => {
        window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab } }))
      }
    })

    if (processorResult.handled) {
      if (processorResult.spokenResponse && context?.onSpeakConfirmation) {
        context.onSpeakConfirmation(processorResult.spokenResponse)
      }
      return {
        type: 'handled',
        message:
          processorResult.spokenResponse || processorResult.displayText || 'Command executed.',
        actionTaken: processorResult.intent
      }
    }

    // 4. Conversational / Generative AI query
    return { type: 'conversational_ai' }
  }
}
