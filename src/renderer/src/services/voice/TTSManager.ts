/**
 * TTSManager - Streaming Text-to-Speech Engine with Instant Barge-In
 *
 * Rules:
 * - Start speaking as soon as first meaningful sentence chunk is available.
 * - Queue speech chunks efficiently without unnatural pauses.
 * - Strip markdown, JSON, code fences, and internal tool data before speaking.
 * - Instant barge-in: cancel active TTS, empty queue, clear buffer.
 * - Prevent overlapping TTS audio.
 * - Chrome 15s synthesis pause heartbeat fix.
 */

import { TextToSpeechProvider, VoicePersonality } from './VoiceTypes'

export interface TTSManagerHandlers {
  onSpeakingStart: () => void
  onSpeakingChunk: (chunk: string) => void
  onSpeakingEnd: () => void
  onInterrupted: () => void
}

export class TTSManager implements TextToSpeechProvider {
  private queue: string[] = []
  private isSpeaking: boolean = false
  private isProcessingQueue: boolean = false
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private handlers: TTSManagerHandlers
  private currentPersonality: VoicePersonality | null = null
  private heartbeatInterval: any = null
  private preferredVoice: SpeechSynthesisVoice | null = null
  private streamingBuffer: string = ''
  private speechRate: number = 1.05
  private speechPitch: number = 1.0
  private speechVolume: number = 1.0
  private isPaused: boolean = false

  constructor(handlers: TTSManagerHandlers) {
    this.handlers = handlers
    this.initVoices()
  }

  private initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices && voices.length > 0 && this.currentPersonality) {
        this.resolveBestVoice(this.currentPersonality)
      }
    }

    loadVoices()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }

  public setPersonality(personality: VoicePersonality) {
    this.currentPersonality = personality
    this.speechPitch = personality.pitch
    this.speechRate = personality.rate
    this.resolveBestVoice(personality)
  }

  public setVoiceControls(rate?: number, pitch?: number, volume?: number) {
    if (rate !== undefined) this.speechRate = Math.max(0.5, Math.min(2.0, rate))
    if (pitch !== undefined) this.speechPitch = Math.max(0.5, Math.min(1.5, pitch))
    if (volume !== undefined) this.speechVolume = Math.max(0, Math.min(1.0, volume))
  }

  private resolveBestVoice(personality: VoicePersonality) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) return

    const keywords = personality.preferredVoiceKeywords.map((k) => k.toLowerCase())
    let bestMatch: SpeechSynthesisVoice | null = null
    let bestScore = -1

    for (const v of voices) {
      const name = v.name.toLowerCase()
      const lang = v.lang.toLowerCase()
      let score = 0

      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i]
        if (name.includes(kw)) score += (keywords.length - i) * 3
        if (lang.includes(kw)) score += (keywords.length - i) * 2
      }

      if (v.default) score += 1
      if (score > bestScore) {
        bestScore = score
        bestMatch = v
      }
    }

    this.preferredVoice = bestMatch || voices[0]
  }

  /**
   * Cleans text of markdown, code fences, JSON blocks, and formatting
   */
  public cleanTextForSpeech(text: string): string {
    if (!text) return ''
    return (
      text
        // Remove code fences
        .replace(/```[\s\S]*?```/g, ' [code omitted] ')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove JSON objects
        .replace(/\{[\s\S]*?\}/g, '')
        // Remove markdown links [title](url) -> title
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove raw URLs
        .replace(/https?:\/\/\S+/g, '')
        // Remove markdown bold / italic
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove headers #
        .replace(/#+\s/g, '')
        // Remove citations like [1], [Source: ...]
        .replace(/\[\d+\]/g, '')
        .replace(/\[Source:[^\]]+\]/g, '')
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        .trim()
    )
  }

  /**
   * Appends incoming tokens from an AI stream and progressively triggers speech
   * as soon as sentence or clause boundaries are detected.
   */
  public feedStreamToken(token: string): void {
    if (this.isPaused) return
    this.streamingBuffer += token

    // Split on sentence boundaries (. ! ? ; : \n or commas if buffer > 70 chars)
    const delimiterMatch = this.streamingBuffer.match(/([.!?;\n]|\.\.\.|\b,\s)/)
    if (delimiterMatch && delimiterMatch.index !== undefined) {
      const splitIndex = delimiterMatch.index + delimiterMatch[0].length
      const rawChunk = this.streamingBuffer.substring(0, splitIndex)
      this.streamingBuffer = this.streamingBuffer.substring(splitIndex)

      const cleaned = this.cleanTextForSpeech(rawChunk)
      if (cleaned.length > 0) {
        this.enqueueChunk(cleaned)
      }
    }
  }

  /**
   * Speaks any remaining buffered text when generation finishes
   */
  public finishStream(): void {
    const remaining = this.cleanTextForSpeech(this.streamingBuffer)
    this.streamingBuffer = ''
    if (remaining.length > 0) {
      this.enqueueChunk(remaining)
    }
  }

  /**
   * Enqueues a full complete response (splits into natural sentence chunks)
   */
  public speakFullResponse(text: string): void {
    this.stopSpeaking()
    const cleaned = this.cleanTextForSpeech(text)
    if (!cleaned) return

    const sentenceRegex = /[^.!?\n]+[.!?\n]+/g
    const chunks = cleaned.match(sentenceRegex) || [cleaned]

    for (const chunk of chunks) {
      const trimmed = chunk.trim()
      if (trimmed) {
        this.enqueueChunk(trimmed)
      }
    }
  }

  private enqueueChunk(chunk: string) {
    this.queue.push(chunk)
    if (!this.isProcessingQueue) {
      this.processQueue()
    }
  }

  private processQueue() {
    if (this.queue.length === 0) {
      this.isProcessingQueue = false
      if (this.isSpeaking) {
        this.isSpeaking = false
        this.stopHeartbeat()
        this.handlers.onSpeakingEnd()
      }
      return
    }

    this.isProcessingQueue = true
    const nextChunk = this.queue.shift()!

    if (!this.isSpeaking) {
      this.isSpeaking = true
      this.handlers.onSpeakingStart()
      this.startHeartbeat()
    }

    this.handlers.onSpeakingChunk(nextChunk)
    this.speakChunk(nextChunk, () => {
      this.processQueue()
    })
  }

  private speakChunk(text: string, onDone: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      onDone()
      return
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text)
      this.currentUtterance = utterance

      if (this.preferredVoice) {
        utterance.voice = this.preferredVoice
      }

      utterance.pitch = this.speechPitch
      utterance.rate = this.speechRate
      utterance.volume = this.speechVolume

      let completed = false
      const finish = () => {
        if (!completed) {
          completed = true
          this.currentUtterance = null
          onDone()
        }
      }

      utterance.onend = () => finish()
      utterance.onerror = (e) => {
        console.warn('[TTSManager] Chunk utterance ended or cancelled:', e)
        finish()
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('[TTSManager] Utterance execution error:', err)
      onDone()
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis && this.isSpeaking) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
      }
    }, 4500)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Instantly stops all playing speech, clears queue & streaming buffer, and notifies onInterrupted.
   */
  public interrupt(): boolean {
    if (!this.isSpeaking && this.queue.length === 0 && !this.streamingBuffer) {
      return false
    }

    console.log('[TTSManager] Speech interrupted by user barge-in.')
    this.stopSpeaking()
    this.handlers.onInterrupted()
    return true
  }

  public stopSpeaking(): void {
    this.queue = []
    this.streamingBuffer = ''
    this.isProcessingQueue = false
    this.stopHeartbeat()

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel()
      } catch (_e) {}
    }

    if (this.isSpeaking) {
      this.isSpeaking = false
      this.handlers.onSpeakingEnd()
    }
    this.currentUtterance = null
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking
  }

  public start(): boolean {
    this.isPaused = false
    return true
  }

  public pause(): void {
    this.isPaused = true
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.pause()
      } catch (_e) {}
    }
  }

  public resume(): void {
    this.isPaused = false
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.resume()
      } catch (_e) {}
    }
  }

  public stop(): void {
    this.stopSpeaking()
  }

  public destroy(): void {
    this.stopSpeaking()
  }
}
