/**
 * VoiceOutputService
 * ├── StreamingTTS (Sentence/clause progressive chunker)
 * ├── AudioQueue (FIFO speech queue)
 * ├── PlaybackController (Voice selection, pitch/rate, Chrome heartbeat)
 * └── InterruptHandler (Instant cancellation / barge-in)
 */

import { VoicePersonality } from './types'

export interface VoiceOutputHandlers {
  onSpeakingStart: () => void
  onSpeakingChunk: (chunk: string) => void
  onSpeakingEnd: () => void
  onInterrupted: () => void
}

export class VoiceOutputService {
  private queue: string[] = []
  private isSpeaking: boolean = false
  private isProcessingQueue: boolean = false
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private handlers: VoiceOutputHandlers
  private currentPersonality: VoicePersonality | null = null
  private heartbeatInterval: any = null
  private preferredVoice: SpeechSynthesisVoice | null = null
  private voicesLoaded: boolean = false

  // Streaming text buffer for progressive TTS
  private streamingBuffer: string = ''

  constructor(handlers: VoiceOutputHandlers) {
    this.handlers = handlers
    this.initVoices()
  }

  private initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      if (voices && voices.length > 0) {
        this.voicesLoaded = true
        if (this.currentPersonality) {
          this.resolveBestVoice(this.currentPersonality)
        }
      }
    }

    loadVoices()
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }
  }

  public setPersonality(personality: VoicePersonality) {
    this.currentPersonality = personality
    this.resolveBestVoice(personality)
  }

  private resolveBestVoice(personality: VoicePersonality) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const voices = window.speechSynthesis.getVoices()
    if (!voices || voices.length === 0) return

    const keywords = personality.preferredVoiceKeywords.map((k) => k.toLowerCase())

    // Score voices by keyword matching
    let bestMatch: SpeechSynthesisVoice | null = null
    let bestScore = -1

    for (const v of voices) {
      const name = v.name.toLowerCase()
      const lang = v.lang.toLowerCase()
      let score = 0

      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i]
        if (name.includes(kw)) {
          score += (keywords.length - i) * 3
        }
        if (lang.includes(kw)) {
          score += (keywords.length - i) * 2
        }
      }

      if (v.default) score += 1
      if (score > bestScore) {
        bestScore = score
        bestMatch = v
      }
    }

    this.preferredVoice = bestMatch || voices[0]
  }

  // ==========================================
  // STREAMING TTS FEEDER
  // ==========================================
  /**
   * Appends incoming tokens from an AI stream and progressively triggers speech
   * as soon as sentence or clause boundaries are detected.
   */
  public feedStreamToken(token: string) {
    this.streamingBuffer += token

    // Split on sentence boundaries (. ! ? ; : \n or commas if buffer > 60 chars)
    const delimiterMatch = this.streamingBuffer.match(/([.!?;\n]|,\s)/)
    if (delimiterMatch && delimiterMatch.index !== undefined) {
      const splitIndex = delimiterMatch.index + delimiterMatch[0].length
      const chunk = this.streamingBuffer.substring(0, splitIndex).trim()
      this.streamingBuffer = this.streamingBuffer.substring(splitIndex)

      if (chunk.length > 0) {
        this.enqueueChunk(chunk)
      }
    }
  }

  /**
   * Call when AI generation turn finishes to speak whatever remaining text is buffered.
   */
  public finishStream() {
    const remaining = this.streamingBuffer.trim()
    this.streamingBuffer = ''
    if (remaining.length > 0) {
      this.enqueueChunk(remaining)
    }
  }

  /**
   * Enqueues a full complete response (splits into natural sentence chunks)
   */
  public speakFullResponse(text: string) {
    this.stopSpeaking()

    // Clean markdown symbols (e.g. asterisks, backticks, hashes) that sound awkward spoken aloud
    const cleaned = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#+\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()

    // Break into natural sentence chunks < 140 chars
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

  // ==========================================
  // PLAYBACK CONTROLLER & QUEUE PROCESSOR
  // ==========================================
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

      if (this.currentPersonality) {
        utterance.pitch = this.currentPersonality.pitch
        utterance.rate = this.currentPersonality.rate
      } else {
        utterance.pitch = 1.0
        utterance.rate = 1.05
      }

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
        console.warn('[VoiceOutput] Speech chunk error/cancel:', e)
        finish()
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.warn('[VoiceOutput] Exception speaking chunk:', err)
      onDone()
    }
  }

  // ==========================================
  // CHROME HEARTBEAT (Prevents 15s pause bug)
  // ==========================================
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis && this.isSpeaking) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
      }
    }, 5000)
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  // ==========================================
  // INTERRUPT HANDLER (Barge-In)
  // ==========================================
  /**
   * Instantly aborts all playing speech, empties queue, and triggers onInterrupted.
   */
  public interrupt(): boolean {
    if (!this.isSpeaking && this.queue.length === 0 && !this.streamingBuffer) {
      return false
    }

    this.stopSpeaking()
    this.handlers.onInterrupted()
    return true
  }

  public stopSpeaking() {
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
}
