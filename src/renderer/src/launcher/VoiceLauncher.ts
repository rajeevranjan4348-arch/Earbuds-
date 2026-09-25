import { IntentResolver } from './IntentResolver'
import { launchManager } from './LaunchManager'
import { LaunchResult } from './types'

export type VoiceLauncherState = 'idle' | 'listening' | 'processing' | 'success' | 'error'

export interface VoiceLauncherCallbacks {
  onStateChange?: (state: VoiceLauncherState, message?: string) => void
  onTranscript?: (transcript: string, isFinal: boolean) => void
  onLaunchComplete?: (result: LaunchResult) => void
}

export class VoiceLauncher {
  private recognition: any = null
  private isListening = false
  private callbacks: VoiceLauncherCallbacks = {}

  constructor() {
    this.initRecognition()
  }

  private initRecognition() {
    if (typeof window === 'undefined') return
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition()
        this.recognition.continuous = false
        this.recognition.interimResults = true
        this.recognition.lang = 'en-US'

        this.recognition.onstart = () => {
          this.isListening = true
          this.callbacks.onStateChange?.('listening', 'Listening for app command...')
        }

        this.recognition.onresult = (event: any) => {
          let interim = ''
          let final = ''

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript
            } else {
              interim += event.results[i][0].transcript
            }
          }

          if (interim) {
            this.callbacks.onTranscript?.(interim, false)
          }

          if (final) {
            this.callbacks.onTranscript?.(final, true)
            this.handleFinalTranscript(final)
          }
        }

        this.recognition.onerror = (event: any) => {
          console.warn('[VoiceLauncher] Speech error:', event.error)
          this.isListening = false
          this.callbacks.onStateChange?.('error', `Microphone error: ${event.error}`)
        }

        this.recognition.onend = () => {
          this.isListening = false
          this.callbacks.onStateChange?.('idle')
        }
      } catch (err) {
        console.warn('[VoiceLauncher] Could not initialize Web Speech API:', err)
      }
    }
  }

  public setCallbacks(callbacks: VoiceLauncherCallbacks) {
    this.callbacks = callbacks
  }

  public async startListening(currentTab?: string): Promise<boolean> {
    if (this.isListening) {
      this.stopListening()
      return false
    }

    if (!this.recognition) {
      this.initRecognition()
    }

    if (!this.recognition) {
      this.callbacks.onStateChange?.('error', 'Voice recognition unsupported in this browser.')
      return false
    }

    try {
      this.recognition.start()
      return true
    } catch (err: any) {
      console.error('[VoiceLauncher] Failed to start recognition:', err)
      this.callbacks.onStateChange?.('error', 'Could not access microphone.')
      return false
    }
  }

  public stopListening() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop()
      } catch (_e) {}
    }
    this.isListening = false
    this.callbacks.onStateChange?.('idle')
  }

  public async handleFinalTranscript(
    transcript: string,
    currentTab?: string
  ): Promise<LaunchResult> {
    this.callbacks.onStateChange?.('processing', 'Resolving command...')

    const intent = IntentResolver.resolve(transcript, currentTab)

    if (!intent.app) {
      const result: LaunchResult = {
        success: false,
        status: 'APP_NOT_FOUND',
        message: `No application matching "${transcript}".`,
        spokenResponse: "I couldn't find an application matching that name."
      }
      this.callbacks.onStateChange?.('error', result.message)
      this.speakFeedback(result.spokenResponse!)
      this.callbacks.onLaunchComplete?.(result)
      return result
    }

    const launchRes = await launchManager.launch(intent.app, intent.secondaryParam)

    if (launchRes.success) {
      this.callbacks.onStateChange?.('success', launchRes.message)
      if (launchRes.spokenResponse) {
        this.speakFeedback(launchRes.spokenResponse)
      }
    } else {
      this.callbacks.onStateChange?.('error', launchRes.message)
      if (launchRes.spokenResponse) {
        this.speakFeedback(launchRes.spokenResponse)
      }
    }

    this.callbacks.onLaunchComplete?.(launchRes)
    return launchRes
  }

  /**
   * Speaks vocal feedback using Web Speech API synthesis
   */
  private speakFeedback(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0
      window.speechSynthesis.speak(utterance)
    } catch (_e) {}
  }
}

export const voiceLauncher = new VoiceLauncher()
