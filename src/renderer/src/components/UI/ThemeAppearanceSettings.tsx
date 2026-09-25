import React from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Laptop, Palette, Sparkles, Check, Eye, Sliders } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { ThemeMode, AccentColor, ACCENT_PALETTES } from '../../services/themeService'

export const ThemeAppearanceSettings: React.FC = () => {
  const { mode, resolvedTheme, systemPrefersDark, accent, accentConfig, setThemeMode, setAccent } =
    useTheme()

  const themeOptions: {
    id: ThemeMode
    label: string
    sublabel: string
    icon: React.ReactNode
    previewBg: string
  }[] = [
    {
      id: 'system',
      label: 'System OS Sync',
      sublabel: `Auto-adapts to OS (currently ${systemPrefersDark ? 'Dark' : 'Light'})`,
      icon: <Laptop className="w-5 h-5" />,
      previewBg: 'from-zinc-900 to-zinc-700'
    },
    {
      id: 'dark',
      label: 'Cyber Dark',
      sublabel: 'Obsidian matrix, deep OLED black & neon glow',
      icon: <Moon className="w-5 h-5" />,
      previewBg: 'from-black to-zinc-950'
    },
    {
      id: 'light',
      label: 'Frost Light',
      sublabel: 'High-contrast crystalline slate & crisp lumina',
      icon: <Sun className="w-5 h-5" />,
      previewBg: 'from-slate-100 to-white'
    }
  ]

  const accentList: AccentColor[] = ['emerald', 'cyan', 'violet', 'amber', 'rose', 'blue']

  return (
    <div className="space-y-6 text-zinc-100 font-sans">
      {/* Header Banner */}
      <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 backdrop-blur-xl flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg transition-colors"
            style={{
              backgroundColor: `${accentConfig.primaryHex}15`,
              borderColor: `${accentConfig.primaryHex}40`,
              boxShadow: `0 0 20px ${accentConfig.glowHex}`
            }}
          >
            <Palette className="w-5 h-5" style={{ color: accentConfig.primaryHex }} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              System Theme & Color Engine
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Automated OS color scheme detection, dynamic CSS variables, and cyber accent tuning
            </p>
          </div>
        </div>

        {/* Live OS Sync Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono">
          <span
            className="w-2 h-2 rounded-full animate-ping"
            style={{ backgroundColor: accentConfig.primaryHex }}
          />
          <span className="text-zinc-400">OS Theme:</span>
          <span className="font-bold text-white uppercase">
            {systemPrefersDark ? 'Dark (Active)' : 'Light (Active)'}
          </span>
        </div>
      </div>

      {/* Theme Mode Selector (System, Dark, Light) */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
          <Sliders className="w-4 h-4" style={{ color: accentConfig.primaryHex }} />
          <span>Interface Color Scheme Mode</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themeOptions.map((opt) => {
            const isSelected = mode === opt.id
            return (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setThemeMode(opt.id)}
                className={`relative p-4 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer overflow-hidden ${
                  isSelected
                    ? 'bg-zinc-900/90 border-emerald-500/50 shadow-[0_0_25px_rgba(0,255,65,0.15)]'
                    : 'bg-zinc-950/50 hover:bg-zinc-900/50 border-white/10 text-zinc-400'
                }`}
                style={
                  isSelected
                    ? {
                        borderColor: accentConfig.primaryHex,
                        boxShadow: `0 0 25px ${accentConfig.glowHex}`
                      }
                    : {}
                }
              >
                {/* Background accent ambient highlight */}
                {isSelected && (
                  <div
                    className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-20 blur-xl pointer-events-none"
                    style={{ backgroundColor: accentConfig.primaryHex }}
                  />
                )}

                <div className="flex items-center justify-between">
                  <div
                    className={`p-2.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-white/10 text-white border-white/20'
                        : 'bg-zinc-900 text-zinc-400 border-white/5'
                    }`}
                    style={isSelected ? { color: accentConfig.primaryHex } : {}}
                  >
                    {opt.icon}
                  </div>

                  {isSelected && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-black shadow-md"
                      style={{ backgroundColor: accentConfig.primaryHex }}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    <span>{opt.label}</span>
                    {opt.id === 'system' && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        AUTO
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{opt.sublabel}</div>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Accent Color Palette Selector */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 font-mono">
          <Sparkles className="w-4 h-4" style={{ color: accentConfig.primaryHex }} />
          <span>Cyber Accent Resonance</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {accentList.map((accKey) => {
            const acc = ACCENT_PALETTES[accKey]
            const isSelected = accent === accKey
            return (
              <motion.button
                key={accKey}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setAccent(accKey)}
                className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900/90 border-white/30 shadow-lg'
                    : 'bg-zinc-950/40 hover:bg-zinc-900/50 border-white/10 text-zinc-400'
                }`}
                style={
                  isSelected
                    ? {
                        borderColor: acc.primaryHex,
                        boxShadow: `0 0 18px ${acc.glowHex}`
                      }
                    : {}
                }
              >
                <div
                  className="w-4 h-4 rounded-full shadow-md shrink-0 border border-white/20 flex items-center justify-center"
                  style={{ backgroundColor: acc.primaryHex }}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-zinc-100 truncate">{acc.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500">{acc.primaryHex}</div>
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Live CSS Variables & Interface Component Preview */}
      <div className="p-5 rounded-2xl bg-black/50 border border-white/10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-zinc-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-200 font-mono">
              Live CSS Variables & Real-Time Preview
            </span>
          </div>

          <div className="text-[11px] font-mono text-zinc-400">
            Active Theme: <span className="font-bold text-white uppercase">{resolvedTheme}</span>{' '}
            (Mode: <span className="text-emerald-400 uppercase">{mode}</span>)
          </div>
        </div>

        {/* Live Interactive Sample Card using CSS variables */}
        <div
          className="p-4 rounded-2xl border transition-all duration-300 shadow-xl space-y-3"
          style={{
            backgroundColor: 'var(--iris-bg-card)',
            borderColor: 'var(--iris-border-strong)',
            color: 'var(--iris-text-primary)'
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: 'var(--iris-accent-primary)' }}
              />
              <span className="text-xs font-bold tracking-wider font-mono">
                IRIS OS NEURAL TELEMETRY CARD
              </span>
            </div>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border"
              style={{
                backgroundColor: 'var(--iris-bg-accent-subtle)',
                borderColor: 'var(--iris-border-accent)',
                color: 'var(--iris-accent-primary)'
              }}
            >
              ACTIVE
            </span>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: 'var(--iris-text-secondary)' }}>
            CSS variables dynamically update across the entire document tree whenever the OS
            switches between light and dark color schemes, or when manual overrides are selected.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
            <div
              className="p-2 rounded-xl border"
              style={{
                backgroundColor: 'var(--iris-bg-input)',
                borderColor: 'var(--iris-border-subtle)'
              }}
            >
              <div style={{ color: 'var(--iris-text-muted)' }}>--iris-bg-main</div>
              <div className="font-bold mt-0.5 truncate">
                {resolvedTheme === 'dark' ? '#050508' : '#f8fafc'}
              </div>
            </div>

            <div
              className="p-2 rounded-xl border"
              style={{
                backgroundColor: 'var(--iris-bg-input)',
                borderColor: 'var(--iris-border-subtle)'
              }}
            >
              <div style={{ color: 'var(--iris-text-muted)' }}>--iris-text-primary</div>
              <div className="font-bold mt-0.5 truncate">
                {resolvedTheme === 'dark' ? '#f4f4f5' : '#0f172a'}
              </div>
            </div>

            <div
              className="p-2 rounded-xl border"
              style={{
                backgroundColor: 'var(--iris-bg-input)',
                borderColor: 'var(--iris-border-subtle)'
              }}
            >
              <div style={{ color: 'var(--iris-text-muted)' }}>--iris-accent-primary</div>
              <div
                className="font-bold mt-0.5 truncate"
                style={{ color: 'var(--iris-accent-primary)' }}
              >
                {accentConfig.primaryHex}
              </div>
            </div>

            <div
              className="p-2 rounded-xl border"
              style={{
                backgroundColor: 'var(--iris-bg-input)',
                borderColor: 'var(--iris-border-subtle)'
              }}
            >
              <div style={{ color: 'var(--iris-text-muted)' }}>--iris-backdrop-filter</div>
              <div className="font-bold mt-0.5 truncate">blur(20px)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThemeAppearanceSettings
