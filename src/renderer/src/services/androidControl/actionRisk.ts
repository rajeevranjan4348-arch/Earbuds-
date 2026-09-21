/**
 * Action Risk & Safety Policy Engine
 * Ported and adapted from OpenDroid (com.opendroid.ai.core.agent.ActionRisk)
 *
 * Enforces safety guardrails:
 * Never automatically performs sensitive or irreversible actions such as
 * sending messages, deleting data, making purchases, altering critical
 * security settings, or submitting forms without explicit user confirmation.
 */

import { ActionRiskLevel, AndroidAction } from './types'

// Sensitive keywords for message dispatch / communications
const SENSITIVE_COMMUNICATION_KEYWORDS = [
  'send',
  'send message',
  'submit message',
  'reply',
  'forward',
  'call',
  'dial',
  'post comment',
  'publish'
]

// Irreversible keywords for destructive operations
const IRREVERSIBLE_DESTRUCTION_KEYWORDS = [
  'delete',
  'erase',
  'remove',
  'clear all',
  'wipe',
  'uninstall',
  'format',
  'factory reset',
  'discard'
]

// Sensitive keywords for financial / transaction / purchase actions
const SENSITIVE_FINANCIAL_KEYWORDS = [
  'pay',
  'purchase',
  'buy',
  'checkout',
  'transfer money',
  'send money',
  'confirm payment',
  'place order',
  'subscribe'
]

// Sensitive keywords for system security / authentication
const SENSITIVE_SECURITY_KEYWORDS = [
  'change password',
  'reset pin',
  'fingerprint',
  'biometric',
  'disable security',
  'screen lock',
  'admin permission',
  'install unknown app'
]

export interface ActionRiskEvaluation {
  risk: ActionRiskLevel
  requiresConfirmation: boolean
  reason?: string
}

export class ActionRiskPolicy {
  /**
   * Evaluates the risk profile of an individual Android action or planned step.
   */
  public static evaluate(action: AndroidAction): ActionRiskEvaluation {
    const actionType = action.type
    const desc = (action.description || '').toLowerCase()
    const paramsStr = JSON.stringify(action.params || {}).toLowerCase()
    const fullContext = `${desc} ${paramsStr}`

    // 1. Explicit request_confirmation action
    if (actionType === 'request_confirmation') {
      return {
        risk: 'SENSITIVE',
        requiresConfirmation: true,
        reason: action.params?.reason || 'Explicit confirmation requested for safety.'
      }
    }

    // 2. Financial / payment actions -> IRREVERSIBLE
    if (SENSITIVE_FINANCIAL_KEYWORDS.some((kw) => fullContext.includes(kw))) {
      return {
        risk: 'IRREVERSIBLE',
        requiresConfirmation: true,
        reason: 'This action initiates a payment or financial transaction.'
      }
    }

    // 3. Deletion / Destruction actions -> IRREVERSIBLE
    if (IRREVERSIBLE_DESTRUCTION_KEYWORDS.some((kw) => fullContext.includes(kw))) {
      return {
        risk: 'IRREVERSIBLE',
        requiresConfirmation: true,
        reason: 'This action deletes data or modifies permanent storage.'
      }
    }

    // 4. Security / Account alterations -> IRREVERSIBLE
    if (SENSITIVE_SECURITY_KEYWORDS.some((kw) => fullContext.includes(kw))) {
      return {
        risk: 'IRREVERSIBLE',
        requiresConfirmation: true,
        reason: 'This action modifies security, passwords, or authentication credentials.'
      }
    }

    // 5. Sensitive communications (e.g. sending text message, submitting form)
    if (
      (actionType === 'tap' || actionType === 'tap_element') &&
      SENSITIVE_COMMUNICATION_KEYWORDS.some((kw) => fullContext.includes(kw))
    ) {
      return {
        risk: 'SENSITIVE',
        requiresConfirmation: true,
        reason: 'This action sends a message or submits data outward.'
      }
    }

    // 6. Form submissions / submit buttons
    if (
      (actionType === 'tap' || actionType === 'tap_element') &&
      (fullContext.includes('submit') ||
        fullContext.includes('confirm order') ||
        fullContext.includes('complete checkout'))
    ) {
      return {
        risk: 'SENSITIVE',
        requiresConfirmation: true,
        reason: 'This action submits a form or completes an order.'
      }
    }

    // 7. Text entry into sensitive fields (password, pin, credit card)
    if (actionType === 'type_text') {
      if (
        fullContext.includes('password') ||
        fullContext.includes('pin') ||
        fullContext.includes('cvv') ||
        fullContext.includes('card')
      ) {
        return {
          risk: 'SENSITIVE',
          requiresConfirmation: true,
          reason: 'This action inputs sensitive authentication or financial details.'
        }
      }
      return {
        risk: 'REVERSIBLE',
        requiresConfirmation: false
      }
    }

    // 8. Reversible / Safe navigation actions
    if (
      actionType === 'launch_app' ||
      actionType === 'find_app' ||
      actionType === 'press_back' ||
      actionType === 'press_home' ||
      actionType === 'press_recents' ||
      actionType === 'scroll' ||
      actionType === 'swipe' ||
      actionType === 'wait_for_element' ||
      actionType === 'verify_action' ||
      actionType === 'get_screen_state' ||
      actionType === 'find_element' ||
      actionType === 'find_clickable_element'
    ) {
      return {
        risk: 'READ_ONLY',
        requiresConfirmation: false
      }
    }

    // Default: tap is reversible unless flagged above
    return {
      risk: 'REVERSIBLE',
      requiresConfirmation: false
    }
  }

  /**
   * Sanitizes text for debug logging so credentials or private message payloads
   * are never emitted in console logs or diagnostics.
   */
  public static redactSensitiveData(text: string): string {
    if (!text) return ''
    return text
      .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[REDACTED_CARD]')
      .replace(/\b\d{3,4}\b(?=.*(?:cvv|cvc|pin))/gi, '[REDACTED_PIN]')
      .replace(/(password|secret|token|apikey)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
  }
}
