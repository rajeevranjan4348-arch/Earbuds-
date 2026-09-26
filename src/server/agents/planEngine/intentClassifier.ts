/**
 * Intent & Goal Classifier with Smart Listening Normalization
 * Translates noisy voice or text inputs into structured intent targets and entity models.
 */

import { GoogleGenAI } from '@google/genai'
import type { IntentAnalysisResult, GoalCategory } from './types'
import { toolRegistry } from '../../tools/toolRegistry'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (geminiClient) return geminiClient
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!key) return null
  try {
    geminiClient = new GoogleGenAI({ apiKey: key })
    return geminiClient
  } catch (_e) {
    return null
  }
}

export class IntentClassifier {
  /**
   * Cleans raw spoken voice transcript or text, eliminating acoustic stutter artifacts
   * and conversational filler phrases.
   */
  public cleanAndNormalize(rawText: string): string {
    if (!rawText) return ''
    let text = rawText.trim()

    // 1. Remove speech filler words at start of phrase
    text = text.replace(/^(hey iris|iris|ok iris|um|uh|please|can you please|could you please|would you)\s+/i, '')

    // 2. Normalize repeated speech stutter tokens (e.g. "find find trending" -> "find trending")
    const words = text.split(/\s+/)
    const deduped: string[] = []
    for (let i = 0; i < words.length; i++) {
      if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
        deduped.push(words[i])
      }
    }
    text = deduped.join(' ')

    // 3. Remove trailing conversational filler
    text = text.replace(/\s+(for me|right now|please)$/i, '')

    return text.trim()
  }

  /**
   * Resolves contextual pronouns ("it", "that file", "those trends", "the location")
   * using previous task context memory.
   */
  public resolveContextReferences(
    cleanedText: string,
    contextMemory?: Record<string, any>
  ): { resolvedText: string; references: string[] } {
    let resolved = cleanedText
    const references: string[] = []

    if (!contextMemory) {
      return { resolvedText: resolved, references }
    }

    const lastTopic = contextMemory.lastTopic || contextMemory.topicTitle
    const lastFile = contextMemory.lastFile || contextMemory.filename
    const lastLocation = contextMemory.lastLocation

    // If query has pronouns like "about it", "analyze it", "make a video on it"
    if (/\b(it|that|this topic)\b/i.test(resolved) && lastTopic) {
      resolved = resolved.replace(/\b(it|that|this topic)\b/gi, `"${lastTopic}"`)
      references.push(`Resolved topic: "${lastTopic}"`)
    }

    // If query references "that document", "that file", "the pdf"
    if (/\b(that file|that document|the pdf|the doc)\b/i.test(resolved) && lastFile) {
      resolved = resolved.replace(/\b(that file|that document|the pdf|the doc)\b/gi, `file "${lastFile}"`)
      references.push(`Resolved file: "${lastFile}"`)
    }

    // If query references "there", "that place", "the location"
    if (/\b(there|that place|that city)\b/i.test(resolved) && lastLocation?.city) {
      resolved = resolved.replace(/\b(there|that place|that city)\b/gi, `location "${lastLocation.city}"`)
      references.push(`Resolved location: "${lastLocation.city}"`)
    }

    return { resolvedText: resolved, references }
  }

  /**
   * Fast rule-based heuristic classification and entity extraction
   */
  private classifyRuleBased(
    text: string,
    contextReferences: string[] = []
  ): IntentAnalysisResult {
    const lower = text.toLowerCase()
    const tools = toolRegistry.getToolDefinitions()
    const availableToolNames = tools.map((t) => t.name)

    // Check for multi-step signals (conjunctions connecting distinct tool actions)
    const hasMultipleActions =
      (lower.includes(' and then ') ||
        lower.includes(' and also ') ||
        lower.includes(' after that ') ||
        lower.includes(' then ') ||
        (lower.includes(' and ') && (lower.includes('create') || lower.includes('generate') || lower.includes('search') || lower.includes('produce')))) &&
      lower.length > 20

    // Multi-step: YouTube production from trends
    if (
      (lower.includes('trend') && (lower.includes('video') || lower.includes('script') || lower.includes('produce') || lower.includes('short'))) ||
      (lower.includes('find trends') && lower.includes('make'))
    ) {
      return {
        cleanedInput: text,
        category: 'multi_step',
        primaryGoal: 'Discover trending topics and execute full YouTube video production pipeline',
        entities: {
          niche: lower.includes('ai') ? 'AI & Autonomous Agents' : 'Tech',
          format: lower.includes('short') ? 'SHORTS' : 'STANDARD'
        },
        suggestedTools: ['youtube_discover_trends', 'youtube_create_video_job'],
        confidence: 0.95,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Multi-step: PDF / Document Research + Diagram or Summary
    if (
      (lower.includes('pdf') || lower.includes('document')) &&
      (lower.includes('diagram') || lower.includes('architecture') || lower.includes('flowchart'))
    ) {
      return {
        cleanedInput: text,
        category: 'multi_step',
        primaryGoal: 'Retrieve document knowledge and generate architectural diagram',
        entities: { query: text },
        suggestedTools: ['document_knowledge_qa', 'generate_diagram'],
        confidence: 0.92,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Multi-step: Web Search + Scientific/Deep Analysis + FLUX Art
    if (
      lower.includes('search') &&
      (lower.includes('image') || lower.includes('diagram') || lower.includes('artwork'))
    ) {
      return {
        cleanedInput: text,
        category: 'multi_step',
        primaryGoal: 'Search current information and generate corresponding visual asset',
        entities: { query: text },
        suggestedTools: ['web_search', 'generate_flux_image'],
        confidence: 0.9,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: YouTube Trends
    if (lower.includes('youtube trend') || (lower.includes('trending') && lower.includes('youtube'))) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Discover live YouTube trending opportunities',
        entities: {},
        suggestedTools: ['youtube_discover_trends'],
        confidence: 0.95,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: YouTube Video Creation
    if (
      lower.includes('create video') ||
      lower.includes('produce video') ||
      lower.includes('generate video') ||
      lower.includes('create a short') ||
      lower.includes('generate a short')
    ) {
      const topic = text.replace(/^(create|produce|generate|make)\s+(a\s+)?(video|short)\s+(on|about|for)?\s*/i, '').trim()
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: `Produce YouTube video job for "${topic || 'Autonomous AI'}"`,
        entities: {
          topicTitle: topic || 'Autonomous AI Agents',
          format: lower.includes('short') ? 'SHORTS' : 'STANDARD'
        },
        suggestedTools: ['youtube_create_video_job'],
        confidence: 0.92,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: PDF Document Knowledge Search / QA
    if (
      lower.includes('pdf') ||
      lower.includes('uploaded document') ||
      lower.includes('my document') ||
      lower.includes('document knowledge')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Query PDF document knowledge base',
        entities: { query: text },
        suggestedTools: ['document_knowledge_qa'],
        confidence: 0.9,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Workspace Drive / Docs / Sheets
    if (
      lower.includes('google drive') ||
      lower.includes('my drive') ||
      lower.includes('find my file') ||
      lower.includes('search drive') ||
      lower.includes('in workspace')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Query Google Workspace data agent',
        entities: { prompt: text },
        suggestedTools: ['workspace_analyze_file'],
        confidence: 0.9,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Live Location
    if (
      lower.includes('where am i') ||
      lower.includes('my location') ||
      lower.includes('current location') ||
      lower.includes('gps coordinates')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Retrieve real-time physical GPS location telemetry',
        entities: {},
        suggestedTools: ['get_live_location'],
        confidence: 0.98,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Image Generation
    if (
      lower.startsWith('generate image') ||
      lower.startsWith('create image') ||
      lower.startsWith('draw') ||
      lower.includes('flux image')
    ) {
      const prompt = text.replace(/^(generate image|create image|draw|paint|flux image)\s*(of|for|about)?\s*/i, '').trim()
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Generate FLUX artwork',
        entities: { prompt: prompt || text, aspectRatio: '1:1' },
        suggestedTools: ['generate_flux_image'],
        confidence: 0.95,
        isAmbiguous: !prompt,
        clarificationQuestion: !prompt ? 'What would you like me to draw or generate an image of?' : undefined,
        contextReferences
      }
    }

    // Single step: Diagram Generation
    if (
      lower.includes('diagram') ||
      lower.includes('flowchart') ||
      lower.includes('sequence diagram') ||
      lower.includes('architecture diagram')
    ) {
      const title = text.replace(/^(create|generate|draw|make)\s*(a|an)?\s*(architecture|sequence|system)?\s*diagram\s*(of|for|about)?\s*/i, '').trim()
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Generate Mermaid architecture diagram',
        entities: {
          title: title || 'System Architecture',
          type: lower.includes('sequence') ? 'sequence' : lower.includes('flow') ? 'flowchart' : 'architecture'
        },
        suggestedTools: ['generate_diagram'],
        confidence: 0.93,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Scientific Research
    if (lower.includes('scientific research') || lower.includes('research paper') || lower.includes('empirical hypothesis')) {
      const topic = text.replace(/^(scientific research|research on|conduct research on)\s*/i, '').trim()
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Conduct formal scientific literature research',
        entities: { topic: topic || text },
        suggestedTools: ['scientific_research'],
        confidence: 0.92,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Web Search
    if (lower.startsWith('search web') || lower.startsWith('google ') || lower.startsWith('search for ') || lower.includes('latest news')) {
      const query = text.replace(/^(search web|search for|google|search)\s*(for|about)?\s*/i, '').trim()
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Execute web search',
        entities: { query: query || text },
        suggestedTools: ['web_search'],
        confidence: 0.9,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Repository & Codebase Analysis (gstack)
    if (
      lower.includes('analyze repo') ||
      lower.includes('analyze this repo') ||
      lower.includes('analyze repository') ||
      lower.includes('inspect project structure') ||
      lower.includes('scan codebase')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Analyze project structure and repository dependencies with gstack code intelligence',
        entities: { target: 'current_workspace' },
        suggestedTools: ['gstack_analyze_repo'],
        confidence: 0.98,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Autoplan & Multi-perspective Review (gstack)
    if (
      lower.includes('autoplan') ||
      lower.includes('run all reviews') ||
      lower.includes('automatic review pipeline') ||
      lower.includes('review this plan automatically')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Run gstack Autoplan gauntlet across CEO, Eng, Design, and DevEx reviews',
        entities: { plan: text },
        suggestedTools: ['gstack_autoplan'],
        confidence: 0.97,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Specialist Plan Review (gstack CEO, Eng, Design, DevEx)
    if (
      lower.includes('ceo review') ||
      lower.includes('eng review') ||
      lower.includes('architecture review') ||
      lower.includes('design review') ||
      lower.includes('devex review')
    ) {
      const subRole = lower.includes('ceo') ? 'ceo' : lower.includes('design') ? 'design' : lower.includes('devex') ? 'devex' : 'eng'
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: `Execute gstack ${subRole.toUpperCase()} specialist review`,
        entities: { subRole, plan: text },
        suggestedTools: ['gstack_specialist_review'],
        confidence: 0.96,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Investigation & Build Debugging (gstack)
    if (
      lower.includes('investigate') ||
      lower.includes('build problem') ||
      lower.includes('why the build is failing') ||
      lower.includes('diagnose error') ||
      lower.includes('debug this failure')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Diagnose failure layer and formulate verified repair hypothesis using gstack investigate',
        entities: { query: text },
        suggestedTools: ['gstack_investigate_debug'],
        confidence: 0.97,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Verification Gate (gstack)
    if (
      lower.includes('run the tests') ||
      lower.includes('run verification') ||
      lower.includes('verify gate') ||
      lower.includes('run build checks')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Execute gstack verification gate across declared test, lint, and typecheck scripts',
        entities: {},
        suggestedTools: ['gstack_verify_gate'],
        confidence: 0.98,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: CSO Security Audit & Redaction (gstack)
    if (
      lower.includes('cso') ||
      lower.includes('scan for secrets') ||
      lower.includes('credential leak') ||
      lower.includes('security audit')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Audit source code and diffs for leaked secrets and high-tier credentials using gstack CSO',
        entities: { text },
        suggestedTools: ['gstack_cso_security_audit'],
        confidence: 0.96,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Ship & Release Readiness (gstack)
    if (
      lower.includes('ready to ship') ||
      lower.includes('prepare commit') ||
      lower.includes('ship checklist')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Evaluate git cleanliness, verification gates, and secret leaks for release readiness',
        entities: {},
        suggestedTools: ['gstack_ship_check'],
        confidence: 0.96,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Single step: Decision Ledger (gstack)
    if (
      lower.includes('record decision') ||
      lower.includes('active decisions') ||
      lower.includes('what did we decide')
    ) {
      return {
        cleanedInput: text,
        category: 'single_step',
        primaryGoal: 'Access or record institutional architecture decisions using gstack decision ledger',
        entities: { text },
        suggestedTools: ['gstack_decision_log'],
        confidence: 0.95,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Generic multi-step detection based on conjunctions
    if (hasMultipleActions) {
      return {
        cleanedInput: text,
        category: 'multi_step',
        primaryGoal: text,
        entities: { rawInstruction: text },
        suggestedTools: availableToolNames.filter((t) => lower.includes(t.split('_')[0])),
        confidence: 0.8,
        isAmbiguous: false,
        contextReferences
      }
    }

    // Conversational or general question
    return {
      cleanedInput: text,
      category: lower.endsWith('?') || lower.startsWith('what') || lower.startsWith('who') || lower.startsWith('how') || lower.startsWith('why') ? 'information_query' : 'conversational',
      primaryGoal: text,
      entities: {},
      suggestedTools: [],
      confidence: 0.85,
      isAmbiguous: false,
      contextReferences
    }
  }

  /**
   * Main analysis method: Cleans text, resolves references, and classifies intent
   */
  public async analyzeIntent(
    rawInput: string,
    contextMemory?: Record<string, any>
  ): Promise<IntentAnalysisResult> {
    const cleaned = this.cleanAndNormalize(rawInput)
    if (!cleaned) {
      return {
        cleanedInput: '',
        category: 'clarification_needed',
        primaryGoal: 'Empty input',
        entities: {},
        suggestedTools: [],
        confidence: 1.0,
        isAmbiguous: true,
        clarificationQuestion: "I didn't catch that. How can I assist you?"
      }
    }

    const { resolvedText, references } = this.resolveContextReferences(cleaned, contextMemory)
    const ruleResult = this.classifyRuleBased(resolvedText, references)

    // For complex or ambiguous cases, augment with Gemini if available
    const gemini = getGemini()
    if (gemini && (ruleResult.category === 'multi_step' || ruleResult.confidence < 0.85)) {
      try {
        const toolsList = toolRegistry.getToolDefinitions().map((t) => `${t.name}: ${t.description}`).join('\n')
        const candidateModels = [
          'gemini-3.8-flash',
          'gemini-flash-latest',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite'
        ]

        let responseText = ''
        for (const modelCandidate of candidateModels) {
          try {
            const response = await gemini.models.generateContent({
              model: modelCandidate,
              contents: [
                {
                  text: `You are the Intent Classification Engine for the IRIS Autonomous Agent.
Analyze the user's request and determine the exact execution category and recommended tools.

Available Tools:
${toolsList}

User Input: "${resolvedText}"

Return JSON matching this schema:
{
  "category": "single_step" | "multi_step" | "information_query" | "clarification_needed" | "conversational",
  "primaryGoal": "concise description of what needs to be achieved",
  "suggestedTools": ["tool_name_1", "tool_name_2"],
  "isAmbiguous": boolean,
  "clarificationQuestion": "string or null if not ambiguous",
  "entities": { ...extracted parameters }
}`
                }
              ],
              config: {
                responseMimeType: 'application/json'
              }
            })
            if (response.text) {
              responseText = response.text
              break
            }
          } catch (_mErr) {
            // Try next model candidate
          }
        }

        if (responseText) {
          const parsed = JSON.parse(responseText)
          return {
            cleanedInput: resolvedText,
            category: parsed.category || ruleResult.category,
            primaryGoal: parsed.primaryGoal || ruleResult.primaryGoal,
            entities: { ...ruleResult.entities, ...(parsed.entities || {}) },
            suggestedTools: Array.isArray(parsed.suggestedTools) && parsed.suggestedTools.length > 0 ? parsed.suggestedTools : ruleResult.suggestedTools,
            confidence: 0.95,
            isAmbiguous: Boolean(parsed.isAmbiguous),
            clarificationQuestion: parsed.clarificationQuestion || undefined,
            contextReferences: references
          }
        }
      } catch (_e) {
        // Fall back gracefully to ruleResult
      }
    }

    return ruleResult
  }
}

export const intentClassifier = new IntentClassifier()
