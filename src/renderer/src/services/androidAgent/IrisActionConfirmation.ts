/**
 * IRIS — Action Safety & Confirmation Layer
 * 
 * Intercepts sensitive operations (Phone Calls, SMS, Privileged ADB/Shizuku,
 * System Deletions, Financials) and ensures explicit user authorization.
 */

import { confirmationEngine } from './ConfirmationEngine'
import { RiskLevel } from './types'

export interface SensitiveActionPolicy {
  action: string
  target?: string
  reason: string
  consequences: string
  riskLevel: RiskLevel
}

export class IrisActionConfirmation {
  private static instance: IrisActionConfirmation

  public static getInstance(): IrisActionConfirmation {
    if (!IrisActionConfirmation.instance) {
      IrisActionConfirmation.instance = new IrisActionConfirmation()
    }
    return IrisActionConfirmation.instance
  }

  /**
   * Asserts whether an action is sensitive and requires explicit user confirmation
   */
  public isSensitiveAction(actionName: string, params?: Record<string, any>): boolean {
    const act = actionName.toLowerCase()
    if (act.includes('call') || act.includes('phone') || act.includes('dial')) return true
    if (act.includes('sms') || act.includes('message') || act.includes('send_message')) return true
    if (act.includes('shell') || act.includes('adb') || act.includes('exec_command')) return true
    if (act.includes('delete') || act.includes('erase') || act.includes('wipe')) return true
    if (act.includes('install') || act.includes('uninstall')) return true
    if (act.includes('pay') || act.includes('transfer') || act.includes('wallet')) return true
    return false
  }

  /**
   * Evaluates policy and prompts for user approval if required
   */
  public async requireConfirmationIfNeeded(
    actionName: string,
    params: Record<string, any> = {}
  ): Promise<{ approved: boolean; reason?: string }> {
    if (!this.isSensitiveAction(actionName, params)) {
      return { approved: true }
    }

    const target = params.recipient || params.target || params.appName || params.command || 'System Resource'
    let reason = 'This operation can affect system state or send external communications.'
    let consequences = 'Action will be executed on your Android device.'
    let riskLevel: RiskLevel = 'medium'

    if (actionName.includes('call')) {
      reason = `Iris is requesting to place an outbound call to "${target}".`
      consequences = 'Carrier charges may apply and call will connect.'
      riskLevel = 'high'
    } else if (actionName.includes('sms') || actionName.includes('message')) {
      reason = `Iris is requesting to send an SMS/message to "${target}": "${params.message || params.text || ''}"`
      consequences = 'Message will be delivered immediately to the recipient.'
      riskLevel = 'high'
    } else if (actionName.includes('shell') || actionName.includes('adb')) {
      reason = `Iris is requesting to run a privileged shell command: "${params.command || ''}"`
      consequences = 'Elevated device modification may occur.'
      riskLevel = 'critical'
    }

    const approved = await confirmationEngine.requestApproval({
      action: actionName,
      target,
      reason,
      consequences,
      riskLevel,
      metadata: params
    })

    return {
      approved,
      reason: approved ? 'User approved action.' : 'User declined sensitive action prompt.'
    }
  }
}

export const irisActionConfirmation = IrisActionConfirmation.getInstance()
