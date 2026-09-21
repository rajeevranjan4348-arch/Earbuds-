/**
 * Authentic port of fr.neamar.kiss.searcher.ApplicationsSearcher & QuerySearcher
 * Executes multi-candidate ranking, query normalization, and disambiguation.
 */

import { AppPojo } from '../pojo/AppPojo'
import { AppProvider, kissAppProvider } from '../dataprovider/AppProvider'

export interface SearchResultItem {
  app: AppPojo
  score: number
  isExactMatch: boolean
}

export class ApplicationsSearcher {
  private readonly provider: AppProvider

  constructor(provider: AppProvider = kissAppProvider) {
    this.provider = provider
  }

  /**
   * Searches installed applications using KISS fast-match ranking
   */
  public search(query: string, maxResults = 10): SearchResultItem[] {
    const rawMatches = this.provider.requestResults(query, maxResults)
    const normalizedQuery = query.trim().toLowerCase()

    return rawMatches.map((app) => {
      const isExact =
        app.getName().toLowerCase() === normalizedQuery ||
        app.packageName.toLowerCase() === normalizedQuery ||
        app.tags.some((t) => t.toLowerCase() === normalizedQuery)

      return {
        app,
        score: app.relevance,
        isExactMatch: isExact
      }
    })
  }

  /**
   * Resolves the single highest-ranking application for a given query
   */
  public resolveTopMatch(query: string): AppPojo | null {
    const results = this.search(query, 5)
    if (results.length === 0) return null

    // Exact matches take top priority
    const exact = results.find((r) => r.isExactMatch)
    if (exact) return exact.app

    // Return the top-scored candidate
    return results[0].app
  }
}

export const kissSearcher = new ApplicationsSearcher()
