/**
 * Android Task Planner Engine
 * Ported and synthesized from:
 * - OpenDroid (com.opendroid.ai.core.agent.PlanManager)
 * - Android Agent (adev0x/android-agent - Task Decomposer)
 *
 * Separates intent understanding and multi-step task planning from execution.
 * Translates natural language instructions into ordered, verified AndroidActions
 * with attached safety and risk evaluations.
 */

import { ActionRiskPolicy } from './actionRisk'
import { AndroidAction, PlanStep, TaskPlan } from './types'
import { resolve_app } from '../launcher'

export class TaskPlanner {
  private static instance: TaskPlanner
  private initialized = true

  private constructor() {
    this.initialized = true
  }

  public static getInstance(): TaskPlanner {
    if (!TaskPlanner.instance) {
      TaskPlanner.instance = new TaskPlanner()
    }
    return TaskPlanner.instance
  }

  /**
   * Plans an end-to-end task from user natural language prompt.
   */
  public async planTask(prompt: string): Promise<TaskPlan> {
    const rawClean = prompt.trim()
    const cleanLower = rawClean.toLowerCase()
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    const actions: AndroidAction[] = []

    // 1. Pattern: "Search <App> for <Query>" (e.g., "Search YouTube for Minecraft", "Search Maps for India Gate")
    const searchAppForMatch = cleanLower.match(/^search\s+([a-z0-9\s]+?)\s+for\s+(.+)$/i)
    if (searchAppForMatch) {
      const appTarget = searchAppForMatch[1].trim()
      const searchTarget = searchAppForMatch[2].trim()
      const appResolution = await resolve_app(appTarget)

      if (appResolution.app) {
        actions.push({
          type: 'launch_app',
          params: { packageName: appResolution.app.packageName, appName: appResolution.app.name },
          description: `Launch ${appResolution.app.name}`
        })
        actions.push({
          type: 'wait_for_element',
          params: { selector: 'search', timeoutMs: 3500 },
          description: `Wait for search bar in ${appResolution.app.name}`
        })
        actions.push({
          type: 'tap_element',
          params: { selector: 'search' },
          description: `Tap search button`
        })
        actions.push({
          type: 'type_text',
          params: { text: searchTarget, pressEnter: true },
          description: `Type search query "${searchTarget}" and submit`
        })
        actions.push({
          type: 'verify_action',
          params: { expectedText: searchTarget },
          description: `Verify results appear for "${searchTarget}"`
        })
      }
    }

    // 2. Pattern: "Open <App> and search for <Query>" (e.g. "Open Maps and search for India Gate")
    if (actions.length === 0) {
      const openAndSearchMatch = cleanLower.match(
        /^open\s+([a-z0-9\s]+?)\s+(?:and|then)\s+search(?:\s+for)?\s+(.+)$/i
      )
      if (openAndSearchMatch) {
        const appTarget = openAndSearchMatch[1].trim()
        const searchTarget = openAndSearchMatch[2].trim()
        const appResolution = await resolve_app(appTarget)

        if (appResolution.app) {
          actions.push({
            type: 'launch_app',
            params: { packageName: appResolution.app.packageName, appName: appResolution.app.name },
            description: `Launch ${appResolution.app.name}`
          })
          actions.push({
            type: 'wait_for_element',
            params: { selector: 'search', timeoutMs: 3500 },
            description: `Wait for search element in ${appResolution.app.name}`
          })
          actions.push({
            type: 'tap_element',
            params: { selector: 'search' },
            description: `Tap search input`
          })
          actions.push({
            type: 'type_text',
            params: { text: searchTarget, pressEnter: true },
            description: `Enter search query "${searchTarget}"`
          })
          actions.push({
            type: 'verify_action',
            params: { expectedText: searchTarget },
            description: `Verify destination/content "${searchTarget}"`
          })
        }
      }
    }

    // 3. Pattern: "Open <App> and send/message <Contact> <Message>"
    if (actions.length === 0) {
      const messagePattern = cleanLower.match(
        /^open\s+([a-z0-9]+)\s+(?:and|then)\s+(?:send\s+message|message|text)\s+(?:to\s+)?([a-z0-9\s]+?)\s+(?:saying|that)?\s*(.+)$/i
      )
      if (messagePattern) {
        const appTarget = messagePattern[1].trim()
        const recipient = messagePattern[2].trim()
        const messageBody = messagePattern[3].trim()
        const appResolution = await resolve_app(appTarget)

        if (appResolution.app) {
          actions.push({
            type: 'launch_app',
            params: { packageName: appResolution.app.packageName, appName: appResolution.app.name },
            description: `Launch ${appResolution.app.name}`
          })
          actions.push({
            type: 'tap_element',
            params: { selector: 'search' },
            description: `Search for contact "${recipient}"`
          })
          actions.push({
            type: 'type_text',
            params: { text: recipient },
            description: `Enter contact name "${recipient}"`
          })
          actions.push({
            type: 'tap_element',
            params: { selector: recipient },
            description: `Select contact "${recipient}"`
          })
          actions.push({
            type: 'type_text',
            params: { text: messageBody, pressEnter: false },
            description: `Compose message draft: "${messageBody}"`
          })
          // Mandatory safety confirmation before dispatching message!
          actions.push({
            type: 'request_confirmation',
            params: {
              actionName: 'send_message',
              recipient,
              message: messageBody,
              app: appResolution.app.name,
              reason: `Send message to ${recipient} in ${appResolution.app.name}?`
            },
            description: `Request user confirmation before sending message to ${recipient}`
          })
          actions.push({
            type: 'tap_element',
            params: { selector: 'send' },
            description: `Tap Send button to dispatch message`
          })
        }
      }
    }

    // 4. Pattern: "Scroll down", "Scroll up", "Scroll left", "Scroll right"
    if (actions.length === 0) {
      const scrollMatch = cleanLower.match(/^scroll\s+(down|up|left|right)$/i)
      if (scrollMatch) {
        actions.push({
          type: 'scroll',
          params: { direction: scrollMatch[1].toLowerCase() },
          description: `Scroll ${scrollMatch[1].toLowerCase()}`
        })
      }
    }

    // 5. Pattern: "Go back", "Back", "Press back"
    if (actions.length === 0) {
      if (cleanLower === 'go back' || cleanLower === 'back' || cleanLower === 'press back') {
        actions.push({
          type: 'press_back',
          params: {},
          description: 'Press Android Back button'
        })
      }
    }

    // 6. Pattern: "Press home", "Go home", "Home"
    if (actions.length === 0) {
      if (
        cleanLower === 'press home' ||
        cleanLower === 'go home' ||
        cleanLower === 'home screen' ||
        cleanLower === 'home'
      ) {
        actions.push({
          type: 'press_home',
          params: {},
          description: 'Press Android Home button'
        })
      }
    }

    // 7. Pattern: "Tap [the] <Element>", "Click [the] <Element>"
    if (actions.length === 0) {
      const tapMatch = cleanLower.match(/^(?:tap|click|press)(?:\s+on|\s+the)?\s+(.+)$/i)
      if (tapMatch) {
        const target = tapMatch[1].trim()
        actions.push({
          type: 'tap_element',
          params: { selector: target },
          description: `Tap element matching "${target}"`
        })
      }
    }

    // 8. Pattern: "Type this text <Text>", "Type <Text>"
    if (actions.length === 0) {
      const typeMatch = cleanLower.match(/^(?:type|enter|input)(?:\s+this\s+text)?\s+(.+)$/i)
      if (typeMatch) {
        const text = typeMatch[1].trim()
        actions.push({
          type: 'type_text',
          params: { text, pressEnter: false },
          description: `Type text "${text}"`
        })
      }
    }

    // 9. Pattern: "Clear text", "Clear input field"
    if (actions.length === 0) {
      if (cleanLower.includes('clear text') || cleanLower.includes('clear input')) {
        actions.push({
          type: 'clear_text',
          params: {},
          description: 'Clear text from active input field'
        })
      }
    }

    // 10. Pattern: "Find the <Target> option/button/element", "Find <Target>"
    if (actions.length === 0) {
      const findMatch = cleanLower.match(
        /^(?:find|locate)(?:\s+the)?\s+([a-z0-9\s]+?)(?:\s+option|\s+button|\s+setting)?$/i
      )
      if (findMatch) {
        const query = findMatch[1].trim()
        actions.push({
          type: 'find_element',
          params: { query },
          description: `Search current screen for "${query}"`
        })
      }
    }

    // 11. Pattern: "Open <App>"
    if (actions.length === 0) {
      const openMatch = cleanLower.match(/^open\s+([a-z0-9\s]+)$/i)
      if (openMatch) {
        const appTarget = openMatch[1].trim()
        const appResolution = await resolve_app(appTarget)
        if (appResolution.app) {
          actions.push({
            type: 'launch_app',
            params: { packageName: appResolution.app.packageName, appName: appResolution.app.name },
            description: `Open ${appResolution.app.name}`
          })
        }
      }
    }

    // 12. Fallback: inspect current screen state
    if (actions.length === 0) {
      actions.push({
        type: 'get_screen_state',
        params: {},
        description: 'Inspect active Android screen and UI hierarchy'
      })
    }

    // Build PlanSteps with evaluated risk levels
    const steps: PlanStep[] = actions.map((act, index) => {
      const riskEval = ActionRiskPolicy.evaluate(act)
      return {
        id: `step_${index + 1}`,
        index,
        action: act,
        description: act.description,
        riskLevel: riskEval.risk,
        requiresConfirmation: riskEval.requiresConfirmation,
        status: 'pending'
      }
    })

    return {
      id: planId,
      goal: prompt,
      steps,
      currentStepIndex: 0,
      status: 'planning',
      startedAt: Date.now(),
      updatedAt: Date.now()
    }
  }
}

export const taskPlanner = TaskPlanner.getInstance()
