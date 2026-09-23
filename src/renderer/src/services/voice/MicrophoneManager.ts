/**
 * MicrophoneManager - Robust Mobile & Desktop Hardware Audio Ingestion
 * 
 * Rules:
 * - Never activate the microphone without permission.
 * - Stop microphone streams completely when disabled.
 * - Release MediaStream tracks properly (no lingering red mic indicators).
 * - Handle permission denial gracefully.
 * - Implement AudioLifecycleComponent: start(), stop(), pause(), resume(), destroy().
 */

import { AudioLifecycleComponent } from './VoiceTypes'

export interface MicrophoneManagerOptions {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

export class MicrophoneManager implements AudioLifecycleComponent {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private isMuted: boolean = false
  private animFrameId: number | null = null
  private isPaused: boolean = false

  private options: MicrophoneManagerOptions = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }

  constructor(options?: MicrophoneManagerOptions) {
    if (options) {
      this.options = { ...this.options, ...options }
    }
  }

  public setOptions(options: Partial<MicrophoneManagerOptions>) {
    this.options = { ...this.options, ...options }
  }

  public async start(): Promise<boolean> {
    try {
      await this.requestMicrophone()
      return true
    } catch (err) {
      console.warn('[MicrophoneManager] start() failed:', err)
      return false
    }
  }

  public async requestMicrophone(): Promise<MediaStream> {
    if (this.mediaStream && this.mediaStream.active) {
      return this.mediaStream
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported by your browser environment.')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.options.echoCancellation,
          noiseSuppression: this.options.noiseSuppression,
          autoGainControl: this.options.autoGainControl
        }
      })
    } catch (_firstErr) {
      // Graceful fallback to unconstrained basic audio
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }

    const audioTracks = stream.getAudioTracks()
    if (!audioTracks || audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
      throw new Error('Microphone did not provide an active live audio track.')
    }

    this.mediaStream = stream
    this.isMuted = false
    this.isPaused = false
    this.setupAudioContext(stream)
    return stream
  }

  private setupAudioContext(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.audioContext.close()
        } catch (_e) {}
      }

      this.audioContext = new AudioCtx()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      const source = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.82
      source.connect(this.analyser)
    } catch (err) {
      console.warn('[MicrophoneManager] Analyser setup error:', err)
    }
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted
      })
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted
  }

  public getIsActive(): boolean {
    return !!(this.mediaStream && this.mediaStream.active && !this.isPaused)
  }

  public pause(): void {
    this.isPaused = true
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
    }
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend().catch(() => {})
    }
  }

  public resume(): void {
    this.isPaused = false
    if (this.mediaStream && !this.isMuted) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = true
      })
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
    }
  }

  public startTelemetryLoop(
    onAudioLevel: (level: number) => void,
    onFrequencyData?: (data: Uint8Array) => void
  ) {
    this.stopTelemetryLoop()

    const bufferLength = this.analyser ? this.analyser.frequencyBinCount : 256
    const dataArray = new Uint8Array(bufferLength)

    const tick = () => {
      if (!this.mediaStream || !this.mediaStream.active || this.isPaused || this.isMuted) {
        onAudioLevel(0)
        if (this.mediaStream && this.mediaStream.active) {
          this.animFrameId = requestAnimationFrame(tick)
        }
        return
      }

      if (this.analyser) {
        this.analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(avg / 128, 1)
        onAudioLevel(normalized)
        if (onFrequencyData) {
          onFrequencyData(dataArray)
        }
      } else {
        onAudioLevel(0)
      }

      this.animFrameId = requestAnimationFrame(tick)
    }

    this.animFrameId = requestAnimationFrame(tick)
  }

  public stopTelemetryLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  public stop(): void {
    this.stopTelemetryLoop()
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (_e) {}
      })
      this.mediaStream = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close()
      } catch (_e) {}
      this.audioContext = null
    }

    this.analyser = null
    this.isMuted = false
    this.isPaused = false
  }

  public destroy(): void {
    this.stop()
  }
}
