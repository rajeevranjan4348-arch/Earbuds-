/**
 * VoiceCommandService
 * ├── IntentDetector (Short commands & system actions)
 * ├── ActionRouter (Application integration & navigation)
 * ├── PermissionManager (Sensitive action confirmation safety)
 * └── FunctionExecutor (Execution bridge)
 */

import { SensitiveActionPayload } from './types'
import { launchManager } from '../../launcher'

export type CommandExecutionResult =
  | { type: 'handled'; message?: string; actionTaken?: string }
  | { type: 'confirmation_required'; payload: SensitiveActionPayload }
  | { type: 'task_orchestrator'; goal: string }
  | { type: 'conversational_ai' } // Not a system command, proceed to conversational LLM

export interface VoiceCommandHandlers {
  onConfirmationRequired: (payload: SensitiveActionPayload) => void
  onNavigate?: (tab: string) => void
  onStopSpeaking?: () => void
  onCloseVoiceMode?: () => void
  onRepeatLastAnswer?: () => void
}

export class VoiceCommandService {
  private handlers: VoiceCommandHandlers

  constructor(handlers: VoiceCommandHandlers) {
    this.handlers = handlers
  }

  // ==========================================
  // 1. INTENT DETECTOR
  // ==========================================
  /**
   * Evaluates if the spoken text matches an immediate short command or system control action.
   */
  public evaluateSpokenIntent(text: string): CommandExecutionResult {
    const clean = text.trim().toLowerCase()
    if (!clean) return { type: 'handled' }

    // 0. TaskOrchestrator Multi-Agent Spoken Command Intent
    const isOrchestratorIntent =
      clean.startsWith('orchestrate') ||
      clean.startsWith('run agent') ||
      clean.startsWith('start agent') ||
      clean.startsWith('agent task') ||
      clean.startsWith('agent pipeline') ||
      clean.startsWith('multi agent') ||
      clean.startsWith('task orchestrator') ||
      clean.startsWith('research and write') ||
      clean.startsWith('research and code') ||
      clean.startsWith('analyze and fix') ||
      clean.startsWith('investigate and report') ||
      clean.startsWith('plan and execute') ||
      clean.startsWith('build and verify') ||
      clean.startsWith('browse and summarize') ||
      clean.startsWith('task:') ||
      clean.startsWith('orchestrate:')

    if (isOrchestratorIntent) {
      const goal =
        text
          .replace(/^(?:hey\s+iris|iris|jarvis)[,\s]*/i, '')
          .replace(
            /^(?:please\s+)?(?:orchestrate|run agent|start agent|agent task|agent pipeline|multi agent|task orchestrator|plan and execute|orchestrate:|task:)\s*/i,
            ''
          )
          .trim() || text
      return { type: 'task_orchestrator', goal }
    }

    // 1. Immediate Short Stop/Cancel Commands
    if (/^(stop|quiet|hush|silence|stop talking|stop speaking|be quiet|shh)$/i.test(clean)) {
      this.handlers.onStopSpeaking?.()
      return { type: 'handled', actionTaken: 'STOP_SPEECH' }
    }

    if (/^(repeat|say again|repeat that|read this answer|read answer again)$/i.test(clean)) {
      this.handlers.onRepeatLastAnswer?.()
      return { type: 'handled', actionTaken: 'REPEAT_ANSWER' }
    }

    if (/^(turn voice mode off|close voice mode|exit voice|close voice chat|stop voice chat)$/i.test(clean)) {
      this.handlers.onCloseVoiceMode?.()
      return { type: 'handled', actionTaken: 'CLOSE_VOICE_MODE' }
    }

    // 2. Navigation Actions
    if (/^(open|go to|show|switch to)?\s*(settings|preferences)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'SETTINGS' } }))
      return { type: 'handled', message: 'Opening Settings' }
    }

    if (/^(open|go to|show|switch to)?\s*(chat|new chat|start a new chat)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'CHAT' } }))
      window.dispatchEvent(new CustomEvent('iris:new-chat'))
      return { type: 'handled', message: 'Starting a new conversation' }
    }

    if (/^(open|go to|show|switch to)?\s*(dashboard|command center|home)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'DASHBOARD' } }))
      return { type: 'handled', message: 'Navigating to Dashboard' }
    }

    if (/^(open|go to|show|switch to)?\s*(workspace|google workspace|drive|docs)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'WORKSPACE' } }))
      return { type: 'handled', message: 'Opening Google Workspace' }
    }

    if (/^(open|go to|show|switch to)?\s*(youtube|youtube studio|channel)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'YOUTUBE' } }))
      return { type: 'handled', message: 'Opening YouTube Studio' }
    }

    if (/^(open|go to|show|switch to)?\s*(maps|google maps|location)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'MAPS' } }))
      return { type: 'handled', message: 'Opening Maps' }
    }

    if (/^(open|go to|show|switch to)?\s*(notes|my notes|notebook)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'NOTES' } }))
      return { type: 'handled', message: 'Opening Notes' }
    }

    if (/^(open|go to|show|switch to)?\s*(gallery|images|photos)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'GALLERY' } }))
      return { type: 'handled', message: 'Opening Gallery' }
    }

    if (/^(open|go to|show|switch to)?\s*(mobile|phone|android)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:navigate', { detail: { tab: 'PHONE' } }))
      return { type: 'handled', message: 'Opening Mobile Sync' }
    }

    // 3. Launcher & App triggers
    if (/^(open|launch|show)\s*(launcher|apps|app launcher|command palette)$/i.test(clean)) {
      window.dispatchEvent(new CustomEvent('iris:toggle-launcher'))
      return { type: 'handled', message: 'Opening App Launcher' }
    }

    // App launch commands like "open github", "launch youtube", "open calculator"
    const launchMatch = clean.match(/^(?:open|launch|start)\s+(.+)$/i)
    if (launchMatch && launchMatch[1]) {
      const appQuery = launchMatch[1].trim()
      if (appQuery && !['settings', 'chat', 'dashboard', 'notes'].includes(appQuery)) {
        const opened = launchManager.launchAppByName(appQuery)
        if (opened) {
          return { type: 'handled', message: `Launching ${appQuery}` }
        }
      }
    }

    // 4. Web Search Action
    const searchMatch = clean.match(/^(?:search the web for|search online for|google)\s+(.+)$/i)
    if (searchMatch && searchMatch[1]) {
      const query = searchMatch[1].trim()
      window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank')
      return { type: 'handled', message: `Searching the web for "${query}"` }
    }

    // 5. Sensitive / Irreversible Actions (Requires explicit confirmation safety gate)
    if (
      clean.includes('delete all chats') ||
      clean.includes('clear chat history') ||
      clean.includes('delete conversation') ||
      clean.includes('wipe memory') ||
      clean.includes('reset system')
    ) {
      const payload: SensitiveActionPayload = {
        actionId: 'CLEAR_DATA',
        title: 'Confirm Data Deletion',
        description: 'You requested to clear or delete conversation history. This action cannot be undone.',
        commandText: text,
        onConfirm: () => {
          window.dispatchEvent(new CustomEvent('iris:clear-chat'))
        },
        onCancel: () => {}
      }
      this.handlers.onConfirmationRequired(payload)
      return { type: 'confirmation_required', payload }
    }

    // Otherwise, treat as conversational query for the conversational AI model
    return { type: 'conversational_ai' }
  }
}
