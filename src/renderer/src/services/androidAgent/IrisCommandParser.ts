/**
 * IRIS — Advanced Android Command Parser
 * Converts natural language into structured, typed, permission-annotated intents.
 */

import { ParsedCommandIntent, RiskLevel, PermissionName } from './types'

export class IrisCommandParser {
  /**
   * Parse a raw natural language prompt into a structured command intent
   */
  public parse(prompt: string): ParsedCommandIntent {
    const raw = prompt.trim()
    const lower = raw.toLowerCase()

    // 1. APP LAUNCH INTENT ("Open YouTube", "Launch WhatsApp", "Open Chrome", "Go to Settings")
    const appMatch = lower.match(/^(?:open|launch|start|switch to|go to)\s+([a-z0-9\s._-]+)$/i)
    if (appMatch && !lower.includes('settings for') && !lower.includes('camera') && !lower.includes('browser') && !lower.includes('url')) {
      const appName = appMatch[1].trim()
      return {
        rawPrompt: raw,
        intent: 'app_launch',
        category: 'app_control',
        target: appName,
        parameters: { appName },
        required_permissions: [],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'android_apps',
        verification_required: true,
        confidence: 0.95
      }
    }

    // 2. PHONE CALL INTENT ("Call Rahul", "Make a call to Mom", "Dial 9876543210")
    if (lower.startsWith('call ') || lower.startsWith('dial ') || lower.startsWith('phone call to ') || lower.includes('make a call to')) {
      const contactOrNumber = raw.replace(/^(?:call|dial|make a phone call to|phone call to|make a call to)\s+/i, '').trim()
      return {
        rawPrompt: raw,
        intent: 'phone_call',
        category: 'communication',
        target: contactOrNumber,
        parameters: { recipient: contactOrNumber },
        required_permissions: ['calls', 'contacts'],
        risk_level: 'high',
        requires_confirmation: true,
        confirmation_message: `Place phone call to "${contactOrNumber}"?`,
        tool: 'phone',
        verification_required: true,
        confidence: 0.96
      }
    }

    // 3. MESSAGING INTENT ("Message Rahul: I'm reaching home", "Send a message to Priya hello", "Text Alex ...")
    if (lower.startsWith('message ') || lower.startsWith('text ') || lower.startsWith('send a message to ') || lower.startsWith('send message to ')) {
      let recipient = ''
      let messageContent = ''

      const colonSplit = raw.split(/:\s*/)
      if (colonSplit.length > 1) {
        recipient = colonSplit[0].replace(/^(?:message|text|send a message to|send message to)\s+/i, '').trim()
        messageContent = colonSplit.slice(1).join(':').trim()
      } else {
        const words = raw.split(' ')
        recipient = words[1] || 'Contact'
        messageContent = words.slice(2).join(' ') || 'Hello'
      }

      return {
        rawPrompt: raw,
        intent: 'send_message',
        category: 'communication',
        target: recipient,
        parameters: { recipient, message: messageContent },
        required_permissions: ['messaging', 'contacts'],
        risk_level: 'high',
        requires_confirmation: true,
        confirmation_message: `Send message to "${recipient}" with content: "${messageContent}"?`,
        tool: 'messages',
        verification_required: true,
        confidence: 0.94
      }
    }

    // 4. BLUETOOTH & EARBUDS ("Are my earbuds connected?", "Check bluetooth", "Is bluetooth on?")
    if (lower.includes('earbuds') || lower.includes('earphones') || lower.includes('headphones') || lower.includes('bluetooth')) {
      return {
        rawPrompt: raw,
        intent: 'bluetooth_query',
        category: 'system_info',
        target: 'bluetooth_subsystem',
        parameters: { query: raw },
        required_permissions: ['bluetooth'],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'bluetooth',
        verification_required: false,
        confidence: 0.92
      }
    }

    // 5. MEDIA CONTROLS ("Pause music", "Play music", "Next song", "Previous track", "Volume up", "Stop playback")
    if (lower.includes('pause music') || lower.includes('play music') || lower.includes('next song') || lower.includes('next track') || lower.includes('previous track') || lower.includes('volume up') || lower.includes('volume down') || lower.includes('pause playback')) {
      let action = 'pause'
      if (lower.includes('play')) action = 'play'
      else if (lower.includes('next')) action = 'next'
      else if (lower.includes('prev')) action = 'previous'
      else if (lower.includes('volume up')) action = 'volume_up'
      else if (lower.includes('volume down')) action = 'volume_down'

      return {
        rawPrompt: raw,
        intent: 'media_control',
        category: 'media',
        target: action,
        parameters: { action },
        required_permissions: ['media_control'],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'media',
        verification_required: true,
        confidence: 0.95
      }
    }

    // 6. BATTERY & POWER ("How much battery do I have?", "Battery percentage", "Is phone charging?")
    if (lower.includes('battery') || lower.includes('charging') || lower.includes('power level')) {
      return {
        rawPrompt: raw,
        intent: 'battery_query',
        category: 'system_info',
        target: 'power_manager',
        parameters: {},
        required_permissions: ['battery'],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'system_info',
        verification_required: false,
        confidence: 0.96
      }
    }

    // 7. NOTIFICATIONS ("Read notifications", "Summarize my notifications", "What notifications do I have?")
    if (lower.includes('notification') || lower.includes('alerts') || lower.includes('read my messages')) {
      return {
        rawPrompt: raw,
        intent: 'read_notifications',
        category: 'productivity',
        target: 'notification_listener',
        parameters: { summarize: true },
        required_permissions: ['notifications'],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'notifications',
        verification_required: false,
        confidence: 0.93
      }
    }

    // 8. LOCATION & GPS ("Where am I?", "Navigate home", "Find restaurants nearby", "Show nearest hospital")
    if (lower.includes('where am i') || lower.includes('navigate') || lower.includes('directions to') || lower.includes('nearby') || lower.includes('nearest')) {
      return {
        rawPrompt: raw,
        intent: 'location_query',
        category: 'navigation',
        target: 'gps_maps',
        parameters: { query: raw },
        required_permissions: ['location'],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'maps',
        verification_required: true,
        confidence: 0.93
      }
    }

    // 9. ALARMS & TIMERS ("Set an alarm for 7 AM", "Timer for 10 minutes", "Remind me at 5 PM")
    if (lower.includes('alarm') || lower.includes('timer') || lower.includes('remind me at')) {
      return {
        rawPrompt: raw,
        intent: 'alarm_timer',
        category: 'productivity',
        target: 'clock_manager',
        parameters: { rawText: raw },
        required_permissions: ['alarms'],
        risk_level: 'medium',
        requires_confirmation: false,
        tool: 'alarms',
        verification_required: true,
        confidence: 0.91
      }
    }

    // 10. CAMERA & OCR ("Scan document", "What is in front of the camera?", "Read text from image", "Take a photo")
    if (lower.includes('camera') || lower.includes('scan document') || lower.includes('ocr') || lower.includes('take a picture') || lower.includes('take photo')) {
      return {
        rawPrompt: raw,
        intent: 'vision_ocr',
        category: 'vision_ocr',
        target: 'camera_ocr',
        parameters: { action: lower.includes('scan') ? 'ocr' : 'capture' },
        required_permissions: ['camera'],
        risk_level: 'medium',
        requires_confirmation: false,
        tool: 'camera',
        verification_required: true,
        confidence: 0.92
      }
    }

    // 11. SCREEN CONTEXT & ACCESSIBILITY ("What is on my screen?", "Read current screen", "Click submit button")
    if (lower.includes('screen') || lower.includes('click ') || lower.includes('tap ') || lower.includes('scroll down') || lower.includes('scroll up')) {
      return {
        rawPrompt: raw,
        intent: 'screen_accessibility',
        category: 'accessibility',
        target: 'accessibility_service',
        parameters: { action: raw },
        required_permissions: ['accessibility'],
        risk_level: 'medium',
        requires_confirmation: lower.includes('delete') || lower.includes('pay') || lower.includes('confirm'),
        tool: 'accessibility',
        verification_required: true,
        confidence: 0.9
      }
    }

    // 12. MEMORY ("Remember that...", "What do you remember?", "Forget this")
    if (lower.startsWith('remember ') || lower.includes('what do you remember') || lower.startsWith('forget ')) {
      return {
        rawPrompt: raw,
        intent: 'memory_manage',
        category: 'memory',
        target: 'mem0_layer',
        parameters: {
          action: lower.startsWith('remember ') ? 'store' : lower.startsWith('forget ') ? 'delete' : 'retrieve',
          statement: raw
        },
        required_permissions: [],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'memory',
        verification_required: true,
        confidence: 0.97
      }
    }

    // 13. PRIVACY DASHBOARD ("Show privacy dashboard", "Privacy settings", "Permissions audit")
    if (lower.includes('privacy') || lower.includes('permissions dashboard') || lower.includes('privacy dashboard')) {
      return {
        rawPrompt: raw,
        intent: 'privacy_dashboard',
        category: 'privacy',
        target: 'privacy_manager',
        parameters: {},
        required_permissions: [],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'privacy',
        verification_required: false,
        confidence: 0.98
      }
    }

    // 14. DEVICE SETTINGS ("Open Wi-Fi settings", "Open Bluetooth settings", "Open Sound settings")
    if (lower.includes('settings')) {
      return {
        rawPrompt: raw,
        intent: 'device_settings',
        category: 'device_setting',
        target: 'settings_app',
        parameters: { query: raw },
        required_permissions: [],
        risk_level: 'low',
        requires_confirmation: false,
        tool: 'settings',
        verification_required: true,
        confidence: 0.94
      }
    }

    // 15. DEFAULT WEB SEARCH & GENERAL ASSISTANT INTENT
    return {
      rawPrompt: raw,
      intent: 'general_ai_assistant',
      category: 'web_search',
      target: 'ai_neural_core',
      parameters: { query: raw },
      required_permissions: [],
      risk_level: 'low',
      requires_confirmation: false,
      tool: 'web_search',
      verification_required: false,
      confidence: 0.85
    }
  }
}

export const irisCommandParser = new IrisCommandParser()
