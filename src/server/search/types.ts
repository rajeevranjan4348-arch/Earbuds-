/**
 * Web Search & Browsing Types
 * Modeled after SearXNG, agent-search, and browser-search specifications.
 */

export type SearchCategory = 'general' | 'news' | 'science' | 'it' | 'images' | 'videos'
export type TimeRange = 'day' | 'week' | 'month' | 'year' | ''

export interface SearchOptions {
  category?: SearchCategory
  timeRange?: TimeRange
  limit?: number
  language?: string
  safeSearch?: number
  extractContent?: boolean
  maxTokensPerSource?: number
}

export interface SearchResult {
  id: string
  title: string
  url: string
  snippet: string
  content?: string
  score?: number
  engine?: string
  publishedDate?: string
  author?: string
  domain?: string
  thumbnail?: string
}

export interface Citation {
  index: number
  title: string
  url: string
  domain: string
  snippet: string
}

export interface SearchResponse {
  success: boolean
  query: string
  provider: string
  totalResults: number
  results: SearchResult[]
  citations: Citation[]
  cached?: boolean
  error?: string
}

export interface ExtractedPage {
  url: string
  title: string
  description?: string
  content: string
  markdown: string
  author?: string
  publishedTime?: string
  domain: string
  wordCount: number
  truncated: boolean
}

export interface ResearchPlan {
  topic: string
  queries: string[]
  subtopics: string[]
}

export interface ResearchSynthesis {
  topic: string
  summary: string
  keyFindings: string[]
  sources: Citation[]
  queriesExecuted: string[]
}
