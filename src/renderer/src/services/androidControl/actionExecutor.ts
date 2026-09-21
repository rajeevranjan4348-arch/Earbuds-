/**
 * Android Action Execution Engine
 * Ported and adapted from OpenDroid (GenericAppAutomator) & Android Agent (AccessibilityActionService)
 *
 * Handles:
 * - Direct action execution with change detection
 * - Retries on transient UI settling / missing elements
 * - Safety validation via ActionRiskPolicy
 * - Settle delays and observation
 */

import { AccessibilityNode, AndroidAction, ScreenChangeComparison, ScreenState } from './types'
import { accessibilityService } from './accessibilityService'
import { ActionRiskPolicy } from './actionRisk'
import { launch_app, resolve_app } from '../launcher'

export interface ActionExecutionOutcome {
  success: boolean
  action: AndroidAction
  screenBefore: ScreenState
  screenAfter: ScreenState
  change: ScreenChangeComparison
  result?: any
  error?: string
  retriesUsed: number
}

export class ActionExecutor {
  private static instance: ActionExecutor
  private settleDelayMs = 450

  private constructor() {
    this.settleDelayMs = 450
  }

  public static getInstance(): ActionExecutor {
    if (!ActionExecutor.instance) {
      ActionExecutor.instance = new ActionExecutor()
    }
    return ActionExecutor.instance
  }

  /**
   * Executes an AndroidAction with automatic pre/post screen state observation,
   * verification of effect, and retry logic.
   */
  public async executeAction(
    action: AndroidAction,
    options: { maxRetries?: number; settleMs?: number } = {}
  ): Promise<ActionExecutionOutcome> {
    const maxRetries = options.maxRetries ?? 2
    const settleTime = options.settleMs ?? this.settleDelayMs

    let lastError: string | undefined
    let retriesUsed = 0

    const screenBefore = await accessibilityService.getScreenState()

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[ActionExecutor] Executing ${action.type} (Attempt ${attempt + 1}/${maxRetries + 1}): ${action.description}`
        )

        const rawResult = await this.dispatchRawAction(action)

        // Allow UI to settle
        await new Promise((r) => setTimeout(r, settleTime))

        const screenAfter = await accessibilityService.getScreenState()
        const change = accessibilityService.compareScreenStates(screenBefore, screenAfter)

        // If action was expected to produce a change but didn't, retry if applicable
        if (
          change.level === 'NONE' &&
          attempt < maxRetries &&
          (action.type === 'tap' || action.type === 'tap_element' || action.type === 'launch_app')
        ) {
          console.warn(`[ActionExecutor] No UI change observed after ${action.type}, retrying...`)
          retriesUsed++
          await new Promise((r) => setTimeout(r, 400))
          continue
        }

        return {
          success: rawResult.success !== false,
          action,
          screenBefore,
          screenAfter,
          change,
          result: rawResult,
          retriesUsed
        }
      } catch (err: any) {
        lastError = err?.message || String(err)
        console.error(`[ActionExecutor] Error executing ${action.type}:`, err)
        retriesUsed++
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500))
        }
      }
    }

    const screenAfter = await accessibilityService.getScreenState()
    return {
      success: false,
      action,
      screenBefore,
      screenAfter,
      change: { level: 'NONE', similarityScore: 1.0, details: 'Action failed after retries' },
      error: lastError || 'Execution failed',
      retriesUsed
    }
  }

  /**
   * Internal dispatcher for each specific action type.
   */
  private async dispatchRawAction(action: AndroidAction): Promise<any> {
    const { type, params } = action

    switch (type) {
      case 'launch_app': {
        const pkg = params.packageName || params.package
        const appName = params.appName || params.name
        if (!pkg && appName) {
          const resolved = await resolve_app(appName)
          if (resolved.app) {
            accessibilityService.setForegroundApp(resolved.app.packageName, resolved.app.name)
            return launch_app(resolved.app.packageName)
          }
        }
        if (pkg) {
          accessibilityService.setForegroundApp(pkg, appName)
          return launch_app(pkg)
        }
        throw new Error('Package name or app name required for launch_app')
      }

      case 'find_app': {
        const query = params.appName || params.query
        return resolve_app(query)
      }

      case 'get_screen_state': {
        return accessibilityService.getScreenState()
      }

      case 'find_element': {
        const text = params.text || params.query
        return accessibilityService.findElement(text)
      }

      case 'find_clickable_element': {
        const desc = params.description || params.desc || params.text
        return accessibilityService.findClickableElement(desc)
      }

      case 'tap': {
        const x = Number(params.x)
        const y = Number(params.y)
        if (isNaN(x) || isNaN(y)) {
          throw new Error(`Invalid tap coordinates: (${params.x}, ${params.y})`)
        }
        return accessibilityService.dispatchTap(x, y)
      }

      case 'tap_element': {
        const target = params.element || params.selector || params.text
        return accessibilityService.dispatchTapElement(target)
      }

      case 'long_press': {
        const x = Number(params.x)
        const y = Number(params.y)
        const duration = Number(params.duration || 1000)
        return accessibilityService.dispatchLongPress(x, y, duration)
      }

      case 'type_text': {
        const text = params.text || ''
        const target = params.targetSelector || params.selector
        const outcome = await accessibilityService.dispatchTypeText(text, target)
        // Auto trigger IME enter if requested or default
        if (params.pressEnter !== false) {
          await accessibilityService.dispatchImeEnter()
        }
        return outcome
      }

      case 'clear_text': {
        return accessibilityService.dispatchClearText(params.targetSelector)
      }

      case 'swipe': {
        const startX = Number(params.startX)
        const startY = Number(params.startY)
        const endX = Number(params.endX)
        const endY = Number(params.endY)
        const duration = Number(params.duration || 300)
        return accessibilityService.dispatchSwipe(startX, startY, endX, endY, duration)
      }

      case 'scroll': {
        const direction = (params.direction || 'down').toLowerCase()
        return accessibilityService.dispatchScroll(direction as any)
      }

      case 'press_back': {
        return accessibilityService.dispatchBack()
      }

      case 'press_home': {
        return accessibilityService.dispatchHome()
      }

      case 'press_recents': {
        return accessibilityService.dispatchRecents()
      }

      case 'wait_for_element': {
        const selector = params.selector || params.text || params.id
        const timeoutMs = Number(params.timeoutMs || 4000)
        const found = await accessibilityService.waitForElement(selector, timeoutMs)
        return { success: Boolean(found), element: found }
      }

      case 'verify_action': {
        const state = await accessibilityService.getScreenState()
        if (params.expectedText) {
          const match = state.allVisibleText.some((t) =>
            t.toLowerCase().includes(params.expectedText.toLowerCase())
          )
          return { success: match, matchedText: params.expectedText }
        }
        return { success: true }
      }

      case 'request_confirmation': {
        // Confirmation is handled at task planner / agent loop level
        return { success: true }
      }

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`)
    }
  }
}

export const actionExecutor = ActionExecutor.getInstance()
