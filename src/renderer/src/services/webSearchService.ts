/**
 * Web Search Service (Client / Renderer)
 * Communicates with /api/search, /api/search/browse, and /api/search/research.
 * Formats voice responses, citation links, and integrates with the voice command pipeline.
 */

export interface SearchCitation {
  index: number
  title: string
  url: string
  domain: string
  snippet: string
}

export interface ClientSearchResult {
  id: string
  title: string
  url: string
  snippet: string
  domain: string
  score?: number
}

export interface WebSearchOutcome {
  success: boolean
  query: string
  provider: string
  results: ClientSearchResult[]
  citations: SearchCitation[]
  summary?: string
  spokenAnswer?: string
}

export class WebSearchService {
  /**
   * Performs real-time web search
   */
  public async search(
    query: string,
    options: {
      category?: 'general' | 'news' | 'science' | 'it'
      timeRange?: string
      limit?: number
    } = {}
  ): Promise<WebSearchOutcome> {
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          category: options.category || 'general',
          timeRange: options.timeRange || '',
          limit: options.limit || 4,
          extractContent: true
        })
      })

      if (!res.ok) {
        throw new Error(`Search request failed with HTTP ${res.status}`)
      }

      const data = await res.json()
      const results: ClientSearchResult[] = data.results || []
      const citations: SearchCitation[] = data.citations || []

      // Generate a spoken conversational response from top findings
      let spokenAnswer = ''
      if (results.length > 0) {
        const top = results[0]
        const cleanSnippet = top.snippet.replace(/https?:\/\/[^\s]+/g, '').trim()
        spokenAnswer = `According to ${top.domain || 'the web'}: ${cleanSnippet}`
      } else {
        spokenAnswer = `I searched the web for "${query}", but found no definitive current results.`
      }

      return {
        success: data.success ?? results.length > 0,
        query: data.query || query,
        provider: data.provider || 'orchestrator',
        results,
        citations,
        spokenAnswer
      }
    } catch (err: any) {
      console.warn('[WebSearchService] Search error:', err)
      return {
        success: false,
        query,
        provider: 'fallback',
        results: [],
        citations: [],
        spokenAnswer: `I encountered an issue connecting to web search. Please check your network connection.`
      }
    }
  }

  /**
   * Fetches readable content from any URL
   */
  public async browseUrl(
    url: string,
    maxChars = 3000
  ): Promise<{ success: boolean; title: string; content: string }> {
    try {
      const res = await fetch('/api/search/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxChars })
      })
      if (!res.ok) throw new Error(`Browse HTTP ${res.status}`)
      const data = await res.json()
      return {
        success: data.success,
        title: data.page?.title || '',
        content: data.page?.content || ''
      }
    } catch (err: any) {
      return {
        success: false,
        title: 'Error',
        content: err?.message || 'Failed to browse URL'
      }
    }
  }

  /**
   * Deep multi-query research
   */
  public async research(topic: string, depth: 'standard' | 'deep' = 'standard'): Promise<any> {
    try {
      const res = await fetch('/api/search/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, depth })
      })
      if (!res.ok) throw new Error(`Research HTTP ${res.status}`)
      const data = await res.json()
      return data.research
    } catch (err: any) {
      console.warn('[WebSearchService] Research error:', err)
      return null
    }
  }
}

export const webSearchService = new WebSearchService()
