/**
 * Title Candidate & Policy Compliance Engine
 * Generates and validates search-friendly, accurate, high-CTR titles without misleading clickbait.
 */

import { TitleCandidate, TrendTopic, VideoScript } from './types'

export class TitleEngine {
  /**
   * Validates title candidates against YouTube policies and character length guidelines
   */
  public evaluateTitles(
    candidates: TitleCandidate[],
    topic: TrendTopic,
    script?: VideoScript
  ): TitleCandidate[] {
    return candidates.map((cand) => {
      let score = cand.score || 85
      const charCount = cand.title.length

      // Optimal YouTube title length: 50-70 characters (fits mobile without truncation)
      if (charCount >= 45 && charCount <= 68) {
        score += 8
      } else if (charCount > 85) {
        score -= 15 // Truncated on mobile
      } else if (charCount < 30) {
        score -= 10 // Too short / lack of search context
      }

      // Check for excessive exclamation marks or spam words
      if (
        cand.title.includes('!!!') ||
        cand.title.includes('FREE MONEY') ||
        cand.title.includes('1000X')
      ) {
        score -= 40
      }

      return {
        ...cand,
        characterCount: charCount,
        score: Math.min(100, Math.max(20, score))
      }
    })
  }

  /**
   * Selects best title based on highest combined policy and engagement score
   */
  public selectBestTitle(candidates: TitleCandidate[]): string {
    const evaluated = this.evaluateTitles(candidates, { title: '' } as any)
    const sorted = [...evaluated].sort((a, b) => b.score - a.score)
    return sorted[0]?.title || candidates[0]?.title || 'Autonomous System Breakdown'
  }
}

export const titleEngine = new TitleEngine()
