/**
 * SearXNG Provider
 * Interacts with SearXNG metasearch instance (self-hosted or public nodes)
 * Formats results into standardized SearchResult schema.
 */

import type { SearchOptions, SearchResult } from '../types'
import { extractDomain } from '../extractor'

// Public reliable SearXNG instances used as failovers if no private instance is provided
const DEFAULT_FALLBACK_INSTANCES = [
  'https://search.ononoki.org',
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com'
]

export class SearxngProvider {
  private customUrl: string | null = null

  constructor(customUrl?: string) {
    this.customUrl = customUrl || process.env.SEARXNG_URL || null
  }

  public async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { category = 'general', timeRange = '', limit = 6, language = 'en' } = options

    const candidates = this.customUrl
      ? [this.customUrl.replace(/\/$/, '')]
      : DEFAULT_FALLBACK_INSTANCES

    let lastError: Error | null = null

    for (const baseUrl of candidates) {
      try {
        const url = new URL(`${baseUrl}/search`)
        url.searchParams.set('q', query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('categories', category)
        url.searchParams.set('language', language)
        if (timeRange) {
          url.searchParams.set('time_range', timeRange)
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 6000)

        const res = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'IRIS-AI/1.7 (+https://irisxhq.vercel.app)'
          }
        })

        clearTimeout(timer)

        if (!res.ok) {
          throw new Error(`SearXNG HTTP ${res.status} from ${baseUrl}`)
        }

        const data = await res.json()
        const rawResults = Array.isArray(data?.results) ? data.results : []

        if (rawResults.length > 0) {
          return rawResults.slice(0, limit).map((r: any, idx: number) => ({
            id: `searx_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            title: r.title || 'Untitled',
            url: r.url || '',
            snippet: r.content || r.snippet || '',
            engine: r.engine || 'searxng',
            publishedDate: r.publishedDate,
            domain: extractDomain(r.url || '')
          }))
        }
      } catch (err: any) {
        lastError = err
        continue
      }
    }

    if (lastError) {
      console.warn('[SearXNG Provider] All instances failed, falling back:', lastError.message)
    }
    return []
  }
}
