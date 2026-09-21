/**
 * Android App Launcher Service
 * Powered by authentic KISS Launcher (Neamar/KISS) AppResult & Intent Dispatcher:
 * - fr.neamar.kiss.result.AppResult
 * - fr.neamar.kiss.bridge.KissLauncherBridge
 *
 * Dispatches launch intents across Android platforms:
 * - Native Android WebView / Bridge (window.Android)
 * - Android Intent URI Specification
 * - Connected Android Device via ADB Uplink
 * - Desktop/Electron IPC layer
 */

import { appResolver, pojoToInstalledApp } from './appResolver'
import { InstalledApp, LaunchAppResult } from './types'
import { kissLauncherBridge, kissAppProvider, AppResult } from './kiss'

export class AndroidAppLauncher {
  /**
   * Main entry point for AI app launching.
   * Resolves target app using KISS search and executes the Android launch intent.
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

    const trimmed = appName.trim()

    // 1. Resolve application against installed apps registry using KISS
    const resolution = await appResolver.resolveApp(trimmed)

    // 2. Handle app not found gracefully (KISS ActivityNotFound / missing package handling)
    if (resolution.status === 'APP_NOT_FOUND' || !resolution.app) {
      return {
        success: false,
        status: 'APP_NOT_FOUND',
        appNameRequested: trimmed,
        message: `Package for '${trimmed}' is not installed on target Android environment.`,
        spokenResponse: "I couldn't find that app on your phone."
      }
    }

    // 3. Handle multiple conflicting matches (Safety / Disambiguation)
    if (resolution.status === 'MULTIPLE_MATCHES' && resolution.candidates) {
      return {
        success: false,
        status: 'MULTIPLE_MATCHES',
        appNameRequested: trimmed,
        message: 'Multiple matching apps detected.',
        spokenResponse:
          resolution.clarificationPrompt ||
          `I found multiple apps matching ${trimmed}. Which one did you mean?`
      }
    }

    const app = resolution.app

    // 4. Execute the Android Launch Intent using KISS Bridge & AppResult
    try {
      const kissResponse = await kissLauncherBridge.findAndLaunch(app.name)

      if (kissResponse.success) {
        return {
          success: true,
          status: 'SUCCESS',
          app,
          appNameRequested: trimmed,
          targetPackage: app.packageName,
          launchMethod: (kissResponse.execution?.layer as any) || 'android_intent',
          message: kissResponse.displayText,
          spokenResponse: `Opening ${app.name}.`
        }
      }

      return {
        success: false,
        status: 'LAUNCH_FAILED',
        app,
        appNameRequested: trimmed,
        targetPackage: app.packageName,
        message: kissResponse.displayText || `Failed to launch ${app.name}`,
        spokenResponse: `Unable to launch ${app.name} at this time.`,
        error: kissResponse.error
      }
    } catch (err: any) {
      console.error(
        `[IRIS KISS Launcher] Error dispatching launch intent for ${app.packageName}:`,
        err
      )
      return {
        success: false,
        status: 'LAUNCH_FAILED',
        app,
        appNameRequested: trimmed,
        targetPackage: app.packageName,
        message: `Failed to launch ${app.name}: ${err?.message || 'Unknown error'}`,
        spokenResponse: `Unable to launch ${app.name} at this time.`,
        error: err?.message || String(err)
      }
    }
  }

  /**
   * Direct package launcher using KISS AppResult
   */
  public async launchPackage(packageName: string): Promise<LaunchAppResult> {
    const res = await kissLauncherBridge.launchPackage(packageName)
    const app = await appResolver.findByPackage(packageName)

    return {
      success: res.success,
      status: res.success ? 'SUCCESS' : 'LAUNCH_FAILED',
      app: app || undefined,
      appNameRequested: packageName,
      targetPackage: packageName,
      launchMethod: (res.execution?.layer as any) || 'android_intent',
      message: res.displayText,
      spokenResponse: res.spokenResponse
    }
  }

  /**
   * Constructs the official Android Intent URI for the target package.
   * Format: intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=<pkg>;[component=<pkg>/<act>;]end
   */
  public buildAndroidIntentUri(app: InstalledApp): string {
    const pojo = kissAppProvider.findByPackage(app.packageName)
    if (pojo) {
      const appResult = new AppResult(pojo)
      return appResult.buildIntent().uri || ''
    }
    const pkg = app.packageName
    const component = app.launchActivity ? `component=${pkg}/${app.launchActivity};` : ''
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${pkg};${component}end;`
  }
}

export const androidLauncher = new AndroidAppLauncher()
