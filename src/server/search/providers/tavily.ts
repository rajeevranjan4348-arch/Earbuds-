/**
 * Tavily Search Provider
 * Supports Tavily search API if TAVILY_API_KEY is configured.
 */

import type { SearchOptions, SearchResult } from '../types'
import { extractDomain } from '../extractor'

export class TavilyProvider {
  private apiKey: string | null = null

  constructor(key?: string) {
    this.apiKey = key || process.env.TAVILY_API_KEY || null
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  public async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.apiKey) return []

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: options.category === 'news' ? 'news' : 'basic',
          include_answer: false,
          max_results: options.limit || 6
        })
      })

      clearTimeout(timer)

      if (!response.ok) {
        throw new Error(`Tavily HTTP ${response.status}`)
      }

      const data = await response.json()
      const results = Array.isArray(data?.results) ? data.results : []

      return results.map((r: any, idx: number) => ({
        id: `tavily_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        title: r.title || 'Untitled',
        url: r.url || '',
        snippet: r.content || '',
        engine: 'tavily',
        score: r.score,
        domain: extractDomain(r.url || '')
      }))
    } catch (err: any) {
      if (!err?.message?.includes('401')) {
        console.warn('[Tavily Provider] Error:', err?.message)
      }
      return []
    }
  }
}
