/**
 * Thumbnail Generation & Mobile Readability Scoring Engine
 * Generates original thumbnail variations with high-contrast text overlays,
 * evaluates mobile viewport legibility, and integrates with image generation.
 */

import { ThumbnailConcept, TrendTopic, VideoScript } from './types'
import { geminiContentEngine } from './geminiEngine'

export class ThumbnailEngine {
  /**
   * Generates multiple thumbnail concepts and scores their mobile readability
   */
  public async generateConcepts(
    topic: TrendTopic,
    script: VideoScript
  ): Promise<ThumbnailConcept[]> {
    const concepts = await geminiContentEngine.generateThumbnails(topic, script)

    return concepts.map((c) => {
      // Evaluate readability criteria: <= 4 words, high contrast colors
      const wordCount = c.headlineText.split(/\s+/).length
      let readabilityScore = 90

      if (wordCount > 4) readabilityScore -= (wordCount - 4) * 8
      if (c.headlineText === c.headlineText.toUpperCase()) readabilityScore += 5 // All caps boost mobile legibility
      if (c.colorPalette.includes('#000000') || c.colorPalette.includes('#18181B')) readabilityScore += 5 // High contrast dark anchor

      return {
        ...c,
        mobileReadabilityScore: Math.min(100, Math.max(50, readabilityScore))
      }
    })
  }

  /**
   * Selects the highest scoring thumbnail concept based on measurable criteria
   */
  public selectBestConcept(concepts: ThumbnailConcept[]): ThumbnailConcept {
    const sorted = [...concepts].sort((a, b) => b.mobileReadabilityScore - a.mobileReadabilityScore)
    return sorted[0] || concepts[0]
  }
}

export const thumbnailEngine = new ThumbnailEngine()
