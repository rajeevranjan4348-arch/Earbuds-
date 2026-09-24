import { useState, useEffect, useCallback } from 'react'
import {
  themeService,
  ThemeState,
  ThemeMode,
  AccentColor,
  ACCENT_PALETTES
} from '../services/themeService'

export function useTheme() {
  const [themeState, setThemeState] = useState<ThemeState>(themeService.getState())

  useEffect(() => {
    const unsubscribe = themeService.subscribe((state) => {
      setThemeState(state)
    })
    return unsubscribe
  }, [])

  const setThemeMode = useCallback((mode: ThemeMode) => {
    themeService.setThemeMode(mode)
  }, [])

  const setAccent = useCallback((accent: AccentColor) => {
    themeService.setAccent(accent)
  }, [])

  const toggleThemeMode = useCallback(() => {
    themeService.toggleThemeMode()
  }, [])

  return {
    mode: themeState.mode,
    resolvedTheme: themeState.resolvedTheme,
    systemPrefersDark: themeState.systemPrefersDark,
    accent: themeState.accent,
    accentConfig: ACCENT_PALETTES[themeState.accent],
    setThemeMode,
    setAccent,
    toggleThemeMode,
    isDark: themeState.resolvedTheme === 'dark',
    isLight: themeState.resolvedTheme === 'light',
    isSystemMode: themeState.mode === 'system'
  }
}

export default useTheme
