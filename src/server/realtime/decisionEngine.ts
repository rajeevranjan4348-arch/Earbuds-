/**
 * RealTimeDecisionEngine
 * Classifies user requests into STATIC, CURRENT, LIVE, or UNKNOWN
 * and resolves temporal queries using actual real-time date and timestamps.
 */

import { QueryClassification } from './types'

export interface DecisionResult {
  classification: QueryClassification
  reasoning: string
  requiresRealtimeData: boolean
  suggestedTools: string[]
  temporalContext: {
    currentDateIso: string
    currentFormattedDate: string
    detectedTimeKeywords: string[]
  }
}

export class RealTimeDecisionEngine {
  private staticKeywords = [
    'photosynthesis',
    'explain recursion',
    'what is a function',
    'python syntax',
    'how does gravity work',
    'definition of',
    'history of rome',
    'quadratic formula',
    'what is pythagorean theorem',
    'how to boil an egg'
  ]

  private liveKeywords = [
    'weather',
    'temperature',
    'forecast',
    'today',
    'tonight',
    'yesterday',
    'tomorrow',
    'right now',
    'currently',
    'just now',
    'breaking news',
    'last hour',
    'trending on youtube',
    'trending now',
    'live score',
    'current price',
    'stock price',
    'open this website',
    'open this url',
    'http://',
    'https://'
  ]

  private currentKeywords = [
    'current president',
    'current ceo',
    'latest version',
    'latest release',
    'latest model',
    'latest news',
    'recent developments',
    'newest',
    'as of today',
    'current features',
    'latest github',
    'latest video'
  ]

  /**
   * Classifies a user query and resolves temporal parameters
   */
  public evaluate(query: string): DecisionResult {
    const norm = query.trim().toLowerCase()
    const now = new Date()

    const detectedTimeKeywords: string[] = []

    // 1. Detect temporal markers
    const timePatterns = [
      'today',
      'tonight',
      'yesterday',
      'tomorrow',
      'this week',
      'this month',
      'this year',
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

    for (const kw of timePatterns) {
      if (norm.includes(kw)) {
        detectedTimeKeywords.push(kw)
      }
    }

    // 2. Evaluate URL presence
    if (/https?:\/\/\S+/i.test(query) || /\b(?:www\.)?[a-z0-9-]+\.(?:com|org|io|net|gov|edu|ai|dev)\b/i.test(norm)) {
      return {
        classification: 'LIVE',
        reasoning: 'Explicit URL or web domain requested for browsing or extraction.',
        requiresRealtimeData: true,
        suggestedTools: ['browserOpen', 'browserRead'],
        temporalContext: {
          currentDateIso: now.toISOString(),
          currentFormattedDate: now.toDateString(),
          detectedTimeKeywords
        }
      }
    }

    // 3. Evaluate LIVE classification
    for (const kw of this.liveKeywords) {
      if (norm.includes(kw)) {
        let suggested = ['webSearch', 'newsSearch']
        if (norm.includes('convert') || norm.includes('currency') || norm.includes('exchange rate') || /\b(usd|eur|gbp|inr|jpy|cad|aud)\b/i.test(norm)) {
          suggested = ['currencyConverter']
        } else if (norm.includes('weather') || norm.includes('temperature') || norm.includes('forecast')) {
          suggested = ['weather']
        } else if (norm.includes('time') || norm.includes('clock') || norm.includes('timezone') || norm.includes('time in')) {
          suggested = ['worldClock', 'time']
        } else if (norm.includes('youtube') || norm.includes('video') || norm.includes('trending')) {
          suggested = ['youtubeSearch']
        } else if (norm.includes('map') || norm.includes('directions') || norm.includes('near me')) {
          suggested = ['maps']
        } else if (norm.includes('world news') || norm.includes('global news') || norm.includes('international')) {
          suggested = ['worldNews', 'newsSearch']
        } else if (norm.includes('country') || norm.includes('capital of') || norm.includes('population of')) {
          suggested = ['countryDetails', 'webSearch']
        }

        return {
          classification: 'LIVE',
          reasoning: `Query matched live indicator '${kw}'. Real-time data retrieval mandatory.`,
          requiresRealtimeData: true,
          suggestedTools: suggested,
          temporalContext: {
            currentDateIso: now.toISOString(),
            currentFormattedDate: now.toDateString(),
            detectedTimeKeywords
          }
        }
      }
    }

    // 4. Evaluate CURRENT classification
    for (const kw of this.currentKeywords) {
      if (norm.includes(kw)) {
        let suggested = ['webSearch']
        if (norm.includes('github') || norm.includes('repo') || norm.includes('release')) {
          suggested = ['githubSearch', 'webSearch']
        }
        return {
          classification: 'CURRENT',
          reasoning: `Query matched current indicator '${kw}'. Fresh data verification required.`,
          requiresRealtimeData: true,
          suggestedTools: suggested,
          temporalContext: {
            currentDateIso: now.toISOString(),
            currentFormattedDate: now.toDateString(),
            detectedTimeKeywords
          }
        }
      }
    }

    // 5. Evaluate STATIC classification
    if (
      /\b(explain|define|what is|how to|code in|formula|algorithm|history of|theory)\b/i.test(norm) &&
      detectedTimeKeywords.length === 0
    ) {
      return {
        classification: 'STATIC',
        reasoning: 'Query asks for evergreen foundational concepts without temporal constraints.',
        requiresRealtimeData: false,
        suggestedTools: [],
        temporalContext: {
          currentDateIso: now.toISOString(),
          currentFormattedDate: now.toDateString(),
          detectedTimeKeywords: []
        }
      }
    }

    // 6. Default to UNKNOWN (Fallback to lightweight search if temporal markers exist)
    const requiresRealtime = detectedTimeKeywords.length > 0
    return {
      classification: requiresRealtime ? 'CURRENT' : 'UNKNOWN',
      reasoning: requiresRealtime
        ? 'Detected temporal keywords in query.'
        : 'Query intent ambiguous; safe default evaluation.',
      requiresRealtimeData: requiresRealtime,
      suggestedTools: requiresRealtime ? ['webSearch'] : [],
      temporalContext: {
        currentDateIso: now.toISOString(),
        currentFormattedDate: now.toDateString(),
        detectedTimeKeywords
      }
    }
  }
}

export const realtimeDecisionEngine = new RealTimeDecisionEngine()
