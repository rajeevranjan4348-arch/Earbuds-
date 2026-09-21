/**
 * Installed App Resolver & Smart Matching Engine for Android
 * Powered by authentic KISS Launcher (Neamar/KISS) core:
 * - fr.neamar.kiss.dataprovider.AppProvider
 * - fr.neamar.kiss.searcher.ApplicationsSearcher
 * - fr.neamar.kiss.utils.fuzzy.FuzzyScoreV2
 * - fr.neamar.kiss.normalizer.StringNormalizer
 */

import { InstalledApp, ResolveAppResult } from './types'
import {
  kissAppProvider,
  kissSearcher,
  AppPojo,
  StringNormalizer,
  BASELINE_KISS_APP_CATALOG
} from './kiss'

/**
 * Converts a KISS AppPojo to the system's InstalledApp representation
 */
export function pojoToInstalledApp(pojo: AppPojo): InstalledApp {
  return {
    name: pojo.getName(),
    packageName: pojo.packageName,
    launchActivity: pojo.activityName,
    aliases: pojo.tags,
    category: (pojo.category as any) || 'utility',
    isSystemApp: pojo.isSystemApp
  }
}

/**
 * Baseline catalog of standard Android launchable applications
 */
export const DEFAULT_ANDROID_APPS: InstalledApp[] = BASELINE_KISS_APP_CATALOG.map((raw) => ({
  name: raw.name,
  packageName: raw.packageName,
  launchActivity: raw.activityName || raw.launchActivity,
  aliases: raw.aliases || [],
  category: (raw.category as any) || 'utility',
  isSystemApp: raw.isSystemApp
}))

/**
 * Normalizes a string using KISS StringNormalizer
 */
export function normalizeString(str: string): string {
  return StringNormalizer.normalize(str)
}

class AppResolverService {
  /**
   * Retrieves all installed apps using KISS AppProvider
   */
  public async getInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
    await kissAppProvider.initialize(forceRefresh)
    const pojos = kissAppProvider.getPojos()
    return pojos.map(pojoToInstalledApp)
  }

  /**
   * Smart App Matching using authentic KISS Launcher fuzzy search (FuzzyScoreV2):
   * Resolves a user's spoken or typed app name to an InstalledApp.
   * Handles acronyms ("YT" -> "YouTube", "WA" -> "WhatsApp"), camelCase,
   * prefixes, aliases, package leaves, and ambiguity detection.
   */
  public async resolveApp(requestedName: string): Promise<ResolveAppResult> {
    if (!requestedName || !requestedName.trim()) {
      return { status: 'APP_NOT_FOUND' }
    }

    await kissAppProvider.initialize()
    const query = requestedName.trim()

    // Query KISS Searcher
    const candidates = kissSearcher.search(query, 10)

    if (candidates.length === 0) {
      return {
        status: 'APP_NOT_FOUND'
      }
    }

    const top = candidates[0]

    // Ambiguity detection: check if runner up is nearly identical in score
    // (e.g. WhatsApp vs WhatsApp Business)
    const closeMatches = candidates.filter(
      (c, idx) =>
        idx > 0 &&
        !c.isExactMatch &&
        !top.isExactMatch &&
        Math.abs(c.score - top.score) < 15 &&
        c.score >= 120
    )

    if (closeMatches.length > 0 && !top.isExactMatch) {
      const allMatches = [top.app, ...closeMatches.map((m) => m.app)]
      const installedApps = allMatches.map(pojoToInstalledApp)
      const namesList = installedApps.map((a) => a.name).join(' or ')
      return {
        status: 'MULTIPLE_MATCHES',
        candidates: installedApps,
        clarificationPrompt: `I found multiple matching apps: ${namesList}. Which one would you like to open?`
      }
    }

    // Found top match
    return {
      status: 'MATCH_FOUND',
      app: pojoToInstalledApp(top.app)
    }
  }

  /**
   * Find an app specifically by its package name
   */
  public async findByPackage(packageName: string): Promise<InstalledApp | null> {
    await kissAppProvider.initialize()
    const pojo = kissAppProvider.findByPackage(packageName)
    return pojo ? pojoToInstalledApp(pojo) : null
  }

  /**
   * Invalidate cached app list and trigger a fresh scan
   */
  public async invalidateCache(): Promise<void> {
    await kissAppProvider.initialize(true)
  }
}

export const appResolver = new AppResolverService()
