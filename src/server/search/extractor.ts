/**
 * Safe Webpage Reader & Content Extractor
 * Inspired by browser-search and agent-search extraction pipelines.
 * Strips ads, scripts, nav, footer, styles, and extracts readable text & markdown.
 */

import type { ExtractedPage } from './types'

const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
]

function getRandomUserAgent(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)]
}

export function extractDomain(urlStr: string): string {
  try {
    const parsed = new URL(urlStr)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return 'web'
  }
}

/**
 * Strips HTML tags and boilerplate to produce clean readable text and markdown.
 */
export function cleanHtmlToText(html: string): {
  title: string
  description: string
  content: string
  markdown: string
} {
  if (!html) return { title: '', description: '', content: '', markdown: '' }

  // 1. Extract metadata
  let title = ''
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    title = titleMatch[1].replace(/\s+/g, ' ').trim()
  }

  let description = ''
  const metaDescMatch = html.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i
  )
  if (metaDescMatch) {
    description = metaDescMatch[1].replace(/\s+/g, ' ').trim()
  }

  // 2. Remove non-content tags: scripts, styles, noscript, iframes, svgs, forms, nav, footer, header, aside
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

  // 3. Convert structural elements to markdown-like line breaks
  clean = clean
    .replace(/<(?:h[1-6]|p|div|section|article|blockquote|li)\b[^>]*>/gi, '\n\n')
    .replace(/<\/(?:h[1-6]|p|div|section|article|blockquote|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')

  // 4. Strip remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ')

  // 5. Decode HTML entities
  clean = clean
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')

  // 6. Normalize whitespace and clean lines
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // Filter out boilerplate common strings (cookie policies, share buttons, sign-up prompts)
  const filteredLines = lines.filter((line) => {
    const lower = line.toLowerCase()
    if (lower.includes('accept all cookies') || lower.includes('cookie policy')) return false
    if (lower.includes('all rights reserved') && line.length < 50) return false
    if (lower.includes('privacy policy') && line.length < 30) return false
    if (lower.includes('terms of service') && line.length < 30) return false
    if (lower === 'subscribe' || lower === 'sign up' || lower === 'log in') return false
    return true
  })

  const textContent = filteredLines.join('\n\n')
  return {
    title,
    description,
    content: textContent,
    markdown: textContent
  }
}

/**
 * Fetches and extracts content from a given URL with timeout and size guards.
 */
export async function fetchAndExtractUrl(
  url: string,
  options: { timeoutMs?: number; maxChars?: number } = {}
): Promise<ExtractedPage> {
  const { timeoutMs = 8000, maxChars = 4000 } = options
  const domain = extractDomain(url)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      redirect: 'follow'
    })

    clearTimeout(timer)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml') &&
      !contentType.includes('text/plain')
    ) {
      return {
        url,
        title: domain,
        content: `[Non-HTML content of type: ${contentType}]`,
        markdown: `[Non-HTML content: ${contentType}]`,
        domain,
        wordCount: 0,
        truncated: false
      }
    }

    const html = await response.text()
    const { title, description, content, markdown } = cleanHtmlToText(html)

    const truncated = content.length > maxChars
    const safeContent = truncated ? content.slice(0, maxChars) + '... [truncated]' : content

    return {
      url,
      title: title || domain,
      description,
      content: safeContent,
      markdown: truncated ? markdown.slice(0, maxChars) + '... [truncated]' : markdown,
      domain,
      wordCount: safeContent.split(/\s+/).length,
      truncated
    }
  } catch (err: any) {
    clearTimeout(timer)
    return {
      url,
      title: domain,
      description: '',
      content: `Failed to fetch page content: ${err?.message || 'Network error'}`,
      markdown: `Error retrieving ${url}`,
      domain,
      wordCount: 0,
      truncated: false
    }
  }
}
