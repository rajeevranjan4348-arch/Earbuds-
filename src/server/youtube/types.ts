/**
 * Autonomous AI YouTube Manager Types & Data Contracts
 */

export type ContentStage =
  | 'DISCOVERED'
  | 'RESEARCHING'
  | 'SCRIPT_READY'
  | 'ASSETS_READY'
  | 'RENDERING'
  | 'REVIEW'
  | 'APPROVED'
  | 'UPLOADED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'ANALYZING'
  | 'REJECTED'

export type VideoFormat = 'SHORTS' | 'MINI' | 'STANDARD' | 'LONG_FORM'

export type ApprovalMode = 'MANUAL' | 'SEMI_AUTO' | 'AUTO'

export type FactStatus = 'CONFIRMED_FACT' | 'UNCONFIRMED_REPORT' | 'COMMENTARY_ANALYSIS'

export type QualityCheckType =
  | 'FACT_CHECK'
  | 'COPYRIGHT_CHECK'
  | 'POLICY_CHECK'
  | 'SCRIPT_CHECK'
  | 'AUDIO_CHECK'
  | 'VIDEO_CHECK'
  | 'CAPTION_CHECK'
  | 'THUMBNAIL_CHECK'
  | 'METADATA_CHECK'

export interface QualityCheckItem {
  check: QualityCheckType
  passed: boolean
  score: number // 0-100
  critical: boolean
  details: string
  timestamp: string
}

export interface FactualClaim {
  claim: string
  source: string
  status: FactStatus
  verified: boolean
  verificationNotes?: string
}

export interface TrendTopic {
  id: string
  title: string
  niche: string
  source: string // e.g. 'YouTube Data API', 'Google Trends', 'News Intelligence', 'Channel Analytics'
  discoveredAt: string
  relevanceScore: number // 0-100
  interestScore: number // 0-100
  searchDemand: number // 0-100
  competitionScore: number // 0-100
  freshnessScore: number // 0-100
  audienceFitScore: number // 0-100
  contentAvailability: number // 0-100
  safetyPolicyRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  opportunityScore: number // 0-100 (composite calculated)
  selectionReason: string
  factualClaims: FactualClaim[]
  copyrightRisk: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH'
  requiresHumanReview: boolean
  isDuplicate: boolean
  duplicateMatchId?: string
}

export interface TitleCandidate {
  title: string
  characterCount: number
  score: number // 0-100
  style: 'HIGH_CURIOSITY' | 'SEARCH_OPTIMIZED' | 'HOW_TO' | 'AUTHORITATIVE' | 'STORY_DRIVEN'
  reasoning: string
}

export interface VideoScript {
  titleCandidates: TitleCandidate[]
  selectedTitle: string
  format: VideoFormat
  estimatedDurationSec: number
  hook: {
    text: string
    visualCue: string
    durationSec: number
    psychologyType: string
  }
  context: {
    text: string
    visualCue: string
  }
  mainInfo: {
    keyPoints: string[]
    visualCues: string[]
  }
  storytelling: {
    text: string
    visualCue: string
  }
  transitions: string[]
  conclusion: {
    text: string
    visualCue: string
  }
  callToAction: {
    text: string
    placement: string
  }
  fullText: string
  voiceoverPacing: string
  shortFormAdaptation: string
}

export interface VideoChapter {
  timestamp: string
  seconds: number
  title: string
}

export interface VideoMetadata {
  title: string
  description: string
  tags: string[]
  category: string
  categoryId: string // standard YouTube category id, e.g. 28 for Sci/Tech
  language: string
  chapters: VideoChapter[]
  visibility: 'private' | 'unlisted' | 'public'
  scheduledPublishAt?: string
  isShorts: boolean
  playlistTitle?: string
}

export interface AssetManifestItem {
  assetId: string
  assetName: string
  type: 'IMAGE' | 'BROLL' | 'VOICEOVER' | 'CAPTION' | 'MUSIC' | 'THUMBNAIL'
  source: string
  licenseStatus: 'PROPRIETARY_AI' | 'CREATIVE_COMMONS' | 'PUBLIC_DOMAIN' | 'LICENSED'
  creationMethod: string
  usageRestrictions: string
  previewUrl?: string
}

export interface ThumbnailConcept {
  id: string
  conceptName: string
  headlineText: string
  compositionDescription: string
  visualPrompt: string
  colorPalette: string[]
  mobileReadabilityScore: number // 0-100
  generatedImageUrl?: string
  isSelected: boolean
}

export interface StoryboardScene {
  sceneNumber: number
  timecode: string
  durationSec: number
  visualDescription: string
  spokenText: string
  assetPrompt: string
  transitionType: string
  renderedAssetUrl?: string
}

export interface ContentJob {
  jobId: string
  createdAt: string
  updatedAt: string
  stage: ContentStage
  topic: TrendTopic
  format: VideoFormat
  script?: VideoScript
  metadata?: VideoMetadata
  thumbnails: ThumbnailConcept[]
  selectedThumbnail?: ThumbnailConcept
  storyboard: StoryboardScene[]
  assetManifest: AssetManifestItem[]
  vttCaptions?: string
  qualityChecks: QualityCheckItem[]
  qualityGatePassed: boolean
  needsReviewReason?: string
  youtubeVideoId?: string
  youtubeVideoUrl?: string
  uploadStatus?: 'PENDING' | 'UPLOADED_PRIVATE' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'
  publishScheduledFor?: string
  logs: Array<{
    timestamp: string
    step: string
    message: string
    status: 'info' | 'success' | 'warning' | 'error'
  }>
}

export interface ChannelProfile {
  channelId: string
  channelName: string
  handle: string
  description: string
  targetAudience: string
  contentNiches: string[]
  blockedTopics: string[]
  preferredVideoLength: VideoFormat
  preferredLanguage: string
  brandStyle: {
    tone: string
    primaryColor: string
    visualTheme: string
  }
  uploadSchedule: {
    daysOfWeek: number[] // 0-6 (Sun-Sat)
    publishHourUtc: number
    timezone: string
  }
  approvalMode: ApprovalMode
  autoPublishEnabled: boolean
  successfulTopics: string[]
  failedTopics: string[]
  publishedVideosCount: number
  totalViews: number
  subscribers: number
}

export interface ChannelAnalytics {
  period: string
  views: number
  watchTimeHours: number
  avgViewDurationSec: number
  retentionRate: number // 0-100
  ctr: number // 0-100
  likes: number
  comments: number
  subscribersGained: number
  trafficSources: Array<{ source: string; percentage: number }>
  topPerformingVideos: Array<{
    videoId: string
    title: string
    views: number
    ctr: number
    retention: number
    publishDate: string
  }>
  audienceRetentionCurve: Array<{ percent: number; retentionPercent: number }>
  aiInsights: string[]
  recommendedNextTopics: string[]
}

export interface AutomationScheduleConfig {
  enabled: boolean
  discoveryTime: string // '07:00'
  researchTime: string // '08:00'
  generateTime: string // '09:00'
  qcTime: string // '12:00'
  publishTime: string // '18:00'
  timezone: string
  lastRunAt?: string
  nextRunAt?: string
}

export interface PipelineOperationResult {
  status: 'success' | 'pending' | 'failed'
  job_id: string
  step: string
  message: string
  retryable: boolean
  data?: any
  error?: string
}
