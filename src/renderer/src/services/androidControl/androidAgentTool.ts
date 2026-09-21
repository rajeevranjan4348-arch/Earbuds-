/**
 * Android Agent Function & Tool Invocation Interface
 * Exposes the standard tool calling interface for both autonomous Agent Loops
 * and LLM tool calling (Gemini / Anthropic / OpenAI schemas).
 */

import { AccessibilityNode, AgentExecutionResult, AndroidAction, ScreenState } from './types'
import { accessibilityService } from './accessibilityService'
import { actionExecutor } from './actionExecutor'
import { agentLoop } from './agentLoop'
import { resolve_app } from '../launcher'

export const androidAgentTools = {
  /**
   * 1. launch_app(packageName)
   * Launches an installed Android app by its package name or resolves from dynamic index.
   */
  async launch_app(packageName: string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'launch_app',
      params: { packageName },
      description: `Launch app ${packageName}`
    })
  },

  /**
   * 2. find_app(appName)
   * Discovers and resolves an app using the dynamic KISS launcher engine.
   */
  async find_app(appName: string): Promise<any> {
    return resolve_app(appName)
  },

  /**
   * 3. get_screen_state()
   * Captures and analyzes current UI hierarchy, text nodes, and bounds.
   */
  async get_screen_state(): Promise<ScreenState> {
    return accessibilityService.getScreenState()
  },

  /**
   * 4. find_element(text)
   * Locates a UI node by visible text or label.
   */
  async find_element(text: string): Promise<AccessibilityNode | null> {
    return accessibilityService.findElement(text)
  },

  /**
   * 5. find_clickable_element(description)
   * Finds interactive clickable button, tab, or control.
   */
  async find_clickable_element(description: string): Promise<AccessibilityNode | null> {
    return accessibilityService.findClickableElement(description)
  },

  /**
   * 6. tap(x, y)
   * Dispatches a tap gesture at physical screen coordinates.
   */
  async tap(x: number, y: number): Promise<any> {
    return actionExecutor.executeAction({
      type: 'tap',
      params: { x, y },
      description: `Tap at (${x}, ${y})`
    })
  },

  /**
   * 7. tap_element(element)
   * Taps an element by node reference or text selector.
   */
  async tap_element(element: AccessibilityNode | string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'tap_element',
      params: { element },
      description: `Tap element "${typeof element === 'string' ? element : element.text || element.contentDescription}"`
    })
  },

  /**
   * 8. long_press(x, y, duration)
   * Dispatches a long press gesture at coordinates.
   */
  async long_press(x: number, y: number, durationMs = 1000): Promise<any> {
    return actionExecutor.executeAction({
      type: 'long_press',
      params: { x, y, duration: durationMs },
      description: `Long press at (${x}, ${y}) for ${durationMs}ms`
    })
  },

  /**
   * 9. type_text(text)
   * Types text into the active/focused or specified input field.
   */
  async type_text(text: string, targetSelector?: string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'type_text',
      params: { text, targetSelector },
      description: `Type text "${text}"`
    })
  },

  /**
   * 10. clear_text()
   * Clears text from the active or specified input element.
   */
  async clear_text(targetSelector?: string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'clear_text',
      params: { targetSelector },
      description: `Clear text field`
    })
  },

  /**
   * 11. swipe(startX, startY, endX, endY, duration)
   * Performs a drag/swipe gesture across screen coordinates.
   */
  async swipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs = 300
  ): Promise<any> {
    return actionExecutor.executeAction({
      type: 'swipe',
      params: { startX, startY, endX, endY, duration: durationMs },
      description: `Swipe from (${startX},${startY}) to (${endX},${endY})`
    })
  },

  /**
   * 12. scroll(direction)
   * Scrolls the active scrollable view up, down, left, or right.
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<any> {
    return actionExecutor.executeAction({
      type: 'scroll',
      params: { direction },
      description: `Scroll ${direction}`
    })
  },

  /**
   * 13. press_back()
   * Dispatches Android Global Back action.
   */
  async press_back(): Promise<any> {
    return actionExecutor.executeAction({
      type: 'press_back',
      params: {},
      description: `Press Android Back`
    })
  },

  /**
   * 14. press_home()
   * Dispatches Android Global Home action.
   */
  async press_home(): Promise<any> {
    return actionExecutor.executeAction({
      type: 'press_home',
      params: {},
      description: `Press Android Home`
    })
  },

  /**
   * 15. wait_for_element()
   * Polls UI hierarchy until an element appears or times out.
   */
  async wait_for_element(selector: string, timeoutMs = 4000): Promise<any> {
    return actionExecutor.executeAction({
      type: 'wait_for_element',
      params: { selector, timeoutMs },
      description: `Wait for element "${selector}"`
    })
  },

  /**
   * 16. verify_action()
   * Asserts whether an expected UI text or element is present.
   */
  async verify_action(expectedText: string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'verify_action',
      params: { expectedText },
      description: `Verify text "${expectedText}" is present`
    })
  },

  /**
   * 17. request_confirmation(action)
   * Pauses task execution and prompts user for explicit consent before sensitive operations.
   */
  async request_confirmation(actionDescription: string, reason?: string): Promise<any> {
    return actionExecutor.executeAction({
      type: 'request_confirmation',
      params: { reason, description: actionDescription },
      description: actionDescription
    })
  },

  /**
   * Autonomous Task Executor
   * Translates natural language commands into complete multi-step agent execution.
   */
  async execute_agent_task(prompt: string): Promise<AgentExecutionResult> {
    return agentLoop.executeTask(prompt)
  },

  /**
   * Resumes or cancels execution following user security confirmation.
   */
  async confirm_pending_action(approved: boolean): Promise<AgentExecutionResult> {
    return agentLoop.handleConfirmationResponse(approved)
  }
}

// Direct function exports for individual imports
export const {
  launch_app,
  find_app,
  get_screen_state,
  find_element,
  find_clickable_element,
  tap,
  tap_element,
  long_press,
  type_text,
  clear_text,
  swipe,
  scroll,
  press_back,
  press_home,
  wait_for_element,
  verify_action,
  request_confirmation,
  execute_agent_task,
  confirm_pending_action
} = androidAgentTools
