/**
 * IRIS System-Level Theme & Dynamic CSS Variables Management Service
 * Detects OS color scheme (prefers-color-scheme: dark/light) and binds
 * reactive CSS variables across the entire IRIS interface.
 */

export type ThemeMode = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'
export type AccentColor = 'emerald' | 'cyan' | 'violet' | 'amber' | 'rose' | 'blue'

export interface AccentColorConfig {
  id: AccentColor
  name: string
  primaryHex: string
  secondaryHex: string
  rgb: string // 'r, g, b'
  glowHex: string
}

export const ACCENT_PALETTES: Record<AccentColor, AccentColorConfig> = {
  emerald: {
    id: 'emerald',
    name: 'Cyber Emerald',
    primaryHex: '#00ff41',
    secondaryHex: '#10b981',
    rgb: '0, 255, 65',
    glowHex: 'rgba(0, 255, 65, 0.35)'
  },
  cyan: {
    id: 'cyan',
    name: 'Quantum Cyan',
    primaryHex: '#00f0ff',
    secondaryHex: '#06b6d4',
    rgb: '0, 240, 255',
    glowHex: 'rgba(0, 240, 255, 0.35)'
  },
  violet: {
    id: 'violet',
    name: 'Neon Violet',
    primaryHex: '#b026ff',
    secondaryHex: '#a855f7',
    rgb: '176, 38, 255',
    glowHex: 'rgba(176, 38, 255, 0.35)'
  },
  amber: {
    id: 'amber',
    name: 'Neural Amber',
    primaryHex: '#fbbf24',
    secondaryHex: '#f59e0b',
    rgb: '251, 191, 36',
    glowHex: 'rgba(251, 191, 36, 0.35)'
  },
  rose: {
    id: 'rose',
    name: 'Crimson Plasma',
    primaryHex: '#ff0055',
    secondaryHex: '#f43f5e',
    rgb: '255, 0, 85',
    glowHex: 'rgba(255, 0, 85, 0.35)'
  },
  blue: {
    id: 'blue',
    name: 'Deep Cobalt',
    primaryHex: '#3b82f6',
    secondaryHex: '#60a5fa',
    rgb: '59, 130, 246',
    glowHex: 'rgba(59, 130, 246, 0.35)'
  }
}

export interface ThemeState {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  systemPrefersDark: boolean
  accent: AccentColor
  lastUpdated: number
}

const STORAGE_THEME_KEY = 'iris_theme_mode_v2'
const STORAGE_ACCENT_KEY = 'iris_accent_color_v2'

type ThemeListener = (state: ThemeState) => void

class ThemeService {
  private mode: ThemeMode = 'system'
  private accent: AccentColor = 'emerald'
  private systemPrefersDark: boolean = true
  private listeners: Set<ThemeListener> = new Set()
  private mediaQueryList: MediaQueryList | null = null

  constructor() {
    this.init()
  }

  private init() {
    if (typeof window === 'undefined') return

    // Load saved settings
    try {
      const savedMode = localStorage.getItem(STORAGE_THEME_KEY) as ThemeMode
      if (savedMode === 'system' || savedMode === 'dark' || savedMode === 'light') {
        this.mode = savedMode
      }
      const savedAccent = localStorage.getItem(STORAGE_ACCENT_KEY) as AccentColor
      if (savedAccent && ACCENT_PALETTES[savedAccent]) {
        this.accent = savedAccent
      }
    } catch (_e) {
      // Ignore storage errors
    }

    // Set up OS prefers-color-scheme media query listener
    if (window.matchMedia) {
      this.mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
      this.systemPrefersDark = this.mediaQueryList.matches

      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        this.systemPrefersDark = e.matches
        this.applyTheme()
      }

      if (this.mediaQueryList.addEventListener) {
        this.mediaQueryList.addEventListener('change', handleSystemThemeChange)
      } else if ('addListener' in this.mediaQueryList) {
        // Legacy fallback
        ;(this.mediaQueryList as any).addListener(handleSystemThemeChange)
      }
    }

    // Apply initially
    this.applyTheme()
  }

  public getResolvedTheme(): ResolvedTheme {
    if (this.mode === 'system') {
      return this.systemPrefersDark ? 'dark' : 'light'
    }
    return this.mode
  }

  public getState(): ThemeState {
    return {
      mode: this.mode,
      resolvedTheme: this.getResolvedTheme(),
      systemPrefersDark: this.systemPrefersDark,
      accent: this.accent,
      lastUpdated: Date.now()
    }
  }

  public setThemeMode(mode: ThemeMode) {
    this.mode = mode
    try {
      localStorage.setItem(STORAGE_THEME_KEY, mode)
    } catch (_e) {}
    this.applyTheme()
  }

  public setAccent(accent: AccentColor) {
    if (!ACCENT_PALETTES[accent]) return
    this.accent = accent
    try {
      localStorage.setItem(STORAGE_ACCENT_KEY, accent)
    } catch (_e) {}
    this.applyTheme()
  }

  public toggleThemeMode() {
    if (this.mode === 'system') {
      this.setThemeMode('dark')
    } else if (this.mode === 'dark') {
      this.setThemeMode('light')
    } else {
      this.setThemeMode('system')
    }
  }

  public subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const state = this.getState()
    this.listeners.forEach((listener) => {
      try {
        listener(state)
      } catch (err) {
        console.error('Error in theme listener:', err)
      }
    })
  }

  public applyTheme() {
    if (typeof document === 'undefined') return

    const resolved = this.getResolvedTheme()
    const accentConfig = ACCENT_PALETTES[this.accent] || ACCENT_PALETTES.emerald
    const root = document.documentElement

    // HTML / Body Data Attributes & Classes
    root.setAttribute('data-theme', resolved)
    root.setAttribute('data-theme-mode', this.mode)
    root.setAttribute('data-accent', this.accent)

    if (resolved === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
    } else {
      root.classList.add('light')
      root.classList.remove('dark')
    }

    // Dynamic CSS Variables Injection
    const cssVars: Record<string, string> =
      resolved === 'dark'
        ? {
            '--iris-bg-main': '#050508',
            '--iris-bg-surface': '#09090d',
            '--iris-bg-card': 'rgba(18, 18, 24, 0.75)',
            '--iris-bg-card-hover': 'rgba(28, 28, 36, 0.85)',
            '--iris-bg-glass': 'rgba(9, 9, 13, 0.85)',
            '--iris-bg-input': 'rgba(20, 20, 28, 0.8)',
            '--iris-text-primary': '#f4f4f5',
            '--iris-text-secondary': '#a1a1aa',
            '--iris-text-muted': '#71717a',
            '--iris-border-subtle': 'rgba(255, 255, 255, 0.08)',
            '--iris-border-medium': 'rgba(255, 255, 255, 0.14)',
            '--iris-border-strong': 'rgba(255, 255, 255, 0.22)',
            '--iris-shadow-ambient': '0 12px 40px rgba(0, 0, 0, 0.7)',
            '--iris-shadow-card': '0 8px 24px rgba(0, 0, 0, 0.5)',
            '--iris-backdrop-filter': 'blur(20px)',
            '--iris-grid-color': 'rgba(255, 255, 255, 0.03)'
          }
        : {
            '--iris-bg-main': '#f8fafc',
            '--iris-bg-surface': '#ffffff',
            '--iris-bg-card': 'rgba(255, 255, 255, 0.88)',
            '--iris-bg-card-hover': 'rgba(241, 245, 249, 0.95)',
            '--iris-bg-glass': 'rgba(255, 255, 255, 0.82)',
            '--iris-bg-input': 'rgba(241, 245, 249, 0.92)',
            '--iris-text-primary': '#0f172a',
            '--iris-text-secondary': '#334155',
            '--iris-text-muted': '#64748b',
            '--iris-border-subtle': 'rgba(15, 23, 42, 0.10)',
            '--iris-border-medium': 'rgba(15, 23, 42, 0.18)',
            '--iris-border-strong': 'rgba(15, 23, 42, 0.28)',
            '--iris-shadow-ambient': '0 12px 40px rgba(15, 23, 42, 0.08)',
            '--iris-shadow-card': '0 4px 20px rgba(15, 23, 42, 0.06)',
            '--iris-backdrop-filter': 'blur(20px)',
            '--iris-grid-color': 'rgba(15, 23, 42, 0.04)'
          }

    // Apply Accent CSS variables
    cssVars['--iris-accent-primary'] = accentConfig.primaryHex
    cssVars['--iris-accent-secondary'] = accentConfig.secondaryHex
    cssVars['--iris-accent-rgb'] = accentConfig.rgb
    cssVars['--iris-accent-glow'] = accentConfig.glowHex
    cssVars['--iris-border-accent'] = `${accentConfig.primaryHex}4d`
    cssVars['--iris-bg-accent-subtle'] = `rgba(${accentConfig.rgb}, 0.12)`
    cssVars['--iris-bg-accent-hover'] = `rgba(${accentConfig.rgb}, 0.22)`

    // Write directly to style element or root style
    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })

    // Also update body background
    if (document.body) {
      document.body.style.backgroundColor = cssVars['--iris-bg-main']
      document.body.style.color = cssVars['--iris-text-primary']
    }

    this.notify()
  }
}

export const themeService = new ThemeService()
