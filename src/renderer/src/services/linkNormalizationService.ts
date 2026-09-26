/**
 * Link Normalization Service
 * Detects, normalizes, and extracts URLs from text for the unified chat system
 * Ensures URLs in voice and text conversations are properly formatted and clickable
 */

// ============================================================================
// URL Patterns
// ============================================================================

/**
 * Comprehensive URL pattern that matches:
 * - https://example.com
 * - http://example.com
 * - www.example.com
 * - example.com
 * - sub.example.com/path
 * - example.com/path?query=value
 * - example.com/path#hash
 */
const COMPREHENSIVE_URL_PATTERN = /\b(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\/[^\s<>"]*)?)\b/gi

/**
 * Markdown link pattern: [text](url)
 */
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g

/**
 * HTML link pattern: <a href="url">text</a>
 */
const HTML_LINK_PATTERN = /<a\s+[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Valid TLDs (top-level domains) for URL detection
 */
const VALID_TLDS = [
  'com', 'org', 'net', 'io', 'co', 'uk', 'us', 'ca', 'au', 'nz',
  'de', 'fr', 'jp', 'cn', 'in', 'br', 'ru', 'it', 'es', 'nl',
  'se', 'ch', 'no', 'dk', 'fi', 'pl', 'pt', 'be', 'at', 'ie',
  'za', 'kr', 'mx', 'ar', 'cl', 'pe', 've', 'sg', 'my', 'ph',
  'id', 'th', 'vn', 'tr', 'sa', 'ae', 'qa', 'om', 'bh', 'kw',
  'eg', 'ma', 'dz', 'ng', 'ke', 'gh', 'tz', 'ug', 'mu'
]

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }
  
  try {
    // Try to parse as URL
    new URL(url)
    return true
  } catch (e) {
    // Check if it looks like a domain
    const domainPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/
    if (domainPattern.test(url)) {
      const parts = url.split('.')
      const tld = parts[parts.length - 1].toLowerCase()
      return VALID_TLDS.includes(tld)
    }
    return false
  }
}

// ============================================================================
// URL Extraction
// ============================================================================

/**
 * Extract all URLs from text
 * Returns normalized URLs with https:// protocol
 */
export function extractUrls(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return []
  }
  
  const urls: Set<string> = new Set()
  
  // Extract from markdown links
  const markdownMatches = text.match(MARKDOWN_LINK_PATTERN)
  if (markdownMatches) {
    for (const match of markdownMatches) {
      const urlMatch = match.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (urlMatch && urlMatch[2]) {
        const normalized = normalizeUrl(urlMatch[2])
        if (normalized) {
          urls.add(normalized)
        }
      }
    }
  }
  
  // Extract from HTML links
  const htmlMatches = text.match(HTML_LINK_PATTERN)
  if (htmlMatches) {
    for (const match of htmlMatches) {
      const urlMatch = match.match(/href="([^"]+)"/)
      if (urlMatch && urlMatch[1]) {
        const normalized = normalizeUrl(urlMatch[1])
        if (normalized) {
          urls.add(normalized)
        }
      }
    }
  }
  
  // Extract from plain text
  const plainMatches = text.match(COMPREHENSIVE_URL_PATTERN)
  if (plainMatches) {
    for (const match of plainMatches) {
      const normalized = normalizeUrl(match)
      if (normalized) {
        urls.add(normalized)
      }
    }
  }
  
  return Array.from(urls)
}

/**
 * Extract URLs with their context (text around them)
 */
export function extractUrlsWithContext(text: string, contextLength: number = 20): Array<{ url: string, context: string }> {
  const urls = extractUrls(text)
  const results: Array<{ url: string, context: string }> = []
  
  for (const url of urls) {
    const index = text.indexOf(url)
    if (index !== -1) {
      const start = Math.max(0, index - contextLength)
      const end = Math.min(text.length, index + url.length + contextLength)
      const context = text.substring(start, end)
      results.push({ url, context })
    }
  }
  
  return results
}

// ============================================================================
// URL Normalization
// ============================================================================

/**
 * Normalize a URL to ensure it has a protocol and is properly formatted
 */
export function normalizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }
  
  let normalized = url.trim()
  
  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;:!?"'()\]]+$/, '')
  
  // Remove markdown formatting
  normalized = normalized.replace(/^[\[<]|[\]>]$/g, '')
  
  // Skip if empty
  if (!normalized) {
    return null
  }
  
  // Check if already has protocol
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsed = new URL(normalized)
      return parsed.toString()
    } catch (e) {
      return null
    }
  }
  
  // Add https:// if missing
  if (normalized.startsWith('www.')) {
    return `https://${normalized}`
  }
  
  // Check if it's a domain
  if (/^[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}/.test(normalized)) {
    return `https://${normalized}`
  }
  
  // Check if it's a path without domain (shouldn't happen in isolation)
  if (normalized.startsWith('/')) {
    return null
  }
  
  return null
}

/**
 * Normalize multiple URLs
 */
export function normalizeUrls(urls: string[]): string[] {
  return urls
    .map(normalizeUrl)
    .filter((url): url is string => url !== null)
}

// ============================================================================
// URL Formatting
// ============================================================================

/**
 * Format a URL for display (removes https://, www. for cleaner display)
 */
export function formatUrlForDisplay(url: string): string {
  try {
    const parsed = new URL(url)
    let display = parsed.hostname
    
    // Remove www. prefix
    if (display.startsWith('www.')) {
      display = display.substring(4)
    }
    
    // Add path if present
    if (parsed.pathname && parsed.pathname !== '/') {
      display += parsed.pathname
    }
    
    return display
  } catch (e) {
    return url
  }
}

/**
 * Format a URL as a markdown link
 */
export function formatUrlAsMarkdown(url: string, text?: string): string {
  const displayText = text || formatUrlForDisplay(url)
  return `[${displayText}](${url})`
}

/**
 * Format a URL as an HTML link
 */
export function formatUrlAsHtml(url: string, text?: string): string {
  const displayText = text || formatUrlForDisplay(url)
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayText}</a>`
}

// ============================================================================
// Text Processing
// ============================================================================

/**
 * Replace URLs in text with markdown links
 */
export function replaceUrlsWithMarkdown(text: string): string {
  if (!text || typeof text !== 'string') {
    return text
  }
  
  let result = text
  const urls = extractUrls(text)
  
  for (const url of urls) {
    const display = formatUrlForDisplay(url)
    const markdownLink = `[${display}](${url})`
    
    // Replace the URL with the markdown link
    // Try to match the original URL pattern
    const urlPatterns = [
      url,
      url.replace(/^https?:\/\//, ''),
      url.replace(/^www\./, ''),
      url.replace(/^https?:\/\/www\./, '')
    ]
    
    for (const pattern of urlPatterns) {
      const regex = new RegExp(escapeRegExp(pattern), 'gi')
      result = result.replace(regex, markdownLink)
    }
  }
  
  return result
}

/**
 * Replace URLs in text with HTML links
 */
export function replaceUrlsWithHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return text
  }
  
  let result = text
  const urls = extractUrls(text)
  
  for (const url of urls) {
    const display = formatUrlForDisplay(url)
    const htmlLink = `<a href="${url}" target="_blank" rel="noopener noreferrer">${display}</a>`
    
    const urlPatterns = [
      url,
      url.replace(/^https?:\/\//, ''),
      url.replace(/^www\./, ''),
      url.replace(/^https?:\/\/www\./, '')
    ]
    
    for (const pattern of urlPatterns) {
      const regex = new RegExp(escapeRegExp(pattern), 'gi')
      result = result.replace(regex, htmlLink)
    }
  }
  
  return result
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================================
// URL Metadata
// ============================================================================

/**
 * Get domain from URL
 */
export function getDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname
  } catch (e) {
    return null
  }
}

/**
 * Get path from URL
 */
export function getPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.pathname
  } catch (e) {
    return null
  }
}

/**
 * Get query parameters from URL
 */
export function getQueryParams(url: string): Record<string, string> {
  try {
    const parsed = new URL(url)
    const params: Record<string, string> = {}
    
    for (const [key, value] of parsed.searchParams.entries()) {
      params[key] = value
    }
    
    return params
  } catch (e) {
    return {}
  }
}

/**
 * Check if URL is from a known safe domain
 */
export function isSafeUrl(url: string, safeDomains: string[] = []): boolean {
  const domain = getDomain(url)
  if (!domain) return false
  
  const safe = [
    'youtube.com',
    'youtu.be',
    'google.com',
    'github.com',
    'wikipedia.org',
    'stackoverflow.com',
    'stackoverflow.com',
    'mdn.web.docs',
    'developer.mozilla.org',
    'npmjs.com',
    'yarnpkg.com',
    'gitlab.com',
    'bitbucket.org',
    ...safeDomains
  ]
  
  return safe.some(safeDomain => domain.includes(safeDomain))
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process an array of messages to extract and normalize URLs
 */
export function processMessagesForUrls(messages: Array<{ text: string }>): Array<{
  message: any
  urls: string[]
  hasUrls: boolean
}> {
  return messages.map(message => {
    const urls = extractUrls(message.text)
    return {
      message,
      urls,
      hasUrls: urls.length > 0
    }
  })
}

/**
 * Add clickable links to messages
 */
export function addClickableLinksToMessages(
  messages: Array<{ text: string }>,
  format: 'markdown' | 'html' = 'markdown'
): Array<{ text: string }> {
  return messages.map(message => {
    if (format === 'markdown') {
      return {
        ...message,
        text: replaceUrlsWithMarkdown(message.text)
      }
    } else {
      return {
        ...message,
        text: replaceUrlsWithHtml(message.text)
      }
    }
  })
}

// ============================================================================
// Exports
// ============================================================================

export {
  COMPREHENSIVE_URL_PATTERN,
  MARKDOWN_LINK_PATTERN,
  HTML_LINK_PATTERN,
  VALID_TLDS
}
