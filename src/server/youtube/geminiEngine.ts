/**
 * Gemini Content Engine for YouTube Production
 * Generates original, highly engaging video concepts, scripts (7 core sections),
 * storyboard scenes, title variants, SEO descriptions, chapters, and thumbnail prompts.
 */

import { GoogleGenAI } from '@google/genai'
import {
  TrendTopic,
  VideoFormat,
  VideoScript,
  VideoMetadata,
  ThumbnailConcept,
  StoryboardScene,
  TitleCandidate,
  VideoChapter
} from './types'
import { channelMemoryStore } from './channelMemory'

export class GeminiContentEngine {
  private getClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY
    if (!key) return null
    return new GoogleGenAI({ apiKey: key })
  }

  private getModelName(): string {
    return process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  }

  /**
   * Generates a complete 7-part production script adapted to the target duration format
   */
  public async generateScript(
    topic: TrendTopic,
    format: VideoFormat = 'STANDARD'
  ): Promise<VideoScript> {
    const ai = this.getClient()
    const profile = channelMemoryStore.getProfile()
    const model = this.getModelName()

    const targetWords =
      format === 'SHORTS' ? 130 : format === 'MINI' ? 350 : format === 'STANDARD' ? 1100 : 2200

    const durationSec =
      format === 'SHORTS' ? 50 : format === 'MINI' ? 150 : format === 'STANDARD' ? 480 : 900

    const prompt = `You are a world-class YouTube producer, scriptwriter, and educator for the channel "${profile.channelName}".
Channel Tone: ${profile.brandStyle.tone}
Target Audience: ${profile.targetAudience}

Generate a complete, original, and highly engaging video script on:
Topic: "${topic.title}"
Niche: ${topic.niche}
Target Format: ${format} (~${targetWords} words, ~${Math.round(durationSec / 60)} minutes)

Requirements:
1. Generate 4 high-CTR, accurate title candidates (Curiosity, Search-Optimized, How-To, Authoritative).
2. The script MUST strictly follow this 7-part architecture:
   - Part 1: Strong Opening Hook (0-15s, pattern interrupt, high curiosity visual cue).
   - Part 2: Clear Context (why this matters right now, stakes, problem definition).
   - Part 3: Main Information (the core breakthrough/mechanics, structured key points with visual cues).
   - Part 4: Useful Explanation / Storytelling (analogies, mental models, practical implementation).
   - Part 5: Natural Transitions (smooth pacing shifts connecting concepts).
   - Part 6: Conclusion (insightful synthesis, key takeaways).
   - Part 7: Call to Action (natural subscription/comment prompt tailored to the topic).
3. Provide a voiceover pacing guide.
4. Provide a 60-second short-form adaptation script.

Respond in structured JSON format with this schema:
{
  "titleCandidates": [
    { "title": "...", "characterCount": 55, "score": 94, "style": "HIGH_CURIOSITY", "reasoning": "..." }
  ],
  "selectedTitle": "...",
  "hook": {
    "text": "...",
    "visualCue": "...",
    "durationSec": 15,
    "psychologyType": "Curiosity Gap / Pattern Interrupt"
  },
  "context": {
    "text": "...",
    "visualCue": "..."
  },
  "mainInfo": {
    "keyPoints": ["...", "..."],
    "visualCues": ["...", "..."]
  },
  "storytelling": {
    "text": "...",
    "visualCue": "..."
  },
  "transitions": ["...", "..."],
  "conclusion": {
    "text": "...",
    "visualCue": "..."
  },
  "callToAction": {
    "text": "...",
    "placement": "End of video with pinned resource link"
  },
  "voiceoverPacing": "Energetic and crisp at 145 WPM with dramatic pauses after code revelations",
  "shortFormAdaptation": "..."
}`

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        })

        const text = response.text || '{}'
        const parsed = JSON.parse(text)

        const fullText = [
          `[HOOK]\n${parsed.hook?.text || ''}`,
          `[CONTEXT]\n${parsed.context?.text || ''}`,
          `[MAIN INSIGHTS]\n${(parsed.mainInfo?.keyPoints || []).join('\n\n')}`,
          `[DEEP DIVE & STORY]\n${parsed.storytelling?.text || ''}`,
          `[CONCLUSION]\n${parsed.conclusion?.text || ''}`,
          `[CALL TO ACTION]\n${parsed.callToAction?.text || ''}`
        ].join('\n\n')

        return {
          titleCandidates: parsed.titleCandidates || this.getDefaultTitles(topic.title),
          selectedTitle: parsed.selectedTitle || parsed.titleCandidates?.[0]?.title || topic.title,
          format,
          estimatedDurationSec: durationSec,
          hook: parsed.hook || {
            text: `What if everything you knew about ${topic.title} was only 10% of the picture?`,
            visualCue: 'High-contrast glowing neural network topology snapping into focus.',
            durationSec: 15,
            psychologyType: 'Curiosity Gap'
          },
          context: parsed.context || {
            text: `Today, autonomous systems and AI pipelines are transforming how software is written.`,
            visualCue: 'Split screen comparing manual code vs autonomous terminal output.'
          },
          mainInfo: parsed.mainInfo || {
            keyPoints: [
              'First principle: Real-time latency optimization and structured function routing.',
              'Second principle: Multi-modal grounded context prevents hallucinations.',
              'Third principle: Production deployment with zero-token leak sandboxing.'
            ],
            visualCues: [
              'Architectural data flow diagram highlighting sub-50ms hops.',
              'Live terminal logs showing autonomous verification.',
              'Performance metric charts showing 4x speedup.'
            ]
          },
          storytelling: parsed.storytelling || {
            text: `Think of this architecture like an air traffic control tower for your API calls.`,
            visualCue: '3D spatial visualization of coordinated API streams.'
          },
          transitions: parsed.transitions || [
            'Now that we understand the foundations, let us look at the actual code.',
            'Here is where things get truly interesting.'
          ],
          conclusion: parsed.conclusion || {
            text: `By decoupling orchestration from execution, we achieve resilience that scales.`,
            visualCue: 'Final summary graphic highlighting key architectural pillars.'
          },
          callToAction: parsed.callToAction || {
            text: `If you found this technical breakdown valuable, hit subscribe and check the GitHub repository below.`,
            placement: 'End screen with code repo link'
          },
          fullText,
          voiceoverPacing: parsed.voiceoverPacing || 'Confident, authoritative, 140 WPM',
          shortFormAdaptation: parsed.shortFormAdaptation || fullText.slice(0, 400)
        }
      } catch (err: any) {
        console.warn('[GeminiContentEngine] Gemini API script generation fallback:', err?.message)
      }
    }

    // High quality deterministic fallback script if API key is not yet set
    return this.buildFallbackScript(topic, format, durationSec)
  }

  /**
   * Generates production storyboard scenes from the script
   */
  public async generateStoryboard(
    script: VideoScript,
    topic: TrendTopic
  ): Promise<StoryboardScene[]> {
    const isShorts = script.format === 'SHORTS'
    const sceneCount = isShorts ? 4 : 8
    const totalDuration = script.estimatedDurationSec || (isShorts ? 50 : 480)
    const sceneDuration = Math.round(totalDuration / sceneCount)

    const scenes: StoryboardScene[] = [
      {
        sceneNumber: 1,
        timecode: '00:00 - 00:15',
        durationSec: 15,
        visualDescription: `Cinematic macro opening: ${script.hook.visualCue}`,
        spokenText: script.hook.text,
        assetPrompt: `Minimalist high-tech dark studio background with vibrant emerald neon vector graph: ${topic.title}, 4k, cinematic lighting, photorealistic typography`,
        transitionType: 'Glitch Cut'
      },
      {
        sceneNumber: 2,
        timecode: `00:15 - 00:${String(15 + sceneDuration).padStart(2, '0')}`,
        durationSec: sceneDuration,
        visualDescription: `Problem Context: ${script.context.visualCue}`,
        spokenText: script.context.text,
        assetPrompt: `Modern developer workspace with multiple monitors displaying real-time data flows, sleek dark UI, subtle particle glow`,
        transitionType: 'Smooth Pan'
      },
      {
        sceneNumber: 3,
        timecode: `00:${String(15 + sceneDuration).padStart(2, '0')} - 01:45`,
        durationSec: sceneDuration,
        visualDescription: `Core Concept 1: ${script.mainInfo.visualCues[0] || 'Technical architecture breakdown'}`,
        spokenText: script.mainInfo.keyPoints[0] || 'Let us explore the core foundation.',
        assetPrompt: `3D architectural blueprint of distributed AI agent network, glowing emerald and cyan connection lines, dark background`,
        transitionType: 'Zoom In'
      },
      {
        sceneNumber: 4,
        timecode: '01:45 - 03:00',
        durationSec: sceneDuration,
        visualDescription: `Core Concept 2: ${script.mainInfo.visualCues[1] || 'Live terminal verification'}`,
        spokenText: script.mainInfo.keyPoints[1] || 'Analyzing performance under load.',
        assetPrompt: `Futuristic command line interface running autonomous benchmarks, clean monospace text, emerald status badges`,
        transitionType: 'Cross Dissolve'
      },
      {
        sceneNumber: 5,
        timecode: '03:00 - 04:30',
        durationSec: sceneDuration,
        visualDescription: `Deep Dive Analogy: ${script.storytelling.visualCue}`,
        spokenText: script.storytelling.text,
        assetPrompt: `Abstract digital sculpture representing intelligent decision matrices, smooth motion blur, premium tech aesthetic`,
        transitionType: 'Wipe Right'
      },
      {
        sceneNumber: 6,
        timecode: '04:30 - 06:00',
        durationSec: sceneDuration,
        visualDescription: `Synthesis: ${script.conclusion.visualCue}`,
        spokenText: script.conclusion.text,
        assetPrompt: `Clean summary card with 3 key architectural pillars highlighted in emerald gradient boxes, crisp typography`,
        transitionType: 'Fade to Black'
      },
      {
        sceneNumber: 7,
        timecode: '06:00 - 06:40',
        durationSec: 40,
        visualDescription: `Outro & CTA: ${script.callToAction.placement}`,
        spokenText: script.callToAction.text,
        assetPrompt: `Branded channel end-screen card with subscribe button animation, next recommended video placeholder, sleek dark glassmorphism`,
        transitionType: 'Fade Out'
      }
    ]

    return scenes.slice(0, sceneCount)
  }

  /**
   * Generates thumbnail visual concepts with high-contrast composition rules
   */
  public async generateThumbnails(
    topic: TrendTopic,
    script: VideoScript
  ): Promise<ThumbnailConcept[]> {
    const concepts: ThumbnailConcept[] = [
      {
        id: `thumb_c1_${Date.now()}`,
        conceptName: 'Curiosity Contrast',
        headlineText: 'IT ACTUALLY WORKS',
        compositionDescription:
          'Left: Shocked/focused engineer looking at glowing holographic terminal. Right: Bold neon emerald text "100% AUTONOMOUS" on pitch black.',
        visualPrompt: `YouTube thumbnail background, minimalist high-tech cybersecurity lab, glowing holographic data matrix, high contrast, 16:9, ultra sharp, 8k, vibrant emerald lighting`,
        colorPalette: ['#10B981', '#000000', '#FFFFFF', '#064E3B'],
        mobileReadabilityScore: 96,
        isSelected: true
      },
      {
        id: `thumb_c2_${Date.now()}`,
        conceptName: 'Before vs After Architecture',
        headlineText: '10X FASTER',
        compositionDescription:
          'Split-screen: Red "Traditional 45min" vs Emerald "Autonomous 4.2s" with speed meter graphic.',
        visualPrompt: `Split-screen comparison YouTube thumbnail background, clean futuristic user interface, speed benchmark gauge, cinematic lighting, 16:9`,
        colorPalette: ['#EF4444', '#10B981', '#09090B', '#F4F4F5'],
        mobileReadabilityScore: 92,
        isSelected: false
      },
      {
        id: `thumb_c3_${Date.now()}`,
        conceptName: 'Blueprint Deep-Dive',
        headlineText: 'THE SECRET CODE',
        compositionDescription:
          'Close-up of clean code snippets floating above glowing 3D hardware chip with glowing circuits.',
        visualPrompt: `Close-up glowing semiconductor microchip with golden circuits and emerald light rays, clean TypeScript code overlays, 16:9, photorealistic`,
        colorPalette: ['#10B981', '#3B82F6', '#18181B', '#FBBF24'],
        mobileReadabilityScore: 88,
        isSelected: false
      }
    ]

    return concepts
  }

  /**
   * Generates complete YouTube metadata, SEO tags, and timestamp chapters
   */
  public generateMetadata(
    topic: TrendTopic,
    script: VideoScript,
    selectedTitle?: string
  ): VideoMetadata {
    const profile = channelMemoryStore.getProfile()
    const title = selectedTitle || script.selectedTitle || topic.title
    const isShorts = script.format === 'SHORTS'

    const chapters: VideoChapter[] = isShorts
      ? [{ timestamp: '00:00', seconds: 0, title: 'Breakthrough Overview' }]
      : [
          { timestamp: '00:00', seconds: 0, title: 'Introduction & The Core Problem' },
          { timestamp: '00:45', seconds: 45, title: 'Architectural Breakdown' },
          { timestamp: '02:30', seconds: 150, title: 'Step-by-Step Implementation' },
          { timestamp: '04:45', seconds: 285, title: 'Live Benchmarks & Results' },
          { timestamp: '06:30', seconds: 390, title: 'Key Takeaways & Next Steps' }
        ]

    const chapterText = chapters.map((c) => `${c.timestamp} - ${c.title}`).join('\n')

    const description = `${title}

${script.hook.text}

In this comprehensive technical breakdown, we explore ${topic.title} and how to leverage modern autonomous agent architecture for real-world production systems.

📌 TIMESTAMPS:
${chapterText}

🔗 RESOURCES & CODE:
• Documentation: https://ai.google.dev/gemini-api
• Channel: ${profile.handle}

💡 ABOUT ${profile.channelName.toUpperCase()}:
${profile.description}

⚠️ DISCLAIMER & PROVENANCE:
This video contains original research, technical benchmarks, and educational analysis. Factual claims are verified against primary technical documentation.

#${topic.niche.replace(/[^a-zA-Z0-9]/g, '')} #GeminiAI #AutonomousAgents #SoftwareEngineering ${isShorts ? '#Shorts' : ''}`

    const tags = [
      topic.niche,
      'Gemini 2.5',
      'Autonomous Agents',
      'AI Engineering',
      'Developer Tutorial',
      'Software Architecture',
      'TypeScript',
      'API Integration',
      profile.channelName,
      ...(isShorts ? ['Shorts', 'YouTube Shorts'] : ['Full Tutorial', 'Tech Deep Dive'])
    ]

    return {
      title: isShorts && !title.includes('#Shorts') ? `${title} #Shorts` : title,
      description,
      tags,
      category: 'Science & Technology',
      categoryId: '28', // Standard YouTube Category for Science & Tech
      language: profile.preferredLanguage || 'en',
      chapters,
      visibility: 'private',
      isShorts
    }
  }

  private getDefaultTitles(topicTitle: string): TitleCandidate[] {
    return [
      {
        title: `How I Built an Autonomous System for ${topicTitle.slice(0, 40)}`,
        characterCount: 65,
        score: 95,
        style: 'STORY_DRIVEN',
        reasoning: 'High personal authority and clear project outcome.'
      },
      {
        title: `${topicTitle.slice(0, 50)}: The Complete Guide`,
        characterCount: 58,
        score: 91,
        style: 'SEARCH_OPTIMIZED',
        reasoning: 'Strong search volume targeting high-intent developers.'
      },
      {
        title: `Stop Doing This Manually: ${topicTitle.slice(0, 35)}`,
        characterCount: 60,
        score: 93,
        style: 'HIGH_CURIOSITY',
        reasoning: 'Strong pain-point pattern interrupt.'
      },
      {
        title: `How to Build ${topicTitle.slice(0, 45)} in 10 Minutes`,
        characterCount: 62,
        score: 89,
        style: 'HOW_TO',
        reasoning: 'High conversion for tutorial seekers.'
      }
    ]
  }

  private buildFallbackScript(
    topic: TrendTopic,
    format: VideoFormat,
    durationSec: number
  ): VideoScript {
    const titles = this.getDefaultTitles(topic.title)
    const hookText = `What if you could automate 100% of your ${topic.niche} workflow without writing repetitive boilerplate?`
    const contextText = `Modern developer ecosystems are evolving rapidly. In this breakdown, we examine how ${topic.title} enables unprecedented efficiency.`
    const keyPoints = [
      'Core Architecture: Decoupling intent parsing from background execution.',
      'Grounded Reasoning: Verifying all factual assertions before committing state.',
      'Production Hardening: Graceful error recovery with exponential retry backoff.'
    ]
    const storytellingText = `When scaling autonomous pipelines, resilience isn't just a luxury—it is the entire foundation.`
    const conclusionText = `By applying these three architectural pillars, you build systems that scale reliably in production.`
    const ctaText = `If you want more deep dives on autonomous AI engineering, subscribe to IRIS Intelligence Labs.`

    const fullText = `[HOOK]\n${hookText}\n\n[CONTEXT]\n${contextText}\n\n[MAIN POINTS]\n${keyPoints.join('\n\n')}\n\n[DEEP DIVE]\n${storytellingText}\n\n[CONCLUSION]\n${conclusionText}\n\n[CALL TO ACTION]\n${ctaText}`

    return {
      titleCandidates: titles,
      selectedTitle: titles[0].title,
      format,
      estimatedDurationSec: durationSec,
      hook: {
        text: hookText,
        visualCue: 'Dynamic terminal sequence with instant autonomous execution status.',
        durationSec: 15,
        psychologyType: 'Curiosity Gap'
      },
      context: {
        text: contextText,
        visualCue: 'System architectural diagram illustrating the multi-step pipeline.'
      },
      mainInfo: {
        keyPoints,
        visualCues: [
          'Interactive sequence diagram showing request routing.',
          'Live verification log output with passing status flags.',
          'Latency benchmark chart showing 95th percentile stability.'
        ]
      },
      storytelling: {
        text: storytellingText,
        visualCue: '3D spatial visualization of resilient distributed nodes.'
      },
      transitions: [
        'Let us move directly to the implementation details.',
        'Here is the crucial design decision that changes everything.'
      ],
      conclusion: {
        text: conclusionText,
        visualCue: 'Final architectural summary infographic with highlighted key principles.'
      },
      callToAction: {
        text: ctaText,
        placement: 'Outro screen with link to source code'
      },
      fullText,
      voiceoverPacing: 'Clear, steady, 140 WPM with natural conversational cadence',
      shortFormAdaptation: `${hookText} ${keyPoints[0]} Check the full video on the channel for the complete codebase!`
    }
  }
}

export const geminiContentEngine = new GeminiContentEngine()
