/**
 * Advanced AI Brain - Specialized Agents
 * Concrete implementations of the 7 core specialized agents:
 * - Research Agent
 * - Coding Agent
 * - Browser Agent
 * - File Agent
 * - Vision Agent
 * - Android Agent
 * - Voice Agent
 */

import { GoogleGenAI } from '@google/genai'
import type { SpecializedAgentRole, BrainTask } from '../types'
import { toolRegistry } from '../../tools/toolRegistry'
import { searchOrchestrator } from '../../search'
import { codebaseService } from '../../codebase/service'
import { ragEngine } from '../../rag/ragEngine'
import { browserUseAgent } from '../../browser/browserAgent'
import { scientificResearch } from '../../research/scientificResearch'
import { diagramDesign } from '../../research/diagramGenerator'
import { fluxImageEngine } from '../../image/fluxEngine'
import { androidPackageResolver } from '../../android/packageResolver'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

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

export interface AgentExecutionResult {
  success: boolean
  output: any
  toolUsed?: string
  error?: string
  durationMs: number
}

export interface IAgentExecutor {
  role: SpecializedAgentRole
  description: string
  defaultTools: string[]
  execute: (task: BrainTask, context?: Record<string, any>) => Promise<AgentExecutionResult>
}

// --------------------------------------------------------------------------
// 1. Research Agent
// --------------------------------------------------------------------------
export class ResearchAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Research Agent'
  public description =
    'Deep web search, academic literature synthesis, and factual citation grounding.'
  public defaultTools = ['search_web', 'scientific_research_query', 'rag_retrieve_context']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const query = task.parameters?.query || task.description
    const preferredTool = task.requiredTools[0] || 'search_web'

    try {
      if (
        preferredTool === 'scientific_research_query' ||
        query.toLowerCase().includes('paper') ||
        query.toLowerCase().includes('study')
      ) {
        const sciResult = await scientificResearch.synthesizeResearch(query, { category: 'all' })
        return {
          success: Boolean(sciResult.synthesis),
          output: sciResult,
          toolUsed: 'scientific_research_query',
          durationMs: Date.now() - start
        }
      }

      if (preferredTool === 'rag_retrieve_context' || task.parameters?.useRag) {
        const ragResult = await ragEngine.retrieveContext(query, { limit: 4 })
        if (ragResult.chunks.length > 0) {
          return {
            success: true,
            output: ragResult,
            toolUsed: 'rag_retrieve_context',
            durationMs: Date.now() - start
          }
        }
      }

      // Default: Multi-engine web search with extraction
      const searchRes = await searchOrchestrator.search(query, {
        limit: 5,
        extractContent: true
      })

      return {
        success: searchRes.results.length > 0,
        output: {
          query,
          resultsCount: searchRes.results.length,
          results: searchRes.results,
          citations: searchRes.citations,
          summary: searchRes.results
            .map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`)
            .join('\n\n')
        },
        toolUsed: 'search_web',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: preferredTool,
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 2. Coding Agent
// --------------------------------------------------------------------------
export class CodingAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Coding Agent'
  public description =
    'Codebase AST analysis, semantic code search, refactoring, and syntax validation.'
  public defaultTools = ['codebase_search', 'codebase_symbol', 'codebase_structure']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const query = task.parameters?.query || task.description
    const preferredTool = task.requiredTools[0] || 'codebase_search'

    try {
      if (preferredTool === 'codebase_structure' || task.parameters?.structure) {
        const structure = codebaseService.getStructure('current_workspace', 'default_user')
        return {
          success: Boolean(structure),
          output: structure,
          toolUsed: 'codebase_structure',
          durationMs: Date.now() - start
        }
      }

      if (preferredTool === 'codebase_symbol' && task.parameters?.symbolName) {
        const symbols = codebaseService.findSymbols(
          task.parameters.symbolName,
          'current_workspace',
          'default_user'
        )
        return {
          success: symbols.length > 0,
          output: symbols,
          toolUsed: 'codebase_symbol',
          durationMs: Date.now() - start
        }
      }

      // Codebase search
      const searchResults = codebaseService.searchCodebase(
        query,
        'current_workspace',
        'default_user',
        { limit: 5 }
      )
      return {
        success: true,
        output: {
          query,
          matchesCount: searchResults.length,
          matches: searchResults
        },
        toolUsed: 'codebase_search',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: preferredTool,
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 3. Browser Agent
// --------------------------------------------------------------------------
export class BrowserAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Browser Agent'
  public description =
    'Autonomous web page navigation, live DOM extraction, and web reader parsing.'
  public defaultTools = ['browser_navigate_and_extract', 'browse_url']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const url = task.parameters?.url || (task.description.match(/https?:\/\/[^\s]+/)?.[0] ?? '')

    if (!url) {
      return {
        success: false,
        output: null,
        error: 'Browser Agent requires a valid HTTP/HTTPS URL.',
        toolUsed: 'browser_navigate_and_extract',
        durationMs: Date.now() - start
      }
    }

    try {
      const pageData = await browserUseAgent.navigateAndExtract(url)

      return {
        success: Boolean(pageData?.content || pageData?.title),
        output: pageData,
        toolUsed: 'browser_navigate_and_extract',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: 'browser_navigate_and_extract',
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 4. File Agent
// --------------------------------------------------------------------------
export class FileAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'File Agent'
  public description =
    'Safe project filesystem operations: reading, writing, listing, and inspection.'
  public defaultTools = ['file_read', 'file_write', 'file_list']

  private safePath(targetPath: string): string {
    const root = process.cwd()
    const resolved = resolve(root, targetPath)
    if (!resolved.startsWith(root)) {
      throw new Error(`Access denied: path outside workspace root (${targetPath})`)
    }
    return resolved
  }

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const action = task.parameters?.action || 'read'
    const filePath = task.parameters?.filePath || task.parameters?.path

    try {
      if (
        action === 'list' ||
        (!filePath && task.description.toLowerCase().includes('list file'))
      ) {
        const dir = this.safePath(task.parameters?.dir || '.')
        const entries = readdirSync(dir)
          .slice(0, 50)
          .map((name) => {
            const full = join(dir, name)
            const isDir = statSync(full).isDirectory()
            return { name, isDirectory: isDir }
          })
        return {
          success: true,
          output: { directory: dir, entries },
          toolUsed: 'file_list',
          durationMs: Date.now() - start
        }
      }

      if (!filePath) {
        return {
          success: false,
          output: null,
          error: 'File Agent requires a target filePath.',
          toolUsed: 'file_read',
          durationMs: Date.now() - start
        }
      }

      const absolute = this.safePath(filePath)

      if (action === 'read') {
        if (!existsSync(absolute)) {
          return {
            success: false,
            output: null,
            error: `File not found: ${filePath}`,
            toolUsed: 'file_read',
            durationMs: Date.now() - start
          }
        }
        const content = readFileSync(absolute, 'utf-8').slice(0, 16000)
        return {
          success: true,
          output: { filePath, size: content.length, content },
          toolUsed: 'file_read',
          durationMs: Date.now() - start
        }
      }

      if (action === 'write') {
        const content = task.parameters?.content ?? ''
        writeFileSync(absolute, content, 'utf-8')
        return {
          success: true,
          output: { filePath, writtenBytes: Buffer.byteLength(content) },
          toolUsed: 'file_write',
          durationMs: Date.now() - start
        }
      }

      return {
        success: false,
        output: null,
        error: `Unsupported File Agent action: ${action}`,
        toolUsed: 'file_read',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: 'file_agent',
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 5. Vision Agent
// --------------------------------------------------------------------------
export class VisionAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Vision Agent'
  public description = 'Visual inspection, OCR, Mermaid.js diagramming, and FLUX creative imagery.'
  public defaultTools = ['vision_analyze_image', 'generate_mermaid_diagram', 'flux_generate_image']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const desc = task.description.toLowerCase()

    try {
      // 1. Mermaid diagram generation
      if (
        desc.includes('diagram') ||
        desc.includes('flowchart') ||
        desc.includes('sequence diagram') ||
        task.parameters?.diagramType
      ) {
        const diagramRes = await diagramDesign.generateDiagram(task.description, {
          diagramType: task.parameters?.diagramType || 'flowchart'
        })
        return {
          success: Boolean(diagramRes.code),
          output: diagramRes,
          toolUsed: 'generate_mermaid_diagram',
          durationMs: Date.now() - start
        }
      }

      // 2. Creative image generation (FLUX)
      if (
        desc.includes('generate image') ||
        desc.includes('flux') ||
        task.parameters?.aspectRatio
      ) {
        const imgRes = await fluxImageEngine.generateImage({
          prompt: task.description,
          aspectRatio: task.parameters?.aspectRatio || '1:1'
        })
        return {
          success: Boolean(imgRes?.imageUrl),
          output: imgRes,
          toolUsed: 'flux_generate_image',
          durationMs: Date.now() - start
        }
      }

      // 3. Vision analysis via Gemini multimodal
      const ai = getGemini()
      if (!ai) {
        return {
          success: false,
          output: null,
          error: 'Gemini multimodal client not configured for Vision Agent.',
          toolUsed: 'vision_analyze_image',
          durationMs: Date.now() - start
        }
      }

      const prompt = task.parameters?.prompt || task.description
      const imageBase64 = task.parameters?.imageBase64
      const mimeType = task.parameters?.mimeType || 'image/jpeg'

      const contents: any[] = []
      if (imageBase64) {
        contents.push({
          inlineData: {
            mimeType,
            data: imageBase64.replace(/^data:image\/\w+;base64,/, '')
          }
        })
      }
      contents.push({ text: prompt })

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents
      })

      return {
        success: Boolean(response.text),
        output: { analysis: response.text },
        toolUsed: 'vision_analyze_image',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: 'vision_agent',
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 6. Android Agent
// --------------------------------------------------------------------------
export class AndroidAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Android Agent'
  public description =
    'Android app discovery, package resolution, and accessibility intent dispatch.'
  public defaultTools = ['android_open_app', 'android_resolve_package']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const appQuery =
      task.parameters?.appName || task.description.replace(/^(open|launch|start)\s+/i, '').trim()

    try {
      const resolution = await androidPackageResolver.resolveApp(appQuery)
      if (resolution && resolution.packageName) {
        return {
          success: true,
          output: {
            resolved: true,
            appName: resolution.displayName || resolution.name,
            packageName: resolution.packageName,
            deepLink: resolution.deepLink,
            action: 'DISPATCH_INTENT',
            status: 'LAUNCHED'
          },
          toolUsed: 'android_open_app',
          durationMs: Date.now() - start
        }
      }

      return {
        success: false,
        output: null,
        error: `Could not resolve Android package for application "${appQuery}".`,
        toolUsed: 'android_resolve_package',
        durationMs: Date.now() - start
      }
    } catch (err: any) {
      return {
        success: false,
        output: null,
        error: err?.message || String(err),
        toolUsed: 'android_agent',
        durationMs: Date.now() - start
      }
    }
  }
}

// --------------------------------------------------------------------------
// 7. Voice Agent
// --------------------------------------------------------------------------
export class VoiceAgent implements IAgentExecutor {
  public role: SpecializedAgentRole = 'Voice Agent'
  public description =
    'Voice dialogue formatting, speech phrasing, conversational tone, and TTS preparation.'
  public defaultTools = ['voice_format_dialogue']

  public async execute(
    task: BrainTask,
    _context?: Record<string, any>
  ): Promise<AgentExecutionResult> {
    const start = Date.now()
    const rawText = task.parameters?.text || task.description

    // Clean formatting for spoken output (removes markdown tables, codeblocks, heavy URLs)
    const spokenText = rawText
      .replace(/```[\s\S]*?```/g, 'Code block omitted for voice audio.')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*_~`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      success: true,
      output: {
        spokenText,
        displayText: rawText,
        characterCount: spokenText.length,
        estimatedDurationSec: Math.ceil(spokenText.split(' ').length / 2.5)
      },
      toolUsed: 'voice_format_dialogue',
      durationMs: Date.now() - start
    }
  }
}

// --------------------------------------------------------------------------
// Agent Registry Factory
// --------------------------------------------------------------------------
export class AgentRegistry {
  private agents = new Map<SpecializedAgentRole, IAgentExecutor>()

  constructor() {
    this.register(new ResearchAgent())
    this.register(new CodingAgent())
    this.register(new BrowserAgent())
    this.register(new FileAgent())
    this.register(new VisionAgent())
    this.register(new AndroidAgent())
    this.register(new VoiceAgent())
  }

  public register(agent: IAgentExecutor) {
    this.agents.set(agent.role, agent)
  }

  public get(role: SpecializedAgentRole): IAgentExecutor | undefined {
    return this.agents.get(role)
  }

  public getAll(): IAgentExecutor[] {
    return Array.from(this.agents.values())
  }

  /**
   * Intelligently selects the specialized agent best suited for a prompt or goal
   */
  public selectAgentForGoal(
    goal: string,
    preferredRole?: SpecializedAgentRole
  ): SpecializedAgentRole {
    if (preferredRole && this.agents.has(preferredRole)) {
      return preferredRole
    }

    const g = goal.toLowerCase()

    // 1. Android
    if (
      g.startsWith('open ') ||
      g.startsWith('launch ') ||
      g.includes('app') ||
      g.includes('android') ||
      g.includes('phone') ||
      g.includes('tap') ||
      g.includes('swipe')
    ) {
      return 'Android Agent'
    }

    // 2. Vision
    if (
      g.includes('image') ||
      g.includes('diagram') ||
      g.includes('flowchart') ||
      g.includes('picture') ||
      g.includes('flux') ||
      g.includes('photo')
    ) {
      return 'Vision Agent'
    }

    // 3. Browser
    if (
      g.startsWith('browse ') ||
      g.startsWith('visit ') ||
      g.includes('http://') ||
      g.includes('https://') ||
      g.includes('webpage') ||
      g.includes('website')
    ) {
      return 'Browser Agent'
    }

    // 4. Coding
    if (
      g.includes('code') ||
      g.includes('function') ||
      g.includes('refactor') ||
      g.includes('bug') ||
      g.includes('typescript') ||
      g.includes('javascript') ||
      g.includes('error') ||
      g.includes('repo')
    ) {
      return 'Coding Agent'
    }

    // 5. File
    if (
      g.includes('file') ||
      g.includes('folder') ||
      g.includes('directory') ||
      g.includes('read path') ||
      g.includes('save to')
    ) {
      return 'File Agent'
    }

    // 6. Voice
    if (
      g.includes('speak') ||
      g.includes('say aloud') ||
      g.includes('voice mode') ||
      g.includes('tts')
    ) {
      return 'Voice Agent'
    }

    // Default: Research Agent (web search, factual query)
    return 'Research Agent'
  }
}

export const brainAgentRegistry = new AgentRegistry()
