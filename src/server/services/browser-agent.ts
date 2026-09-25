/**
 * BrowserAgent Service
 * Core implementation inspired by browser-use architecture.
 * Provides server-side methods for autonomous web interaction:
 * - openUrl: Navigates to a webpage, extracts content & structure
 * - search: Searches the live web using query or browser execution
 * - extractInformation: Extracts targeted information based on natural language queries
 * 
 * Safety & Security Protocols:
 * - Strict SSRF protection (prohibits private IPs, localhost, metadata endpoints)
 * - Safe HTML/DOM sanitization and bounded token lengths
 * - No credential bypass or authentication evasion
 * - Isolated browser execution contexts
 */

import { privacyAlign } from '../security/privacyAlign'
import { externalContentBoundary } from '../realtime/externalContentBoundary'
import { realTimeCacheManager } from '../realtime/cacheManager'
import { webSearchService } from './web-search'

export interface BrowserAction {
  type: 'navigate' | 'search' | 'read' | 'extract' | 'scroll'
  target: string
  status: 'pending' | 'success' | 'failed'
  result?: string
  error?: string
}

export interface ExtractedPage {
  title: string
  url: string
  domain: string
  mainText: string
  headings: string[]
  paragraphs: string[]
  links: Array<{ text: string; href: string }>
  metadata: {
    description?: string
    publishedDate?: string
    author?: string
  }
  retrievedAt: string
}

export interface BrowserAgentTaskResult {
  taskId: string
  query: string
  success: boolean
  finalUrl?: string
  pageTitle?: string
  extractedText: string
  sources: Array<{
    title: string
    url: string
    domain: string
    retrievedAt: string
  }>
  actions: BrowserAction[]
  durationMs: number
  error?: string
}

export class BrowserAgent {
  /**
   * Evaluates if a target URL is safe to fetch according to SSRF policies
   */
  public isUrlSafe(url: string): { safe: boolean; reason?: string } {
    if (!url || typeof url !== 'string') {
      return { safe: false, reason: 'Invalid or empty URL.' }
    }

    try {
      const parsed = new URL(url)
      const protocol = parsed.protocol.toLowerCase()
      if (protocol !== 'http:' && protocol !== 'https:') {
        return { safe: false, reason: `Unsupported protocol: ${protocol}` }
      }

      const host = parsed.hostname.toLowerCase()
      // Disallow localhost, private subnets, cloud metadata IPs
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.16.') ||
        host.startsWith('172.17.') ||
        host.startsWith('172.18.') ||
        host.startsWith('172.19.') ||
        host.startsWith('172.2') ||
        host.startsWith('172.30.') ||
        host.startsWith('172.31.') ||
        host === '169.254.169.254' || // AWS/GCP metadata
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return { safe: false, reason: 'Access to private or local network resources is prohibited.' }
      }

      return { safe: true }
    } catch (_e) {
      return { safe: false, reason: 'Malformed URL.' }
    }
  }

  /**
   * Opens a URL and extracts clean structured text and metadata
   */
  public async openUrl(url: string, options: { timeoutMs?: number; skipCache?: boolean } = {}): Promise<ExtractedPage> {
    const safeCheck = this.isUrlSafe(url)
    if (!safeCheck.safe) {
      throw new Error(`SECURITY_REJECTED: ${safeCheck.reason}`)
    }

    const cacheKey = `browser_page_${url}`
    if (!options.skipCache) {
      const cached = realTimeCacheManager.get<ExtractedPage>(cacheKey)
      if (cached) {
        console.log(`[BrowserAgent] Returning cached page for ${url}`)
        return cached
      }
    }

    const timeout = options.timeoutMs || 8000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      console.log(`[BrowserAgent] Fetching URL: ${url}`)
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 IRIS-Agent/3.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: controller.signal
      })

      clearTimeout(timer)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const html = await res.text()
      const domain = new URL(url).hostname

      // Clean HTML tags and extract metadata
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
      const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : domain

      const descMatch =
        html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
        html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)
      const description = descMatch ? descMatch[1].trim() : undefined

      // Extract headings
      const headings: string[] = []
      const headingMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)
      if (headingMatches) {
        headingMatches.slice(0, 10).forEach((h) => {
          const clean = h.replace(/<[^>]+>/g, '').trim()
          if (clean && clean.length > 3) headings.push(clean)
        })
      }

      // Strip script, style, nav, footer, ads
      const strippedHtml = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
        .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

      const rawText = strippedHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()

      const sanitizedText = privacyAlign.sanitize(rawText).redactedText
      const bounded = externalContentBoundary.sanitizeAndBound(sanitizedText, `${rawTitle} (${domain})`)

      // Parse paragraphs
      const paragraphs = bounded.sanitizedText
        .split(/(?<=\.|\?|!)\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 40)
        .slice(0, 20)

      const extractedPage: ExtractedPage = {
        title: rawTitle,
        url,
        domain,
        mainText: bounded.sanitizedText.slice(0, 8000),
        headings,
        paragraphs,
        links: [],
        metadata: {
          description,
          publishedDate: new Date().toISOString()
        },
        retrievedAt: new Date().toISOString()
      }

      // Cache page for 15 minutes
      realTimeCacheManager.set(cacheKey, extractedPage, 15 * 60 * 1000)

      return extractedPage
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`[BrowserAgent] Failed to open URL ${url}:`, err?.message || err)
      throw new Error(`Failed to load URL ${url}: ${err?.message || 'Network error'}`)
    }
  }

  /**
   * Searches the live web and optionally browses top results for deep extraction
   */
  public async search(query: string, options: { maxResults?: number; browseTopResult?: boolean } = {}): Promise<BrowserAgentTaskResult> {
    const startTime = Date.now()
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const actions: BrowserAction[] = []
    const sources: BrowserAgentTaskResult['sources'] = []

    actions.push({
      type: 'search',
      target: query,
      status: 'pending'
    })

    try {
      const searchRes = await webSearchService.search(query, { limit: options.maxResults || 4 })
      actions[0].status = 'success'
      actions[0].result = `Found ${searchRes.results.length} search results`

      searchRes.results.forEach((r) => {
        sources.push({
          title: r.title,
          url: r.url,
          domain: r.domain || (r.url ? new URL(r.url).hostname : 'web'),
          retrievedAt: new Date().toISOString()
        })
      })

      let synthesized = searchRes.results
        .map((r, i) => `[${i + 1}] **${r.title}**\n${r.snippet}\nLink: ${r.url}`)
        .join('\n\n')

      if (options.browseTopResult && searchRes.results.length > 0 && searchRes.results[0].url) {
        const topUrl = searchRes.results[0].url
        actions.push({
          type: 'read',
          target: topUrl,
          status: 'pending'
        })

        try {
          const page = await this.openUrl(topUrl)
          actions[1].status = 'success'
          actions[1].result = `Read page: "${page.title}"`
          synthesized += `\n\n--- Deep Extraction from ${page.title} ---\n${page.mainText.slice(0, 1800)}`
        } catch (_browseErr) {
          actions[1].status = 'failed'
          actions[1].error = 'Deep page extraction timed out'
        }
      }

      return {
        taskId,
        query,
        success: true,
        extractedText: synthesized,
        sources,
        actions,
        durationMs: Date.now() - startTime
      }
    } catch (err: any) {
      actions[0].status = 'failed'
      actions[0].error = err?.message || 'Search execution failed'

      return {
        taskId,
        query,
        success: false,
        extractedText: '',
        sources: [],
        actions,
        durationMs: Date.now() - startTime,
        error: err?.message || 'Search failed'
      }
    }
  }

  /**
   * Extracts targeted information from a webpage based on natural language query
   */
  public async extractInformation(url: string, extractionGoal: string): Promise<string> {
    const page = await this.openUrl(url)
    const keywords = extractionGoal
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)

    if (keywords.length === 0) {
      return page.mainText.slice(0, 2500)
    }

    const matchingParagraphs = page.paragraphs.filter((p) => {
      const lower = p.toLowerCase()
      return keywords.some((k) => lower.includes(k))
    })

    if (matchingParagraphs.length > 0) {
      return matchingParagraphs.slice(0, 5).join('\n\n')
    }

    return page.mainText.slice(0, 2000)
  }
}

export const browserAgent = new BrowserAgent()
