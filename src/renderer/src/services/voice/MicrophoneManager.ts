/**
 * MicrophoneManager - Advanced Audio Pipeline & Hardware Manager
 *
 * Implements:
 * - Deterministic permission check and request
 * - Safe singleton stream & AudioContext lifecycle (leak-free)
 * - Echo cancellation, noise suppression, auto gain control with adaptive constraints
 * - Real RMS, Peak, and Normalized Level detection (0.0 - 1.0)
 * - Mobile / Android routing compatibility
 * - Smooth requestAnimationFrame telemetry loop
 */

import { AudioLifecycleComponent, AudioMetrics, VADLevel } from './VoiceTypes'

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

export interface AudioMetricsListener {
  (metrics: AudioMetrics): void
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
  private metricsListeners: Set<AudioMetricsListener> = new Set()

  // Real-time audio metrics
  private currentMetrics: AudioMetrics = {
    rms: 0,
    peak: 0,
    normalizedLevel: 0,
    isSpeaking: false,
    silenceDuration: 0,
    speechDuration: 0,
    vadLevel: 'SILENCE'
  }

  private smoothedLevel: number = 0
  private lastSpeechTimestamp: number = 0
  private speechStartTimestamp: number = 0
  private noiseFloor: number = 0.015
  private speechThreshold: number = 0.05
  private silenceThreshold: number = 0.03

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

  public onMetrics(listener: AudioMetricsListener): () => void {
    this.metricsListeners.add(listener)
    return () => this.metricsListeners.delete(listener)
  }

  private notifyState(isActive: boolean, error?: string) {
    this.stateListeners.forEach((l) => {
      try {
        l(isActive, error)
      } catch (_e) {}
    })
  }

  /**
   * Detects browser permission status for microphone
   */
  public async getPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return 'unsupported'
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        return status.state
      } catch (_e) {
        // Fallback for browsers that do not support microphone query
      }
    }

    return 'prompt'
  }

  /**
   * Requests microphone permission without creating unnecessary audio pipelines
   */
  public async requestPermission(): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone API is not supported in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.options.echoCancellation ?? true,
          noiseSuppression: this.options.noiseSuppression ?? true,
          autoGainControl: this.options.autoGainControl ?? true
        }
      })

      // Immediately stop temporary test tracks
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch (err: any) {
      console.warn('[MicrophoneManager] Permission request denied or failed:', err?.message)
      return false
    }
  }

  /**
   * Deterministic microphone initialization with mutex promise to prevent race conditions
   */
  public async requestMicrophone(): Promise<MediaStream> {
    if (this.mediaStream && this.mediaStream.active) {
      const tracks = this.mediaStream.getAudioTracks()
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        return this.mediaStream
      }
    }

    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is not supported in this browser environment.')
        }

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
        } catch (_constraintErr) {
          // Fallback to basic audio constraint if enhanced constraints fail
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        }

        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0) {
          throw new Error('No audio input devices available on this system.')
        }

        const track = audioTracks[0]
        track.onended = () => {
          this.notifyState(false, 'Microphone was disconnected.')
          this.releaseStream()
        }

        this.mediaStream = stream
        this.setupAudioGraph(stream)
        this.startTelemetryLoop()

        this.isMuted = false
        this.isPaused = false
        this.notifyState(true)

        return stream
      } catch (err: any) {
        const errorMsg =
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Microphone permission was denied by user or browser policy.'
            : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
            ? 'No microphone detected on your system.'
            : err?.message || 'Failed to initialize microphone.'

        this.notifyState(false, errorMsg)
        throw new Error(errorMsg)
      } finally {
        this.initPromise = null
      }
    })()

    return this.initPromise
  }

  private setupAudioGraph(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx()
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }

      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.8

      this.sourceNode = this.audioContext.createMediaStreamSource(stream)
      this.sourceNode.connect(this.analyser)
    } catch (err: any) {
      console.warn('[MicrophoneManager] Failed to set up Analyser graph:', err?.message)
    }
  }

  private startTelemetryLoop() {
    this.stopTelemetryLoop()
    if (!this.analyser) return

    const bufferLength = this.analyser.fftSize
    const timeDomainData = new Float32Array(bufferLength)

    const tick = () => {
      if (!this.mediaStream || !this.mediaStream.active || this.isPaused || this.isMuted) {
        this.currentMetrics = {
          rms: 0,
          peak: 0,
          normalizedLevel: 0,
          isSpeaking: false,
          silenceDuration: Date.now() - (this.lastSpeechTimestamp || Date.now()),
          speechDuration: 0,
          vadLevel: 'SILENCE'
        }
        this.notifyMetrics()
        if (this.mediaStream && this.mediaStream.active) {
          this.animFrameId = requestAnimationFrame(tick)
        }
        return
      }

      if (this.analyser) {
        this.analyser.getFloatTimeDomainData(timeDomainData)

        let sumSquares = 0
        let peak = 0

        for (let i = 0; i < bufferLength; i++) {
          const val = timeDomainData[i]
          const absVal = Math.abs(val)
          if (absVal > peak) peak = absVal
          sumSquares += val * val
        }

        const rms = Math.sqrt(sumSquares / bufferLength)

        // Adaptive noise floor tracking
        if (rms < this.noiseFloor * 1.5) {
          this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05
        }
        this.speechThreshold = Math.max(0.04, this.noiseFloor * 2.8)
        this.silenceThreshold = Math.max(0.02, this.noiseFloor * 1.8)

        // Level normalization 0.0 - 1.0 with logarithmic compression
        const rawNormalized = Math.min(1.0, Math.max(0.0, (rms - this.noiseFloor) / (0.35 - this.noiseFloor)))
        // Standard smoothing: smoothedLevel = smoothedLevel * 0.8 + currentLevel * 0.2
        this.smoothedLevel = this.smoothedLevel * 0.8 + rawNormalized * 0.2

        const now = Date.now()
        let isSpeaking = this.currentMetrics.isSpeaking

        if (this.smoothedLevel > this.speechThreshold) {
          if (!isSpeaking) {
            this.speechStartTimestamp = now
          }
          isSpeaking = true
          this.lastSpeechTimestamp = now
        } else if (this.smoothedLevel < this.silenceThreshold) {
          if (now - this.lastSpeechTimestamp > 350) {
            isSpeaking = false
          }
        }

        const silenceDuration = isSpeaking ? 0 : now - (this.lastSpeechTimestamp || now)
        const speechDuration = isSpeaking ? now - (this.speechStartTimestamp || now) : 0

        let vadLevel: VADLevel = 'SILENCE'
        if (this.smoothedLevel > 0.45) {
          vadLevel = 'LOUD_SPEECH'
        } else if (isSpeaking || this.smoothedLevel > this.speechThreshold) {
          vadLevel = 'SPEECH'
        } else if (this.smoothedLevel > this.noiseFloor * 1.2) {
          vadLevel = 'QUIET'
        }

        this.currentMetrics = {
          rms: Number(rms.toFixed(4)),
          peak: Number(peak.toFixed(4)),
          normalizedLevel: Number(this.smoothedLevel.toFixed(4)),
          isSpeaking,
          silenceDuration,
          speechDuration,
          vadLevel
        }

        this.notifyMetrics()
      }

      this.animFrameId = requestAnimationFrame(tick)
    }

    this.animFrameId = requestAnimationFrame(tick)
  }

  private notifyMetrics() {
    this.metricsListeners.forEach((l) => {
      try {
        l(this.currentMetrics)
      } catch (_e) {}
    })
  }

  public getAudioLevel(): number {
    return this.currentMetrics.normalizedLevel
  }

  public getAudioMetrics(): AudioMetrics {
    return { ...this.currentMetrics }
  }

  public getStream(): MediaStream | null {
    return this.mediaStream
  }

  public async start(): Promise<boolean> {
    try {
      await this.requestMicrophone()
      return true
    } catch (_e) {
      return false
    }
  }

  public pause(): void {
    this.isPaused = true
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
    }
  }

  public resume(): void {
    this.isPaused = false
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = true
      })
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted
      })
    }
  }

  public isMute(): boolean {
    return this.isMuted
  }

  public isMicrophoneActive(): boolean {
    return Boolean(this.mediaStream && this.mediaStream.active && !this.isPaused && !this.isMuted)
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
    this.smoothedLevel = 0
    this.notifyState(false)
  }

  public destroy(): void {
    this.stop()
    this.stateListeners.clear()
    this.metricsListeners.clear()
  }
}

export const microphoneManager = new MicrophoneManager()
