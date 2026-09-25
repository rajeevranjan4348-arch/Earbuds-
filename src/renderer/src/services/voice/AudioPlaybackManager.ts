/**
 * AudioPlaybackManager - Web Audio & Audio Context Playback Manager
 *
 * Rules:
 * - Controls audio playback pipeline.
 * - Handles volume, mute, pause, and resume.
 * - Prevents audio overlapping.
 * - Cleanly releases AudioContext and audio elements on stop/destroy.
 */

import { AudioLifecycleComponent } from './VoiceTypes'

export class AudioPlaybackManager implements AudioLifecycleComponent {
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private volume: number = 1.0
  private isMuted: boolean = false
  private isPlaying: boolean = false
  private activeAudioElements: Set<HTMLAudioElement> = new Set()

  constructor() {
    this.initContext()
  }

  private initContext() {
    if (typeof window === 'undefined') return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      this.audioContext = new AudioCtx()
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume
      this.gainNode.connect(this.audioContext.destination)
    } catch (e) {
      console.warn('[AudioPlaybackManager] AudioContext init error:', e)
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol))
    if (this.gainNode && !this.isMuted) {
      this.gainNode.gain.value = this.volume
    }
  }

  public getVolume(): number {
    return this.volume
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : this.volume
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }

  public start(): boolean {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
    }
    return true
  }

  public pause(): void {
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend().catch(() => {})
    }
    for (const el of this.activeAudioElements) {
      try {
        el.pause()
      } catch (_e) {}
    }
  }

  public resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
    }
    for (const el of this.activeAudioElements) {
      try {
        el.play().catch(() => {})
      } catch (_e) {}
    }
  }

  public stop(): void {
    this.isPlaying = false
    for (const el of this.activeAudioElements) {
      try {
        el.pause()
        el.currentTime = 0
      } catch (_e) {}
    }
    this.activeAudioElements.clear()
  }

  public destroy(): void {
    this.stop()
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close()
      } catch (_e) {}
      this.audioContext = null
    }
    this.gainNode = null
  }
}
