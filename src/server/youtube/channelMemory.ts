/**
 * Channel Memory & Structured Historical Ledger
 * Maintains persistent channel preferences, niches, audience profile,
 * published videos, and performance feedback loops.
 */

import { ChannelProfile, AutomationScheduleConfig, VideoFormat } from './types'

export class ChannelMemoryStore {
  private profile: ChannelProfile = {
    channelId: 'UC_IRIS_AI_AUTONOMOUS_01',
    channelName: 'IRIS Intelligence Labs',
    handle: '@iris_intelligence',
    description:
      'Exploring frontiers in artificial intelligence, autonomous systems, spatial computing, and next-generation developer tooling.',
    targetAudience:
      'Developers, AI researchers, tech enthusiasts, robotics engineers, and digital innovators aged 18-45 interested in cutting-edge technology and practical tutorials.',
    contentNiches: [
      'AI & Autonomous Agents',
      'Large Language Models & Gemini',
      'Spatial GIS & Live Telemetry',
      'Developer Productivity & Tools',
      'Tech Breakthroughs & Deep Dives'
    ],
    blockedTopics: [
      'crypto scam giveaways',
      'unverified gossip',
      'gambling platforms',
      'get-rich-quick hacks',
      'clickbait rumors',
      'copyrighted movie re-uploads'
    ],
    preferredVideoLength: 'STANDARD',
    preferredLanguage: 'en',
    brandStyle: {
      tone: 'Authoritative, curious, high-energy, technically grounded, and accessible',
      primaryColor: '#10B981', // Emerald AI theme
      visualTheme: 'Minimalist cybernetic, high-contrast dark visualizers, crisp code callouts'
    },
    uploadSchedule: {
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      publishHourUtc: 18,
      timezone: 'UTC'
    },
    approvalMode: 'SEMI_AUTO',
    autoPublishEnabled: false,
    successfulTopics: [
      'Building Autonomous Agent Pipelines with Gemini 2.5',
      'Spatial AI Telemetry in Real-Time Maps',
      'Mastering Full-Stack TypeScript Workspaces'
    ],
    failedTopics: ['Generic top 10 AI tools with no code', 'Over-simplified buzzword overviews'],
    publishedVideosCount: 14,
    totalViews: 248900,
    subscribers: 18450
  }

  private scheduleConfig: AutomationScheduleConfig = {
    enabled: true,
    discoveryTime: '07:00',
    researchTime: '08:00',
    generateTime: '09:00',
    qcTime: '12:00',
    publishTime: '18:00',
    timezone: 'UTC'
  }

  private contentHistory: Array<{
    id: string
    title: string
    niche: string
    publishedAt?: string
    outcome?: 'high_performing' | 'average' | 'underperformed' | 'rejected'
    notes?: string
  }> = [
    {
      id: 'vid_hist_01',
      title: 'How Gemini 2.5 Solves Agentic Tool Use at Scale',
      niche: 'AI & Autonomous Agents',
      publishedAt: '2026-08-15T18:00:00Z',
      outcome: 'high_performing',
      notes: 'High retention at 68%, great search traffic from developer queries.'
    },
    {
      id: 'vid_hist_02',
      title: 'Connecting Google Workspace to AI Agents in 10 Minutes',
      niche: 'Developer Productivity & Tools',
      publishedAt: '2026-08-22T18:00:00Z',
      outcome: 'high_performing',
      notes: 'Strong comment engagement around Drive & Sheets automation.'
    },
    {
      id: 'vid_hist_03',
      title: 'Real-Time Spatial Telemetry & GIS Mapping with React',
      niche: 'Spatial GIS & Live Telemetry',
      publishedAt: '2026-09-01T18:00:00Z',
      outcome: 'high_performing',
      notes: 'Audience loved the interactive visual demo and high-contrast UI.'
    }
  ]

  public getProfile(): ChannelProfile {
    return { ...this.profile }
  }

  public updateProfile(updates: Partial<ChannelProfile>): ChannelProfile {
    this.profile = {
      ...this.profile,
      ...updates,
      brandStyle: {
        ...this.profile.brandStyle,
        ...(updates.brandStyle || {})
      },
      uploadSchedule: {
        ...this.profile.uploadSchedule,
        ...(updates.uploadSchedule || {})
      }
    }
    return this.getProfile()
  }

  public getScheduleConfig(): AutomationScheduleConfig {
    return { ...this.scheduleConfig }
  }

  public updateScheduleConfig(
    updates: Partial<AutomationScheduleConfig>
  ): AutomationScheduleConfig {
    this.scheduleConfig = {
      ...this.scheduleConfig,
      ...updates
    }
    return this.getScheduleConfig()
  }

  public isTopicBlocked(topicTitle: string): { blocked: boolean; reason?: string } {
    const lower = topicTitle.toLowerCase()
    for (const blocked of this.profile.blockedTopics) {
      if (lower.includes(blocked.toLowerCase())) {
        return {
          blocked: true,
          reason: `Topic violates channel safety rules (contains blocked term: "${blocked}")`
        }
      }
    }
    return { blocked: false }
  }

  public findDuplicateOrSimilar(topicTitle: string): { isDuplicate: boolean; matchTitle?: string } {
    const lower = topicTitle.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    const tokens = new Set(lower.split(/\s+/).filter((t) => t.length > 3))

    for (const item of this.contentHistory) {
      const itemLower = item.title.toLowerCase().replace(/[^a-z0-9 ]/g, '')
      const itemTokens = itemLower.split(/\s+/).filter((t) => t.length > 3)
      const matches = itemTokens.filter((t) => tokens.has(t))

      // If more than 60% of significant keywords overlap with a recently published video
      if (itemTokens.length > 0 && matches.length / itemTokens.length >= 0.65) {
        return { isDuplicate: true, matchTitle: item.title }
      }
    }
    return { isDuplicate: false }
  }

  public recordContentHistory(entry: {
    id: string
    title: string
    niche: string
    publishedAt?: string
    outcome?: 'high_performing' | 'average' | 'underperformed' | 'rejected'
    notes?: string
  }) {
    this.contentHistory.unshift(entry)
    if (this.contentHistory.length > 100) {
      this.contentHistory.pop()
    }
  }

  public getContentHistory() {
    return [...this.contentHistory]
  }

  public recordSuccessfulTopic(topic: string) {
    if (!this.profile.successfulTopics.includes(topic)) {
      this.profile.successfulTopics.push(topic)
    }
  }

  public recordFailedTopic(topic: string) {
    if (!this.profile.failedTopics.includes(topic)) {
      this.profile.failedTopics.push(topic)
    }
  }
}

export const channelMemoryStore = new ChannelMemoryStore()
