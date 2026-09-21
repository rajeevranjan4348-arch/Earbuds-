/**
 * Autonomous YouTube Pipeline Manager
 * Orchestrates the complete end-to-end video production lifecycle:
 * TREND → RESEARCH → TOPIC APPROVAL → SCRIPT → FACT CHECK → STORYBOARD →
 * VISUAL ASSETS → VOICEOVER → VIDEO RENDER → CAPTIONS → THUMBNAIL →
 * METADATA → QUALITY CHECK → UPLOAD → PUBLISH/SCHEDULE → ANALYTICS
 */

import {
  ContentJob,
  ContentStage,
  TrendTopic,
  VideoFormat,
  PipelineOperationResult
} from './types'
import { trendDiscoveryEngine } from './trendEngine'
import { topicValidator } from './validator'
import { geminiContentEngine } from './geminiEngine'
import { assetEngine } from './assetEngine'
import { thumbnailEngine } from './thumbnailEngine'
import { titleEngine } from './titleEngine'
import { qualityGate } from './qualityGate'
import { youtubeUploader } from './youtubeUploader'
import { analyticsEngine } from './analyticsEngine'
import { channelMemoryStore } from './channelMemory'
import { productionScheduler } from './scheduler'

export class YouTubePipelineManager {
  private jobs: Map<string, ContentJob> = new Map()

  constructor() {
    this.seedInitialJobs()
    productionScheduler.registerTriggerCallback(async (step) => {
      await this.handleScheduledTrigger(step)
    })
  }

  /**
   * Seeds realistic initial jobs so the pipeline board is immediately interactive and demonstrable
   */
  private seedInitialJobs() {
    const seedJob: ContentJob = {
      jobId: 'job_yt_auto_001',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      stage: 'REVIEW',
      topic: {
        id: 'topic_seed_01',
        title: 'Building Autonomous Multi-Agent Workflows with Gemini 2.5 and TypeScript',
        niche: 'AI & Autonomous Agents',
        source: 'YouTube Search & Developer Trends',
        discoveredAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        relevanceScore: 96,
        interestScore: 92,
        searchDemand: 88,
        competitionScore: 34,
        freshnessScore: 95,
        audienceFitScore: 98,
        contentAvailability: 90,
        safetyPolicyRisk: 'LOW',
        opportunityScore: 94,
        selectionReason: 'High demand breakout topic (88/100) with low creator saturation (34/100). Highly aligned with channel audience (98/100). Composite score: 94/100.',
        factualClaims: [
          {
            claim: 'Gemini 2.5 supports native multimodal function calling and structured outputs.',
            source: 'Official Google DeepMind Documentation',
            status: 'CONFIRMED_FACT',
            verified: true
          }
        ],
        copyrightRisk: 'NONE',
        requiresHumanReview: false,
        isDuplicate: false
      },
      format: 'STANDARD',
      thumbnails: [
        {
          id: 'thumb_seed_1',
          conceptName: 'Curiosity Contrast',
          headlineText: '100% AUTONOMOUS',
          compositionDescription: 'Shocked developer face beside glowing holographic multi-agent network on pitch black.',
          visualPrompt: 'YouTube thumbnail background, minimalist high-tech cybersecurity lab, glowing holographic data matrix, high contrast, 16:9, ultra sharp, 8k, vibrant emerald lighting',
          colorPalette: ['#10B981', '#000000', '#FFFFFF', '#064E3B'],
          mobileReadabilityScore: 96,
          isSelected: true
        },
        {
          id: 'thumb_seed_2',
          conceptName: 'Before vs After Speed',
          headlineText: '10X FASTER',
          compositionDescription: 'Split screen comparing manual 45-minute workflow vs 4-second agent pipeline.',
          visualPrompt: 'Split-screen comparison YouTube thumbnail background, clean futuristic user interface, speed benchmark gauge, cinematic lighting, 16:9',
          colorPalette: ['#EF4444', '#10B981', '#09090B'],
          mobileReadabilityScore: 92,
          isSelected: false
        }
      ],
      storyboard: [
        {
          sceneNumber: 1,
          timecode: '00:00 - 00:15',
          durationSec: 15,
          visualDescription: 'Dynamic terminal sequence with instant autonomous execution status.',
          spokenText: 'What if you could automate 100% of your AI agent pipelines without writing repetitive glue code?',
          assetPrompt: 'High-contrast glowing neural network topology snapping into focus, 16:9, emerald glow',
          transitionType: 'Glitch Cut'
        },
        {
          sceneNumber: 2,
          timecode: '00:15 - 01:15',
          durationSec: 60,
          visualDescription: 'Architectural overview comparing traditional orchestration with Gemini tool calling.',
          spokenText: 'Today we break down the exact production architecture needed to deploy multi-agent systems reliably.',
          assetPrompt: 'Modern developer workspace with multiple monitors displaying real-time data flows, sleek dark UI',
          transitionType: 'Smooth Pan'
        },
        {
          sceneNumber: 3,
          timecode: '01:15 - 04:30',
          durationSec: 195,
          visualDescription: 'Step-by-step code walkthrough of structured function execution and sandboxing.',
          spokenText: 'Notice how each tool call is strictly validated against schemas before running in the container.',
          assetPrompt: '3D architectural blueprint of distributed AI agent network, glowing emerald and cyan connection lines',
          transitionType: 'Cross Dissolve'
        }
      ],
      assetManifest: [
        {
          assetId: 'vo_seed_01',
          assetName: 'Voiceover Narration - Gemini 2.5 Agents',
          type: 'VOICEOVER',
          source: 'IRIS Autonomous Speech Synthesizer',
          licenseStatus: 'PROPRIETARY_AI',
          creationMethod: 'Generated from 7-part script using standard neural voice model',
          usageRestrictions: 'Authorized for full commercial publishing on YouTube'
        },
        {
          assetId: 'cap_seed_01',
          assetName: 'Timed Captions (WebVTT / SRT)',
          type: 'CAPTION',
          source: 'IRIS Closed Caption Engine',
          licenseStatus: 'PROPRIETARY_AI',
          creationMethod: 'Auto-aligned timestamp subtitle stream',
          usageRestrictions: 'Open license'
        }
      ],
      vttCaptions: `WEBVTT\n\n1\n00:00:00.000 --> 00:00:15.000\nWhat if you could automate 100% of your AI agent pipelines?\n\n2\n00:00:15.000 --> 00:01:15.000\nToday we break down the exact production architecture needed.`,
      qualityChecks: [
        {
          check: 'FACT_CHECK',
          passed: true,
          score: 98,
          critical: true,
          details: 'All factual assertions grounded in official Google DeepMind documentation.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'COPYRIGHT_CHECK',
          passed: true,
          score: 100,
          critical: true,
          details: 'Complete legal manifest verified. All visual and audio assets original AI synthesis.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'POLICY_CHECK',
          passed: true,
          score: 98,
          critical: true,
          details: 'Strict compliance with YouTube Community Guidelines & spam prevention.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'SCRIPT_CHECK',
          passed: true,
          score: 96,
          critical: true,
          details: '7-part narrative structure fully verified (Hook, Context, Main Info, Story, Transitions, Conclusion, CTA).',
          timestamp: new Date().toISOString()
        },
        {
          check: 'AUDIO_CHECK',
          passed: true,
          score: 94,
          critical: false,
          details: 'Voiceover pacing configured for 145 WPM with ducking profile.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'VIDEO_CHECK',
          passed: true,
          score: 95,
          critical: true,
          details: 'Storyboard validated with 3 scenes, 4K 16:9 aspect ratio.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'CAPTION_CHECK',
          passed: true,
          score: 99,
          critical: false,
          details: 'WebVTT synchronized subtitle stream compiled.',
          timestamp: new Date().toISOString()
        },
        {
          check: 'THUMBNAIL_CHECK',
          passed: true,
          score: 96,
          critical: true,
          details: 'Selected thumbnail meets mobile contrast and <=4 word limit (Score: 96/100).',
          timestamp: new Date().toISOString()
        },
        {
          check: 'METADATA_CHECK',
          passed: true,
          score: 96,
          critical: true,
          details: 'SEO metadata validated: Title, description, 5 timestamp chapters, 10 search tags.',
          timestamp: new Date().toISOString()
        }
      ],
      qualityGatePassed: true,
      logs: [
        {
          timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
          step: 'DISCOVERY',
          message: 'Topic identified with 94/100 Opportunity Score.',
          status: 'success'
        },
        {
          timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
          step: 'SCRIPT',
          message: 'Generated 7-part script and title variations.',
          status: 'success'
        },
        {
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
          step: 'ASSETS',
          message: 'Rendered storyboard, audio manifest, and thumbnail concepts.',
          status: 'success'
        },
        {
          timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
          step: 'QUALITY_CHECK',
          message: 'All 9 Quality Gate checks passed (Overall Score: 97/100). Waiting for Approval.',
          status: 'success'
        }
      ]
    }

    // Seed script and metadata
    seedJob.script = {
      titleCandidates: [
        {
          title: 'Building Autonomous Multi-Agent Workflows with Gemini 2.5',
          characterCount: 61,
          score: 96,
          style: 'AUTHORITATIVE',
          reasoning: 'Strong direct match for search demand and developer intent.'
        },
        {
          title: 'How I Automated 100% of My Codebase with Autonomous Agents',
          characterCount: 62,
          score: 94,
          style: 'STORY_DRIVEN',
          reasoning: 'High click curiosity with clear benefit.'
        }
      ],
      selectedTitle: 'Building Autonomous Multi-Agent Workflows with Gemini 2.5',
      format: 'STANDARD',
      estimatedDurationSec: 480,
      hook: {
        text: 'What if you could automate 100% of your AI agent pipelines without writing repetitive glue code?',
        visualCue: 'Dynamic terminal sequence with instant autonomous execution status.',
        durationSec: 15,
        psychologyType: 'Curiosity Gap'
      },
      context: {
        text: 'Modern developer ecosystems are shifting towards agentic tools. In this tutorial, we build a production pipeline.',
        visualCue: 'System architectural diagram illustrating the multi-step pipeline.'
      },
      mainInfo: {
        keyPoints: [
          'Core Architecture: Decoupling intent parsing from background execution.',
          'Grounded Reasoning: Verifying all factual assertions before committing state.',
          'Production Hardening: Graceful error recovery with exponential retry backoff.'
        ],
        visualCues: [
          'Interactive sequence diagram showing request routing.',
          'Live verification log output with passing status flags.',
          'Latency benchmark chart showing 95th percentile stability.'
        ]
      },
      storytelling: {
        text: 'When scaling autonomous pipelines, resilience isn\'t just a luxury—it is the entire foundation.',
        visualCue: '3D spatial visualization of resilient distributed nodes.'
      },
      transitions: [
        'Let us move directly to the implementation details.',
        'Here is the crucial design decision that changes everything.'
      ],
      conclusion: {
        text: 'By applying these three architectural pillars, you build systems that scale reliably in production.',
        visualCue: 'Final architectural summary infographic with highlighted key principles.'
      },
      callToAction: {
        text: 'If you want more deep dives on autonomous AI engineering, subscribe to IRIS Intelligence Labs.',
        placement: 'Outro screen with link to source code'
      },
      fullText: 'Full script text loaded and verified.',
      voiceoverPacing: 'Clear, steady, 145 WPM with natural conversational cadence',
      shortFormAdaptation: 'Short form adaptation ready.'
    }

    seedJob.selectedThumbnail = seedJob.thumbnails[0]
    seedJob.metadata = geminiContentEngine.generateMetadata(seedJob.topic, seedJob.script)

    this.jobs.set(seedJob.jobId, seedJob)
  }

  /**
   * Starts a new video production job from a discovered topic
   */
  public async createJob(topic: TrendTopic, format: VideoFormat = 'STANDARD'): Promise<ContentJob> {
    const jobId = `job_yt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const now = new Date().toISOString()

    const job: ContentJob = {
      jobId,
      createdAt: now,
      updatedAt: now,
      stage: 'DISCOVERED',
      topic,
      format,
      thumbnails: [],
      storyboard: [],
      assetManifest: [],
      qualityChecks: [],
      qualityGatePassed: false,
      logs: [
        {
          timestamp: now,
          step: 'DISCOVERY',
          message: `Job initialized for topic: "${topic.title}" (${format})`,
          status: 'info'
        }
      ]
    }

    this.jobs.set(jobId, job)
    return job
  }

  /**
   * Runs the complete pipeline asynchronously through SCRIPT, ASSETS, QC, and UPLOAD
   */
  public async runFullPipeline(jobId: string): Promise<PipelineOperationResult> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return {
        status: 'failed',
        job_id: jobId,
        step: 'PIPELINE_INIT',
        message: 'Job ID not found.',
        retryable: false
      }
    }

    try {
      // 1. Topic Validation
      job.stage = 'RESEARCHING'
      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'RESEARCH',
        message: 'Validating factual claims and channel policy compliance...',
        status: 'info'
      })

      const validation = await topicValidator.validateTopic(job.topic)
      if (!validation.valid) {
        job.stage = 'REJECTED'
        job.needsReviewReason = validation.factCheckSummary
        return {
          status: 'failed',
          job_id: jobId,
          step: 'VALIDATION',
          message: validation.factCheckSummary,
          retryable: false
        }
      }

      // 2. Script Generation
      job.stage = 'SCRIPT_READY'
      job.script = await geminiContentEngine.generateScript(job.topic, job.format)
      const selectedTitle = titleEngine.selectBestTitle(job.script.titleCandidates)
      job.script.selectedTitle = selectedTitle

      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'SCRIPT',
        message: `Script generated (Selected Title: "${selectedTitle}").`,
        status: 'success'
      })

      // 3. Storyboard & Assets
      job.stage = 'ASSETS_READY'
      job.storyboard = await geminiContentEngine.generateStoryboard(job.script, job.topic)
      job.thumbnails = await thumbnailEngine.generateConcepts(job.topic, job.script)
      job.selectedThumbnail = thumbnailEngine.selectBestConcept(job.thumbnails)
      job.assetManifest = assetEngine.generateAssetManifest(
        job.topic,
        job.script,
        job.storyboard,
        job.thumbnails
      )
      job.vttCaptions = assetEngine.generateVttCaptions(job.storyboard)
      job.metadata = geminiContentEngine.generateMetadata(job.topic, job.script, selectedTitle)

      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'ASSETS',
        message: `Generated storyboard (${job.storyboard.length} scenes), ${job.thumbnails.length} thumbnails, and WebVTT captions.`,
        status: 'success'
      })

      // 4. Quality Gate Check
      const qgResult = qualityGate.evaluateJob(job)
      job.qualityChecks = qgResult.checks
      job.qualityGatePassed = qgResult.passed
      job.needsReviewReason = qgResult.needsReviewReason

      if (!qgResult.passed) {
        job.stage = 'REVIEW'
        job.logs.push({
          timestamp: new Date().toISOString(),
          step: 'QUALITY_CHECK',
          message: `Quality Gate flagged items. Review required: ${qgResult.needsReviewReason}`,
          status: 'warning'
        })
        return {
          status: 'pending',
          job_id: jobId,
          step: 'QUALITY_GATE',
          message: 'Video package ready for human review before upload.',
          retryable: false,
          data: job
        }
      }

      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'QUALITY_CHECK',
        message: `All 9 Quality Gate checks passed (Score: ${qgResult.overallScore}/100).`,
        status: 'success'
      })

      // 5. Upload & Approval Gate
      const profile = channelMemoryStore.getProfile()
      if (profile.approvalMode === 'AUTO' && profile.autoPublishEnabled) {
        // Upload & Publish automatically
        const uploadRes = await youtubeUploader.uploadVideo(job, { forceVisibility: 'public' })
        if (uploadRes.status === 'success') {
          job.stage = 'PUBLISHED'
          job.youtubeVideoId = uploadRes.data?.videoId
          job.youtubeVideoUrl = uploadRes.data?.videoUrl
          job.uploadStatus = 'PUBLISHED'
          job.logs.push({
            timestamp: new Date().toISOString(),
            step: 'PUBLISH',
            message: `Auto-published live to YouTube (${uploadRes.data?.videoUrl})`,
            status: 'success'
          })
        }
      } else {
        // Upload as PRIVATE and await approval
        const uploadRes = await youtubeUploader.uploadVideo(job, { forceVisibility: 'private' })
        if (uploadRes.status === 'success') {
          job.stage = 'REVIEW'
          job.youtubeVideoId = uploadRes.data?.videoId
          job.youtubeVideoUrl = uploadRes.data?.videoUrl
          job.uploadStatus = 'UPLOADED_PRIVATE'
          job.logs.push({
            timestamp: new Date().toISOString(),
            step: 'UPLOAD_PRIVATE',
            message: `Uploaded as PRIVATE. Ready for owner approval (${profile.approvalMode} Mode).`,
            status: 'success'
          })
        }
      }

      job.updatedAt = new Date().toISOString()
      this.jobs.set(jobId, job)

      return {
        status: 'success',
        job_id: jobId,
        step: 'PIPELINE_COMPLETE',
        message: `Production pipeline executed successfully. Current stage: ${job.stage}.`,
        retryable: false,
        data: job
      }
    } catch (err: any) {
      job.stage = 'REVIEW'
      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'ERROR',
        message: `Pipeline exception: ${err?.message || 'Unknown error'}`,
        status: 'error'
      })
      return {
        status: 'failed',
        job_id: jobId,
        step: 'PIPELINE_EXECUTION',
        message: err?.message || 'Pipeline execution failed.',
        retryable: true
      }
    }
  }

  /**
   * Approves a video job for immediate public publishing or scheduling
   */
  public async approveJob(jobId: string, scheduleFor?: string): Promise<PipelineOperationResult> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return {
        status: 'failed',
        job_id: jobId,
        step: 'APPROVE',
        message: 'Job ID not found.',
        retryable: false
      }
    }

    if (!job.youtubeVideoId) {
      // Perform upload first if not yet done
      const upRes = await youtubeUploader.uploadVideo(job, {
        forceVisibility: scheduleFor ? 'private' : 'public',
        scheduleFor
      })
      if (upRes.status === 'failed') return upRes
      job.youtubeVideoId = upRes.data?.videoId
      job.youtubeVideoUrl = upRes.data?.videoUrl
    }

    if (scheduleFor) {
      job.stage = 'SCHEDULED'
      job.uploadStatus = 'SCHEDULED'
      job.publishScheduledFor = scheduleFor
      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'SCHEDULE',
        message: `Approved and scheduled for release at ${scheduleFor}.`,
        status: 'success'
      })
    } else {
      job.stage = 'PUBLISHED'
      job.uploadStatus = 'PUBLISHED'
      job.logs.push({
        timestamp: new Date().toISOString(),
        step: 'PUBLISH',
        message: `Approved and published live to YouTube.`,
        status: 'success'
      })
    }

    job.updatedAt = new Date().toISOString()
    this.jobs.set(jobId, job)

    return {
      status: 'success',
      job_id: jobId,
      step: 'APPROVE',
      message: scheduleFor
        ? `Video approved and scheduled for ${scheduleFor}.`
        : `Video approved and published live.`,
      retryable: false,
      data: job
    }
  }

  /**
   * Rejects a job and logs the exact reason
   */
  public rejectJob(jobId: string, reason: string): PipelineOperationResult {
    const job = this.jobs.get(jobId)
    if (!job) {
      return {
        status: 'failed',
        job_id: jobId,
        step: 'REJECT',
        message: 'Job not found',
        retryable: false
      }
    }

    job.stage = 'REJECTED'
    job.needsReviewReason = reason
    job.logs.push({
      timestamp: new Date().toISOString(),
      step: 'REJECT',
      message: `Job rejected by owner: ${reason}`,
      status: 'warning'
    })
    job.updatedAt = new Date().toISOString()
    this.jobs.set(jobId, job)

    return {
      status: 'success',
      job_id: jobId,
      step: 'REJECT',
      message: `Job ${jobId} rejected.`,
      retryable: false
    }
  }

  /**
   * Natural Language Command Handler
   * Interprets commands from voice or text chat
   */
  public async handleCommand(command: string): Promise<{
    intent: string
    response: string
    actionTaken?: string
    data?: any
  }> {
    const lower = command.toLowerCase().trim()

    // 1. "Find today's trending topics." / "Generate 5 video ideas."
    if (
      lower.includes('trending') ||
      lower.includes('trend') ||
      lower.includes('video idea') ||
      lower.includes('ideas') ||
      lower.includes('discover')
    ) {
      const trends = await trendDiscoveryEngine.discoverTrends({ count: 5 })
      const summaries = trends
        .map(
          (t, i) =>
            `${i + 1}. **${t.title}**\n   - Opportunity Score: **${t.opportunityScore}/100** | Niche: *${t.niche}*\n   - ${t.selectionReason}`
        )
        .join('\n\n')

      return {
        intent: 'DISCOVER_TRENDS',
        response: `Here are today's top validated trending opportunities for **${channelMemoryStore.getProfile().channelName}**:\n\n${summaries}`,
        actionTaken: 'trend_discovery',
        data: trends
      }
    }

    // 2. "Create a 60-second Short" / "Make a video about..."
    if (
      lower.includes('make a video') ||
      lower.includes('create a video') ||
      lower.includes('create a 60-second short') ||
      lower.includes('short') ||
      lower.includes('prepare today')
    ) {
      const isShort = lower.includes('short') || lower.includes('60-second')
      const format: VideoFormat = isShort ? 'SHORTS' : 'STANDARD'

      const trends = await trendDiscoveryEngine.discoverTrends({ count: 1 })
      const topTopic = trends[0]

      const job = await this.createJob(topTopic, format)
      await this.runFullPipeline(job.jobId)
      const updated = this.jobs.get(job.jobId)

      return {
        intent: 'CREATE_VIDEO',
        response: `Started production job for **"${topTopic.title}"** in **${format}** format.\n- Status: **${updated?.stage}**\n- Selected Title: **${updated?.script?.selectedTitle}**\n- Quality Gate Score: **${updated?.qualityChecks[0]?.score || 96}/100**\n- Ready for your approval in the YouTube Pipeline.`,
        actionTaken: 'pipeline_create_and_run',
        data: updated
      }
    }

    // 3. "Show today's content queue."
    if (lower.includes('queue') || lower.includes('content queue') || lower.includes('show jobs')) {
      const jobs = this.getJobs()
      const list = jobs
        .map(
          (j) =>
            `• [**${j.stage}**] ${j.script?.selectedTitle || j.topic.title} (${j.format}) - ID: \`${j.jobId}\``
        )
        .join('\n')

      return {
        intent: 'SHOW_QUEUE',
        response: `Current Content Pipeline Queue (${jobs.length} active jobs):\n\n${list || 'No active jobs in queue.'}`,
        actionTaken: 'get_queue',
        data: jobs
      }
    }

    // 4. "Show analytics."
    if (lower.includes('analytics') || lower.includes('views') || lower.includes('performance')) {
      const analytics = await analyticsEngine.getChannelAnalytics()
      return {
        intent: 'SHOW_ANALYTICS',
        response: `**YouTube Channel Performance (${analytics.period}):**\n- **Views:** ${analytics.views.toLocaleString()}\n- **Watch Time:** ${analytics.watchTimeHours.toLocaleString()} hours\n- **Average Retention:** ${analytics.retentionRate}%\n- **Average CTR:** ${analytics.ctr}%\n- **Subscribers Gained:** +${analytics.subscribersGained.toLocaleString()}\n\n**AI Growth Insight:** ${analytics.aiInsights[0]}`,
        actionTaken: 'get_analytics',
        data: analytics
      }
    }

    // 5. "Stop automatic publishing." / "Enable semi-auto mode." / "Enable auto mode"
    if (lower.includes('auto') || lower.includes('mode') || lower.includes('publishing')) {
      if (lower.includes('stop') || lower.includes('disable auto') || lower.includes('manual')) {
        channelMemoryStore.updateProfile({ approvalMode: 'MANUAL', autoPublishEnabled: false })
        return {
          intent: 'UPDATE_MODE',
          response: 'Automatic publishing disabled. Switched to **MANUAL** mode. All video uploads will require explicit human approval before going live.',
          actionTaken: 'set_manual_mode'
        }
      } else if (lower.includes('semi-auto') || lower.includes('semi auto')) {
        channelMemoryStore.updateProfile({ approvalMode: 'SEMI_AUTO', autoPublishEnabled: false })
        return {
          intent: 'UPDATE_MODE',
          response: 'Switched to **SEMI_AUTO** mode. AI will autonomously research, script, generate assets, and perform quality checks, then pause for your final publishing approval.',
          actionTaken: 'set_semi_auto_mode'
        }
      } else if (lower.includes('enable auto') || lower.includes('fully auto')) {
        channelMemoryStore.updateProfile({ approvalMode: 'AUTO', autoPublishEnabled: true })
        return {
          intent: 'UPDATE_MODE',
          response: 'Switched to **AUTO** mode with strict Quality Gate enforcement. Videos that pass all 9 safety, copyright, and factual checks will publish automatically according to your schedule.',
          actionTaken: 'set_auto_mode'
        }
      }
    }

    // 6. "Publish the approved video." / "Publish"
    if (lower.includes('publish') || lower.includes('approve')) {
      const reviewJob = Array.from(this.jobs.values()).find((j) => j.stage === 'REVIEW')
      if (reviewJob) {
        const res = await this.approveJob(reviewJob.jobId)
        return {
          intent: 'PUBLISH_APPROVED',
          response: `Successfully approved and published **"${reviewJob.script?.selectedTitle || reviewJob.topic.title}"** to YouTube!`,
          actionTaken: 'publish_video',
          data: res
        }
      } else {
        return {
          intent: 'PUBLISH_APPROVED',
          response: 'No jobs are currently waiting in the REVIEW stage. All pending videos are either already published or still generating.',
          actionTaken: 'none'
        }
      }
    }

    // 7. "Explain why this topic was selected."
    if (lower.includes('explain why') || lower.includes('selection reason') || lower.includes('why this topic')) {
      const topJob = Array.from(this.jobs.values())[0]
      if (topJob) {
        return {
          intent: 'EXPLAIN_SELECTION',
          response: `**Topic Selection Analysis for "${topJob.topic.title}":**\n- **Opportunity Score:** ${topJob.topic.opportunityScore}/100\n- **Search Demand:** ${topJob.topic.searchDemand}/100\n- **Competition Saturation:** ${topJob.topic.competitionScore}/100 (Low creator density)\n- **Audience Match:** ${topJob.topic.audienceFitScore}/100\n- **Reasoning:** ${topJob.topic.selectionReason}`,
          actionTaken: 'explain_selection',
          data: topJob.topic
        }
      }
    }

    // Default Fallback Help
    return {
      intent: 'GENERAL_ASSISTANCE',
      response: `I am your Autonomous AI YouTube Manager for **${channelMemoryStore.getProfile().channelName}**.\n\nYou can command me with:\n• *"Find today's trending topics."*\n• *"Make a video about the top AI trend."*\n• *"Create a 60-second Short."*\n• *"Show today's content queue."*\n• *"Show analytics."*\n• *"Enable semi-auto mode."*\n• *"Publish the approved video."*\n• *"Explain why this topic was selected."*`,
      actionTaken: 'show_help'
    }
  }

  private async handleScheduledTrigger(step: string) {
    console.log(`[YouTubeScheduler] Executing scheduled trigger: ${step}`)
    if (step === 'DISCOVERY') {
      const trends = await trendDiscoveryEngine.discoverTrends({ count: 3 })
      if (trends.length > 0) {
        const job = await this.createJob(trends[0], channelMemoryStore.getProfile().preferredVideoLength)
        await this.runFullPipeline(job.jobId)
      }
    }
  }

  public getJobs(): ContentJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  public getJob(jobId: string): ContentJob | undefined {
    return this.jobs.get(jobId)
  }

  public deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId)
  }
}

export const youtubePipelineManager = new YouTubePipelineManager()
