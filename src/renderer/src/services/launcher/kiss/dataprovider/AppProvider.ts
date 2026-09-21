/**
 * Authentic port of fr.neamar.kiss.dataprovider.AppProvider from Neamar/KISS
 * Manages the indexed collection of AppPojos, handles package installation / removal events,
 * and executes query matching using KISS FuzzyScoreV2 and history weighting.
 */

import { AppPojo } from '../pojo/AppPojo'
import { LoadAppPojos, RawAppInfo } from '../loader/LoadAppPojos'
import { StringNormalizer } from '../normalizer/StringNormalizer'
import { FuzzyScoreV2 } from '../fuzzy/FuzzyScoreV2'
import { MatchInfo } from '../fuzzy/MatchInfo'

const KISS_HISTORY_STORAGE_KEY = 'kiss_query_history'
const KISS_APPS_STORAGE_KEY = 'kiss_indexed_apps'
const KISS_LAST_LOAD_KEY = 'kiss_last_load_ts'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface HistoryRecord {
  query: string
  appId: string
  count: number
  lastUsed: number
}

export class AppProvider {
  private static instance: AppProvider | null = null

  public static getInstance(): AppProvider {
    if (!AppProvider.instance) {
      AppProvider.instance = new AppProvider()
    }
    return AppProvider.instance
  }

  private pojos: AppPojo[] = []
  private readonly loader = new LoadAppPojos()
  private isLoaded = false
  private queryHistory: Map<string, HistoryRecord> = new Map()

  constructor() {
    this.loadHistory()
  }

  /**
   * Initializes and populates the KISS App Provider index
   */
  public async initialize(forceReload = false): Promise<void> {
    if (this.isLoaded && !forceReload && this.pojos.length > 0) {
      return
    }

    // Try loading from cached storage if valid
    if (!forceReload && typeof window !== 'undefined') {
      try {
        const storedTs = localStorage.getItem(KISS_LAST_LOAD_KEY)
        const storedApps = localStorage.getItem(KISS_APPS_STORAGE_KEY)
        if (storedTs && storedApps) {
          const age = Date.now() - parseInt(storedTs, 10)
          if (age < CACHE_TTL_MS) {
            const parsed: RawAppInfo[] = JSON.parse(storedApps)
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.pojos = parsed.map((p) => this.loader.createAppPojo(p))
              this.isLoaded = true
              return
            }
          }
        }
      } catch (_e) {}
    }

    // Full scan via LoadAppPojos
    this.pojos = await this.loader.load()
    this.isLoaded = true

    this.persistApps()
  }

  /**
   * Returns all indexed AppPojos
   */
  public getPojos(): AppPojo[] {
    return this.pojos
  }

  /**
   * Finds an AppPojo by component name or package name
   */
  public findByPackage(packageName: string): AppPojo | undefined {
    return this.pojos.find((p) => p.packageName === packageName)
  }

  /**
   * Authentic KISS search resolution:
   * 1. Normalizes query using StringNormalizer
   * 2. Evaluates each pojo using FuzzyScoreV2
   * 3. Checks tags/aliases
   * 4. Applies KISS history boost (+100 for previously chosen results)
   * 5. Sorts by relevance descending
   */
  public requestResults(query: string, maxResults = 10): AppPojo[] {
    const trimmed = query.trim()
    if (!trimmed) {
      return []
    }

    const queryNormalized = StringNormalizer.normalizeWithResult(trimmed, true)
    if (queryNormalized.codePoints.length === 0) {
      return []
    }

    const fuzzyScore = new FuzzyScoreV2(queryNormalized.codePoints, false)
    const normalizedQueryStr = queryNormalized.normalizedString.toLowerCase()

    const results: { pojo: AppPojo; score: number }[] = []

    for (const pojo of this.pojos) {
      if (pojo.isExcluded()) continue

      let bestScore = -9999
      let matched = false

      // 1. Match against app display name with KISS FuzzyScoreV2
      const matchInfo: MatchInfo = fuzzyScore.match(pojo.normalizedName.codePoints)
      if (matchInfo.match) {
        matched = true
        bestScore = Math.max(bestScore, matchInfo.score)
      }

      // 2. Exact word / prefix bonus
      const pojoNormStr = pojo.normalizedName.normalizedString.toLowerCase()
      if (pojoNormStr === normalizedQueryStr) {
        bestScore = Math.max(bestScore, 200)
        matched = true
      } else if (pojoNormStr.startsWith(normalizedQueryStr)) {
        bestScore = Math.max(bestScore, 150)
        matched = true
      }

      // 3. Match against tags / aliases (e.g. "yt" -> YouTube, "wa" -> WhatsApp, "insta" -> Instagram)
      for (const tag of pojo.tags) {
        const tagNorm = StringNormalizer.normalizeWithResult(tag, true)
        if (tag.toLowerCase() === normalizedQueryStr) {
          bestScore = Math.max(bestScore, 180)
          matched = true
          break
        }
        const tagMatch = fuzzyScore.match(tagNorm.codePoints)
        if (tagMatch.match) {
          matched = true
          bestScore = Math.max(bestScore, tagMatch.score + 10)
        }
      }

      // 4. Package leaf match (e.g. "chrome" in "com.android.chrome")
      const pkgLeaf = pojo.packageName.split('.').pop() || ''
      if (pkgLeaf.toLowerCase() === normalizedQueryStr) {
        bestScore = Math.max(bestScore, 140)
        matched = true
      }

      // 5. Apply penalty for disabled items
      if (pojo.isDisabled()) {
        bestScore -= 200
      }

      // 6. KISS History Boost (authentic to fr.neamar.kiss.searcher.QuerySearcher.addResults)
      // Items previously selected for this query gain up to +100 bonus points
      const historyKey = `${normalizedQueryStr}|${pojo.id}`
      const history = this.queryHistory.get(historyKey)
      if (history && history.count > 0) {
        const boost = Math.min(100, 50 + history.count * 15)
        bestScore += boost
      }

      if (matched && bestScore > -20) {
        pojo.relevance = bestScore
        results.push({ pojo, score: bestScore })
      }
    }

    // Sort descending by calculated relevance score
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, maxResults).map((r) => r.pojo)
  }

  /**
   * Records a user's selection in KISS history to boost future search relevance
   */
  public recordSelection(query: string, pojo: AppPojo): void {
    const norm = StringNormalizer.normalize(query).toLowerCase()
    const historyKey = `${norm}|${pojo.id}`
    const existing = this.queryHistory.get(historyKey)
    if (existing) {
      existing.count += 1
      existing.lastUsed = Date.now()
    } else {
      this.queryHistory.set(historyKey, {
        query: norm,
        appId: pojo.id,
        count: 1,
        lastUsed: Date.now()
      })
    }
    this.saveHistory()
  }

  // Lifecycle handlers authentic to KISS AppProvider / LauncherAppsCallback
  public onPackageAdded(appInfo: RawAppInfo): void {
    const pojo = this.loader.createAppPojo(appInfo)
    this.pojos = this.pojos.filter((p) => p.packageName !== pojo.packageName)
    this.pojos.push(pojo)
    this.persistApps()
  }

  public onPackageRemoved(packageName: string): void {
    this.pojos = this.pojos.filter((p) => p.packageName !== packageName)
    this.persistApps()
  }

  public onPackageChanged(appInfo: RawAppInfo): void {
    this.onPackageAdded(appInfo)
  }

  private persistApps(): void {
    if (typeof window === 'undefined') return
    try {
      const raw: RawAppInfo[] = this.pojos.map((p) => ({
        name: p.getName(),
        packageName: p.packageName,
        activityName: p.activityName,
        aliases: p.customAliases,
        isSystemApp: p.isSystemApp,
        category: p.category,
        disabled: p.isDisabled()
      }))
      localStorage.setItem(KISS_APPS_STORAGE_KEY, JSON.stringify(raw))
      localStorage.setItem(KISS_LAST_LOAD_KEY, String(Date.now()))
    } catch (_e) {}
  }

  private loadHistory(): void {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(KISS_HISTORY_STORAGE_KEY)
      if (raw) {
        const list: HistoryRecord[] = JSON.parse(raw)
        if (Array.isArray(list)) {
          for (const item of list) {
            this.queryHistory.set(`${item.query}|${item.appId}`, item)
          }
        }
      }
    } catch (_e) {}
  }

  private saveHistory(): void {
    if (typeof window === 'undefined') return
    try {
      const list = Array.from(this.queryHistory.values())
      localStorage.setItem(KISS_HISTORY_STORAGE_KEY, JSON.stringify(list.slice(-100)))
    } catch (_e) {}
  }
}

export const kissAppProvider = AppProvider.getInstance()
