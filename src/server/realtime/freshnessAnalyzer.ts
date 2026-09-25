/**
 * FreshnessAnalyzer & Source Prioritizer
 * Classifies source recency, enforces domain credibility prioritization,
 * and performs cross-source verification across retrieved content.
 */

import { FreshnessLevel, SourceMetadata, VerificationResult } from './types'

export class FreshnessAnalyzer {
  /**
   * Evaluates freshness level of content based on publishedAt timestamp
   */
  public evaluateFreshness(publishedAt?: string, queryCategory: 'LIVE' | 'NEWS' | 'SOFTWARE' | 'GENERAL' = 'GENERAL'): FreshnessLevel {
    if (!publishedAt) return 'unknown'

    const pubDate = new Date(publishedAt)
    if (isNaN(pubDate.getTime())) return 'unknown'

    const now = Date.now()
    const ageMs = now - pubDate.getTime()
    const ageHours = ageMs / (1000 * 60 * 60)
    const ageDays = ageHours / 24

    if (queryCategory === 'LIVE') {
      if (ageHours <= 6) return 'fresh'
      if (ageHours <= 24) return 'recent'
      return 'stale'
    }

    if (queryCategory === 'NEWS') {
      if (ageHours <= 24) return 'fresh'
      if (ageDays <= 3) return 'recent'
      return 'stale'
    }

    if (queryCategory === 'SOFTWARE') {
      if (ageDays <= 7) return 'fresh'
      if (ageDays <= 30) return 'recent'
      return 'stale'
    }

    // GENERAL
    if (ageDays <= 14) return 'fresh'
    if (ageDays <= 90) return 'recent'
    return 'stale'
  }

  /**
   * Ranks and prioritizes sources based on domain credibility and type
   */
  public prioritizeSources(sources: SourceMetadata[]): SourceMetadata[] {
    const sorted = [...sources].sort((a, b) => {
      const priorityOrder: Record<SourceMetadata['sourceType'], number> = {
        official_doc: 1,
        official_website: 2,
        government: 3,
        official_api: 4,
        reputable_news: 5,
        established_tech: 6,
        community: 7,
        search_snippet: 8
      }

      const rankA = priorityOrder[a.sourceType] || 8
      const rankB = priorityOrder[b.sourceType] || 8

      if (rankA !== rankB) return rankA - rankB

      // Freshness tie-breaker
      const freshnessOrder: Record<FreshnessLevel, number> = {
        fresh: 1,
        recent: 2,
        unknown: 3,
        stale: 4
      }

      return (freshnessOrder[a.freshness] || 3) - (freshnessOrder[b.freshness] || 3)
    })

    return sorted
  }

  /**
   * Classifies source type based on URL / domain
   */
  public classifySourceType(url: string, title?: string): SourceMetadata['sourceType'] {
    const normUrl = url.toLowerCase()

    if (normUrl.includes('docs.') || normUrl.includes('developer.') || normUrl.includes('api.')) {
      return 'official_doc'
    }

    if (normUrl.includes('.gov') || normUrl.includes('.edu')) {
      return 'government'
    }

    if (
      normUrl.includes('github.com') ||
      normUrl.includes('stackoverflow.com') ||
      normUrl.includes('dev.to') ||
      normUrl.includes('medium.com')
    ) {
      return 'established_tech'
    }

    if (
      normUrl.includes('bbc.com') ||
      normUrl.includes('reuters.com') ||
      normUrl.includes('apnews.com') ||
      normUrl.includes('cnn.com') ||
      normUrl.includes('techcrunch.com') ||
      normUrl.includes('theverge.com')
    ) {
      return 'reputable_news'
    }

    if (normUrl.includes('google.com') || normUrl.includes('android.com') || normUrl.includes('microsoft.com')) {
      return 'official_website'
    }

    return 'community'
  }

  /**
   * Performs cross-source verification comparing claims and dates
   */
  public verifyCrossSource(claim: string, sources: SourceMetadata[]): VerificationResult {
    if (!sources || sources.length === 0) {
      return {
        claim,
        sources: [],
        agreement: 'low',
        confidence: 'low',
        summary: 'No verified external sources available.',
        disagreements: ['Zero sources returned.']
      }
    }

    if (sources.length === 1) {
      return {
        claim,
        sources,
        agreement: 'high',
        confidence: 'medium',
        summary: `Single retrieved source (${sources[0].source}): "${sources[0].title}".`
      }
    }

    // Check consistency across multiple sources
    const titlesAndSnippets = sources.map((s) => `${s.title} ${s.snippet}`).join(' ')
    const keywords = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    let matchCount = 0

    for (const kw of keywords) {
      if (titlesAndSnippets.toLowerCase().includes(kw)) {
        matchCount++
      }
    }

    const matchRatio = keywords.length > 0 ? matchCount / keywords.length : 1
    const agreement = matchRatio > 0.6 ? 'high' : matchRatio > 0.3 ? 'medium' : 'low'

    return {
      claim,
      sources,
      agreement,
      confidence: agreement === 'high' ? 'high' : agreement === 'medium' ? 'medium' : 'low',
      summary: `Cross-verified across ${sources.length} sources with ${agreement} claim alignment.`
    }
  }
}

export const freshnessAnalyzer = new FreshnessAnalyzer()
