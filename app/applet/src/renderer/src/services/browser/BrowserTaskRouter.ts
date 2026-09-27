/**
 * IRIS — Browser Task Router
 *
 * Exposes browser-use automation tools to Iris AI with strict safety verification:
 * - browser_open(url)
 * - browser_navigate(url)
 * - browser_back()
 * - browser_forward()
 * - browser_click(target)
 * - browser_type(target, text)
 * - browser_extract(instruction)
 * - browser_scroll(direction)
 * - browser_wait(condition)
 * - browser_screenshot()
 * - browser_execute_task(task)
 */

import { browserAgentAdapter, BrowserActionResult } from './BrowserAgentAdapter'
import { irisActionConfirmation } from '../androidAgent/IrisActionConfirmation'

export class BrowserTaskRouter {
  private static instance: BrowserTaskRouter

  public static getInstance(): BrowserTaskRouter {
    if (!BrowserTaskRouter.instance) {
      BrowserTaskRouter.instance = new BrowserTaskRouter()
    }
    return BrowserTaskRouter.instance
  }

  /**
   * Checks if an action is sensitive and requires user confirmation
   */
  private isSensitiveAction(
    actionName: string,
    params: Record<string, any>
  ): { isSensitive: boolean; actionType: string; reason: string } {
    const actionLower = actionName.toLowerCase()
    const textLower = (params.text || params.target || params.instruction || params.task || '').toLowerCase()

    // 1. Submitting forms or posting comments
    if (
      actionLower.includes('submit') ||
      actionLower.includes('post') ||
      textLower.includes('submit') ||
      textLower.includes('post comment') ||
      textLower.includes('publish')
    ) {
      return {
        isSensitive: true,
        actionType: 'form_submission',
        reason: 'Submitting web form or publishing content online.'
      }
    }

    // 2. Making purchases or financial transactions
    if (
      textLower.includes('buy') ||
      textLower.includes('checkout') ||
      textLower.includes('pay') ||
      textLower.includes('purchase') ||
      textLower.includes('credit card') ||
      textLower.includes('order')
    ) {
      return {
        isSensitive: true,
        actionType: 'purchase',
        reason: 'Initiating web purchase or financial checkout.'
      }
    }

    // 3. Sending messages or emails via web apps
    if (
      textLower.includes('send message') ||
      textLower.includes('send email') ||
      textLower.includes('tweet') ||
      textLower.includes('dm')
    ) {
      return {
        isSensitive: true,
        actionType: 'send_message',
        reason: 'Sending online message or communication.'
      }
    }

    // 4. Deleting data or changing security settings
    if (
      textLower.includes('delete') ||
      textLower.includes('remove account') ||
      textLower.includes('change password') ||
      textLower.includes('security settings')
    ) {
      return {
        isSensitive: true,
        actionType: 'account_modification',
        reason: 'Deleting online data or modifying account security settings.'
      }
    }

    return { isSensitive: false, actionType: 'safe_browsing', reason: '' }
  }

  /**
   * Routes and executes browser tools with safety confirmation gate
   */
  public async executeTool(toolName: string, args: Record<string, any>): Promise<BrowserActionResult> {
    const sensitive = this.isSensitiveAction(toolName, args)

    if (sensitive.isSensitive) {
      const confirm = await irisActionConfirmation.requireConfirmationIfNeeded(
        sensitive.actionType as any,
        args
      )
      if (!confirm.approved) {
        return {
          success: false,
          action: toolName,
          output: `Browser Action Blocked: User declined confirmation for sensitive operation (${sensitive.reason}).`,
          sessionId: args.sessionId || 'default_browser_session',
          executionTimeMs: 0,
          error: 'USER_DECLINED_CONFIRMATION'
        }
      }
    }

    switch (toolName) {
      case 'browser_open':
      case 'browser_navigate':
        return browserAgentAdapter.executeAction({
          action: 'navigate',
          url: args.url || args.target,
          sessionId: args.sessionId
        })

      case 'browser_back':
        return browserAgentAdapter.executeAction({
          action: 'back',
          sessionId: args.sessionId
        })

      case 'browser_forward':
        return browserAgentAdapter.executeAction({
          action: 'forward',
          sessionId: args.sessionId
        })

      case 'browser_click':
        return browserAgentAdapter.executeAction({
          action: 'click',
          target: args.target,
          sessionId: args.sessionId
        })

      case 'browser_type':
        return browserAgentAdapter.executeAction({
          action: 'type',
          target: args.target,
          text: args.text,
          sessionId: args.sessionId
        })

      case 'browser_extract':
        return browserAgentAdapter.executeAction({
          action: 'extract',
          instruction: args.instruction,
          sessionId: args.sessionId
        })

      case 'browser_scroll':
        return browserAgentAdapter.executeAction({
          action: 'scroll',
          direction: args.direction || 'down',
          sessionId: args.sessionId
        })

      case 'browser_wait':
        return browserAgentAdapter.executeAction({
          action: 'wait',
          condition: args.condition,
          sessionId: args.sessionId
        })

      case 'browser_screenshot':
        return browserAgentAdapter.executeAction({
          action: 'screenshot',
          sessionId: args.sessionId
        })

      case 'browser_execute_task':
        return browserAgentAdapter.executeAction({
          action: 'execute_task',
          task: args.task || args.instruction,
          sessionId: args.sessionId
        })

      default:
        return {
          success: false,
          action: toolName,
          output: `Unknown browser tool: ${toolName}`,
          sessionId: args.sessionId || 'default_browser_session',
          executionTimeMs: 0
        }
    }
  }
}

export const browserTaskRouter = BrowserTaskRouter.getInstance()
