/**
 * IRIS Core Settings & 3D Particle Core Configuration Service
 * Provides reactive persistence for hardware permissions, 3D particle core tuning,
 * and API provider routing.
 */

export type ColorSchemeId = 'emerald' | 'cyan' | 'gold' | 'crimson' | 'violet' | 'void'

export interface ColorSchemeConfig {
  id: ColorSchemeId
  name: string
  description: string
  idleColor: string
  activeColor: string
  ringColor: string
  ringGlow: string
  accentClass: string
  primaryColor: string
}

export const COLOR_SCHEMES: Record<ColorSchemeId, ColorSchemeConfig> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald Matrix',
    description: 'Original IRIS neural matrix palette with bio-green resonance',
    idleColor: '#39ff14',
    activeColor: '#00ffff',
    ringColor: '#39ff14',
    ringGlow: '#ccffb3',
    accentClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    primaryColor: '#39ff14'
  },
  cyan: {
    id: 'cyan',
    name: 'Cyberpunk Cyan',
    description: 'High-frequency sub-zero neon cyan with magenta active phase',
    idleColor: '#00f0ff',
    activeColor: '#ff007f',
    ringColor: '#00f0ff',
    ringGlow: '#a7f3d0',
    accentClass: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    primaryColor: '#00f0ff'
  },
  gold: {
    id: 'gold',
    name: 'Neural Gold',
    description: 'Warm solar synaptic energy with amber excitation states',
    idleColor: '#ffd700',
    activeColor: '#ff6b00',
    ringColor: '#ffd700',
    ringGlow: '#fff3b0',
    accentClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    primaryColor: '#ffd700'
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Pulse',
    description: 'High-alert tactical crimson with fiery plasma corona',
    idleColor: '#ff0055',
    activeColor: '#ff5500',
    ringColor: '#ff0055',
    ringGlow: '#ffb3cc',
    accentClass: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    primaryColor: '#ff0055'
  },
  violet: {
    id: 'violet',
    name: 'Violet Nova',
    description: 'Deep quantum violet with ultraviolet event horizon',
    idleColor: '#b026ff',
    activeColor: '#00f0ff',
    ringColor: '#b026ff',
    ringGlow: '#e2b3ff',
    accentClass: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    primaryColor: '#b026ff'
  },
  void: {
    id: 'void',
    name: 'Deep Void',
    description: 'Hyperspace indigo with cobalt particle filaments',
    idleColor: '#6366f1',
    activeColor: '#38bdf8',
    ringColor: '#6366f1',
    ringGlow: '#c7d2fe',
    accentClass: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
    primaryColor: '#6366f1'
  }
}

export const PARTICLE_PRESETS = COLOR_SCHEMES
export type ParticlePresetKey = ColorSchemeId

export interface HardwarePermissions {
  camera: boolean
  microphone: boolean
  screen: boolean
  screenCapture?: boolean
  audioOutput: boolean
  location?: boolean
}

export type OrbQuality = 'ultra' | 'high' | 'medium' | 'low'

export interface ParticleCoreConfig {
  intensity: number // 0.2 - 2.5
  density: number // 300 - 1500
  speed: number // 0.5 - 2.5
  glow: number // 0.5 - 2.0
  colorScheme: ColorSchemeId
  reducedMotion?: boolean
  quality?: OrbQuality
  autoOptimize?: boolean
}

export type ApiProviderId = 'gemini' | 'groq' | 'huggingface' | 'tavily' | 'mem0'

export interface CoreSettingsState {
  permissions: HardwarePermissions
  particleCore: ParticleCoreConfig
  activeProvider: ApiProviderId
  hardwarePermissions: HardwarePermissions
  particleSettings: {
    preset: ColorSchemeId
    intensity: number
    speed: number
    density: number
    glow: boolean
  }
  apiProviders: {
    selected: ApiProviderId
  }
}

export type CoreSettings = CoreSettingsState

const STORAGE_KEY = 'iris_core_settings_v2'

const DEFAULT_SETTINGS: CoreSettingsState = {
  permissions: {
    camera: true,
    microphone: true,
    screen: true,
    screenCapture: true,
    audioOutput: true,
    location: true
  },
  particleCore: {
    intensity: 1.0,
    density: 900,
    speed: 1.0,
    glow: 1.0,
    colorScheme: 'emerald',
    reducedMotion: false,
    quality: 'high',
    autoOptimize: true
  },
  activeProvider: 'gemini',
  hardwarePermissions: {
    camera: true,
    microphone: true,
    screen: true,
    screenCapture: true,
    audioOutput: true,
    location: true
  },
  particleSettings: {
    preset: 'emerald',
    intensity: 1.0,
    speed: 1.0,
    density: 0.9,
    glow: true
  },
  apiProviders: {
    selected: 'gemini'
  }
}

type Listener = (state: CoreSettingsState) => void

class CoreSettingsService {
  private state: {
    permissions: HardwarePermissions
    particleCore: ParticleCoreConfig
    activeProvider: ApiProviderId
  }
  private listeners: Set<Listener> = new Set()

  constructor() {
    this.state = this.loadSettings()
  }

  private loadSettings() {
    if (typeof window === 'undefined') {
      return {
        permissions: { ...DEFAULT_SETTINGS.permissions },
        particleCore: { ...DEFAULT_SETTINGS.particleCore },
        activeProvider: DEFAULT_SETTINGS.activeProvider
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          permissions: {
            ...DEFAULT_SETTINGS.permissions,
            ...(parsed.permissions || parsed.hardwarePermissions || {})
          },
          particleCore: { ...DEFAULT_SETTINGS.particleCore, ...(parsed.particleCore || {}) },
          activeProvider:
            parsed.activeProvider ||
            parsed.apiProviders?.selected ||
            DEFAULT_SETTINGS.activeProvider
        }
      }
    } catch (_e) {}
    return {
      permissions: { ...DEFAULT_SETTINGS.permissions },
      particleCore: { ...DEFAULT_SETTINGS.particleCore },
      activeProvider: DEFAULT_SETTINGS.activeProvider
    }
  }

  private saveSettings() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch (_e) {}
    this.notify()
  }

  private notify() {
    const copy = this.getSettings()
    this.listeners.forEach((fn) => {
      try {
        fn(copy)
      } catch (_e) {}
    })
  }

  public getSettings(): CoreSettingsState {
    const p = {
      ...this.state.permissions,
      screenCapture: this.state.permissions.screenCapture ?? this.state.permissions.screen
    }
    return {
      permissions: p,
      particleCore: { ...this.state.particleCore },
      activeProvider: this.state.activeProvider,
      hardwarePermissions: p,
      particleSettings: {
        preset: this.state.particleCore.colorScheme,
        intensity: this.state.particleCore.intensity,
        speed: this.state.particleCore.speed,
        density: Math.min(1.5, Math.max(0.3, this.state.particleCore.density / 1000)),
        glow: this.state.particleCore.glow > 0.8
      },
      apiProviders: {
        selected: this.state.activeProvider
      }
    }
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.getSettings())
    return () => {
      this.listeners.delete(fn)
    }
  }

  public setHardwarePermission(key: keyof HardwarePermissions | 'screenCapture', enabled: boolean) {
    const resolvedKey = key === 'screenCapture' ? 'screen' : key
    this.state.permissions[resolvedKey as keyof HardwarePermissions] = enabled
    if (resolvedKey === 'screen') {
      this.state.permissions.screenCapture = enabled
    }
    this.saveSettings()
  }

  public setParticleIntensity(intensity: number) {
    this.state.particleCore.intensity = Math.max(0.2, Math.min(2.5, intensity))
    this.saveSettings()
  }

  public setParticleDensity(density: number) {
    const rawVal = density <= 2.0 ? density * 1000 : density
    this.state.particleCore.density = Math.max(300, Math.min(1500, Math.round(rawVal)))
    this.saveSettings()
  }

  public setParticleSpeed(speed: number) {
    this.state.particleCore.speed = Math.max(0.5, Math.min(2.5, speed))
    this.saveSettings()
  }

  public setParticleGlow(glow: number) {
    this.state.particleCore.glow = Math.max(0.5, Math.min(2.0, glow))
    this.saveSettings()
  }

  public setColorScheme(scheme: ColorSchemeId) {
    if (COLOR_SCHEMES[scheme]) {
      this.state.particleCore.colorScheme = scheme
      this.saveSettings()
    }
  }

  public applyPreset(scheme: ColorSchemeId) {
    this.setColorScheme(scheme)
  }

  public updateParticleSettings(partial: {
    preset?: ColorSchemeId
    colorScheme?: ColorSchemeId
    intensity?: number
    speed?: number
    density?: number
    glow?: boolean | number
  }) {
    if (partial.preset) this.setColorScheme(partial.preset)
    if (partial.colorScheme) this.setColorScheme(partial.colorScheme)
    if (partial.intensity !== undefined) this.setParticleIntensity(partial.intensity)
    if (partial.speed !== undefined) this.setParticleSpeed(partial.speed)
    if (partial.density !== undefined) this.setParticleDensity(partial.density)
    if (partial.glow !== undefined) {
      const g = typeof partial.glow === 'boolean' ? (partial.glow ? 1.4 : 0.5) : partial.glow
      this.setParticleGlow(g)
    }
  }

  public setActiveProvider(provider: ApiProviderId) {
    this.state.activeProvider = provider
    this.saveSettings()
  }

  public setSelectedProvider(provider: ApiProviderId) {
    this.setActiveProvider(provider)
  }

  public setQuality(quality: OrbQuality) {
    this.state.particleCore.quality = quality
    // Adjust density based on quality
    if (quality === 'low') {
      this.state.particleCore.density = 400
    } else if (quality === 'medium') {
      this.state.particleCore.density = 650
    } else if (quality === 'high') {
      this.state.particleCore.density = 900
    } else if (quality === 'ultra') {
      this.state.particleCore.density = 1300
    }
    this.saveSettings()
  }

  public setReducedMotion(reducedMotion: boolean) {
    this.state.particleCore.reducedMotion = reducedMotion
    if (reducedMotion) {
      this.state.particleCore.speed = 0.5
      this.state.particleCore.density = Math.min(this.state.particleCore.density, 450)
    }
    this.saveSettings()
  }

  public setAutoOptimize(autoOptimize: boolean) {
    this.state.particleCore.autoOptimize = autoOptimize
    this.saveSettings()
  }

  public resetToDefaults() {
    this.state = {
      permissions: { ...DEFAULT_SETTINGS.permissions },
      particleCore: { ...DEFAULT_SETTINGS.particleCore },
      activeProvider: DEFAULT_SETTINGS.activeProvider
    }
    this.saveSettings()
  }
}

export const coreSettingsService = new CoreSettingsService()
