/**
 * VADManager - Voice Activity Detection with Noise Floor Tracking
 *
 * Rules:
 * - Start recording/committing when user speech is detected.
 * - Stop/finalize utterance after configurable silence (default 700ms).
 * - Avoid cutting off speech (min speech duration 150ms).
 * - Ignore very short transient noise bursts.
 * - Dynamically adapt noise floor to ambient background volume.
 * - Provide instant voice interruption hook.
 */

import { VoiceActivityDetectorProvider } from './VoiceTypes'

export interface VADManagerHandlers {
  onSpeechStart: () => void
  onSpeechPause: (durationMs: number) => void
  onSpeechEnd: () => void
  onInterruptionDetected?: () => void
}

export interface VADManagerOptions {
  enabled?: boolean
  silenceTimeoutMs?: number
  minSpeechDurationMs?: number
}

export class VADManager implements VoiceActivityDetectorProvider {
  private isEnabled: boolean = true
  private isSpeaking: boolean = false
  private speechStartTime: number = 0
  private silenceStartTime: number = 0
  private silenceTimer: any = null
  private noiseFloor: number = 0.03
  private speechThreshold: number = 0.06
  private silenceTimeoutMs: number = 700
  private minSpeechDurationMs: number = 150
  private handlers: VADManagerHandlers
  private isPaused: boolean = false

  constructor(handlers: VADManagerHandlers, options?: VADManagerOptions) {
    this.handlers = handlers
    if (options?.enabled !== undefined) this.isEnabled = options.enabled
    if (options?.silenceTimeoutMs !== undefined) this.silenceTimeoutMs = options.silenceTimeoutMs
    if (options?.minSpeechDurationMs !== undefined)
      this.minSpeechDurationMs = options.minSpeechDurationMs
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled
    if (!enabled) {
      this.reset()
    }
  }

  public getIsEnabled(): boolean {
    return this.isEnabled
  }

  public setSilenceTimeout(ms: number) {
    this.silenceTimeoutMs = Math.max(300, Math.min(3000, ms))
  }

  public setMinSpeechDuration(ms: number) {
    this.minSpeechDurationMs = Math.max(50, Math.min(1000, ms))
  }

  public start(): boolean {
    this.isPaused = false
    this.reset()
    return true
  }

  public pause(): void {
    this.isPaused = true
    this.reset()
  }

  public resume(): void {
    this.isPaused = false
  }

  public stop(): void {
    this.reset()
    this.isPaused = false
  }

  public destroy(): void {
    this.stop()
  }

  public reset(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.isSpeaking = false
    this.speechStartTime = 0
    this.silenceStartTime = 0
  }

  /**
   * Process normalized volume level from microphone analyser (0.0 to 1.0)
   */
  public feedAudioLevel(level: number): void {
    if (!this.isEnabled || this.isPaused) return

    const now = Date.now()

    // Smoothly track background noise floor
    if (level < this.noiseFloor * 1.6) {
      this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05
    }

    const dynamicThreshold = Math.max(this.speechThreshold, this.noiseFloor * 2.2)

    if (level > dynamicThreshold) {
      // User is actively producing vocal energy
      if (!this.isSpeaking) {
        this.speechStartTime = now
        this.isSpeaking = true
        this.handlers.onSpeechStart()
      }

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
      this.silenceStartTime = 0
    } else if (this.isSpeaking) {
      // Energy dropped below speech threshold
      if (this.silenceStartTime === 0) {
        this.silenceStartTime = now
      }

      const pauseDuration = now - this.silenceStartTime
      this.handlers.onSpeechPause(pauseDuration)

      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          if (this.isSpeaking) {
            const totalDuration = now - this.speechStartTime
            this.isSpeaking = false
            this.silenceStartTime = 0
            this.silenceTimer = null

            // Filter out transient acoustic clicks shorter than minSpeechDurationMs
            if (totalDuration >= this.minSpeechDurationMs) {
              this.handlers.onSpeechEnd()
            }
          }
        }, this.silenceTimeoutMs)
      }
    }
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking
  }
}
