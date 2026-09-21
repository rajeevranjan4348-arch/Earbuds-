/**
 * DuckDuckGo Provider
 * Zero-API-key search engine fallback.
 * Queries DuckDuckGo HTML/Lite interface and parses clean results.
 */

import type { SearchOptions, SearchResult } from '../types'
import { extractDomain } from '../extractor'

export class DuckDuckGoProvider {
  public async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit || 6

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      // Use DuckDuckGo HTML endpoint
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      })

      clearTimeout(timer)

      if (!res.ok) {
        throw new Error(`DuckDuckGo HTTP ${res.status}`)
      }

      const html = await res.text()
      const results: SearchResult[] = []

      // Match result blocks in DuckDuckGo HTML: class="result results_links results_links_deep web-result"
      // or class="result__body"
      const resultBlocks = html.split(/<div class="result\s+results_links[^>]*>/i).slice(1)

      for (let i = 0; i < resultBlocks.length && results.length < limit; i++) {
        const block = resultBlocks[i]

        // Extract Title and URL
        // <a class="result__url" href="..."> or <a class="result__snippet" href="...">
        const linkMatch =
          block.match(/<a[^>]+class="result__snippet"[^>]+href=["']([^"']+)["']/i) ||
          block.match(/<a[^>]+class="result__url"[^>]+href=["']([^"']+)["']/i) ||
          block.match(/<a[^>]+class="result__a"[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)

        let targetUrl = ''
        let title = ''

        if (linkMatch) {
          let rawHref = linkMatch[1]
          // Decode DDG redirect url (uddg parameter)
          if (rawHref.includes('uddg=')) {
            try {
              const parsed = new URL(rawHref, 'https://duckduckgo.com')
              targetUrl = decodeURIComponent(parsed.searchParams.get('uddg') || rawHref)
            } catch {
              targetUrl = rawHref
            }
          } else if (rawHref.startsWith('//')) {
            targetUrl = 'https:' + rawHref
          } else if (rawHref.startsWith('http')) {
            targetUrl = rawHref
          }

          if (linkMatch[2]) {
            title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
          }
        }

        // Title fallback
        if (!title) {
          const titleTag = block.match(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/i)
          if (titleTag) {
            title = titleTag[1].replace(/<[^>]+>/g, '').trim()
          }
        }

        // Snippet
        let snippet = ''
        const snippetMatch =
          block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) ||
          block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i)

        if (snippetMatch) {
          snippet = snippetMatch[1].replace(/<[^>]+>/g, '').trim()
        }

        if (targetUrl && title && !targetUrl.includes('duckduckgo.com/y.js')) {
          results.push({
            id: `ddg_${results.length}_${Math.random().toString(36).slice(2, 6)}`,
            title,
            url: targetUrl,
            snippet,
            engine: 'duckduckgo',
            domain: extractDomain(targetUrl)
          })
        }
      }

      return results
    } catch (err: any) {
      console.warn('[DuckDuckGo Provider] Query error:', err?.message)
      return []
    }
  }
}
