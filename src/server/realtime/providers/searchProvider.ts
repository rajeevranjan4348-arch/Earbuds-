/**
 * SearchProvider Implementation
 */

import { SearchProvider, SearchResult } from '../types'
import { searchOrchestrator } from '../../search/orchestrator'

export class DefaultSearchProvider implements SearchProvider {
  public name = 'DefaultSearchProvider'

  public async searchWeb(
    query: string,
    options: { recency?: '24h' | '7d' | '30d' | 'any'; limit?: number } = {}
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) return []

    try {
      const searchRes = await searchOrchestrator.search(query.trim(), {
        limit: options.limit || 5
      })

      if (!searchRes || !searchRes.results) return []

      return searchRes.results.map((r: any) => ({
        title: r.title || 'Untitled Source',
        url: r.url || '#',
        snippet: r.snippet || r.content || '',
        source: r.source || this.extractDomain(r.url),
        publishedAt: r.publishedAt || r.date || new Date().toISOString()
      }))
    } catch (err) {
      console.warn('[SearchProvider] Search orchestration warning:', err)
      return []
    }
  }

  private extractDomain(urlStr?: string): string {
    if (!urlStr) return 'Web'
    try {
      const parsed = new URL(urlStr)
      return parsed.hostname.replace(/^www\./, '')
    } catch (_e) {
      return 'Web'
    }
  }
}

export const defaultSearchProvider = new DefaultSearchProvider()
