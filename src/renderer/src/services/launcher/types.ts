/**
 * Android AI App Launcher Types
 */

export interface InstalledApp {
  name: string
  packageName: string
  launchActivity?: string
  aliases: string[]
  category?: 'social' | 'media' | 'productivity' | 'system' | 'communication' | 'utility' | 'tools'
  isSystemApp?: boolean
  versionCode?: number
}

export interface AppLaunchIntent {
  intent: 'launch_app'
  app_name: string
  raw_query?: string
  confidence?: number
}

export type AppResolutionStatus = 'MATCH_FOUND' | 'MULTIPLE_MATCHES' | 'APP_NOT_FOUND'

export interface ResolveAppResult {
  status: AppResolutionStatus
  app?: InstalledApp
  candidates?: InstalledApp[]
  clarificationPrompt?: string
}

export type LaunchStatus = 'SUCCESS' | 'APP_NOT_FOUND' | 'MULTIPLE_MATCHES' | 'LAUNCH_FAILED' | 'PERMISSION_REQUIRED'

export interface LaunchAppResult {
  success: boolean
  status: LaunchStatus
  app?: InstalledApp
  appNameRequested: string
  message: string
  spokenResponse: string
  targetPackage?: string
  launchMethod?: 'android_bridge' | 'android_intent' | 'adb' | 'electron' | 'none'
  error?: string
}
