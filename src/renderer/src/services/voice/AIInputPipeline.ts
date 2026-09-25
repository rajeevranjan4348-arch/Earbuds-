/**
 * AIInputPipeline - Advanced Voice Intent, Command Parser & Reasoning Planner
 * Implements:
 * - Transcript normalization (whitespace, repeated words, STT artifacts)
 * - Multilingual & Hinglish direct intent detection
 * - Multi-step chained command parsing ("Open YouTube and search Hindi songs")
 * - Missing parameter detection & clarification requests
 * - Destructive action confirmation checks
 * - Context synthesis & tool routing
 */

import { ParsedVoiceCommand, VoiceIntentType } from './VoiceTypes'
import { memoryService } from '../memoryService'

export interface PlannedExecutionStep {
  stepIndex: number
  intent: VoiceIntentType
  actionName: string
  tool?: string
  parameters: Record<string, any>
  statusDescription: string
  requiresConfirmation: boolean
  confirmationPrompt?: string
}

export interface ExecutionPlan {
  originalQuery: string
  steps: PlannedExecutionStep[]
  needsClarification: boolean
  clarificationQuestion?: string
  safeToExecute: boolean
}

export class AIInputPipeline {
  /**
   * Normalizes raw STT transcripts
   */
  public normalizeInput(raw: string): string {
    if (!raw) return ''

    const filtered = Array.from(raw)
      .filter((c) => {
        const code = c.charCodeAt(0)
        return code >= 32 && code !== 127
      })
      .join('')

    let cleaned = filtered.replace(/\s+/g, ' ').trim()

    // Deduplicate immediate accidental duplicate words ("open open youtube" -> "open youtube")
    cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1')

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }

    return cleaned
  }

  /**
   * Detects language from script and vocabulary
   */
  public detectLanguage(text: string): string {
    if (!text) return 'en'

    // Devanagari (Hindi)
    if (/[\u0900-\u097F]/.test(text)) {
      return 'hi-IN'
    }
    // Bengali
    if (/[\u0980-\u09FF]/.test(text)) {
      return 'bn-IN'
    }
    // Tamil
    if (/[\u0B80-\u0BFF]/.test(text)) {
      return 'ta-IN'
    }
    // Telugu
    if (/[\u0C00-\u0C7F]/.test(text)) {
      return 'te-IN'
    }

    // Hinglish keywords
    const lower = text.toLowerCase()
    const hinglishPattern =
      /\b(kya|hai|kaise|ho|batao|kholo|chalao|karo|nahi|suno|gaana|gaane|dikhaye|shukriya)\b/i
    if (hinglishPattern.test(lower)) {
      return 'hinglish'
    }

    return 'en-US'
  }

  /**
   * Detects primary intent
   */
  public detectIntent(text: string): VoiceIntentType {
    const lower = text.toLowerCase()

    if (/\b(remember that|remind me that|save to memory|my favorite|meri pasand)\b/i.test(lower)) {
      return 'MEMORY'
    }
    if (/\b(scan|read text|ocr|extract text|image text|document text)\b/i.test(lower)) {
      return 'OCR'
    }
    if (/\b(look at|see this|describe image|what is on screen|camera)\b/i.test(lower)) {
      return 'VISION'
    }
    if (/\b(weather|temperature|forecast|rain|mausam)\b/i.test(lower)) {
      return 'WEATHER'
    }
    if (/\b(directions to|navigate to|where is|map of|route to|rasta)\b/i.test(lower)) {
      return 'MAPS'
    }
    if (/\b(open|launch|start|run|kholo|chalao)\s+([a-z0-9\s\-_.]+)/i.test(lower)) {
      return 'OPEN_APP'
    }
    if (/\b(close|exit|quit|band karo)\s+/i.test(lower)) {
      return 'CLOSE_APP'
    }
    if (/\b(play|stream|chalao|baja)\s+/i.test(lower)) {
      return 'PLAY_MEDIA'
    }
    if (/\b(send message|text|whatsapp|message bhejo)\b/i.test(lower)) {
      return 'SEND_MESSAGE'
    }
    if (/\b(call|phone|dial|phone karo)\b/i.test(lower)) {
      return 'MAKE_CALL'
    }
    if (/\b(reminder|set alarm|timer|remind me to|yaad dilana)\b/i.test(lower)) {
      return 'CREATE_REMINDER'
    }
    if (/\b(write code|function|debug|python|typescript|javascript|react|fix bug)\b/i.test(lower)) {
      return 'CODE'
    }
    if (/\b(draw|generate image|create picture|illustration|flux)\b/i.test(lower)) {
      return 'IMAGE_GENERATION'
    }
    if (/\b(search for|google|find|look up|search on web|khojo)\b/i.test(lower)) {
      return 'WEB_SEARCH'
    }
    if (/^(what|who|where|when|why|how|explain|define|tell me about|kya|kaun|kaise)\b/i.test(lower)) {
      return 'QUESTION'
    }

    return 'GENERAL_CHAT'
  }

  /**
   * Parses voice command with support for multi-step chained actions
   */
  public parseCommand(transcript: string): ParsedVoiceCommand {
    const norm = this.normalizeInput(transcript)

    // Check for chained command separators: "and then", "and", "then", "aur", "fir"
    const chainSplitRegex = /\s+(?:and then|and|then|aur fir|aur)\s+/i
    const parts = norm.split(chainSplitRegex)

    const chainedActions: ParsedVoiceCommand[] = []

    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        const subText = parts[i].trim()
        if (subText) {
          chainedActions.push(this.parseSingleCommand(subText))
        }
      }
    }

    const mainCommand = this.parseSingleCommand(parts[0])
    if (chainedActions.length > 0) {
      mainCommand.chainedActions = chainedActions
    }

    return mainCommand
  }

  private parseSingleCommand(text: string): ParsedVoiceCommand {
    const norm = this.normalizeInput(text)
    const lower = norm.toLowerCase()
    const intent = this.detectIntent(norm)
    const entities: Record<string, any> = {}
    const parameters: Record<string, any> = {}
    let requiresConfirmation = false
    let confirmationPrompt: string | undefined

    if (intent === 'OPEN_APP') {
      const match = lower.match(/(?:open|launch|start|run|kholo|chalao)\s+([a-z0-9\s\-_.]+)/i)
      if (match) {
        entities.app = match[1].trim()
        parameters.appName = match[1].trim()
      }
    } else if (intent === 'WEB_SEARCH' || intent === 'SEARCH') {
      const match = lower.match(/(?:search for|search|find|khojo)\s+(.+)/i)
      if (match) {
        entities.query = match[1].trim()
        parameters.query = match[1].trim()
      }
    } else if (intent === 'WEATHER') {
      const match = lower.match(/weather\s+(?:in|for|at)?\s*([a-z\s]+)?/i)
      if (match && match[1]) {
        entities.location = match[1].trim()
        parameters.location = match[1].trim()
      }
    } else if (intent === 'SEND_MESSAGE') {
      const recipientMatch = lower.match(/(?:to|ko)\s+([a-z0-9\s]+)/i)
      if (recipientMatch) {
        entities.recipient = recipientMatch[1].trim()
      }
      requiresConfirmation = true
      confirmationPrompt = `Are you sure you want to send this message?`
    } else if (intent === 'MEMORY') {
      const memMatch = norm.match(/(?:remember that|remind me that|save to memory)\s+(.+)/i)
      if (memMatch) {
        entities.fact = memMatch[1].trim()
        parameters.fact = memMatch[1].trim()
      }
    }

    return {
      intent,
      entities,
      parameters,
      confidence: 0.95,
      requiresConfirmation,
      confirmationPrompt
    }
  }

  /**
   * Plans multi-step execution, validates missing parameters, and requests clarification
   */
  public planExecution(parsed: ParsedVoiceCommand, rawQuery: string): ExecutionPlan {
    const steps: PlannedExecutionStep[] = []
    let stepCount = 1

    // Step 1
    steps.push({
      stepIndex: stepCount++,
      intent: parsed.intent,
      actionName: this.getActionName(parsed.intent),
      tool: this.mapIntentToTool(parsed.intent),
      parameters: parsed.parameters,
      statusDescription: this.getStatusForIntent(parsed.intent, parsed.entities),
      requiresConfirmation: parsed.requiresConfirmation,
      confirmationPrompt: parsed.confirmationPrompt
    })

    // Chained steps
    if (parsed.chainedActions && parsed.chainedActions.length > 0) {
      for (const chained of parsed.chainedActions) {
        steps.push({
          stepIndex: stepCount++,
          intent: chained.intent,
          actionName: this.getActionName(chained.intent),
          tool: this.mapIntentToTool(chained.intent),
          parameters: chained.parameters,
          statusDescription: this.getStatusForIntent(chained.intent, chained.entities),
          requiresConfirmation: chained.requiresConfirmation,
          confirmationPrompt: chained.confirmationPrompt
        })
      }
    }

    // Check missing parameter validation
    let needsClarification = false
    let clarificationQuestion: string | undefined

    if (parsed.intent === 'SEND_MESSAGE' && !parsed.entities.recipient) {
      needsClarification = true
      clarificationQuestion = 'Who would you like me to send this message to?'
    } else if (parsed.intent === 'MAKE_CALL' && !parsed.entities.contact) {
      needsClarification = true
      clarificationQuestion = 'Which contact would you like me to call?'
    }

    return {
      originalQuery: rawQuery,
      steps,
      needsClarification,
      clarificationQuestion,
      safeToExecute: !needsClarification
    }
  }

  /**
   * Context Builder: synthesizes recent turns, user memory, and system instructions
   */
  public async buildContext(
    query: string,
    _history?: Array<{ role: 'user' | 'assistant'; text: string }>
  ): Promise<{
    systemInstruction: string
    memories: string[]
  }> {
    let memories: string[] = []
    try {
      memories = await memoryService.searchMemories(query, 3)
    } catch (_e) {
      // Gracefully ignore memory retrieval error
    }

    let systemInstruction = `You are IRIS, an intelligent Voice-First Operating Layer and conversational AI.
You provide clear, concise, fluent, and direct answers optimized for natural voice speech.
Do not use verbose introductory fluff, markdown asterisks, or dense tables in speech responses.`

    if (memories.length > 0) {
      systemInstruction += `\n\n[RELEVANT USER MEMORY]:\n${memories.map((m) => `- ${m}`).join('\n')}`
    }

    return { systemInstruction, memories }
  }

  private getActionName(intent: VoiceIntentType): string {
    switch (intent) {
      case 'OPEN_APP':
        return 'Launch Application'
      case 'SEARCH':
      case 'WEB_SEARCH':
        return 'Web Search'
      case 'WEATHER':
        return 'Check Weather'
      case 'MAPS':
        return 'Navigation Lookup'
      case 'OCR':
        return 'PaddleOCR Document Scan'
      case 'MEMORY':
        return 'Save User Memory'
      default:
        return 'AI Inference'
    }
  }

  private mapIntentToTool(intent: VoiceIntentType): string | undefined {
    switch (intent) {
      case 'OPEN_APP':
        return 'appLauncher'
      case 'WEB_SEARCH':
      case 'SEARCH':
        return 'web_search'
      case 'WEATHER':
        return 'weather_lookup'
      case 'MAPS':
        return 'google_maps_directions'
      case 'OCR':
        return 'paddle_ocr_extract'
      case 'MEMORY':
        return 'save_memory'
      default:
        return undefined
    }
  }

  private getStatusForIntent(intent: VoiceIntentType, entities: Record<string, any>): string {
    switch (intent) {
      case 'OPEN_APP':
        return `Opening ${entities.app || 'application'}...`
      case 'SEARCH':
      case 'WEB_SEARCH':
        return `Searching for ${entities.query || 'information'}...`
      case 'WEATHER':
        return `Checking weather forecast...`
      case 'MAPS':
        return `Calculating route...`
      case 'OCR':
        return `Scanning document with PaddleOCR...`
      case 'MEMORY':
        return `Saving to long-term memory...`
      default:
        return 'Thinking...'
    }
  }
}

export const aiInputPipeline = new AIInputPipeline()
