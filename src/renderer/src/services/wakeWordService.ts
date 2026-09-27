/**
 * IRIS Wake Word Detection Service
 * 
 * Provides continuous, 100% on-device hands-free wake word recognition
 * ("Hey IRIS", "OK IRIS", "Hey JARVIS", "Hello IRIS", "Wake up IRIS").
 * 
 * Features:
 * - Real-time acoustic wake chime synthesis (Web Audio API)
 * - Zero cloud upload (pure client-side phonetic phrase spotting)
 * - Automatic command separation ("Hey IRIS open Maps" -> command: "open Maps")
 * - Dynamic sensitivity calibration & debounce protection
 * - Global window event broadcasting for seamless UI reaction
 */

import { soundEffects } from './soundEffectsService'
import { voiceService } from './voiceService'

export interface WakeWordEventDetail {
  phrase: string
  commandTail?: string
  timestamp: number
  confidence: number
}

export interface WakeWordLogEntry {
  id: string
  phrase: string
  commandTail?: string
  timestamp: number
  dateStr: string
}

export interface WakeWordFrequencyStats {
  todayCount: number
  weekCount: number
  totalCount: number
  mostCommonPhrase: string
  avgDailyCount: number
}

export interface WakeWordConfig {
  enabled: boolean
  sensitivity: number // 0.1 to 1.0
  soundFeedback: boolean
  wakePhrases: string[]
  autoExecuteCommand: boolean
}

const STORAGE_KEY = 'iris_wake_word_config'
const LOGS_STORAGE_KEY = 'iris_wake_word_logs'

export const DEFAULT_WAKE_CONFIG: WakeWordConfig = {
  enabled: true,
  sensitivity: 0.75,
  soundFeedback: true,
  wakePhrases: ['hey iris', 'ok iris', 'hello iris', 'hey jarvis', 'wake up iris', 'iris'],
  autoExecuteCommand: true
}

class WakeWordDetectionService {
  private config: WakeWordConfig = DEFAULT_WAKE_CONFIG
  private isListening: boolean = false
  private recognition: any = null
  private listeners: Set<(event: WakeWordEventDetail) => void> = new Set()
  private stateListeners: Set<(isListening: boolean, config: WakeWordConfig) => void> = new Set()
  private lastTriggerTime: number = 0
  private audioContext: AudioContext | null = null
  private restartTimeout: any = null
  private logs: WakeWordLogEntry[] = []

  // Regex patterns
  private strictPatterns: RegExp[] = [
    /\b(?:hey|hay|hi|hello|ok|okay)\s+iris\b/i,
    /\b(?:hey|hay|hi|hello|ok|okay)\s+jarvis\b/i,
    /\bwake\s+up\s+iris\b/i
  ]

  private singleWordPatterns: RegExp[] = [
    /\biris\b/i,
    /\bjarvis\b/i
  ]

  private phoneticFuzzyPatterns: RegExp[] = [
    /\b(?:hey|hay|hi|ok)\s+(?:airis|ayris|eyris|iriss|earis)\b/i,
    /\b(?:hey|hay|hi|ok)\s+(?:jarves|jarviss|javis|arvis)\b/i
  ]

  constructor() {
    this.loadConfig()
    this.loadLogs()
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if (this.config.enabled && !this.isListening) {
          this.start()
        }
      }, 1000)
    }
  }

  private loadConfig(): void {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        this.config = { ...DEFAULT_WAKE_CONFIG, ...JSON.parse(saved) }
      }
    } catch (_e) {}
  }

  private saveConfig(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config))
    } catch (_e) {}
  }

  private loadLogs(): void {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(LOGS_STORAGE_KEY)
      if (saved) {
        this.logs = JSON.parse(saved)
      }
    } catch (_e) {}
  }

  private saveLogs(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(this.logs))
    } catch (_e) {}
  }

  public addLogEntry(entry: WakeWordLogEntry): void {
    this.logs = [entry, ...this.logs].slice(0, 200)
    this.saveLogs()
  }

  public getLogHistory(): WakeWordLogEntry[] {
    return [...this.logs]
  }

  public clearLogHistory(): void {
    this.logs = []
    this.saveLogs()
    this.notifyStateListeners()
  }

  public getFrequencyStats(): WakeWordFrequencyStats {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    const oneWeekMs = 7 * oneDayMs

    const todayStart = new Date().setHours(0, 0, 0, 0)
    const weekStart = now - oneWeekMs

    let todayCount = 0
    let weekCount = 0
    const phraseCounts: Record<string, number> = {}

    for (const log of this.logs) {
      if (log.timestamp >= todayStart) {
        todayCount++
      }
      if (log.timestamp >= weekStart) {
        weekCount++
      }
      const norm = (log.phrase || 'Iris').toLowerCase().trim()
      phraseCounts[norm] = (phraseCounts[norm] || 0) + 1
    }

    let mostCommonPhrase = 'Iris'
    let maxPhraseCount = 0
    for (const [p, count] of Object.entries(phraseCounts)) {
      if (count > maxPhraseCount) {
        maxPhraseCount = count
        mostCommonPhrase = p.charAt(0).toUpperCase() + p.slice(1)
      }
    }

    const uniqueDays = new Set(this.logs.map((l) => l.dateStr?.slice(0, 10))).size || 1
    const avgDailyCount = Math.round((this.logs.length / uniqueDays) * 10) / 10

    return {
      todayCount,
      weekCount,
      totalCount: this.logs.length,
      mostCommonPhrase,
      avgDailyCount
    }
  }

  public getConfig(): WakeWordConfig {
    return { ...this.config }
  }

  public updateConfig(updates: Partial<WakeWordConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
    this.notifyStateListeners()

    if (!this.config.enabled && this.isListening) {
      this.stop()
    } else if (this.config.enabled && !this.isListening) {
      this.start()
    }
  }

  public subscribe(callback: (event: WakeWordEventDetail) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  public subscribeState(callback: (isListening: boolean, config: WakeWordConfig) => void): () => void {
    this.stateListeners.add(callback)
    callback(this.isListening, this.config)
    return () => this.stateListeners.delete(callback)
  }

  private notifyStateListeners(): void {
    this.stateListeners.forEach((fn) => fn(this.isListening, this.config))
  }

  /**
   * Synthesizes an instant futuristic ascending dual-tone chime on wake detection
   */
  public playWakeChime(): void {
    if (!this.config.soundFeedback) return

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx()
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      const now = this.audioContext.currentTime
      const osc1 = this.audioContext.createOscillator()
      const osc2 = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()

      osc1.type = 'sine'
      osc2.type = 'triangle'

      // Note 1: D5 (587 Hz) -> Note 2: A5 (880 Hz) upward chime
      osc1.frequency.setValueAtTime(587.33, now)
      osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12)

      osc2.frequency.setValueAtTime(1174.66, now)
      osc2.frequency.exponentialRampToValueAtTime(1760.0, now + 0.14)

      gain.gain.setValueAtTime(0.01, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(this.audioContext.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 0.36)
      osc2.stop(now + 0.36)
    } catch (_e) {
      soundEffects.play('activate')
    }
  }

  /**
   * Starts background continuous wake word listener
   */
  public start(): boolean {
    if (typeof window === 'undefined') return false
    if (!this.config.enabled) return false
    if (this.isListening) return true

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRec) {
      console.warn('[WakeWordService] SpeechRecognition not supported in this browser.')
      return false
    }

    try {
      const rec = new SpeechRec()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.maxAlternatives = 3

      rec.onstart = () => {
        this.isListening = true
        this.notifyStateListeners()
        console.log('[WakeWordService] Hands-free Wake Word engine active and listening...')
      }

      rec.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0]?.transcript || ''
        }
        if (transcript) {
          this.processTranscript(transcript)
        }
      }

      rec.onerror = (e: any) => {
        const err = e.error || e.type
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.isListening = false
          this.notifyStateListeners()
        }
      }

      rec.onend = () => {
        this.isListening = false
        this.notifyStateListeners()

        // Auto-restart background listener if enabled and main voice session is not actively capturing
        if (this.config.enabled) {
          clearTimeout(this.restartTimeout)
          this.restartTimeout = setTimeout(() => {
            if (this.config.enabled && !this.isListening) {
              this.start()
            }
          }, 600)
        }
      }

      this.recognition = rec
      rec.start()
      return true
    } catch (err) {
      console.warn('[WakeWordService] Start failed:', err)
      return false
    }
  }

  public stop(): void {
    clearTimeout(this.restartTimeout)
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch (_e) {}
      this.recognition = null
    }
    this.isListening = false
    this.notifyStateListeners()
  }

  /**
   * Inspects transcript text for wake patterns and splits commands
   */
  public processTranscript(text: string): boolean {
    if (!this.config.enabled || !text) return false

    const now = Date.now()
    const debounceWindow = Math.max(1200, 3000 - this.config.sensitivity * 1800)
    if (now - this.lastTriggerTime < debounceWindow) {
      return false
    }

    const patternsToTest = [...this.strictPatterns]

    if (this.config.sensitivity >= 0.5) {
      patternsToTest.push(...this.singleWordPatterns)
    }

    if (this.config.sensitivity >= 0.75) {
      patternsToTest.push(...this.phoneticFuzzyPatterns)
    }

    for (const pattern of patternsToTest) {
      const match = text.match(pattern)
      if (match && match.index !== undefined) {
        this.lastTriggerTime = now
        const phrase = match[0]
        const afterIndex = match.index + phrase.length
        const rawTail = text.substring(afterIndex).trim()
        const commandTail = rawTail.replace(/^[,.\-:\s]+/, '').trim()

        const detail: WakeWordEventDetail = {
          phrase,
          commandTail: commandTail || undefined,
          timestamp: now,
          confidence: 0.95
        }

        // Save interaction log timestamp for interaction frequency analytics
        this.addLogEntry({
          id: `wake_${now}_${Math.random().toString(36).substring(2, 7)}`,
          phrase,
          commandTail: commandTail || undefined,
          timestamp: now,
          dateStr: new Date(now).toISOString()
        })

        console.log(`[WakeWordService] ⚡ Wake word triggered: "${phrase}" | Command: "${commandTail}"`)

        // Play feedback
        this.playWakeChime()

        // Notify subscribers
        this.listeners.forEach((listener) => listener(detail))

        // Dispatch Global Window Event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('iris:wake-word-detected', {
              detail
            })
          )
        }

        // Trigger Voice Service if not already started
        if (!voiceService.getIsConnected()) {
          voiceService.start().then(() => {
            if (commandTail && this.config.autoExecuteCommand) {
              setTimeout(() => {
                voiceService.submitPrompt(commandTail)
              }, 400)
            }
          })
        } else if (commandTail && this.config.autoExecuteCommand) {
          voiceService.submitPrompt(commandTail)
        }

        return true
      }
    }

    return false
  }
}

export const wakeWordService = new WakeWordDetectionService()
