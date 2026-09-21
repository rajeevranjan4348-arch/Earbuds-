/**
 * Browser Use Types (Repository 01: browser-use/browser-use)
 */

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'extract_content'
  | 'extract_links'
  | 'take_screenshot'
  | 'evaluate'

export interface BrowserAction {
  type: BrowserActionType
  url?: string
  selector?: string
  text?: string
  direction?: 'up' | 'down'
  pixels?: number
}

export interface BrowserActionResult {
  success: boolean
  action: BrowserActionType
  url?: string
  title?: string
  content?: string
  links?: { text: string; href: string }[]
  error?: string
  executionTimeMs: number
}

export interface BrowserAgentSession {
  id: string
  currentUrl: string
  history: string[]
  pageTitle: string
  extractedText: string
  status: 'idle' | 'navigating' | 'interacting' | 'completed' | 'failed'
}
