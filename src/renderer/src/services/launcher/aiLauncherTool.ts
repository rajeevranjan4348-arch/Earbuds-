/**
 * AI Tool / Function Architecture for Android App Launcher
 * Exposes internal functions:
 * - launch_app(app_name)
 * - get_installed_apps()
 * - resolve_app(app_name)
 *
 * Separates tool execution from the conversational response layer.
 */

import { androidLauncher } from './androidLauncher'
import { appResolver } from './appResolver'
import { InstalledApp, LaunchAppResult, ResolveAppResult } from './types'

/**
 * AI Tool: launch_app(app_name)
 * Resolves the specified application name and executes the Android launch intent.
 */
export async function launch_app(app_name: string): Promise<LaunchAppResult> {
  return await androidLauncher.launchApp(app_name)
}

/**
 * AI Tool: get_installed_apps()
 * Returns the cached or discovered list of launchable applications on the device.
 */
export async function get_installed_apps(forceRefresh = false): Promise<InstalledApp[]> {
  return await appResolver.getInstalledApps(forceRefresh)
}

/**
 * AI Tool: resolve_app(app_name)
 * Resolves a requested app name against the installed apps registry without launching it.
 */
export async function resolve_app(app_name: string): Promise<ResolveAppResult> {
  return await appResolver.resolveApp(app_name)
}
