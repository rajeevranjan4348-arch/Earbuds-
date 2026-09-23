import React from 'react'

export type AppCategory =
  | 'apps'
  | 'tools'
  | 'settings'
  | 'media'
  | 'communication'
  | 'productivity'
  | 'system'
  | 'social'
  | 'developer'

export type AppType = 'internal' | 'external' | 'tool' | 'command'

export type LaunchMethod =
  | 'internal_route'
  | 'deep_link'
  | 'web_fallback'
  | 'command'
  | 'tool'

export type AppAvailability = 'available' | 'requires_permission' | 'beta'

export interface AppItem {
  id: string
  name: string
  description: string
  category: AppCategory
  type: AppType
  icon: string // Lucide / React-Icons identifier or category name
  target: string // internal tab name e.g. 'YOUTUBE' | 'CHAT' or external URL or action id
  deepLink?: string // e.g. 'vnd.youtube://' or 'whatsapp://'
  webFallbackUrl?: string
  launchMethod: LaunchMethod
  permissions?: string[]
  availability: AppAvailability
  keywords: string[]
  aliases: string[]
  pinned?: boolean
  isFavorite?: boolean
  recent?: boolean
  lastLaunched?: number
  launchCount?: number
  contextScope?: string[] // e.g. ['CHAT'], ['SETTINGS'], or ['ALL']
  destructive?: boolean
  confirmationPrompt?: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }
}

export interface LaunchResult {
  success: boolean
  app?: AppItem
  status: 'SUCCESS' | 'APP_NOT_FOUND' | 'PERMISSION_REQUIRED' | 'LAUNCH_FAILED' | 'CONFIRMATION_PENDING'
  message: string
  spokenResponse?: string
  methodUsed?: LaunchMethod
  fallbackUrl?: string
  error?: string
}

export interface ResolvedIntent {
  app: AppItem | null
  action: 'launch' | 'search' | 'toggle' | 'navigate' | 'confirm' | 'unknown'
  rawQuery: string
  confidence: number
  secondaryParam?: string
  multiStepActions?: Array<{ action: string; target: string; param?: string }>
}

export interface SensitiveActionRequest {
  id: string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

export interface LauncherContextState {
  currentTab: string
  isVoiceActive: boolean
  isMinimalHud: boolean
}
