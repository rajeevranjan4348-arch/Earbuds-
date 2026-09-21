/**
 * Android Control & Autonomous Agent Type Definitions
 * Extracted and unified from:
 * - OpenDroid (yashab-cyber/opendroid)
 * - Android Agent (adev0x/android-agent)
 */

export type ActionRiskLevel =
  'READ_ONLY' | 'REVERSIBLE' | 'SENSITIVE' | 'ADVANCED_CONTROL' | 'IRREVERSIBLE'

export interface RectBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export interface AccessibilityNode {
  id: string
  text: string
  contentDescription: string
  className: string
  viewIdResourceName: string
  packageName: string
  bounds: RectBounds
  isClickable: boolean
  isScrollable: boolean
  isEditable: boolean
  isEnabled: boolean
  isFocused: boolean
  children: AccessibilityNode[]
}

export type AccessibilityServiceStatus =
  'READY' | 'CONNECTED' | 'ACCESSIBILITY_PERMISSION_MISSING' | 'DEVICE_OFFLINE' | 'ERROR'

export interface ScreenState {
  packageName: string
  activityName: string
  appName: string
  screenWidth: number
  screenHeight: number
  allVisibleText: string[]
  interactiveElements: AccessibilityNode[]
  rootNode: AccessibilityNode | null
  timestamp: number
  screenHash: string
  accessibilityReady: boolean
  status: AccessibilityServiceStatus
  screenshotUrl?: string
}

export type ScreenChangeLevel = 'SIGNIFICANT' | 'MINOR' | 'NONE'

export interface ScreenChangeComparison {
  level: ScreenChangeLevel
  similarityScore: number
  details: string
}

export type AndroidActionType =
  | 'launch_app'
  | 'find_app'
  | 'get_screen_state'
  | 'find_element'
  | 'find_clickable_element'
  | 'tap'
  | 'tap_element'
  | 'long_press'
  | 'type_text'
  | 'clear_text'
  | 'swipe'
  | 'scroll'
  | 'press_back'
  | 'press_home'
  | 'press_recents'
  | 'wait_for_element'
  | 'verify_action'
  | 'request_confirmation'

export interface AndroidAction {
  type: AndroidActionType
  params: Record<string, any>
  description: string
  targetPackage?: string
  timeoutMs?: number
}

export interface PlanStep {
  id: string
  index: number
  action: AndroidAction
  description: string
  riskLevel: ActionRiskLevel
  requiresConfirmation: boolean
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_confirmation'
  result?: any
  error?: string
  screenChange?: ScreenChangeLevel
}

export interface PendingConfirmation {
  id: string
  stepIndex: number
  action: AndroidAction
  description: string
  reason: string
  createdAt: number
}

export interface TaskPlan {
  id: string
  goal: string
  steps: PlanStep[]
  currentStepIndex: number
  status: 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  pendingConfirmation?: PendingConfirmation
  startedAt: number
  updatedAt: number
  error?: string
  summary?: string
}

export interface AgentExecutionResult {
  success: boolean
  status: 'SUCCESS' | 'AWAITING_CONFIRMATION' | 'FAILED' | 'PERMISSION_REQUIRED' | 'CANCELLED'
  goal: string
  summary: string
  spokenResponse: string
  displayText: string
  stepsExecuted: number
  totalSteps: number
  pendingConfirmation?: PendingConfirmation
  screenState?: ScreenState
  error?: string
  metadata?: Record<string, any>
}
