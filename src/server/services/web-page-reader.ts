/**
 * WebPageReader Service
 * Extracts clean, structured data (title, main text, headings, paragraphs, links, metadata, publication dates)
 * from raw HTML or fetched URLs.
 * Strips all noise (scripts, styles, navigation, footers, cookie banners, tracking, ads) while preserving source integrity.
 */

import { privacyAlign } from '../security/privacyAlign'
import { externalContentBoundary } from '../realtime/externalContentBoundary'
import { realTimeCacheManager } from '../realtime/cacheManager'

export interface ExtractedPageContent {
  title: string
  url: string
  domain: string
  mainText: string
  headings: string[]
  paragraphs: string[]
  links: Array<{ text: string; href: string }>
  metadata: {
    description?: string
    author?: string
    publishedDate?: string
    updatedDate?: string
    keywords?: string[]
    siteName?: string
  }
  retrievedAt: string
  contentLength: number
}

export class WebPageReader {
  /**
   * Evaluates if a target URL is permitted under SSRF policies
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
        host === '169.254.169.254' ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return { safe: false, reason: 'Private and reserved internal addresses are prohibited.' }
      }

      return { safe: true }
    } catch (_e) {
      return { safe: false, reason: 'Malformed URL.' }
    }
  }

  /**
   * Fetches and reads a webpage by URL
   */
  public async readUrl(url: string, options: { timeoutMs?: number; skipCache?: boolean } = {}): Promise<ExtractedPageContent> {
    const safeCheck = this.isUrlSafe(url)
    if (!safeCheck.safe) {
      throw new Error(`SSRF_PROHIBITED: ${safeCheck.reason}`)
    }

    const cacheKey = `web_page_reader_${url}`
    if (!options.skipCache) {
      const cached = realTimeCacheManager.get<ExtractedPageContent>(cacheKey)
      if (cached) {
        return cached
      }
    }

    const timeout = options.timeoutMs || 8000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 IRIS-Reader/2.0',
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
      const extracted = this.extractFromHtml(html, url)

      // Cache for 20 minutes
      realTimeCacheManager.set(cacheKey, extracted, 20 * 60 * 1000)
      return extracted
    } catch (err: any) {
      clearTimeout(timer)
      console.warn(`[WebPageReader] Fetch failed for ${url}:`, err?.message || err)
      throw new Error(`Failed to read page from ${url}: ${err?.message || 'Network error'}`)
    }
  }

  /**
   * Parses raw HTML string into clean, structured content
   */
  public extractFromHtml(html: string, url: string = ''): ExtractedPageContent {
    let domain = 'unknown'
    try {
      if (url) domain = new URL(url).hostname
    } catch (_e) {}

    // 1. Extract Metadata
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? this.cleanText(titleMatch[1]) : (domain || 'Webpage Document')

    const descMatch =
      html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) ||
      html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)
    const description = descMatch ? this.cleanText(descMatch[1]) : undefined

    const authorMatch =
      html.match(/<meta\s+name=["']author["']\s+content=["'](.*?)["']/i) ||
      html.match(/<meta\s+property=["']article:author["']\s+content=["'](.*?)["']/i)
    const author = authorMatch ? this.cleanText(authorMatch[1]) : undefined

    const siteNameMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["'](.*?)["']/i)
    const siteName = siteNameMatch ? this.cleanText(siteNameMatch[1]) : undefined

    // Dates
    const dateMatch =
      html.match(/<meta\s+property=["']article:published_time["']\s+content=["'](.*?)["']/i) ||
      html.match(/<time[^>]*datetime=["'](.*?)["']/i) ||
      html.match(/\b(202[0-6])[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/)
    const publishedDate = dateMatch ? dateMatch[1] : undefined

    const updateMatch = html.match(/<meta\s+property=["']article:modified_time["']\s+content=["'](.*?)["']/i)
    const updatedDate = updateMatch ? updateMatch[1] : undefined

    // 2. Extract Headings
    const headings: string[] = []
    const headingMatches = html.match(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gi)
    if (headingMatches) {
      headingMatches.forEach((h) => {
        const clean = this.cleanText(h)
        if (clean && clean.length > 3 && !headings.includes(clean)) {
          headings.push(clean)
        }
      })
    }

    // 3. Extract Links
    const links: Array<{ text: string; href: string }> = []
    const linkMatches = html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi)
    if (linkMatches) {
      linkMatches.slice(0, 30).forEach((linkTag) => {
        const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i)
        const text = this.cleanText(linkTag)
        if (hrefMatch && hrefMatch[1] && text && text.length > 2 && text.length < 80) {
          let href = hrefMatch[1]
          if (href.startsWith('/') && url) {
            try {
              const u = new URL(url)
              href = `${u.protocol}//${u.host}${href}`
            } catch (_e) {}
          }
          if (href.startsWith('http')) {
            links.push({ text, href })
          }
        }
      })
    }

    // 4. Strip Noise (Scripts, Styles, Nav, Footer, Forms, Comments, SVG, iFrames)
    let cleanedHtml = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

    // Extract relevant paragraphs from article / main / body tags
    const pMatches = cleanedHtml.match(/<p[^>]*>(.*?)<\/p>/gi)
    const paragraphs: string[] = []

    if (pMatches) {
      pMatches.forEach((p) => {
        const cleanP = this.cleanText(p)
        // Keep meaningful paragraphs (more than 30 characters, not cookies/copyright)
        if (
          cleanP.length > 30 &&
          !cleanP.toLowerCase().includes('cookie') &&
          !cleanP.toLowerCase().includes('all rights reserved') &&
          !cleanP.toLowerCase().includes('terms of service')
        ) {
          paragraphs.push(cleanP)
        }
      })
    }

    // Convert full cleaned HTML to readable text
    const rawMainText = this.cleanText(cleanedHtml)
    const sanitized = privacyAlign.sanitize(rawMainText).redactedText
    const bounded = externalContentBoundary.sanitizeAndBound(sanitized, `${title} (${domain})`)

    return {
      title,
      url,
      domain,
      mainText: bounded.sanitizedText.slice(0, 12000),
      headings: headings.slice(0, 15),
      paragraphs: paragraphs.slice(0, 30),
      links: links.slice(0, 20),
      metadata: {
        description,
        author,
        publishedDate,
        updatedDate,
        siteName
      },
      retrievedAt: new Date().toISOString(),
      contentLength: bounded.sanitizedText.length
    }
  }

  /**
   * Helper to clean tags, decode common HTML entities, and trim whitespace
   */
  private cleanText(raw: string): string {
    if (!raw) return ''
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&copy;/gi, '')
      .replace(/&reg;/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

export const webPageReader = new WebPageReader()
