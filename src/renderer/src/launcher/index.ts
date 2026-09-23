export * from './types'
export * from './AppRegistry'
export * from './LauncherSearch'
export * from './IntentResolver'
export * from './LaunchManager'
export * from './PermissionManager'
export * from './VoiceLauncher'
export * from './AppIconRenderer'
export * from './CommandPalette'
export * from './LauncherModal'

/**
 * Convenience hook to control the AI App Launcher anywhere in the UI
 */
export function useAppLauncher() {
  const openLauncher = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('iris:open-launcher'))
    }
  }

  const closeLauncher = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('iris:close-launcher'))
    }
  }

  const toggleLauncher = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('iris:toggle-launcher'))
    }
  }

  return {
    openLauncher,
    closeLauncher,
    toggleLauncher
  }
}
