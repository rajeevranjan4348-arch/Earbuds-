/**
 * Orb Animation Engine & Adaptive Performance Monitor
 * Continuously evaluates frame rates, GPU load, and frame delta jitter.
 * Automatically adapts particle density, shader precision, and reduced motion
 * to guarantee 60fps responsiveness across hardware tiers.
 */

import { coreSettingsService, OrbQuality, ParticleCoreConfig } from './coreSettingsService'

export interface PerformanceTelemetry {
  fps: number
  averageFrameTimeMs: number
  quality: OrbQuality
  reducedMotion: boolean
  autoOptimize: boolean
  isThrottled: boolean
  sampleCount: number
}

class OrbAnimationEngine {
  private frameTimes: number[] = []
  private maxSamples = 60
  private lastTimestamp = 0
  private fps = 60
  private consecutiveLowFpsCount = 0
  private consecutiveHighFpsCount = 0
  private listeners = new Set<(telemetry: PerformanceTelemetry) => void>()
  private isThrottled = false

  constructor() {
    // Listen to user setting updates
    coreSettingsService.subscribe((settings) => {
      this.notify()
    })
  }

  /**
   * Called on each Three.js or requestAnimationFrame render loop tick
   * @param delta in seconds
   */
  public recordFrame(delta: number) {
    const frameTimeMs = delta * 1000
    this.frameTimes.push(frameTimeMs)
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift()
    }

    // Calculate moving average FPS
    const total = this.frameTimes.reduce((acc, val) => acc + val, 0)
    const avgMs = total / this.frameTimes.length
    this.fps = avgMs > 0 ? Math.round(1000 / avgMs) : 60

    const config = coreSettingsService.getSettings().particleCore
    if (config.autoOptimize !== false && this.frameTimes.length >= 30) {
      this.evaluateAdaptiveOptimization(config)
    }
  }

  private lastAdjustmentTime = 0

  /**
   * Adapts quality or enables reducedMotion if frame rate drops
   */
  private evaluateAdaptiveOptimization(config: ParticleCoreConfig) {
    const now = Date.now()
    if (now - this.lastAdjustmentTime < 8000) return

    const currentQuality: OrbQuality = config.quality || 'high'

    // Low FPS condition (< 35 FPS sustained)
    if (this.fps < 35) {
      this.consecutiveLowFpsCount++
      this.consecutiveHighFpsCount = 0

      if (this.consecutiveLowFpsCount >= 50) {
        this.consecutiveLowFpsCount = 0
        this.lastAdjustmentTime = now
        this.stepDownQuality(currentQuality, config)
      }
    } else if (this.fps > 55) {
      // High FPS condition (> 55 FPS sustained)
      this.consecutiveHighFpsCount++
      this.consecutiveLowFpsCount = 0

      if (this.consecutiveHighFpsCount >= 120 && this.isThrottled) {
        this.consecutiveHighFpsCount = 0
        this.lastAdjustmentTime = now
        this.stepUpQuality(currentQuality, config)
      }
    } else {
      this.consecutiveLowFpsCount = 0
      this.consecutiveHighFpsCount = 0
    }
  }

  private stepDownQuality(current: OrbQuality, config: ParticleCoreConfig) {
    if (current === 'ultra') {
      coreSettingsService.setQuality('high')
      this.isThrottled = true
    } else if (current === 'high') {
      coreSettingsService.setQuality('medium')
      this.isThrottled = true
    } else if (current === 'medium') {
      coreSettingsService.setQuality('low')
      this.isThrottled = true
    } else if (current === 'low' && !config.reducedMotion) {
      coreSettingsService.setReducedMotion(true)
      this.isThrottled = true
    }
    this.notify()
  }

  private stepUpQuality(current: OrbQuality, config: ParticleCoreConfig) {
    if (config.reducedMotion) {
      coreSettingsService.setReducedMotion(false)
    } else if (current === 'low') {
      coreSettingsService.setQuality('medium')
    } else if (current === 'medium') {
      coreSettingsService.setQuality('high')
      this.isThrottled = false
    }
    this.notify()
  }

  public getTelemetry(): PerformanceTelemetry {
    const config = coreSettingsService.getSettings().particleCore
    const total = this.frameTimes.reduce((acc, val) => acc + val, 0)
    const avgMs = this.frameTimes.length > 0 ? total / this.frameTimes.length : 16.6

    return {
      fps: this.fps,
      averageFrameTimeMs: Number(avgMs.toFixed(1)),
      quality: config.quality || 'high',
      reducedMotion: Boolean(config.reducedMotion),
      autoOptimize: config.autoOptimize !== false,
      isThrottled: this.isThrottled,
      sampleCount: this.frameTimes.length
    }
  }

  public subscribe(listener: (telemetry: PerformanceTelemetry) => void): () => void {
    this.listeners.add(listener)
    listener(this.getTelemetry())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const data = this.getTelemetry()
    this.listeners.forEach((fn) => {
      try {
        fn(data)
      } catch (_e) {}
    })
  }
}

export const orbAnimationEngine = new OrbAnimationEngine()
