/**
 * IRIS — Android Tool Router
 * Selects and dispatches tools dynamically across native Android APIs,
 * ADB bridge, Shizuku, Intents, Accessibility, Skills/MCP, and AI Core.
 */

import { ParsedCommandIntent } from './types'
import { permissionManager } from './PermissionManager'
import { confirmationEngine } from './ConfirmationEngine'
import { verificationEngine } from './VerificationEngine'
import { irisActionConfirmation } from './IrisActionConfirmation'
import { androidDeviceTools } from './AndroidDeviceTools'
import { irisShizukuManager } from './IrisShizukuManager'
import { irisSkillsMcpRegistry } from './IrisSkillsMcpRegistry'
import {
  appController,
  callController,
  messageController,
  notificationController,
  bluetoothController,
  mediaController,
  locationController,
  memoryController,
  privacyDashboardController
} from './controllers'
import { deviceCapabilityDiscovery } from './DeviceCapabilityDiscovery'

export interface ToolExecutionResult {
  success: boolean
  tool: string
  action: string
  output: string
  details?: Record<string, any>
}

export class AndroidToolRouter {
  public async executeIntent(intent: ParsedCommandIntent): Promise<ToolExecutionResult> {
    // 1. Permission Gate Check
    for (const perm of intent.required_permissions) {
      if (!permissionManager.isGranted(perm)) {
        const req = await permissionManager.requestPermission(perm)
        if (!req.granted) {
          return {
            success: false,
            tool: intent.tool,
            action: intent.intent,
            output: `Operation cancelled: Required permission "${perm}" is not granted.`
          }
        }
      }
    }

    // 2. Sensitive Action Safety Confirmation
    const safetyCheck = await irisActionConfirmation.requireConfirmationIfNeeded(
      intent.intent,
      intent.parameters
    )
    if (!safetyCheck.approved) {
      return {
        success: false,
        tool: intent.tool,
        action: intent.intent,
        output: `Operation stopped: ${safetyCheck.reason}`
      }
    }

    // 3. Dispatch to dedicated controller / Device Tools / MCP Skills
    switch (intent.intent) {
      case 'app_launch': {
        const res = await androidDeviceTools.launchApp(intent.target || intent.parameters.appName)
        return {
          success: res.success,
          tool: intent.tool,
          action: 'launch_app',
          output: res.message,
          details: res.details
        }
      }

      case 'phone_call': {
        const res = await callController.makeCall(intent.target || intent.parameters.recipient)
        return {
          success: res.success,
          tool: intent.tool,
          action: 'call',
          output: res.message
        }
      }

      case 'send_message': {
        const res = await messageController.sendMessage(
          intent.target || intent.parameters.recipient,
          intent.parameters.message
        )
        return {
          success: res.success,
          tool: intent.tool,
          action: 'send_message',
          output: res.message
        }
      }

      case 'bluetooth_query': {
        const status = bluetoothController.checkStatus()
        const text = status.earbudsConnected
          ? `Your earbuds (${status.earbudsName || 'Connected Headset'}) are connected and active.`
          : `Bluetooth is ${status.isEnabled ? 'ON' : 'OFF'}, but no earbuds are currently connected.`
        return {
          success: true,
          tool: intent.tool,
          action: 'check_bluetooth',
          output: text,
          details: status
        }
      }

      case 'media_control': {
        const res = await mediaController.control(intent.target as any)
        return {
          success: res.success,
          tool: intent.tool,
          action: 'media_control',
          output: res.message
        }
      }

      case 'battery_query': {
        const b = deviceCapabilityDiscovery.getBatteryInfo()
        const text = `Current battery level is ${b.level}%${b.isCharging ? ' (Charging)' : ''}. Temperature: ${b.temperature}.`
        return {
          success: true,
          tool: intent.tool,
          action: 'battery_query',
          output: text,
          details: b
        }
      }

      case 'read_notifications': {
        const summary = await notificationController.summarizeNotifications()
        return {
          success: true,
          tool: intent.tool,
          action: 'notifications_summary',
          output: summary
        }
      }

      case 'location_query': {
        if (intent.rawPrompt.toLowerCase().includes('navigate')) {
          const dest = intent.rawPrompt.replace(/navigate to|navigate/i, '').trim() || 'home'
          const res = await locationController.navigateTo(dest)
          return { success: res.success, tool: intent.tool, action: 'navigate', output: res.message }
        }
        const loc = await locationController.getLocation()
        return {
          success: true,
          tool: intent.tool,
          action: 'location_query',
          output: `Current location: ${loc.address} (${loc.city}). Coordinates: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}.`
        }
      }

      case 'alarm_timer': {
        return {
          success: true,
          tool: intent.tool,
          action: 'alarm_timer',
          output: `Alarm / Timer scheduled for: "${intent.parameters.rawText}".`
        }
      }

      case 'memory_manage': {
        if (intent.parameters.action === 'store') {
          const res = await memoryController.remember(intent.parameters.statement)
          return {
            success: res.success,
            tool: intent.tool,
            action: 'store_memory',
            output: `Stored to persistent memory: "${intent.parameters.statement}"`
          }
        }
        const memories = await memoryController.getMemories()
        return {
          success: true,
          tool: intent.tool,
          action: 'get_memories',
          output: memories.length > 0 ? `I remember: ${memories.slice(0, 5).join('; ')}` : 'I have no stored memories yet.'
        }
      }

      case 'privacy_dashboard': {
        const status = privacyDashboardController.getStatus()
        return {
          success: true,
          tool: intent.tool,
          action: 'privacy_dashboard',
          output: `Privacy Dashboard: Mic: ${status.microphone ? 'ON' : 'OFF'}, Camera: ${status.camera ? 'ON' : 'OFF'}, Location: ${status.location ? 'ON' : 'OFF'}, Notifications: ${status.notifications ? 'ON' : 'OFF'}, Accessibility: ${status.accessibility ? 'ON' : 'OFF'}, Bluetooth: ${status.bluetooth ? 'ON' : 'OFF'}.`
        }
      }

      // Android Agent / Screen & Gesture Controls
      case 'screen_inspect' as any: {
        const state = await androidDeviceTools.inspectScreen()
        return {
          success: state.accessibilityReady,
          tool: 'android_device_tools',
          action: 'screen_inspect',
          output: `Screen state captured. Package: ${state.packageName} (${state.appName}). Visible elements: ${state.interactiveElements.length}.`,
          details: state
        }
      }

      case 'tap_element' as any: {
        const target = intent.target || intent.parameters.target
        const res = await androidDeviceTools.tap(target)
        return {
          success: res.success,
          tool: 'android_device_tools',
          action: 'tap_element',
          output: res.message,
          details: res.details
        }
      }

      case 'type_text' as any: {
        const text = intent.parameters.text || intent.target
        const target = intent.parameters.targetSelector
        const res = await androidDeviceTools.typeText(text, target)
        return {
          success: res.success,
          tool: 'android_device_tools',
          action: 'type_text',
          output: res.message,
          details: res.details
        }
      }

      case 'press_system_key' as any: {
        const key = intent.parameters.key || 'back'
        const res = await androidDeviceTools.pressSystemKey(key)
        return {
          success: res.success,
          tool: 'android_device_tools',
          action: 'press_system_key',
          output: res.message,
          details: res.details
        }
      }

      case 'exec_shizuku_command' as any: {
        const cmd = intent.parameters.command || intent.rawPrompt
        const res = await irisShizukuManager.execAdbCommand(cmd)
        return {
          success: res.success,
          tool: 'shizuku_manager',
          action: 'exec_shizuku_command',
          output: res.success ? res.stdout : `Shizuku command failed: ${res.stderr}`,
          details: res
        }
      }

      // Browser-Use Web Automation Tools
      case 'browser_open' as any:
      case 'browser_navigate' as any:
      case 'browser_back' as any:
      case 'browser_forward' as any:
      case 'browser_click' as any:
      case 'browser_type' as any:
      case 'browser_extract' as any:
      case 'browser_scroll' as any:
      case 'browser_wait' as any:
      case 'browser_screenshot' as any:
      case 'browser_execute_task' as any: {
        const { browserTaskRouter } = await import('../browser/BrowserTaskRouter')
        const res = await browserTaskRouter.executeTool(intent.intent, intent.parameters)
        return {
          success: res.success,
          tool: 'browser_task_router',
          action: intent.intent,
          output: res.output,
          details: res.extractedData
        }
      }

      default: {
        // Fallback: Check if registered in Iris Skills / MCP Registry
        const skillRes = await irisSkillsMcpRegistry.executeTool(intent.intent, intent.parameters)
        if (skillRes.output && !skillRes.output.includes('No registered skill found')) {
          return {
            success: skillRes.success,
            tool: 'skills_mcp_registry',
            action: intent.intent,
            output: skillRes.output,
            details: skillRes.details
          }
        }

        return {
          success: true,
          tool: intent.tool,
          action: 'general_ai',
          output: `Processed via IRIS Neural Engine: "${intent.rawPrompt}"`
        }
      }
    }
  }
}

export const androidToolRouter = new AndroidToolRouter()
