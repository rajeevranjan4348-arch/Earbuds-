/**
 * MicrophoneManager - Robust Mobile & Desktop Hardware Audio Ingestion
 *
 * Rules:
 * - Deterministic initialization using navigator.mediaDevices.getUserMedia.
 * - Strict track validation (readyState === 'live', non-empty tracks).
 * - Proper state management for the MediaStream (prevent duplicate streams/races).
 * - Robust cleanup on component unmount / modal close (stop tracks, close AudioContext, cancel RAF).
 * - Handle permission denial gracefully with clear error types.
 * - Implement AudioLifecycleComponent: start(), stop(), pause(), resume(), destroy().
 */

import { AudioLifecycleComponent } from './VoiceTypes'

export interface MicrophoneManagerOptions {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  channelCount?: number
  sampleRate?: number
}

export interface MicrophoneStateListener {
  (isActive: boolean, error?: string): void
}

export class MicrophoneManager implements AudioLifecycleComponent {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private isMuted: boolean = false
  private isPaused: boolean = false
  private animFrameId: number | null = null
  private initPromise: Promise<MediaStream> | null = null
  private stateListeners: Set<MicrophoneStateListener> = new Set()

  private options: MicrophoneManagerOptions = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  }

  constructor(options?: MicrophoneManagerOptions) {
    if (options) {
      this.options = { ...this.options, ...options }
    }
  }

  public setOptions(options: Partial<MicrophoneManagerOptions>) {
    this.options = { ...this.options, ...options }
  }

  public onStateChange(listener: MicrophoneStateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private notifyState(isActive: boolean, error?: string) {
    this.stateListeners.forEach((l) => {
      try {
        l(isActive, error)
      } catch (_e) {}
    })
  }

  /**
   * Deterministic microphone initialization with mutex / singleton promise to prevent race conditions.
   */
  public async requestMicrophone(): Promise<MediaStream> {
    // 1. If an active, healthy stream already exists, reuse it
    if (this.mediaStream && this.mediaStream.active) {
      const tracks = this.mediaStream.getAudioTracks()
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return this.mediaStream
      }
    }

    // 2. If an initialization is already in progress, wait for it
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is not supported in this browser environment.')
        }

        // Clean up any stale streams first
        this.releaseStream()

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: this.options.channelCount ?? 1,
              echoCancellation: this.options.echoCancellation ?? true,
              noiseSuppression: this.options.noiseSuppression ?? true,
              autoGainControl: this.options.autoGainControl ?? true
            }
          })
        } catch (_firstErr) {
          // Fallback to basic audio request if constraints were too strict
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        }

        // Strict track validation
        const audioTracks = stream.getAudioTracks()
        if (!audioTracks || audioTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop())
          throw new Error('No audio tracks provided by the microphone device.')
        }

        const primaryTrack = audioTracks[0]
        if (primaryTrack.readyState !== 'live') {
          stream.getTracks().forEach((t) => t.stop())
          throw new Error(`Microphone audio track is in invalid state: ${primaryTrack.readyState}`)
        }

        // Handle external device disconnection / track termination
        primaryTrack.onended = () => {
          console.warn('[MicrophoneManager] Hardware audio track ended unexpectedly.')
          this.releaseStream()
          this.notifyState(false, 'Microphone disconnected.')
        }

        this.mediaStream = stream
        this.isMuted = false
        this.isPaused = false
        this.setupAudioContext(stream)
        this.notifyState(true)

        return stream
      } catch (err: any) {
        console.warn('[MicrophoneManager] Failed to acquire microphone stream:', err)
        this.releaseStream()
        this.notifyState(false, err?.message || 'Failed to acquire microphone')
        throw err
      } finally {
        this.initPromise = null
      }
    })()

    return this.initPromise
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

      this.sourceNode = this.audioContext.createMediaStreamSource(stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.82
      this.sourceNode.connect(this.analyser)
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
    if (!this.mediaStream || !this.mediaStream.active || this.isPaused) return false
    const tracks = this.mediaStream.getAudioTracks()
    return tracks.length > 0 && tracks[0].readyState === 'live'
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

  private releaseStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.onended = null
          track.stop()
        } catch (_e) {}
      })
      this.mediaStream = null
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch (_e) {}
      this.sourceNode = null
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect()
      } catch (_e) {}
      this.analyser = null
    }
  }

  public stop(): void {
    this.stopTelemetryLoop()
    this.releaseStream()

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close().catch(() => {})
      } catch (_e) {}
      this.audioContext = null
    }

    this.isMuted = false
    this.isPaused = false
    this.notifyState(false)
  }

  public destroy(): void {
    this.stop()
    this.stateListeners.clear()
  }
}
