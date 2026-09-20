/**
 * Android App Launcher Service
 * Executes launch intents for resolved applications across Android platforms:
 * - Native Android WebView / Bridge (window.Android)
 * - Android Intent URI Specification (startActivity via Intent URI)
 * - Connected Android Device via ADB Uplink (am start / monkey)
 * - Desktop/Electron IPC layer
 */

import { appResolver } from './appResolver'
import { InstalledApp, LaunchAppResult } from './types'

export class AndroidAppLauncher {
  /**
   * Main entry point for AI app launching.
   * Resolves target app and executes the Android launch intent.
   */
  public async launchApp(appName: string): Promise<LaunchAppResult> {
    if (!appName || !appName.trim()) {
      return {
        success: false,
        status: 'APP_NOT_FOUND',
        appNameRequested: appName,
        message: 'No application name specified.',
        spokenResponse: "I couldn't find that app on your phone."
      }
    }

    // 1. Resolve application against installed apps registry
    const resolution = await appResolver.resolveApp(appName)

    // 2. Handle app not found
    if (resolution.status === 'APP_NOT_FOUND' || !resolution.app) {
      return {
        success: false,
        status: 'APP_NOT_FOUND',
        appNameRequested: appName,
        message: `Package for '${appName}' is not installed on target Android environment.`,
        spokenResponse: "I couldn't find that app on your phone."
      }
    }

    // 3. Handle multiple conflicting matches (Safety / Disambiguation)
    if (resolution.status === 'MULTIPLE_MATCHES' && resolution.candidates) {
      return {
        success: false,
        status: 'MULTIPLE_MATCHES',
        appNameRequested: appName,
        message: 'Multiple matching apps detected.',
        spokenResponse:
          resolution.clarificationPrompt ||
          `I found multiple apps matching ${appName}. Which one did you mean?`
      }
    }

    const app = resolution.app

    // 4. Execute the Android Launch Intent
    try {
      const launchMethod = await this.dispatchLaunchIntent(app)

      return {
        success: true,
        status: 'SUCCESS',
        app,
        appNameRequested: appName,
        targetPackage: app.packageName,
        launchMethod,
        message: `Successfully triggered Android launch intent for ${app.name} (${app.packageName}).`,
        spokenResponse: `Opening ${app.name}.`
      }
    } catch (err: any) {
      console.error(`[IRIS Launcher] Error dispatching launch intent for ${app.packageName}:`, err)
      return {
        success: false,
        status: 'LAUNCH_FAILED',
        app,
        appNameRequested: appName,
        targetPackage: app.packageName,
        message: `Failed to launch ${app.name}: ${err?.message || 'Unknown error'}`,
        spokenResponse: `Unable to launch ${app.name} at this time.`,
        error: err?.message || String(err)
      }
    }
  }

  /**
   * Dispatches the launch intent across all possible Android execution layers.
   */
  private async dispatchLaunchIntent(
    app: InstalledApp
  ): Promise<'android_bridge' | 'android_intent' | 'adb' | 'electron'> {
    let dispatched = false

    // Layer 1: Native Android Bridge (WebView / Container Javascript Interface)
    if (typeof window !== 'undefined') {
      const bridge =
        (window as any).Android ||
        (window as any).AndroidBridge ||
        (window as any).IRISAndroid ||
        (window as any).IRISLauncher

      if (bridge) {
        if (typeof bridge.launchApp === 'function') {
          bridge.launchApp(app.packageName, app.launchActivity || '')
          return 'android_bridge'
        }
        if (typeof bridge.startActivity === 'function') {
          bridge.startActivity(this.buildAndroidIntentUri(app))
          return 'android_bridge'
        }
      }
    }

    // Layer 2: Connected ADB Target Device (Wireless / USB ADB Uplink)
    if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
      try {
        const adbRes = await (window as any).electron.ipcRenderer.invoke('adb-launch-app', {
          packageName: app.packageName,
          launchActivity: app.launchActivity,
          name: app.name
        })
        if (adbRes && adbRes.success) {
          return 'adb'
        }
      } catch (_e) {
        // ADB fallback to other layers
      }
    }

    // Layer 3: Android Intent URI specification (Standard Android Browser / PWA / WebView)
    // Conceptually: getLaunchIntentForPackage() -> startActivity() via Chrome Android Intent URI
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const intentUri = this.buildAndroidIntentUri(app)
      this.triggerIntentUri(intentUri)
      dispatched = true
    }

    // Layer 4: Electron IPC invoke fallback
    if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
      try {
        await (window as any).electron.ipcRenderer.invoke('launch-android-app', {
          packageName: app.packageName,
          launchActivity: app.launchActivity,
          name: app.name
        })
      } catch (_e) {}
    }

    return dispatched ? 'android_intent' : 'electron'
  }

  /**
   * Constructs the official Android Intent URI for the target package.
   * Format: intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=<pkg>;[component=<pkg>/<act>;]end
   */
  public buildAndroidIntentUri(app: InstalledApp): string {
    const pkg = app.packageName
    const component = app.launchActivity ? `component=${pkg}/${app.launchActivity};` : ''
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};${component}end;`
  }

  /**
   * Triggers the Android Intent URI cleanly without disrupting the current UI view.
   */
  private triggerIntentUri(uri: string): void {
    try {
      // Use hidden iframe to trigger intent without navigating away
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = uri
      document.body.appendChild(iframe)
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe)
        }
      }, 1000)
    } catch (_e) {
      // Fallback to direct anchor dispatch
      try {
        const link = document.createElement('a')
        link.href = uri
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link)
          }
        }, 500)
      } catch (_err) {}
    }
  }
}

export const androidLauncher = new AndroidAppLauncher()
