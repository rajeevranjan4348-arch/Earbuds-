import React, { createContext, useContext, useState, useEffect } from 'react'
import { useTheme as useIrisTheme } from '../hooks/useTheme'

interface ThemeContextType {
  isDarkMode: boolean
  getAccentClass: () => string
  toggleTheme: () => void
  theme: 'dark' | 'light'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const irisTheme = useIrisTheme()
  const [isDarkMode, setIsDarkMode] = useState(true)

  useEffect(() => {
    setIsDarkMode(irisTheme.isDark)
  }, [irisTheme.isDark])

  const getAccentClass = () => {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  }

  const toggleTheme = () => {
    irisTheme.toggleThemeMode()
    setIsDarkMode((prev) => !prev)
  }

  return (
    <ThemeContext.Provider
      value={{
        isDarkMode,
        getAccentClass,
        toggleTheme,
        theme: isDarkMode ? 'dark' : 'light'
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    // Fallback if rendered outside ThemeProvider
    return {
      isDarkMode: true,
      getAccentClass: () => 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      toggleTheme: () => {},
      theme: 'dark'
    }
  }
  return context
}
