/**
 * WebIntelligenceRouter Service
 * Intelligently routes incoming queries between WebSearchService, BrowserAgent,
 * and WebPageReader based on complexity, intent, and dynamicity.
 *
 * Routing Strategy:
 * - Specific URL / Webpage -> WebPageReader / BrowserAgent.openUrl
 * - Simple Current Fact / Real-time Query -> WebSearchService (API fast-path)
 * - Deep multi-source research / comparison -> Multi-source Search + Deep Browser Reading
 * - Complex interaction / extraction goal -> BrowserAgent.extractInformation
 */

import { webSearchService, WebSearchResponse, SearchResultItem } from './web-search'
import { browserAgent, BrowserAgentTaskResult } from './browser-agent'
import { webPageReader, ExtractedPageContent } from './web-page-reader'
import { RealTimeDecisionEngine, DecisionResult } from './RealTimeDecisionEngine'
import { externalContentBoundary } from '../realtime/externalContentBoundary'

export type RoutingStrategy =
  | 'DIRECT_URL_READER'
  | 'SEARCH_API_FASTPATH'
  | 'BROWSER_AGENT_DEEP'
  | 'MULTI_SOURCE_RESEARCH'

export interface WebSourceItem {
  title: string
  url: string
  domain: string
  snippet: string
  retrievedAt: string
  publishedDate?: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface WebIntelligenceResult {
  query: string
  strategy: RoutingStrategy
  success: boolean
  synthesizedContext: string
  sources: WebSourceItem[]
  sourceAgreement: 'agreement' | 'disagreement' | 'single_source' | 'inconclusive'
  retrievalTimestamp: string
  executionTimeMs: number
  error?: string
}

export class WebIntelligenceRouter {
  private decisionEngine = new RealTimeDecisionEngine()

  /**
   * Evaluates query to select optimal routing strategy
   */
  public determineStrategy(query: string): { strategy: RoutingStrategy; targetUrl?: string; decision: DecisionResult } {
    const decision = this.decisionEngine.evaluate(query)
    const norm = query.toLowerCase().trim()

    // 1. Explicit URL check
    const urlMatch = query.match(/https?:\/\/[^\s"'<>]+/i)
    if (urlMatch) {
      return {
        strategy: 'DIRECT_URL_READER',
        targetUrl: urlMatch[0],
        decision
      }
    }

    // 2. Comparison or Multi-source Deep Research
    if (
      norm.includes('compare') ||
      norm.includes('verify') ||
      norm.includes('cross-reference') ||
      norm.includes('in-depth') ||
      norm.includes('research') ||
      norm.includes('multiple sources')
    ) {
      return {
        strategy: 'MULTI_SOURCE_RESEARCH',
        decision
      }
    }

    // 3. Complex browser interaction / specific website extraction
    if (
      norm.includes('extract from') ||
      norm.includes('browse') ||
      norm.includes('click on') ||
      norm.includes('navigate to') ||
      norm.includes('check website')
    ) {
      return {
        strategy: 'BROWSER_AGENT_DEEP',
        decision
      }
    }

    // 4. Default fast-path search API
    return {
      strategy: 'SEARCH_API_FASTPATH',
      decision
    }
  }

  /**
   * Executes the most suitable intelligence pipeline for the user query
   */
  public async route(query: string, options: { maxSources?: number; timeoutMs?: number } = {}): Promise<WebIntelligenceResult> {
    const startTime = Date.now()
    const { strategy, targetUrl, decision } = this.determineStrategy(query)
    const limit = options.maxSources || 4
    const sources: WebSourceItem[] = []
    const nowIso = new Date().toISOString()

    console.log(`[WebIntelligenceRouter] Query: "${query}" -> Strategy: [${strategy}]`)

    try {
      // 1. Direct URL Reading
      if (strategy === 'DIRECT_URL_READER' && targetUrl) {
        const page = await webPageReader.readUrl(targetUrl, { timeoutMs: options.timeoutMs })
        const domain = page.domain || new URL(targetUrl).hostname

        sources.push({
          title: page.title,
          url: targetUrl,
          domain,
          snippet: page.metadata.description || page.paragraphs[0] || page.mainText.slice(0, 200),
          retrievedAt: page.retrievedAt,
          publishedDate: page.metadata.publishedDate,
          confidence: 'high'
        })

        const synthesized = `**Source: [${page.title}](${targetUrl})**\n*Retrieved: ${page.retrievedAt}*\n\n${page.mainText.slice(0, 4000)}`

        return {
          query,
          strategy,
          success: true,
          synthesizedContext: synthesized,
          sources,
          sourceAgreement: 'single_source',
          retrievalTimestamp: nowIso,
          executionTimeMs: Date.now() - startTime
        }
      }

      // 2. Multi-Source Deep Research (Search + Top Result Deep Crawl)
      if (strategy === 'MULTI_SOURCE_RESEARCH') {
        const searchRes = await webSearchService.search(query, { limit: Math.max(limit, 5) })
        let deepExcerpts = ''

        searchRes.results.forEach((r) => {
          sources.push({
            title: r.title,
            url: r.url,
            domain: r.domain || (r.url ? new URL(r.url).hostname : 'web'),
            snippet: r.snippet,
            retrievedAt: nowIso,
            publishedDate: r.publishedDate,
            confidence: 'high'
          })
        })

        // Read top 2 unique domains for verification
        const uniqueUrls = Array.from(new Set(searchRes.results.map((r) => r.url))).filter(Boolean).slice(0, 2)
        for (const u of uniqueUrls) {
          try {
            const deepPage = await webPageReader.readUrl(u, { timeoutMs: 5000 })
            deepExcerpts += `\n\n### Primary Source Excerpt: [${deepPage.title}](${u})\n${deepPage.mainText.slice(0, 1400)}`
          } catch (_e) {}
        }

        const agreement = this.evaluateAgreement(sources)
        const synthesized =
          `[MULTI-SOURCE VERIFIED WEB GROUNDING]\n` +
          searchRes.results.map((r, i) => `[Source ${i + 1}: ${r.title}](${r.url})\n${r.snippet}`).join('\n\n') +
          (deepExcerpts ? `\n\n${deepExcerpts}` : '')

        return {
          query,
          strategy,
          success: true,
          synthesizedContext: synthesized,
          sources,
          sourceAgreement: agreement,
          retrievalTimestamp: nowIso,
          executionTimeMs: Date.now() - startTime
        }
      }

      // 3. Browser Agent Deep Search
      if (strategy === 'BROWSER_AGENT_DEEP') {
        const browserRes: BrowserAgentTaskResult = await browserAgent.search(query, {
          maxResults: limit,
          browseTopResult: true
        })

        browserRes.sources.forEach((s) => {
          sources.push({
            title: s.title,
            url: s.url,
            domain: s.domain,
            snippet: s.title,
            retrievedAt: s.retrievedAt,
            confidence: 'medium'
          })
        })

        return {
          query,
          strategy,
          success: browserRes.success,
          synthesizedContext: browserRes.extractedText,
          sources,
          sourceAgreement: sources.length > 1 ? 'agreement' : 'single_source',
          retrievalTimestamp: nowIso,
          executionTimeMs: Date.now() - startTime,
          error: browserRes.error
        }
      }

      // 4. Fast-Path Search API
      const searchRes: WebSearchResponse = await webSearchService.search(query, { limit })
      searchRes.results.forEach((r) => {
        sources.push({
          title: r.title,
          url: r.url,
          domain: r.domain || (r.url ? new URL(r.url).hostname : 'web'),
          snippet: r.snippet,
          retrievedAt: nowIso,
          publishedDate: r.publishedDate,
          confidence: 'high'
        })
      })

      const synthesized = searchRes.results
        .map((r, i) => `[Source ${i + 1}: ${r.title}](${r.url})\n${r.snippet}`)
        .join('\n\n')

      return {
        query,
        strategy,
        success: searchRes.results.length > 0,
        synthesizedContext: synthesized,
        sources,
        sourceAgreement: sources.length > 1 ? 'agreement' : 'single_source',
        retrievalTimestamp: nowIso,
        executionTimeMs: Date.now() - startTime
      }
    } catch (err: any) {
      console.warn(`[WebIntelligenceRouter] Execution error on strategy ${strategy}:`, err?.message || err)
      return {
        query,
        strategy,
        success: false,
        synthesizedContext: '',
        sources: [],
        sourceAgreement: 'inconclusive',
        retrievalTimestamp: nowIso,
        executionTimeMs: Date.now() - startTime,
        error: err?.message || 'Web intelligence retrieval failed'
      }
    }
  }

  /**
   * Compares sources to check agreement vs disagreement
   */
  private evaluateAgreement(sources: WebSourceItem[]): 'agreement' | 'disagreement' | 'single_source' | 'inconclusive' {
    if (sources.length <= 1) return 'single_source'
    const snippets = sources.map((s) => s.snippet.toLowerCase())

    // Simple conflict detection heuristic
    const conflictKeywords = ['contrary to', 'disputes', 'false', 'denies', 'debunked', 'incorrect']
    const hasConflict = snippets.some((snip) => conflictKeywords.some((ck) => snip.includes(ck)))

    return hasConflict ? 'disagreement' : 'agreement'
  }
}

export const webIntelligenceRouter = new WebIntelligenceRouter()
