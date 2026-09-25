/**
 * RealTimeDecisionEngine Service Module
 * Analyzes user intent and classifies requests into STATIC, CURRENT, LIVE, or UNKNOWN
 * categories to determine if external tool invocation is required.
 */

export type QueryCategory = 'STATIC' | 'CURRENT' | 'LIVE' | 'UNKNOWN'

export interface DecisionAnalysis {
  classification: QueryCategory
  reasoning: string
  requiresExternalTool: boolean
  suggestedTools: string[]
  temporalKeywords: string[]
  timestamp: string
}

export class RealTimeDecisionEngine {
  private staticPatterns = [
    /\b(photosynthesis|recursion|gravity|pythagorean|quadratic|definition of|explain algorithm|how to boil an egg)\b/i
  ]

  private livePatterns = [
    /\b(weather|temperature|forecast|today|tonight|yesterday|tomorrow|right now|currently|just now|breaking news|live score|stock price|trending on youtube)\b/i,
    /https?:\/\/\S+/i
  ]

  private currentPatterns = [
    /\b(current president|current ceo|latest version|latest release|latest model|latest news|recent developments|newest|as of today|latest github)\b/i
  ]

  public evaluateIntent(query: string): DecisionAnalysis {
    const norm = query.trim().toLowerCase()
    const now = new Date()

    const detectedKeywords: string[] = []
    const temporalTerms = [
      'today',
      'tonight',
      'yesterday',
      'tomorrow',
      'this week',
      'this month',
      'latest',
      'recent',
      'currently',
      'right now',
      'just now',
      'breaking',
      'new',
      'updated',
      'current',
      'as of today'
    ]

    for (const term of temporalTerms) {
      if (norm.includes(term)) {
        detectedKeywords.push(term)
      }
    }

    // 1. URL Presence
    if (/https?:\/\/\S+/i.test(query) || /\b[a-z0-9-]+\.(?:com|org|io|net|gov|edu|ai|dev)\b/i.test(norm)) {
      return {
        classification: 'LIVE',
        reasoning: 'Explicit web URL or domain requested for content fetching/extraction.',
        requiresExternalTool: true,
        suggestedTools: ['browserOpen', 'browserRead'],
        temporalKeywords: detectedKeywords,
        timestamp: now.toISOString()
      }
    }

    // 2. LIVE classification
    for (const pat of this.livePatterns) {
      if (pat.test(norm)) {
        let tools = ['webSearch', 'newsSearch']
        if (/weather|temperature|forecast/i.test(norm)) tools = ['weather']
        else if (/time|clock|timezone/i.test(norm)) tools = ['time']
        else if (/youtube|video|trending/i.test(norm)) tools = ['youtubeSearch']
        else if (/map|directions|near me/i.test(norm)) tools = ['maps']

        return {
          classification: 'LIVE',
          reasoning: 'Matches real-time live data pattern. Fresh external retrieval required.',
          requiresExternalTool: true,
          suggestedTools: tools,
          temporalKeywords: detectedKeywords,
          timestamp: now.toISOString()
        }
      }
    }

    // 3. CURRENT classification
    for (const pat of this.currentPatterns) {
      if (pat.test(norm)) {
        let tools = ['webSearch']
        if (/github|repo|release/i.test(norm)) tools = ['githubSearch', 'webSearch']

        return {
          classification: 'CURRENT',
          reasoning: 'Matches recent state inquiry. Fresh verification required.',
          requiresExternalTool: true,
          suggestedTools: tools,
          temporalKeywords: detectedKeywords,
          timestamp: now.toISOString()
        }
      }
    }

    // 4. STATIC classification
    if (
      /\b(explain|define|what is|how to|formula|algorithm|theory)\b/i.test(norm) &&
      detectedKeywords.length === 0
    ) {
      return {
        classification: 'STATIC',
        reasoning: 'Evergreen conceptual query without temporal constraints.',
        requiresExternalTool: false,
        suggestedTools: [],
        temporalKeywords: [],
        timestamp: now.toISOString()
      }
    }

    const requiresTool = detectedKeywords.length > 0
    return {
      classification: requiresTool ? 'CURRENT' : 'UNKNOWN',
      reasoning: requiresTool ? 'Temporal terms detected.' : 'Ambiguous query; safe fallback.',
      requiresExternalTool: requiresTool,
      suggestedTools: requiresTool ? ['webSearch'] : [],
      temporalKeywords: detectedKeywords,
      timestamp: now.toISOString()
    }
  }
}

export const realTimeDecisionEngine = new RealTimeDecisionEngine()
