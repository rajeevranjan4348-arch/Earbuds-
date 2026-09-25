import { AppItem, ResolvedIntent } from './types'
import { appRegistry } from './AppRegistry'
import { LauncherSearch } from './LauncherSearch'

const LAUNCH_VERBS = [
  /^(open|launch|start|run|fire\s+up|bring\s+up|switch\s+to|go\s+to|show\s+me)\s+/i
]

const POLITE_PREFIXES = [
  /^(hey\s+)?(iris|ai|jarvis)[,.\s]+/i,
  /^(can\s+you\s+)?(please\s+)?/i,
  /^(could\s+you\s+)?(please\s+)?/i,
  /^(i\s+want\s+to\s+)?/i,
  /^(help\s+me\s+)?/i,
  /^(kindly\s+)?/i
]

export class IntentResolver {
  /**
   * Resolves a spoken or typed natural language command into an executable intent
   */
  public static resolve(rawQuery: string, currentTab?: string): ResolvedIntent {
    if (!rawQuery || !rawQuery.trim()) {
      return {
        app: null,
        action: 'unknown',
        rawQuery: '',
        confidence: 0
      }
    }

    let cleaned = rawQuery.trim()

    // 1. Strip polite prefixes
    for (const prefix of POLITE_PREFIXES) {
      cleaned = cleaned.replace(prefix, '').trim()
    }

    // 2. Check for multi-action compound statements
    // e.g. "Open YouTube and search for jazz" or "Open GitHub and search for react"
    const multiActionMatch = cleaned.match(
      /^(?:open|launch|start|go to)\s+([a-zA-Z0-9\s]+?)\s+and\s+(?:search\s+for|look\s+for|find)\s+(.+)$/i
    )

    if (multiActionMatch) {
      const appTarget = multiActionMatch[1].trim()
      const searchTarget = multiActionMatch[2].trim()

      const foundApp = this.findBestApp(appTarget, currentTab)
      if (foundApp) {
        return {
          app: foundApp,
          action: 'search',
          rawQuery,
          confidence: 0.95,
          secondaryParam: searchTarget,
          multiStepActions: [
            { action: 'launch', target: foundApp.id },
            { action: 'search', target: foundApp.id, param: searchTarget }
          ]
        }
      }
    }

    // Check for "Go to settings and open voice settings" or "Open settings and turn on dark mode"
    const multiStepSettingsMatch = cleaned.match(
      /^(?:go\s+to|open)\s+settings\s+and\s+(?:open|switch\s+to|turn\s+on)?\s*([a-zA-Z0-9\s]+)$/i
    )
    if (multiStepSettingsMatch) {
      const subSetting = multiStepSettingsMatch[1].trim()
      const settingsApp = appRegistry.getById('settings')
      return {
        app: settingsApp || null,
        action: 'navigate',
        rawQuery,
        confidence: 0.9,
        secondaryParam: subSetting,
        multiStepActions: [
          { action: 'navigate', target: 'SETTINGS' },
          { action: 'focus_setting', target: subSetting }
        ]
      }
    }

    // 3. Check for standard launch verb pattern: "Open [app name]" / "Launch [app name]"
    let isLaunchVerb = false
    let targetPhrase = cleaned

    for (const verb of LAUNCH_VERBS) {
      if (verb.test(targetPhrase)) {
        targetPhrase = targetPhrase.replace(verb, '').trim()
        isLaunchVerb = true
        break
      }
    }

    // Clean trailing filler words like "app", "application", "on device", "for me", "please"
    targetPhrase = targetPhrase
      .replace(
        /\s+(on\s+device|on\s+my\s+device|on\s+phone|on\s+computer|on\s+pc|on\s+my\s+phone|in\s+device|in\s+browser|now)$/i,
        ''
      )
      .replace(/\s+(app|application|website|site)$/i, '')
      .replace(/\s+for\s+me$/i, '')
      .replace(/\s+please$/i, '')
      .trim()

    // 4. Match against apps
    const candidate = this.findBestApp(targetPhrase, currentTab)

    if (candidate) {
      return {
        app: candidate,
        action: 'launch',
        rawQuery,
        confidence: isLaunchVerb ? 0.95 : 0.8
      }
    }

    // 5. Check if query matches a sensitive destructive command like "delete all chats"
    if (/delete\s+(all\s+)?(chats|history|conversations)/i.test(cleaned)) {
      const clearChat = appRegistry.getById('clear-chat-history')
      return {
        app: clearChat || null,
        action: 'confirm',
        rawQuery,
        confidence: 0.95
      }
    }

    if (/emergency\s+(stop|halt|kill)/i.test(cleaned) || /^stop\s+all\s+tasks$/i.test(cleaned)) {
      const emergency = appRegistry.getById('emergency-halt')
      return {
        app: emergency || null,
        action: 'confirm',
        rawQuery,
        confidence: 0.95
      }
    }

    return {
      app: null,
      action: 'unknown',
      rawQuery,
      confidence: 0
    }
  }

  private static findBestApp(query: string, currentTab?: string): AppItem | null {
    if (!query) return null
    const results = LauncherSearch.search({ query, currentTab, limit: 1 })
    return results.length > 0 ? results[0] : null
  }
}
