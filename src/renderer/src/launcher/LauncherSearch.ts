import { AppItem, AppCategory } from './types'
import { appRegistry } from './AppRegistry'

export interface SearchOptions {
  query: string
  category?: 'all' | AppCategory
  currentTab?: string
  limit?: number
}

export interface ScoredAppItem {
  app: AppItem
  score: number
  matchedField?: 'name' | 'alias' | 'keyword' | 'acronym' | 'category' | 'description'
}

/**
 * Normalizes text for scoring: lowercases, removes non-alphanumeric punctuation
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

/**
 * Checks if query forms an acronym of the target words (e.g. "yt" -> "you tube")
 */
function checkAcronym(query: string, targetName: string): boolean {
  const words = targetName.toLowerCase().split(/\s+/)
  if (words.length < 2) return false
  const acronym = words.map((w) => w[0]).join('')
  return acronym.startsWith(query.toLowerCase())
}

export class LauncherSearch {
  /**
   * Evaluates match quality between search query and an app item
   */
  public static scoreApp(app: AppItem, query: string, currentTab?: string): ScoredAppItem {
    if (!query) {
      // Base score when query is empty: favorites and recent items rank highest
      let base = 50
      if (app.isFavorite) base += 40
      if (app.recent) base += 30
      if (currentTab && app.contextScope && app.contextScope.includes(currentTab.toUpperCase())) {
        base += 25
      }
      base += Math.min((app.launchCount || 0) * 5, 50)
      return { app, score: base }
    }

    const q = normalize(query)
    const nameNorm = normalize(app.name)
    let score = 0
    let matchedField: ScoredAppItem['matchedField'] = undefined

    // 1. Exact name match
    if (nameNorm === q) {
      score = 1000
      matchedField = 'name'
    }
    // 2. Starts with name
    else if (nameNorm.startsWith(q)) {
      score = 800 + (q.length / nameNorm.length) * 100
      matchedField = 'name'
    }
    // 3. Name word boundary or contains
    else if (nameNorm.includes(` ${q}`) || nameNorm.includes(q)) {
      score = 650
      matchedField = 'name'
    }
    // 4. Acronym match (e.g. "yt" -> "YouTube", "wa" -> "WhatsApp")
    else if (checkAcronym(q, app.name)) {
      score = 750
      matchedField = 'acronym'
    }

    // 5. Aliases match
    if (score < 700 && app.aliases && app.aliases.length > 0) {
      for (const alias of app.aliases) {
        const aNorm = normalize(alias)
        if (aNorm === q) {
          score = Math.max(score, 720)
          matchedField = 'alias'
          break
        } else if (aNorm.startsWith(q)) {
          score = Math.max(score, 620)
          matchedField = 'alias'
          break
        } else if (aNorm.includes(q)) {
          score = Math.max(score, 520)
          matchedField = 'alias'
          break
        }
      }
    }

    // 6. Keywords match
    if (score < 600 && app.keywords && app.keywords.length > 0) {
      for (const kw of app.keywords) {
        const kNorm = normalize(kw)
        if (kNorm === q) {
          score = Math.max(score, 580)
          matchedField = 'keyword'
          break
        } else if (kNorm.startsWith(q)) {
          score = Math.max(score, 480)
          matchedField = 'keyword'
          break
        } else if (kNorm.includes(q)) {
          score = Math.max(score, 380)
          matchedField = 'keyword'
          break
        }
      }
    }

    // 7. Category match
    if (score < 400 && app.category.toLowerCase().startsWith(q)) {
      score = Math.max(score, 350)
      matchedField = 'category'
    }

    // 8. Description match
    if (score < 300 && app.description) {
      const descNorm = normalize(app.description)
      if (descNorm.includes(q)) {
        score = Math.max(score, 250)
        matchedField = 'description'
      }
    }

    // Context Relevance Boost: if relevant to currently active tab/page
    if (score > 0 && currentTab && app.contextScope && app.contextScope.includes(currentTab.toUpperCase())) {
      score += 40
    }

    // Usage Frequency and Favorite Boost
    if (score > 0) {
      if (app.isFavorite) score += 25
      if (app.recent) score += 15
      score += Math.min((app.launchCount || 0) * 2, 30)
    }

    return { app, score, matchedField }
  }

  /**
   * Searches and filters apps with ranking
   */
  public static search(options: SearchOptions): AppItem[] {
    const { query, category = 'all', currentTab, limit = 20 } = options
    const allApps = appRegistry.getAll()

    // Filter by category if specified
    const pool = category === 'all' ? allApps : allApps.filter((a) => a.category === category)

    // Score and rank
    const scored = pool
      .map((app) => this.scoreApp(app, query, currentTab))
      .filter((res) => (!query ? true : res.score > 150))
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit).map((s) => s.app)
  }

  /**
   * Returns context-aware suggestions when search bar is idle/empty
   */
  public static getContextSuggestions(currentTab = 'DASHBOARD'): {
    contextName: string
    items: AppItem[]
  } {
    const tabUpper = currentTab.toUpperCase()
    const all = appRegistry.getAll()

    let contextName = 'Suggested for You'
    let relevant = all.filter((a) => a.contextScope && a.contextScope.includes(tabUpper))

    if (tabUpper === 'CHAT') {
      contextName = 'Chat Actions & Tools'
    } else if (tabUpper === 'SETTINGS') {
      contextName = 'Settings & Preferences'
    } else if (tabUpper === 'YOUTUBE') {
      contextName = 'YouTube & Video Tools'
    } else if (tabUpper === 'WORKSPACE') {
      contextName = 'Workspace & Cloud Docs'
    } else if (tabUpper === 'MAPS') {
      contextName = 'Navigation & Locations'
    } else if (tabUpper === 'PHONE') {
      contextName = 'Mobile & Companion Tools'
    }

    if (relevant.length < 3) {
      // Fall back to top favorites and recents
      const favs = appRegistry.getFavorites()
      const recents = appRegistry.getRecents(4)
      const combined = [...favs, ...recents]
      const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values())
      relevant = unique.slice(0, 6)
    }

    return {
      contextName,
      items: relevant.slice(0, 6)
    }
  }
}
