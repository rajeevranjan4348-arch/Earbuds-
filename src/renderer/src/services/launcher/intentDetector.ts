/**
 * AI Command & Intent Detection Engine for Android App Launching
 * Detects internal 'launch_app' intent from natural language speech and chat queries.
 */

import { AppLaunchIntent } from './types'

// Regular expression to strip conversational filler and polite prefixes
const POLITE_PREFIXES = [
  /^(hey\s+)?iris[,.\s]+/i,
  /^(can\s+you\s+)?(please\s+)?/i,
  /^(could\s+you\s+)?(please\s+)?/i,
  /^(i\s+want\s+to\s+)?/i,
  /^(help\s+me\s+)?/i,
  /^(would\s+you\s+)?/i,
  /^(kindly\s+)?/i
]

// App launch action verb triggers
const LAUNCH_VERB_PATTERNS = [
  /^(open|launch|start|run|fire\s+up|bring\s+up|switch\s+to|go\s+to)\s+/i
]

// Suffixes and filler words to clean from app target name
const TRAILING_FILLERS = [
  /\s+(app|application)$/i,
  /\s+on\s+my\s+phone$/i,
  /\s+on\s+phone$/i,
  /\s+on\s+android$/i,
  /\s+for\s+me$/i,
  /\s+please$/i
]

const LEADING_ARTICLES = [/^(the|my|an|a)\s+/i]

/**
 * Detects whether an input string represents a 'launch_app' intent,
 * and extracts the target app name.
 * 
 * Returns structured internal intent:
 * {
 *   "intent": "launch_app",
 *   "app_name": "WhatsApp"
 * }
 */
export function detectLaunchAppIntent(rawText: string): AppLaunchIntent | null {
  if (!rawText || typeof rawText !== 'string') return null

  const trimmed = rawText.trim()
  if (!trimmed) return null

  // 1. Check for direct tool/function format e.g. launch_app("WhatsApp") or {"intent":"launch_app"}
  const toolCallMatch = trimmed.match(/^launch_app\s*\(\s*["']?([^"')]+)["']?\s*\)/i)
  if (toolCallMatch && toolCallMatch[1]) {
    return {
      intent: 'launch_app',
      app_name: toolCallMatch[1].trim(),
      raw_query: trimmed,
      confidence: 1.0
    }
  }

  // 2. Check for JSON structured payload if passed internally
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.intent === 'launch_app' && parsed.app_name) {
        return {
          intent: 'launch_app',
          app_name: String(parsed.app_name).trim(),
          raw_query: trimmed,
          confidence: 1.0
        }
      }
    } catch (_e) {
      // not JSON, continue with NLP detection
    }
  }

  // 3. Natural Language Processing for speech & chat queries
  let working = trimmed

  // Strip polite prefixes
  for (const prefix of POLITE_PREFIXES) {
    working = working.replace(prefix, '').trim()
  }

  // Check if starts with a launch action verb
  let matchedVerb = false
  for (const verbPattern of LAUNCH_VERB_PATTERNS) {
    if (verbPattern.test(working)) {
      working = working.replace(verbPattern, '').trim()
      matchedVerb = true
      break
    }
  }

  if (!matchedVerb) {
    return null
  }

  // Clean trailing fillers
  for (const filler of TRAILING_FILLERS) {
    working = working.replace(filler, '').trim()
  }

  // Clean leading articles ("my browser" -> "browser", "the camera" -> "camera")
  for (const article of LEADING_ARTICLES) {
    working = working.replace(article, '').trim()
  }

  // Final sanity check: target app name must have at least 1 character
  // and should not be a general non-app intent like "notes" (unless "notes app"), "lens", "optics"
  // Note: internal IRIS commands like "open notes" or "open gallery" will be prioritized or routed
  if (!working || working.length === 0) {
    return null
  }

  // Format extracted app name cleanly
  const appName = working.trim()

  return {
    intent: 'launch_app',
    app_name: appName,
    raw_query: trimmed,
    confidence: 0.95
  }
}
