/**
 * IRIS — Advanced Android Mobile Agent Type Definitions
 * Full Device Capability + Permission-Gated Control Architecture
 */

export type CapabilityStatus = 'available' | 'blocked' | 'denied' | 'prompt' | 'unavailable'

export interface DeviceCapabilityMap {
  microphone: CapabilityStatus
  camera: CapabilityStatus
  location: CapabilityStatus
  notifications: CapabilityStatus
  accessibility: CapabilityStatus
  bluetooth: CapabilityStatus
  contacts: CapabilityStatus
  calendar: CapabilityStatus
  files: CapabilityStatus
  media_control: CapabilityStatus
  calls: CapabilityStatus
  messaging: CapabilityStatus
  wifi: CapabilityStatus
  mobile_data: CapabilityStatus
  battery: CapabilityStatus
  alarms: CapabilityStatus
  web_browser: CapabilityStatus
}

export type PermissionName = keyof DeviceCapabilityMap

export interface PermissionState {
  name: PermissionName
  status: 'granted' | 'denied' | 'prompt' | 'blocked' | 'not_requested'
  lastRequestedAt?: number
  rationale: string
  isSensitive: boolean
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ParsedCommandIntent {
  rawPrompt: string
  intent: string
  category:
    | 'app_control'
    | 'communication'
    | 'media'
    | 'device_setting'
    | 'system_info'
    | 'navigation'
    | 'productivity'
    | 'vision_ocr'
    | 'web_search'
    | 'accessibility'
    | 'memory'
    | 'privacy'
  target?: string
  parameters: Record<string, any>
  required_permissions: PermissionName[]
  risk_level: RiskLevel
  requires_confirmation: boolean
  confirmation_message?: string
  tool: string
  verification_required: boolean
  confidence: number
}

export interface PlanTaskStep {
  id: string
  index: number
  description: string
  tool: string
  action: string
  parameters: Record<string, any>
  requiredPermission?: PermissionName
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_confirmation'
  result?: any
  error?: string
  verificationStatus?: 'verified' | 'unverified' | 'failed'
}

export interface AgentExecutionPlan {
  id: string
  userPrompt: string
  intent: ParsedCommandIntent
  steps: PlanTaskStep[]
  currentStepIndex: number
  status: 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  createdAt: number
  completedAt?: number
  finalResponse?: string
}

export interface DeviceTelemetryInfo {
  manufacturer: string
  model: string
  androidVersion: string
  sdkVersion: number
  battery: {
    level: number
    isCharging: boolean
    temperature: string
    isBatterySaver: boolean
  }
  network: {
    wifiConnected: boolean
    wifiSsid?: string
    mobileDataConnected: boolean
    networkType: 'WIFI' | '5G' | '4G' | '3G' | 'OFFLINE' | 'UNKNOWN'
  }
  bluetooth: {
    isEnabled: boolean
    connectedDevices: string[]
    earbudsConnected: boolean
    earbudsName?: string
  }
  storage: {
    usedGb: string
    totalGb: string
    percentUsed: number
  }
  accessibilityReady: boolean
  activeAppPackage?: string
  activeAppActivity?: string
}

export interface PrivacyDashboardState {
  microphoneActive: boolean
  cameraActive: boolean
  locationActive: boolean
  screenAccessActive: boolean
  notificationsActive: boolean
  contactsActive: boolean
  accessibilityActive: boolean
  bluetoothActive: boolean
  lastUsedCapability?: {
    capability: PermissionName
    timestamp: number
    actionDescription: string
  }
  auditLogs: PrivacyAuditEntry[]
}

export interface PrivacyAuditEntry {
  id: string
  timestamp: number
  capability: PermissionName
  action: string
  granted: boolean
  userApproved: boolean
  targetPackage?: string
}

export interface ConfirmationRequest {
  id: string
  action: string
  target: string
  reason: string
  consequences: string
  riskLevel: RiskLevel
  metadata?: Record<string, any>
  resolve: (approved: boolean) => void
}

export interface ActionResultVerification {
  success: boolean
  verified: boolean
  message: string
  details?: Record<string, any>
}
