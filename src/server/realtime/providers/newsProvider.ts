/**
 * NewsProvider Implementation
 */

import { NewsArticle, NewsProvider } from '../types'
import { defaultSearchProvider } from './searchProvider'

export class DefaultNewsProvider implements NewsProvider {
  public name = 'DefaultNewsProvider'

  public async searchNews(query: string, limit = 5): Promise<NewsArticle[]> {
    const searchResults = await defaultSearchProvider.searchWeb(`${query} news recent`, {
      recency: '24h',
      limit
    })

    return searchResults.map((r) => ({
      title: r.title,
      url: r.url,
      source: r.source,
      snippet: r.snippet,
      publishedAt: r.publishedAt || new Date().toISOString()
    }))
  }
}

export const defaultNewsProvider = new DefaultNewsProvider()
