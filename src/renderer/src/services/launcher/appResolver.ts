/**
 * Installed App Resolver & Smart Matching Engine for Android
 * Discovers launchable packages, maintains a lightweight cached registry,
 * and performs fuzzy/alias matching with ambiguity detection.
 */

import { InstalledApp, ResolveAppResult } from './types'

const CACHE_STORAGE_KEY = 'iris_android_app_cache'
const CACHE_TIMESTAMP_KEY = 'iris_android_app_cache_ts'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Baseline catalog of standard Android launchable applications and system packages.
 * Includes aliases, package names, and default launch activities across standard Android OS versions.
 */
export const DEFAULT_ANDROID_APPS: InstalledApp[] = [
  {
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    launchActivity: 'com.whatsapp.Main',
    aliases: ['wa', 'whatsapp', 'whats app', 'watsapp', 'wats app'],
    category: 'communication'
  },
  {
    name: 'WhatsApp Business',
    packageName: 'com.whatsapp.w4b',
    launchActivity: 'com.whatsapp.Main',
    aliases: ['wb', 'wa business', 'whatsapp business', 'watsapp business'],
    category: 'communication'
  },
  {
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    launchActivity: 'com.google.android.youtube.HomeActivity',
    aliases: ['yt', 'youtube', 'you tube', 'youtub'],
    category: 'media'
  },
  {
    name: 'YouTube Music',
    packageName: 'com.google.android.apps.youtube.music',
    launchActivity: 'com.google.android.apps.youtube.music.activities.MusicActivity',
    aliases: ['yt music', 'youtube music', 'ytmusic'],
    category: 'media'
  },
  {
    name: 'Google Chrome',
    packageName: 'com.android.chrome',
    launchActivity: 'com.google.android.apps.chrome.Main',
    aliases: ['chrome', 'chrome browser', 'google chrome', 'browser', 'web browser', 'internet'],
    category: 'utility'
  },
  {
    name: 'Instagram',
    packageName: 'com.instagram.android',
    launchActivity: 'com.instagram.mainactivity.MainActivity',
    aliases: ['insta', 'ig', 'instagram', 'instgram'],
    category: 'social'
  },
  {
    name: 'Spotify',
    packageName: 'com.spotify.music',
    launchActivity: 'com.spotify.music.MainActivity',
    aliases: ['spotify', 'spotfy', 'music', 'music player'],
    category: 'media'
  },
  {
    name: 'Calculator',
    packageName: 'com.google.android.calculator',
    launchActivity: 'com.android.calculator2.Calculator',
    aliases: ['calculator', 'calc', 'calcy', 'calculate'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Camera',
    packageName: 'com.google.android.GoogleCamera',
    launchActivity: 'com.android.camera.CameraLauncher',
    aliases: ['camera', 'cam', 'photo camera', 'video camera'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    launchActivity: 'com.google.android.maps.MapsActivity',
    aliases: ['maps', 'map', 'google maps', 'navigation', 'gps'],
    category: 'utility'
  },
  {
    name: 'Gmail',
    packageName: 'com.google.android.gm',
    launchActivity: 'com.google.android.gm.ConversationListActivityGmail',
    aliases: ['gmail', 'google mail', 'email', 'mail', 'inbox'],
    category: 'communication'
  },
  {
    name: 'Telegram',
    packageName: 'org.telegram.messenger',
    launchActivity: 'org.telegram.ui.LaunchActivity',
    aliases: ['telegram', 'tg', 'tele'],
    category: 'communication'
  },
  {
    name: 'X',
    packageName: 'com.twitter.android',
    launchActivity: 'com.twitter.android.StartActivity',
    aliases: ['x', 'twitter', 'tweet', 'tweeter'],
    category: 'social'
  },
  {
    name: 'Snapchat',
    packageName: 'com.snapchat.android',
    launchActivity: 'com.snapchat.android.LandingPageActivity',
    aliases: ['snap', 'snapchat', 'snaps'],
    category: 'social'
  },
  {
    name: 'TikTok',
    packageName: 'com.zhiliaoapp.musically',
    launchActivity: 'com.ss.android.ugc.aweme.splash.SplashActivity',
    aliases: ['tiktok', 'tik tok', 'tok'],
    category: 'social'
  },
  {
    name: 'Netflix',
    packageName: 'com.netflix.mediaclient',
    launchActivity: 'com.netflix.mediaclient.ui.launch.UIWebViewActivity',
    aliases: ['netflix', 'net flix'],
    category: 'media'
  },
  {
    name: 'Google Photos',
    packageName: 'com.google.android.apps.photos',
    launchActivity: 'com.google.android.apps.photos.home.HomeActivity',
    aliases: ['photos', 'gallery', 'google photos', 'images', 'pictures'],
    category: 'media',
    isSystemApp: true
  },
  {
    name: 'Messages',
    packageName: 'com.google.android.apps.messaging',
    launchActivity: 'com.google.android.apps.messaging.ui.ConversationListActivity',
    aliases: ['messages', 'sms', 'text messages', 'messaging', 'texts'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Phone',
    packageName: 'com.google.android.dialer',
    launchActivity: 'com.google.android.dialer.extensions.GoogleDialtactsActivity',
    aliases: ['phone', 'dialer', 'call', 'telephone', 'dial'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Settings',
    packageName: 'com.android.settings',
    launchActivity: 'com.android.settings.Settings',
    aliases: ['settings', 'system settings', 'preferences', 'configuration', 'config'],
    category: 'system',
    isSystemApp: true
  },
  {
    name: 'Clock',
    packageName: 'com.google.android.deskclock',
    launchActivity: 'com.android.deskclock.DeskClock',
    aliases: ['clock', 'alarm', 'timer', 'stopwatch'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Google Calendar',
    packageName: 'com.google.android.calendar',
    launchActivity: 'com.android.calendar.AllInOneActivity',
    aliases: ['calendar', 'google calendar', 'agenda', 'schedule'],
    category: 'productivity'
  },
  {
    name: 'Google Keep',
    packageName: 'com.google.android.keep',
    launchActivity: 'com.google.android.apps.keep.ui.activities.BrowseActivity',
    aliases: ['keep', 'google keep', 'keep notes', 'notes app'],
    category: 'productivity'
  },
  {
    name: 'Google Drive',
    packageName: 'com.google.android.apps.docs',
    launchActivity: 'com.google.android.apps.docs.app.NewMainProxyActivity',
    aliases: ['drive', 'google drive', 'cloud drive'],
    category: 'productivity'
  },
  {
    name: 'Files',
    packageName: 'com.google.android.documentsui',
    launchActivity: 'com.android.documentsui.files.FilesActivity',
    aliases: ['files', 'file manager', 'my files', 'file explorer', 'documents'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Google Play Store',
    packageName: 'com.android.vending',
    launchActivity: 'com.android.vending.AssetBrowserActivity',
    aliases: ['play store', 'google play', 'app store', 'playstore', 'store'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Contacts',
    packageName: 'com.google.android.contacts',
    launchActivity: 'com.android.contacts.activities.PeopleActivity',
    aliases: ['contacts', 'address book', 'phonebook', 'people'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Discord',
    packageName: 'com.discord',
    launchActivity: 'com.discord.main.MainActivity',
    aliases: ['discord', 'dc'],
    category: 'communication'
  },
  {
    name: 'Reddit',
    packageName: 'com.reddit.frontpage',
    launchActivity: 'com.reddit.frontpage.MainActivity',
    aliases: ['reddit'],
    category: 'social'
  },
  {
    name: 'Uber',
    packageName: 'com.ubercab',
    launchActivity: 'com.ubercab.presidio.app.core.root.RootActivity',
    aliases: ['uber', 'cab', 'ride'],
    category: 'utility'
  },
  {
    name: 'Slack',
    packageName: 'com.Slack',
    launchActivity: 'com.slack.ui.HomeActivity',
    aliases: ['slack'],
    category: 'productivity'
  }
]

/**
 * Normalizes a string for robust matching:
 * lowercase, removes special characters, trims excessive whitespace.
 */
export function normalizeString(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[._\-–—/\\+*&^%$#@!?,;:'"`~()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Standard Levenshtein distance calculation for typo tolerance.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Computes a similarity score between 0.0 and 1.0 between query and candidate.
 */
function computeMatchScore(query: string, target: string): number {
  const q = normalizeString(query)
  const t = normalizeString(target)

  if (!q || !t) return 0

  // 1. Exact match
  if (q === t) return 1.0

  // 2. Query equals target without spaces
  const qNoSpace = q.replace(/\s+/g, '')
  const tNoSpace = t.replace(/\s+/g, '')
  if (qNoSpace === tNoSpace) return 0.98

  // 3. Exact word match in target (e.g. query "chrome" in "google chrome")
  const targetWords = t.split(' ')
  if (targetWords.includes(q)) return 0.95

  // 4. Prefix match (e.g. query "insta" in "instagram")
  if (t.startsWith(q) || tNoSpace.startsWith(qNoSpace)) {
    return 0.9
  }

  // 5. Target starts with query
  if (q.startsWith(t)) {
    return 0.88
  }

  // 6. Substring match
  if (t.includes(q)) {
    return 0.8
  }

  // 7. Levenshtein typo matching
  const maxLen = Math.max(q.length, t.length)
  if (maxLen > 3) {
    const dist = levenshteinDistance(q, t)
    const ratio = (maxLen - dist) / maxLen
    if (ratio >= 0.75) {
      return 0.75 * ratio
    }
  }

  return 0
}

class AppResolverService {
  private inMemoryCache: InstalledApp[] | null = null
  private lastScanTimestamp: number = 0

  /**
   * Retrieves all installed apps from cache or triggers discovery when stale.
   */
  public async getInstalledApps(forceRefresh = false): Promise<InstalledApp[]> {
    const now = Date.now()

    // 1. Check in-memory cache
    if (!forceRefresh && this.inMemoryCache && now - this.lastScanTimestamp < CACHE_TTL_MS) {
      return this.inMemoryCache
    }

    // 2. Check localStorage cache
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const storedTs = localStorage.getItem(CACHE_TIMESTAMP_KEY)
        const storedData = localStorage.getItem(CACHE_STORAGE_KEY)
        if (storedTs && storedData) {
          const age = now - parseInt(storedTs, 10)
          if (age < CACHE_TTL_MS) {
            const parsed = JSON.parse(storedData)
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.inMemoryCache = parsed
              this.lastScanTimestamp = parseInt(storedTs, 10)
              return parsed
            }
          }
        }
      } catch (_e) {
        // storage reading error, proceed to discovery
      }
    }

    // 3. Discover apps from Android Bridge / connected ADB / system
    const apps = await this.discoverInstalledApps()

    // 4. Update cache
    this.inMemoryCache = apps
    this.lastScanTimestamp = now
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(apps))
        localStorage.setItem(CACHE_TIMESTAMP_KEY, String(now))
      } catch (_e) {}
    }

    return apps
  }

  /**
   * Discovers launchable packages using Android environment if available,
   * merging with the pre-compiled Android catalog.
   */
  private async discoverInstalledApps(): Promise<InstalledApp[]> {
    const appMap = new Map<string, InstalledApp>()

    // Seed with baseline apps
    for (const app of DEFAULT_ANDROID_APPS) {
      appMap.set(app.packageName, app)
    }

    // A. Check native Android Webview JavaScript Bridge if present
    if (typeof window !== 'undefined') {
      const androidBridge =
        (window as any).Android ||
        (window as any).AndroidBridge ||
        (window as any).IRISAndroid ||
        (window as any).IRISLauncher

      if (androidBridge && typeof androidBridge.getInstalledApps === 'function') {
        try {
          const raw = await Promise.resolve(androidBridge.getInstalledApps())
          const list = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item && item.packageName) {
                const pkg = item.packageName
                const existing = appMap.get(pkg)
                appMap.set(pkg, {
                  name: item.name || existing?.name || pkg,
                  packageName: pkg,
                  launchActivity: item.launchActivity || existing?.launchActivity,
                  aliases: Array.from(
                    new Set([
                      ...(existing?.aliases || []),
                      normalizeString(item.name || ''),
                      ...(Array.isArray(item.aliases) ? item.aliases : [])
                    ].filter(Boolean))
                  ),
                  isSystemApp: item.isSystemApp ?? existing?.isSystemApp,
                  category: item.category || existing?.category
                })
              }
            }
          }
        } catch (e) {
          console.warn('[IRIS Launcher] Native Android Bridge package query error:', e)
        }
      }
    }

    // B. Check ADB connection to Android device via Electron IPC
    if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
      try {
        const adbApps = await (window as any).electron.ipcRenderer.invoke('adb-get-installed-packages')
        if (Array.isArray(adbApps) && adbApps.length > 0) {
          for (const item of adbApps) {
            if (item && item.packageName) {
              const existing = appMap.get(item.packageName)
              appMap.set(item.packageName, {
                name: item.name || existing?.name || item.packageName,
                packageName: item.packageName,
                launchActivity: item.launchActivity || existing?.launchActivity,
                aliases: Array.from(
                  new Set([
                    ...(existing?.aliases || []),
                    normalizeString(item.name || ''),
                    ...(Array.isArray(item.aliases) ? item.aliases : [])
                  ].filter(Boolean))
                ),
                isSystemApp: item.isSystemApp ?? existing?.isSystemApp
              })
            }
          }
        }
      } catch (_e) {
        // ADB packages optional
      }
    }

    return Array.from(appMap.values())
  }

  /**
   * Smart App Matching:
   * Resolves a user's spoken or typed app name to an InstalledApp.
   * Handles abbreviations, aliases, fuzzy queries, and ambiguity.
   */
  public async resolveApp(requestedName: string): Promise<ResolveAppResult> {
    if (!requestedName || !requestedName.trim()) {
      return { status: 'APP_NOT_FOUND' }
    }

    const query = normalizeString(requestedName)
    const apps = await this.getInstalledApps()

    // Array of { app, score }
    const scoredMatches: { app: InstalledApp; score: number }[] = []

    for (const app of apps) {
      let maxScore = 0

      // Match against official display name
      const nameScore = computeMatchScore(query, app.name)
      if (nameScore > maxScore) maxScore = nameScore

      // Match against aliases
      for (const alias of app.aliases) {
        const aliasScore = computeMatchScore(query, alias)
        if (aliasScore > maxScore) maxScore = aliasScore
      }

      // Match against package name leaf (e.g. "whatsapp" from "com.whatsapp")
      const pkgLeaf = app.packageName.split('.').pop() || ''
      const pkgScore = computeMatchScore(query, pkgLeaf) * 0.85
      if (pkgScore > maxScore) maxScore = pkgScore

      if (maxScore >= 0.7) {
        scoredMatches.push({ app, score: maxScore })
      }
    }

    // Sort descending by match score
    scoredMatches.sort((a, b) => b.score - a.score)

    if (scoredMatches.length === 0) {
      return {
        status: 'APP_NOT_FOUND'
      }
    }

    const top = scoredMatches[0]

    // Check for ambiguity if multiple high-scoring matches exist
    // (e.g., WhatsApp vs WhatsApp Business, or YouTube vs YouTube Music)
    const closeCompetitors = scoredMatches.filter(
      (m, idx) => idx > 0 && Math.abs(m.score - top.score) < 0.08 && m.score >= 0.8
    )

    if (closeCompetitors.length > 0) {
      const candidates = [top.app, ...closeCompetitors.map((c) => c.app)]
      const namesList = candidates.map((c) => c.name).join(' or ')
      return {
        status: 'MULTIPLE_MATCHES',
        candidates,
        clarificationPrompt: `I found multiple matching apps: ${namesList}. Which one would you like to open?`
      }
    }

    // Single confident match
    return {
      status: 'MATCH_FOUND',
      app: top.app
    }
  }

  /**
   * Invalidate cached app list (e.g., when a new package is installed)
   */
  public invalidateCache(): void {
    this.inMemoryCache = null
    this.lastScanTimestamp = 0
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(CACHE_STORAGE_KEY)
        localStorage.removeItem(CACHE_TIMESTAMP_KEY)
      } catch (_e) {}
    }
  }
}

export const appResolver = new AppResolverService()
