/**
 * WakeWordDetector - Hands-Free Client-Side "Hey JARVIS" Wake Engine
 * 
 * Rules:
 * - Continuously monitors microphone only when Wake Word Mode is enabled.
 * - Detects wake phrases 100% locally.
 * - Never uploads raw audio to any server.
 * - Prevents accidental repeated activation with dynamic debouncing.
 * - Configurable sensitivity and complete disable toggle.
 */

import { WakeWordProvider } from './VoiceTypes'

export interface WakeWordDetectorHandlers {
  onWakeWordDetected: (phrase: string, commandTail?: string) => void
}

export class WakeWordDetector implements WakeWordProvider {
  private isEnabled: boolean = false
  private sensitivity: number = 0.7 // 0.1 to 1.0
  private handlers: WakeWordDetectorHandlers
  private lastTriggerTime: number = 0
  private isPaused: boolean = false

  // Regex patterns supporting strict vs relaxed phonetic matches based on sensitivity
  private basePatterns: RegExp[] = [
    /\bhey\s+jarvis\b/i,
    /\bok\s+jarvis\b/i,
    /\bhello\s+jarvis\b/i,
    /\bhey\s+iris\b/i,
    /\bok\s+iris\b/i,
    /\bhello\s+iris\b/i
  ]

  private singleWordPatterns: RegExp[] = [
    /\bjarvis\b/i,
    /\biris\b/i
  ]

  // Phonetic fuzzy patterns for noisy environments / mobile microphones
  private relaxedPatterns: RegExp[] = [
    /\b(?:hey|hay|hi|ok)\s+(?:jarvis|jarves|jarviss|javis|arvis)\b/i,
    /\b(?:hey|hay|hi|ok)\s+(?:iris|iriss|eyris|ayris)\b/i
  ]

  constructor(handlers: WakeWordDetectorHandlers, enabled: boolean = false, sensitivity: number = 0.7) {
    this.handlers = handlers
    this.isEnabled = enabled
    this.sensitivity = sensitivity
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  public getIsEnabled(): boolean {
    return this.isEnabled
  }

  public setSensitivity(sensitivity: number) {
    this.sensitivity = Math.max(0.1, Math.min(1.0, sensitivity))
  }

  public getSensitivity(): number {
    return this.sensitivity
  }

  public start(): boolean {
    this.isPaused = false
    return true
  }

  public pause(): void {
    this.isPaused = true
  }

  public resume(): void {
    this.isPaused = false
  }

  public stop(): void {
    this.isPaused = false
  }

  public destroy(): void {
    this.stop()
  }

  /**
   * Scans recognized partial/interim and final transcripts locally in memory.
   * Never uploads audio or tokens to external servers.
   */
  public checkText(text: string): boolean {
    if (!this.isEnabled || this.isPaused || !text) return false

    const now = Date.now()
    // Dynamic debounce: Higher sensitivity allows faster re-activation; default 2000ms
    const debounceWindow = Math.max(1200, 3000 - this.sensitivity * 1800)
    if (now - this.lastTriggerTime < debounceWindow) {
      return false
    }

    const patternsToTest = [...this.basePatterns]

    // If sensitivity > 0.5, include single word triggers ("JARVIS", "IRIS")
    if (this.sensitivity >= 0.5) {
      patternsToTest.push(...this.singleWordPatterns)
    }

    // If sensitivity > 0.75, include relaxed phonetic approximations
    if (this.sensitivity >= 0.75) {
      patternsToTest.push(...this.relaxedPatterns)
    }

    for (const pattern of patternsToTest) {
      const match = text.match(pattern)
      if (match && match.index !== undefined) {
        this.lastTriggerTime = now
        const phrase = match[0]
        const afterWakeIndex = match.index + phrase.length
        const rawTail = text.substring(afterWakeIndex).trim()
        // Strip common leading punctuations from tail
        const commandTail = rawTail.replace(/^[,.\-:\s]+/, '')

        console.log(`[WakeWordDetector] Wake word detected: "${phrase}", command tail: "${commandTail}"`)
        this.handlers.onWakeWordDetected(phrase, commandTail)
        return true
      }
    }

    return false
  }
}
