import { AppItem, LaunchResult, LaunchMethod } from './types'
import { appRegistry } from './AppRegistry'
import { permissionManager } from './PermissionManager'
import { chatHistoryService } from '../services/chatHistoryService'
import { memoryService } from '../services/memoryService'
import { shortcutService } from '../services/shortcutService'

export type NavigateCallback = (tab: string) => void

class LaunchManager {
  private navigateCallback: NavigateCallback | null = null

  public setNavigateCallback(callback: NavigateCallback) {
    this.navigateCallback = callback
  }

  /**
   * Executes launch of an application item by id or item object
   */
  public async launch(
    appOrId: string | AppItem,
    secondaryQuery?: string
  ): Promise<LaunchResult> {
    const app = typeof appOrId === 'string' ? appRegistry.getById(appOrId) : appOrId

    if (!app) {
      return {
        success: false,
        status: 'APP_NOT_FOUND',
        message: `Application "${typeof appOrId === 'string' ? appOrId : 'Unknown'}" not found.`,
        spokenResponse: "I couldn't find that application."
      }
    }

    // 1. Check for sensitive / destructive confirmation requirement
    if (app.destructive && app.confirmationPrompt) {
      const confirmed = await permissionManager.requestConfirmation({
        id: `confirm_${app.id}_${Date.now()}`,
        title: app.confirmationPrompt.title,
        message: app.confirmationPrompt.message,
        confirmLabel: app.confirmationPrompt.confirmLabel || 'Proceed',
        cancelLabel: app.confirmationPrompt.cancelLabel || 'Cancel',
        onConfirm: async () => {
          await this.executeAppAction(app, secondaryQuery)
        }
      })

      if (!confirmed) {
        return {
          success: false,
          app,
          status: 'CONFIRMATION_PENDING',
          message: `Action cancelled by user: ${app.name}`,
          spokenResponse: 'Action cancelled.'
        }
      }

      appRegistry.recordLaunch(app.id)
      return {
        success: true,
        app,
        status: 'SUCCESS',
        message: `Executed confirmed action: ${app.name}`,
        spokenResponse: `${app.name} completed.`
      }
    }

    // 2. Normal execution
    try {
      const result = await this.executeAppAction(app, secondaryQuery)
      appRegistry.recordLaunch(app.id)
      return result
    } catch (err: any) {
      console.error(`[LaunchManager] Failed to launch ${app.name}:`, err)
      return {
        success: false,
        app,
        status: 'LAUNCH_FAILED',
        message: `Failed to launch ${app.name}: ${err?.message || 'Execution error'}`,
        spokenResponse: `Unable to open ${app.name}.`,
        fallbackUrl: app.webFallbackUrl || (app.type === 'external' ? app.target : undefined),
        error: err?.message
      }
    }
  }

  /**
   * Dispatches app action based on its type and launchMethod
   */
  private async executeAppAction(app: AppItem, secondaryQuery?: string): Promise<LaunchResult> {
    // A. Internal Route Navigation
    if (app.type === 'internal') {
      if (this.navigateCallback) {
        this.navigateCallback(app.target)
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('iris:navigate', { detail: { tab: app.target } })
        )
      }
      return {
        success: true,
        app,
        status: 'SUCCESS',
        methodUsed: 'internal_route',
        message: `Navigated to ${app.name}`,
        spokenResponse: `Opening ${app.name}.`
      }
    }

    // B. Internal Commands & Tool Triggers
    if (app.type === 'tool' || app.type === 'command') {
      return await this.executeCommand(app, secondaryQuery)
    }

    // C. External Application (with Deep-Link & Safe Web Fallback)
    if (app.type === 'external') {
      return await this.executeExternalApp(app, secondaryQuery)
    }

    return {
      success: false,
      app,
      status: 'LAUNCH_FAILED',
      message: `Unknown launch type for ${app.name}`
    }
  }

  /**
   * Executes internal tools and actions
   */
  private async executeCommand(app: AppItem, secondaryQuery?: string): Promise<LaunchResult> {
    switch (app.target) {
      case 'ACTION_TOGGLE_VOICE': {
        shortcutService.triggerAction('TRIGGER_VOICE')
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Voice conversation mode toggled',
          spokenResponse: 'Voice mode active.'
        }
      }

      case 'ACTION_CAMERA_VISION': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('iris:vision-mode', { detail: { mode: 'camera' } })
          )
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Camera vision scanner enabled',
          spokenResponse: 'Camera vision enabled.'
        }
      }

      case 'ACTION_SCREEN_VISION': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('iris:vision-mode', { detail: { mode: 'screen' } })
          )
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Screen vision inspection enabled',
          spokenResponse: 'Screen vision enabled.'
        }
      }

      case 'ACTION_KNOWLEDGE_OVERLAY': {
        shortcutService.triggerAction('TOGGLE_KNOWLEDGE')
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Knowledge base opened',
          spokenResponse: 'Opening knowledge base.'
        }
      }

      case 'ACTION_MINIMAL_HUD': {
        shortcutService.triggerAction('TOGGLE_CORE_UI')
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Minimalist HUD toggled',
          spokenResponse: 'Minimalist HUD toggled.'
        }
      }

      case 'ACTION_GESTURE_GUIDE': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('iris:open-gesture-guide'))
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Gesture guide opened'
        }
      }

      case 'ACTION_GITHUB_FIXER': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('iris:run-github-fixer', { detail: { query: secondaryQuery } })
          )
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Autonomous codebase health inspector running',
          spokenResponse: 'Inspecting codebase.'
        }
      }

      case 'ACTION_CLEAR_CHATS': {
        chatHistoryService.clear()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('iris:chats-cleared'))
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'All saved chat history deleted',
          spokenResponse: 'All chat history deleted.'
        }
      }

      case 'ACTION_CLEAR_MEMORY': {
        await memoryService.clearMemory()
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Neural memory vault reset',
          spokenResponse: 'Memory vault has been cleared.'
        }
      }

      case 'ACTION_EMERGENCY_STOP': {
        shortcutService.triggerAction('STOP_SPEECH')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('iris:emergency-halt'))
        }
        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'command',
          message: 'Emergency stop activated. All agent workflows halted.',
          spokenResponse: 'Emergency stop activated.'
        }
      }

      default:
        return {
          success: false,
          app,
          status: 'LAUNCH_FAILED',
          message: `Unknown command: ${app.target}`
        }
    }
  }

  /**
   * Dispatches external app launch using deep link with web fallback
   */
  private async executeExternalApp(app: AppItem, secondaryQuery?: string): Promise<LaunchResult> {
    let targetUrl = app.target
    let deepLinkUrl = app.deepLink

    // If query provided, attach to search URL
    if (secondaryQuery && secondaryQuery.trim()) {
      const encoded = encodeURIComponent(secondaryQuery.trim())
      if (app.id === 'youtube-ext') {
        targetUrl = `https://www.youtube.com/results?search_query=${encoded}`
        deepLinkUrl = `vnd.youtube://results?search_query=${encoded}`
      } else if (app.id === 'github-ext') {
        targetUrl = `https://github.com/search?q=${encoded}`
      } else if (app.id === 'web-browser') {
        targetUrl = `https://www.google.com/search?q=${encoded}`
      } else if (app.id === 'spotify') {
        targetUrl = `https://open.spotify.com/search/${encoded}`
        deepLinkUrl = `spotify:search:${encoded}`
      } else if (app.id === 'whatsapp') {
        targetUrl = `https://web.whatsapp.com/send?text=${encoded}`
        deepLinkUrl = `whatsapp://send?text=${encoded}`
      }
    }

    // 1. Android Native Bridge if running inside an Android container or WebView
    const win = window as any
    if (win.Android && typeof win.Android.launchApp === 'function') {
      try {
        const launched = win.Android.launchApp(app.name, deepLinkUrl || targetUrl)
        if (launched) {
          return {
            success: true,
            app,
            status: 'SUCCESS',
            methodUsed: 'deep_link',
            message: `Launched ${app.name} via Android Bridge`,
            spokenResponse: `Opening ${app.name}.`
          }
        }
      } catch (_e) {
        // Fall back to browser navigation
      }
    }

    // 2. Browser Environment: If deep link is present and app supports it, attempt deep-link
    // Note: To avoid leaving user stranded or redirecting to app store,
    // we use window.open for web version while attempting deep link
    try {
      if (deepLinkUrl && typeof window !== 'undefined' && 'ontouchstart' in window) {
        // On mobile browser, attempt deep-link iframe or location href
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = deepLinkUrl
        document.body.appendChild(iframe)

        setTimeout(() => {
          try {
            document.body.removeChild(iframe)
          } catch (_e) {}
        }, 1000)

        // Open web fallback after short grace period if document still has focus
        setTimeout(() => {
          if (document.hasFocus()) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer')
          }
        }, 800)

        return {
          success: true,
          app,
          status: 'SUCCESS',
          methodUsed: 'deep_link',
          message: `Opened ${app.name}`,
          spokenResponse: `Opening ${app.name}.`,
          fallbackUrl: targetUrl
        }
      }

      // 3. Desktop / Standard Web: Open web fallback URL
      window.open(targetUrl, '_blank', 'noopener,noreferrer')

      return {
        success: true,
        app,
        status: 'SUCCESS',
        methodUsed: 'web_fallback',
        message: `Opened ${app.name}`,
        spokenResponse: `Opening ${app.name}.`,
        fallbackUrl: targetUrl
      }
    } catch (err: any) {
      return {
        success: false,
        app,
        status: 'LAUNCH_FAILED',
        message: `Could not open ${app.name}`,
        spokenResponse: `Unable to open ${app.name}.`,
        fallbackUrl: targetUrl,
        error: err?.message
      }
    }
  }
}

export const launchManager = new LaunchManager()
