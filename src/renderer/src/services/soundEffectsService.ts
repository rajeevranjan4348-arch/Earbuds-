/**
 * IRIS UI Sound Effects Service (Web Audio API)
 * Procedurally generates subtle, responsive, low-latency auditory feedback for UI interactions,
 * button hovers, tab switches, and system events.
 */

export type SoundType =
  | 'hover'
  | 'click'
  | 'tab'
  | 'toggle'
  | 'activate'
  | 'deactivate'
  | 'success'
  | 'error'
  | 'shortcut'
  | 'popup'

class SoundEffectsService {
  private audioCtx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private isEnabled: boolean = true
  private volume: number = 0.5
  private lastHoverTime: number = 0
  private initializedListeners: boolean = false

  constructor() {
    // Load persisted settings
    if (typeof window !== 'undefined') {
      try {
        const storedEnabled = localStorage.getItem('iris_sfx_enabled')
        if (storedEnabled !== null) {
          this.isEnabled = storedEnabled === 'true'
        }
        const storedVol = localStorage.getItem('iris_sfx_volume')
        if (storedVol !== null) {
          this.volume = Math.max(0, Math.min(1, parseFloat(storedVol) || 0.5))
        }
      } catch (_e) {}
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass()
          this.masterGain = this.audioCtx.createGain()
          this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime)
          this.masterGain.connect(this.audioCtx.destination)
        }
      } catch (err) {
        console.warn('[SoundEffects] Web Audio initialization deferred:', err)
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled
    try {
      localStorage.setItem('iris_sfx_enabled', String(enabled))
    } catch (_e) {}
  }

  public getIsEnabled(): boolean {
    return this.isEnabled
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol))
    if (this.audioCtx && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime)
    }
    try {
      localStorage.setItem('iris_sfx_volume', String(this.volume))
    } catch (_e) {}
  }

  public getVolume(): number {
    return this.volume
  }

  /**
   * Plays a synthesized sound effect
   */
  public play(type: SoundType = 'click') {
    if (!this.isEnabled || this.volume <= 0) return

    const ctx = this.getAudioContext()
    if (!ctx || !this.masterGain) return

    const now = ctx.currentTime

    try {
      switch (type) {
        case 'hover': {
          // Debounce hover sounds to prevent audio clutter on fast mouse movement
          const timestamp = performance.now()
          if (timestamp - this.lastHoverTime < 45) return
          this.lastHoverTime = timestamp

          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const filter = ctx.createBiquadFilter()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(1450, now)
          osc.frequency.exponentialRampToValueAtTime(1800, now + 0.018)

          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(2500, now)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.022, now + 0.003)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022)

          osc.connect(filter)
          filter.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.024)
          break
        }

        case 'click': {
          // Crisp, modern mechanical UI click
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, now)
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.035)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.04, now + 0.002)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038)

          osc.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.04)
          break
        }

        case 'tab': {
          // Dual rising tone for navigation tabs
          const osc1 = ctx.createOscillator()
          const osc2 = ctx.createOscillator()
          const gain = ctx.createGain()

          osc1.type = 'sine'
          osc1.frequency.setValueAtTime(523.25, now) // C5
          osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.035) // E5

          osc2.type = 'triangle'
          osc2.frequency.setValueAtTime(1046.5, now)
          osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.035)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.032, now + 0.004)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

          osc1.connect(gain)
          osc2.connect(gain)
          gain.connect(this.masterGain)

          osc1.start(now)
          osc2.start(now)
          osc1.stop(now + 0.052)
          osc2.stop(now + 0.052)
          break
        }

        case 'toggle': {
          // Subtle futuristic switch sound
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(620, now)
          osc.frequency.exponentialRampToValueAtTime(940, now + 0.03)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.035, now + 0.003)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)

          osc.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.038)
          break
        }

        case 'activate': {
          // Rich harmonic chord when turning on AI Voice / features
          const frequencies = [440, 554.37, 659.25] // A Major triad
          frequencies.forEach((freq, idx) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()

            osc.type = idx === 0 ? 'sine' : 'triangle'
            osc.frequency.setValueAtTime(freq, now + idx * 0.02)
            osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + idx * 0.02 + 0.08)

            gain.gain.setValueAtTime(0.0001, now + idx * 0.02)
            gain.gain.linearRampToValueAtTime(0.028, now + idx * 0.02 + 0.006)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.02 + 0.1)

            osc.connect(gain)
            gain.connect(this.masterGain!)

            osc.start(now + idx * 0.02)
            osc.stop(now + idx * 0.02 + 0.11)
          })
          break
        }

        case 'deactivate': {
          // Gentle descending tone
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(659.25, now)
          osc.frequency.exponentialRampToValueAtTime(392.0, now + 0.07)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.03, now + 0.004)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)

          osc.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.08)
          break
        }

        case 'success': {
          // Positive triad chord
          const notes = [523.25, 659.25, 783.99]
          notes.forEach((f, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()

            osc.type = 'sine'
            osc.frequency.setValueAtTime(f, now + i * 0.025)

            gain.gain.setValueAtTime(0.0001, now + i * 0.025)
            gain.gain.linearRampToValueAtTime(0.03, now + i * 0.025 + 0.008)
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.025 + 0.14)

            osc.connect(gain)
            gain.connect(this.masterGain!)

            osc.start(now + i * 0.025)
            osc.stop(now + i * 0.025 + 0.15)
          })
          break
        }

        case 'error': {
          // Low dual pulse
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(220, now)
          osc.frequency.linearRampToValueAtTime(170, now + 0.08)

          const filter = ctx.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(450, now)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.025, now + 0.005)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)

          osc.connect(filter)
          filter.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.095)
          break
        }

        case 'shortcut': {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(1200, now)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.03, now + 0.002)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)

          osc.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.028)
          break
        }

        case 'popup': {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.setValueAtTime(700, now)
          osc.frequency.exponentialRampToValueAtTime(1100, now + 0.04)

          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.linearRampToValueAtTime(0.035, now + 0.004)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

          osc.connect(gain)
          gain.connect(this.masterGain)

          osc.start(now)
          osc.stop(now + 0.055)
          break
        }
      }
    } catch (e) {
      console.warn('[SoundEffects] Playback notice:', e)
    }
  }

  /**
   * Initializes global DOM event delegation for seamless UI auditory feedback
   */
  public initGlobalListeners() {
    if (this.initializedListeners || typeof window === 'undefined') return
    this.initializedListeners = true

    // Resume AudioContext on first user gesture
    const unlockAudio = () => {
      this.getAudioContext()
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio, { passive: true })

    // Global Hover Sound Delegation
    document.addEventListener(
      'pointerenter',
      (e) => {
        try {
          const rawTarget = e.target as any
          if (!rawTarget) return
          const target = typeof rawTarget.closest === 'function' 
            ? rawTarget 
            : (rawTarget.parentElement && typeof rawTarget.parentElement.closest === 'function' ? rawTarget.parentElement : null)
          if (!target) return
          const interactive = target.closest(
            'button, a, [role="button"], input[type="range"], input[type="checkbox"], .interactive-sound, .tab-btn'
          )
          if (interactive && !interactive.hasAttribute('disabled')) {
            this.play('hover')
          }
        } catch (_err) {
          // Ignore event delegation errors
        }
      },
      { capture: true, passive: true }
    )

    // Global Click Sound Delegation
    document.addEventListener(
      'pointerdown',
      (e) => {
        try {
          const rawTarget = e.target as any
          if (!rawTarget) return
          const target = typeof rawTarget.closest === 'function' 
            ? rawTarget 
            : (rawTarget.parentElement && typeof rawTarget.parentElement.closest === 'function' ? rawTarget.parentElement : null)
          if (!target) return
          const interactive = target.closest(
            'button, a, [role="button"], input[type="range"], input[type="checkbox"], .interactive-sound, .tab-btn'
          )
          if (interactive && !interactive.hasAttribute('disabled')) {
            const isTab = interactive.getAttribute('role') === 'tab' || interactive.classList.contains('tab-btn') || (typeof interactive.closest === 'function' && interactive.closest('nav'))
            if (isTab) {
              this.play('tab')
            } else {
              this.play('click')
            }
          }
        } catch (_err) {
          // Ignore event delegation errors
        }
      },
      { capture: true, passive: true }
    )
  }
}

export const soundEffects = new SoundEffectsService()
