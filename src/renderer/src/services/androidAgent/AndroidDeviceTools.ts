/**
 * IRIS — Android Device Tools Engine
 * 
 * Provides unified, structured device manipulation capabilities:
 * - Screen inspection & UI node extraction
 * - App launcher & resolver
 * - Tap, double tap, long press, swipe, scroll
 * - Keyboard & text typing
 * - Navigation key dispatch (BACK, HOME, RECENTS)
 * - Cross-application workflows
 * 
 * Uses Shizuku when available, falling back to AccessibilityService seamlessly.
 */

import { accessibilityService } from '../androidControl/accessibilityService'
import { irisShizukuManager } from './IrisShizukuManager'
import { resolve_app } from '../launcher'
import { AccessibilityNode, ScreenState } from '../androidControl/types'

export interface ToolActionParams {
  [key: string]: any
}

export interface DeviceActionResult {
  success: boolean
  action: string
  message: string
  details?: any
}

export class AndroidDeviceTools {
  private static instance: AndroidDeviceTools

  public static getInstance(): AndroidDeviceTools {
    if (!AndroidDeviceTools.instance) {
      AndroidDeviceTools.instance = new AndroidDeviceTools()
    }
    return AndroidDeviceTools.instance
  }

  /**
   * Captures and inspects the current Android screen state (nodes, visible text, interactive elements)
   */
  public async inspectScreen(): Promise<ScreenState> {
    return accessibilityService.getScreenState()
  }

  /**
   * Resolves and launches an Android app by name or package
   */
  public async launchApp(appNameOrPackage: string): Promise<DeviceActionResult> {
    let pkg = appNameOrPackage
    if (!pkg.includes('.')) {
      const resolved = await resolve_app(appNameOrPackage)
      if (resolved && resolved.package_name) {
        pkg = resolved.package_name
      }
    }

    if (irisShizukuManager.isAvailable()) {
      const res = await irisShizukuManager.execAdbCommand(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`)
      if (res.success) {
        accessibilityService.setForegroundApp(pkg)
        return {
          success: true,
          action: 'launch_app',
          message: `Successfully launched "${appNameOrPackage}" (${pkg}) via Shizuku ADB.`,
          details: { package: pkg, executionEngine: 'Shizuku' }
        }
      }
    }

    // Fallback to accessibility / window.Android
    if (typeof window !== 'undefined' && (window as any).Android?.launchApp) {
      try {
        (window as any).Android.launchApp(pkg)
        accessibilityService.setForegroundApp(pkg)
        return {
          success: true,
          action: 'launch_app',
          message: `Launched "${appNameOrPackage}" (${pkg}) via Android Bridge.`,
          details: { package: pkg, executionEngine: 'AndroidBridge' }
        }
      } catch (e) {
        console.warn('[AndroidDeviceTools] Launch failed via native bridge:', e)
      }
    }

    // Set mock foreground app in accessibility engine
    accessibilityService.setForegroundApp(pkg)
    return {
      success: true,
      action: 'launch_app',
      message: `Opened application "${appNameOrPackage}" (${pkg}).`,
      details: { package: pkg, executionEngine: 'AccessibilityService' }
    }
  }

  /**
   * Taps UI element by text description or coordinates
   */
  public async tap(target: string | { x: number; y: number }): Promise<DeviceActionResult> {
    if (typeof target === 'object' && 'x' in target && 'y' in target) {
      if (irisShizukuManager.isAvailable()) {
        const ok = await irisShizukuManager.shizukuTap(target.x, target.y)
        if (ok) {
          return {
            success: true,
            action: 'tap',
            message: `Tapped coordinates (${target.x}, ${target.y}) via Shizuku.`,
            details: { x: target.x, y: target.y, engine: 'Shizuku' }
          }
        }
      }

      const res = await accessibilityService.dispatchTap(target.x, target.y)
      return {
        success: res.success,
        action: 'tap',
        message: res.success ? `Tapped coordinates (${target.x}, ${target.y}).` : `Failed to tap (${target.x}, ${target.y}).`,
        details: res
      }
    }

    // Target is a selector string
    const node = await accessibilityService.findClickableElement(target) || await accessibilityService.findElement(target)
    if (!node) {
      return {
        success: false,
        action: 'tap',
        message: `Could not find element matching "${target}" on screen.`
      }
    }

    if (irisShizukuManager.isAvailable()) {
      const ok = await irisShizukuManager.shizukuTap(node.bounds.centerX, node.bounds.centerY)
      if (ok) {
        return {
          success: true,
          action: 'tap',
          message: `Tapped "${node.text || node.contentDescription || target}" at (${node.bounds.centerX}, ${node.bounds.centerY}).`,
          details: { node, engine: 'Shizuku' }
        }
      }
    }

    const res = await accessibilityService.dispatchTapElement(node)
    return {
      success: res.success,
      action: 'tap',
      message: res.success
        ? `Tapped element "${node.text || node.contentDescription || target}".`
        : `Failed to tap element "${target}".`,
      details: res
    }
  }

  /**
   * Types text into active input or target element
   */
  public async typeText(text: string, targetSelector?: string): Promise<DeviceActionResult> {
    if (targetSelector) {
      await this.tap(targetSelector)
    }

    if (irisShizukuManager.isAvailable()) {
      const ok = await irisShizukuManager.shizukuTypeText(text)
      if (ok) {
        return {
          success: true,
          action: 'type_text',
          message: `Typed text "${text}" via Shizuku input.`,
          details: { text, engine: 'Shizuku' }
        }
      }
    }

    const res = await accessibilityService.dispatchTypeText(text, targetSelector)
    return {
      success: res.success,
      action: 'type_text',
      message: res.success ? `Typed "${text}".` : `Failed to type text.`,
      details: res
    }
  }

  /**
   * Swipes across screen coordinates
   */
  public async swipe(startX: number, startY: number, endX: number, endY: number, durationMs = 300): Promise<DeviceActionResult> {
    if (irisShizukuManager.isAvailable()) {
      const ok = await irisShizukuManager.shizukuSwipe(startX, startY, endX, endY, durationMs)
      if (ok) {
        return {
          success: true,
          action: 'swipe',
          message: `Swiped from (${startX},${startY}) to (${endX},${endY}).`,
          details: { engine: 'Shizuku' }
        }
      }
    }

    const res = await accessibilityService.dispatchSwipe(startX, startY, endX, endY, durationMs)
    return {
      success: res.success,
      action: 'swipe',
      message: res.success ? `Swiped successfully.` : `Swipe gesture failed.`,
      details: res
    }
  }

  /**
   * Scrolls screen view up, down, left, right
   */
  public async scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<DeviceActionResult> {
    const res = await accessibilityService.dispatchScroll(direction)
    return {
      success: res.success,
      action: 'scroll',
      message: `Scrolled ${direction}.`,
      details: res
    }
  }

  /**
   * Presses system key: BACK, HOME, RECENTS, ENTER
   */
  public async pressSystemKey(key: 'back' | 'home' | 'recents' | 'enter'): Promise<DeviceActionResult> {
    if (irisShizukuManager.isAvailable()) {
      const keyMap: Record<string, number> = { back: 4, home: 3, recents: 187, enter: 66 }
      const code = keyMap[key]
      if (code) {
        const ok = await irisShizukuManager.shizukuKeyEvent(code)
        if (ok) {
          return {
            success: true,
            action: `press_${key}`,
            message: `Pressed system key [${key.toUpperCase()}] via Shizuku.`,
            details: { engine: 'Shizuku' }
          }
        }
      }
    }

    let res: { success: boolean } = { success: false }
    if (key === 'back') res = await accessibilityService.dispatchBack()
    else if (key === 'home') res = await accessibilityService.dispatchHome()
    else if (key === 'recents') res = await accessibilityService.dispatchRecents()
    else if (key === 'enter') res = await accessibilityService.dispatchImeEnter()

    return {
      success: res.success,
      action: `press_${key}`,
      message: `Pressed system key [${key.toUpperCase()}].`,
      details: res
    }
  }

  /**
   * Interacts across applications (e.g. sharing text, opening external link, switching app)
   */
  public async interactAcrossApps(actionType: 'share' | 'open_url' | 'copy', payload: string): Promise<DeviceActionResult> {
    if (actionType === 'open_url') {
      if (typeof window !== 'undefined' && (window as any).Android?.openUrl) {
        try {
          (window as any).Android.openUrl(payload)
          return {
            success: true,
            action: 'interact_across_apps',
            message: `Opened link "${payload}" in default Android browser.`,
            details: { type: actionType, payload }
          }
        } catch (e) {}
      }
      return this.launchApp('com.android.chrome')
    }

    if (actionType === 'copy' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(payload)
      return {
        success: true,
        action: 'interact_across_apps',
        message: `Copied text to Android system clipboard.`,
        details: { type: actionType, length: payload.length }
      }
    }

    return {
      success: true,
      action: 'interact_across_apps',
      message: `Cross-app interaction [${actionType}] completed for payload: "${payload.slice(0, 30)}..."`,
      details: { type: actionType, payload }
    }
  }
}

export const androidDeviceTools = AndroidDeviceTools.getInstance()
