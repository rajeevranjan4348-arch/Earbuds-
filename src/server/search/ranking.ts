/**
 * Relevance, Ranking & Citation Engine
 * Re-ranks search results using lexical BM25/token heuristics, domain authority,
 * and generates traceable citations.
 */

import type { Citation, SearchResult } from './types'

// Domains with elevated trust / authority for diverse topics
const HIGH_AUTHORITY_DOMAINS: Record<string, number> = {
  'wikipedia.org': 1.25,
  'github.com': 1.25,
  'developer.mozilla.org': 1.35,
  'stackoverflow.com': 1.2,
  'arxiv.org': 1.3,
  'nature.com': 1.3,
  'reuters.com': 1.25,
  'apnews.com': 1.25,
  'bbc.com': 1.2,
  'nytimes.com': 1.15,
  'theverge.com': 1.15,
  'techcrunch.com': 1.15,
  'wired.com': 1.15,
  'news.ycombinator.com': 1.15,
  'google.com': 1.1,
  'microsoft.com': 1.15,
  'apple.com': 1.15,
  'docs.python.org': 1.3,
  'nodejs.org': 1.25
}

/**
 * Normalizes URL by removing query tracking tokens and trailing slash
 */
export function normalizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr)
    // Strip tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid'
    ]
    for (const p of trackingParams) {
      parsed.searchParams.delete(p)
    }
    let res = parsed.toString()
    if (res.endsWith('/') && parsed.pathname === '/') {
      res = res.slice(0, -1)
    }
    return res
  } catch {
    return urlStr
  }
}

/**
 * Calculates a lexical relevance score between query tokens and search result
 */
export function scoreResult(query: string, result: SearchResult): number {
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length > 2)

  if (queryTokens.length === 0) return 0.5

  const titleLower = (result.title || '').toLowerCase()
  const snippetLower = (result.snippet || '').toLowerCase()
  const urlLower = (result.url || '').toLowerCase()

  let matchesInTitle = 0
  let matchesInSnippet = 0
  let matchesInUrl = 0

  for (const token of queryTokens) {
    if (titleLower.includes(token)) matchesInTitle++
    if (snippetLower.includes(token)) matchesInSnippet++
    if (urlLower.includes(token)) matchesInUrl++
  }

  // Weightings: Title > Snippet > URL
  const titleRatio = matchesInTitle / queryTokens.length
  const snippetRatio = matchesInSnippet / queryTokens.length
  const urlRatio = matchesInUrl / queryTokens.length

  let baseScore = titleRatio * 0.5 + snippetRatio * 0.35 + urlRatio * 0.15

  // Exact phrase match bonus
  if (titleLower.includes(query.toLowerCase().trim())) {
    baseScore += 0.3
  } else if (snippetLower.includes(query.toLowerCase().trim())) {
    baseScore += 0.15
  }

  // Domain authority multiplier
  const domain = (result.domain || '').toLowerCase()
  let authorityBoost = 1.0
  for (const [authDomain, boost] of Object.entries(HIGH_AUTHORITY_DOMAINS)) {
    if (domain === authDomain || domain.endsWith('.' + authDomain)) {
      authorityBoost = boost
      break
    }
  }

  return baseScore * authorityBoost
}

/**
 * Deduplicates, filters, scores and sorts search results
 */
export function rankAndFilterResults(
  query: string,
  results: SearchResult[],
  limit = 6
): SearchResult[] {
  const seenUrls = new Set<string>()
  const unique: SearchResult[] = []

  for (const r of results) {
    if (!r.url || !r.title) continue
    const norm = normalizeUrl(r.url)
    if (seenUrls.has(norm)) continue
    seenUrls.add(norm)

    const score = scoreResult(query, r)
    unique.push({
      ...r,
      url: norm,
      score
    })
  }

  // Sort descending by score
  unique.sort((a, b) => (b.score || 0) - (a.score || 0))

  return unique.slice(0, limit)
}

/**
 * Formats results into structured citations with index numbers
 */
export function generateCitations(results: SearchResult[]): Citation[] {
  return results.map((r, idx) => ({
    index: idx + 1,
    title: r.title,
    url: r.url,
    domain: r.domain || 'web',
    snippet: r.snippet
  }))
}

/**
 * Formats citations as a markdown string for LLM or UI
 */
export function formatCitationsMarkdown(citations: Citation[]): string {
  if (citations.length === 0) return ''
  return (
    '\n\n**Sources:**\n' +
    citations.map((c) => `[${c.index}] [${c.title}](${c.url}) (${c.domain})`).join('\n')
  )
}
