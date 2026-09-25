/**
 * WebSearchService
 * Multi-provider search orchestration with automatic fallback adapters (Tavily, SearXNG, Brave, DuckDuckGo).
 * All API keys are accessed strictly via server-side environment variables.
 */

import { privacyAlign } from '../security/privacyAlign'
import { realTimeCacheManager } from '../realtime/cacheManager'

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
  domain: string
  publishedDate?: string
  score?: number
  sourceProvider: string
}

export interface WebSearchResponse {
  query: string
  provider: string
  results: SearchResultItem[]
  citations: Array<{ index: number; title: string; url: string; domain: string; snippet: string }>
  executionTimeMs: number
}

export interface SearchProviderAdapter {
  name: string
  isConfigured(): boolean
  search(query: string, limit: number): Promise<SearchResultItem[]>
}

// 1. Tavily Search Provider Adapter
export class TavilySearchAdapter implements SearchProviderAdapter {
  public name = 'tavily'

  private getApiKey(): string | undefined {
    return process.env.TAVILY_API_KEY || process.env.SEARCH_API_KEY
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey())
  }

  public async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const apiKey = this.getApiKey()
    if (!apiKey) throw new Error('Tavily API key is not configured.')

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: limit,
        include_answer: false
      }),
      signal: AbortSignal.timeout(6000)
    })

    if (!res.ok) {
      throw new Error(`Tavily API returned status ${res.status}`)
    }

    const data = await res.json()
    if (!Array.isArray(data.results)) return []

    return data.results.map((r: any) => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      snippet: r.content || r.snippet || '',
      domain: r.url ? new URL(r.url).hostname : 'tavily',
      publishedDate: r.published_date,
      score: r.score,
      sourceProvider: 'tavily'
    }))
  }
}

// 2. Brave Search Provider Adapter
export class BraveSearchAdapter implements SearchProviderAdapter {
  public name = 'brave'

  private getApiKey(): string | undefined {
    return process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey())
  }

  public async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const apiKey = this.getApiKey()
    if (!apiKey) throw new Error('Brave Search API key is not configured.')

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey
      },
      signal: AbortSignal.timeout(6000)
    })

    if (!res.ok) {
      throw new Error(`Brave Search API returned status ${res.status}`)
    }

    const data = await res.json()
    const webResults = data.web?.results || []

    return webResults.map((r: any) => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      snippet: r.description || '',
      domain: r.url ? new URL(r.url).hostname : 'brave',
      publishedDate: r.page_age,
      sourceProvider: 'brave'
    }))
  }
}

// 3. SearXNG Search Provider Adapter
export class SearXNGSearchAdapter implements SearchProviderAdapter {
  public name = 'searxng'

  private getBaseUrl(): string {
    return process.env.SEARXNG_URL || 'https://searx.be'
  }

  public isConfigured(): boolean {
    return true
  }

  public async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const baseUrl = this.getBaseUrl().replace(/\/+$/, '')
    const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&language=en`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IRIS-Search/2.0'
      },
      signal: AbortSignal.timeout(6000)
    })

    if (!res.ok) {
      throw new Error(`SearXNG returned status ${res.status}`)
    }

    const data = await res.json()
    const results = data.results || []

    return results.slice(0, limit).map((r: any) => ({
      title: r.title || 'Untitled',
      url: r.url || '',
      snippet: r.content || r.snippet || '',
      domain: r.url ? new URL(r.url).hostname : 'searxng',
      publishedDate: r.publishedDate,
      score: r.score,
      sourceProvider: 'searxng'
    }))
  }
}

// 4. DuckDuckGo HTML Instant Provider Adapter (Zero-Config Fallback)
export class DuckDuckGoSearchAdapter implements SearchProviderAdapter {
  public name = 'duckduckgo'

  public isConfigured(): boolean {
    return true
  }

  public async search(query: string, limit: number): Promise<SearchResultItem[]> {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(7000)
    })

    if (!res.ok) {
      throw new Error(`DuckDuckGo returned status ${res.status}`)
    }

    const html = await res.text()
    const results: SearchResultItem[] = []
    const linkRegex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

    let match
    while ((match = linkRegex.exec(html)) !== null && results.length < limit) {
      const rawUrl = match[1].trim()
      let decodedUrl = rawUrl
      if (rawUrl.includes('uddg=')) {
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
        if (uddgMatch) {
          decodedUrl = decodeURIComponent(uddgMatch[1])
        }
      }

      const snippet = match[3].replace(/<[^>]+>/g, '').trim()
      const title = match[2].replace(/<[^>]+>/g, '').trim() || 'Result'

      if (decodedUrl.startsWith('http')) {
        results.push({
          title,
          url: decodedUrl,
          snippet,
          domain: new URL(decodedUrl).hostname,
          sourceProvider: 'duckduckgo'
        })
      }
    }

    return results
  }
}

export class WebSearchService {
  private adapters: SearchProviderAdapter[] = [
    new TavilySearchAdapter(),
    new BraveSearchAdapter(),
    new SearXNGSearchAdapter(),
    new DuckDuckGoSearchAdapter()
  ]

  /**
   * Executes multi-provider search with fallback
   */
  public async search(query: string, options: { limit?: number; forceProvider?: string } = {}): Promise<WebSearchResponse> {
    const startTime = Date.now()
    const limit = options.limit || 4
    const sanitizedQuery = privacyAlign.sanitize(query).redactedText.trim()

    // Check Short-Lived Cache
    const cacheKey = `search_${sanitizedQuery}_${limit}`
    const cached = realTimeCacheManager.get<WebSearchResponse>(cacheKey)
    if (cached) {
      console.log(`[WebSearchService] Returning cached search results for: "${sanitizedQuery}"`)
      return cached
    }

    // Select candidate adapters
    const candidateAdapters = options.forceProvider
      ? this.adapters.filter((a) => a.name.toLowerCase() === options.forceProvider?.toLowerCase())
      : this.adapters.filter((a) => a.isConfigured())

    let lastError: Error | null = null
    let activeProviderName = 'unknown'

    for (const adapter of candidateAdapters) {
      try {
        console.log(`[WebSearchService] Attempting search via [${adapter.name}] for: "${sanitizedQuery}"`)
        const items = await adapter.search(sanitizedQuery, limit)
        if (items && items.length > 0) {
          activeProviderName = adapter.name
          const citations = items.map((item, idx) => ({
            index: idx + 1,
            title: item.title,
            url: item.url,
            domain: item.domain,
            snippet: item.snippet
          }))

          const response: WebSearchResponse = {
            query: sanitizedQuery,
            provider: activeProviderName,
            results: items,
            citations,
            executionTimeMs: Date.now() - startTime
          }

          // Cache for 10 minutes
          realTimeCacheManager.set(cacheKey, response, 10 * 60 * 1000)
          return response
        }
      } catch (err: any) {
        lastError = err
        console.warn(`[WebSearchService] Provider [${adapter.name}] failed:`, err?.message || err)
      }
    }

    // Return empty result gracefully instead of throwing
    return {
      query: sanitizedQuery,
      provider: 'none',
      results: [],
      citations: [],
      executionTimeMs: Date.now() - startTime
    }
  }
}

export const webSearchService = new WebSearchService()
