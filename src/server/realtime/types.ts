/**
 * Real-Time Real-Time Architecture Types & Provider Interfaces
 */

export type QueryClassification = 'STATIC' | 'CURRENT' | 'LIVE' | 'UNKNOWN'

export type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'unknown'

export type AgreementLevel = 'high' | 'medium' | 'low'

export interface SourceMetadata {
  url: string
  title: string
  source: string
  snippet: string
  content?: string
  publishedAt?: string
  retrievedAt: string
  freshness: FreshnessLevel
  credibilityScore?: number // 0 to 1
  sourceType:
    | 'official_doc'
    | 'official_website'
    | 'government'
    | 'official_api'
    | 'reputable_news'
    | 'established_tech'
    | 'community'
    | 'search_snippet'
}

export interface VerificationResult {
  claim: string
  sources: SourceMetadata[]
  agreement: AgreementLevel
  confidence: 'high' | 'medium' | 'low'
  summary: string
  disagreements?: string[]
}

export interface ToolExecutionLog {
  requestId: string
  toolName: string
  startTime: number
  endTime: number
  durationMs: number
  success: boolean
  error?: string
  sourceCount: number
  cacheHit: boolean
  retryCount: number
}

// Provider Contracts
export interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
  publishedAt?: string
}

export interface SearchProvider {
  name: string
  searchWeb(query: string, options?: { recency?: '24h' | '7d' | '30d' | 'any'; limit?: number }): Promise<SearchResult[]>
}

export interface WebPageData {
  url: string
  title: string
  content: string
  summary?: string
  publicationDate?: string
  links?: string[]
}

export interface BrowserProvider {
  name: string
  fetchPage(url: string): Promise<WebPageData>
  readPageSection(url: string, selector?: string): Promise<string>
}

export interface NewsArticle {
  title: string
  url: string
  source: string
  snippet: string
  publishedAt: string
}

export interface NewsProvider {
  name: string
  searchNews(query: string, limit?: number): Promise<NewsArticle[]>
}

export interface WeatherData {
  location: string
  temperatureCelsius: number
  temperatureFahrenheit: number
  condition: string
  humidity: number
  windSpeedKmh: number
  forecast?: Array<{ day: string; high: number; low: number; condition: string }>
}

export interface WeatherProvider {
  name: string
  getWeather(location: string): Promise<WeatherData>
}

export interface TimeData {
  location: string
  timezone: string
  localTime: string
  date: string
  utcOffset: string
}

export interface TimeProvider {
  name: string
  getTime(location?: string): Promise<TimeData>
}

export interface PlaceResult {
  name: string
  address: string
  latitude: number
  longitude: number
  rating?: number
  openNow?: boolean
  types?: string[]
}

export interface MapsProvider {
  name: string
  searchPlace(query: string, location?: string): Promise<PlaceResult[]>
  getDirections(origin: string, destination: string): Promise<{ distance: string; duration: string; steps: string[] }>
}

export interface YouTubeVideo {
  id: string
  title: string
  channelTitle: string
  url: string
  publishedAt: string
  description: string
  viewCount?: string
}

export interface YouTubeProvider {
  name: string
  searchVideos(query: string, limit?: number): Promise<YouTubeVideo[]>
  getTrending(region?: string): Promise<YouTubeVideo[]>
}

export interface GitHubRepo {
  name: string
  fullName: string
  url: string
  description: string
  stars: number
  latestRelease?: { tagName: string; publishedAt: string; body: string }
  updatedAt: string
}

export interface GitHubProvider {
  name: string
  searchRepos(query: string, limit?: number): Promise<GitHubRepo[]>
  getRepoDetails(owner: string, repo: string): Promise<GitHubRepo | null>
  getReadme(owner: string, repo: string): Promise<string>
}
