/**
 * AudioManager - Composite Audio Pipeline Orchestrator
 * 
 * Hierarchy:
 * AudioManager
 * ├── MicrophoneManager
 * ├── WakeWordDetector
 * ├── VADManager
 * ├── SpeechRecognitionManager
 * ├── TTSManager
 * └── AudioPlaybackManager
 * 
 * Rules:
 * - All components implement AudioLifecycleComponent: start(), stop(), pause(), resume(), destroy().
 * - Ensure event listeners, media streams, AudioContext instances, and timers are cleaned up cleanly.
 * - Mobile & Android battery and memory optimized.
 */

import { AudioLifecycleComponent, SupportedLanguage, VoicePersonality } from './VoiceTypes'
import { MicrophoneManager } from './MicrophoneManager'
import { WakeWordDetector } from './WakeWordDetector'
import { VADManager } from './VADManager'
import { SpeechRecognitionManager } from './SpeechRecognitionManager'
import { TTSManager } from './TTSManager'
import { AudioPlaybackManager } from './AudioPlaybackManager'

export interface AudioManagerCallbacks {
  onWakeWordDetected: (phrase: string, commandTail?: string) => void
  onSpeechStart: () => void
  onSpeechPause: (durationMs: number) => void
  onSpeechEnd: () => void
  onInterimTranscript: (text: string, confidence?: number) => void
  onFinalTranscript: (text: string, language?: string, confidence?: number) => void
  onAudioLevel: (level: number) => void
  onFrequencyData?: (data: Uint8Array) => void
  onSpeakingStart: () => void
  onSpeakingChunk: (chunk: string) => void
  onSpeakingEnd: () => void
  onInterrupted: () => void
  onError: (error: string) => void
}

export class AudioManager implements AudioLifecycleComponent {
  public micManager: MicrophoneManager
  public wakeDetector: WakeWordDetector
  public vad: VADManager
  public speechRec: SpeechRecognitionManager
  public tts: TTSManager
  public playback: AudioPlaybackManager

  private callbacks: AudioManagerCallbacks
  private isRunning: boolean = false
  private isPaused: boolean = false

  constructor(callbacks: AudioManagerCallbacks) {
    this.callbacks = callbacks

    this.micManager = new MicrophoneManager()

    this.wakeDetector = new WakeWordDetector({
      onWakeWordDetected: (phrase, tail) => {
        this.callbacks.onWakeWordDetected(phrase, tail)
      }
    })

    this.vad = new VADManager({
      onSpeechStart: () => {
        this.callbacks.onSpeechStart()
      },
      onSpeechPause: (dur) => {
        this.callbacks.onSpeechPause(dur)
      },
      onSpeechEnd: () => {
        this.speechRec.commitInterimNow()
        this.callbacks.onSpeechEnd()
      }
    })

    this.speechRec = new SpeechRecognitionManager({
      onInterimTranscript: (text, confidence) => {
        this.callbacks.onInterimTranscript(text, confidence)
        if (this.wakeDetector.getIsEnabled()) {
          this.wakeDetector.checkText(text)
        }
      },
      onFinalTranscript: (text, lang, confidence) => {
        if (this.wakeDetector.getIsEnabled()) {
          const triggered = this.wakeDetector.checkText(text)
          if (triggered) return
        }
        this.callbacks.onFinalTranscript(text, lang, confidence)
      },
      onError: (err) => {
        this.callbacks.onError(err)
      },
      onEnd: () => {}
    })

    this.tts = new TTSManager({
      onSpeakingStart: () => this.callbacks.onSpeakingStart(),
      onSpeakingChunk: (chunk) => this.callbacks.onSpeakingChunk(chunk),
      onSpeakingEnd: () => this.callbacks.onSpeakingEnd(),
      onInterrupted: () => this.callbacks.onInterrupted()
    })

    this.playback = new AudioPlaybackManager()
  }

  public async start(): Promise<boolean> {
    if (this.isRunning) return true
    try {
      this.isRunning = true
      this.isPaused = false

      let stream: MediaStream | null = null
      try {
        stream = await this.micManager.requestMicrophone()
        this.micManager.startTelemetryLoop(
          (level) => {
            this.callbacks.onAudioLevel(level)
            this.vad.feedAudioLevel(level)
          },
          (data) => {
            this.callbacks.onFrequencyData?.(data)
          }
        )
      } catch (streamErr: any) {
        console.warn('[AudioManager] Hardware stream acquisition failed, falling back directly to speech recognition:', streamErr?.message)
      }

      this.wakeDetector.start()
      this.vad.start()
      this.playback.start()
      this.speechRec.start(stream || undefined)
      this.tts.start()

      return true
    } catch (err: any) {
      this.isRunning = false
      console.error('[AudioManager] Failed to start:', err)
      this.callbacks.onError(err?.message || 'Audio pipeline failed to start.')
      return false
    }
  }

  public pause(): void {
    this.isPaused = true
    this.micManager.pause()
    this.wakeDetector.pause()
    this.vad.pause()
    this.speechRec.pause()
    this.tts.pause()
    this.playback.pause()
  }

  public resume(): void {
    this.isPaused = false
    this.micManager.resume()
    this.wakeDetector.resume()
    this.vad.resume()
    this.speechRec.resume()
    this.tts.resume()
    this.playback.resume()
  }

  public stop(): void {
    this.isRunning = false
    this.isPaused = false
    this.speechRec.stop()
    this.vad.stop()
    this.wakeDetector.stop()
    this.tts.stop()
    this.playback.stop()
    this.micManager.stop()
    this.callbacks.onAudioLevel(0)
  }

  public destroy(): void {
    this.stop()
    this.micManager.destroy()
    this.speechRec.destroy()
    this.vad.destroy()
    this.wakeDetector.destroy()
    this.tts.destroy()
    this.playback.destroy()
  }

  public setLanguage(lang: SupportedLanguage): void {
    this.speechRec.setLanguage(lang)
  }

  public setPersonality(personality: VoicePersonality): void {
    this.tts.setPersonality(personality)
  }

  public setWakeWordEnabled(enabled: boolean): void {
    this.wakeDetector.setEnabled(enabled)
  }

  public setMuted(muted: boolean): void {
    this.micManager.setMuted(muted)
    if (muted) {
      this.speechRec.pause()
    } else {
      this.speechRec.resume()
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning
  }
}
