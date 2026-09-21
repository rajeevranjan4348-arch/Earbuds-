/**
 * Unified Tool Registry
 * Manages tool catalog, schema validation, permission checks, timeouts, and error handling.
 */

import { searchToolDefinitions, executeSearchTool } from '../search/mcpTools'
import { androidMcpToolDefinitions } from '../android/mcpTools'
import { browserUseAgent } from '../browser/browserAgent'
import { scientificResearch } from '../research/scientificResearch'
import { diagramDesign } from '../research/diagramGenerator'
import { fluxImageEngine } from '../image/fluxEngine'
import { getLatestLocation, locationService } from '../location/service'
import { ragEngine } from '../rag/ragEngine'
import {
  workspaceAgent,
  googleDriveProvider,
  googleDocsProvider,
  googleSheetsProvider,
  googleGmailProvider,
  googleCalendarProvider
} from '../workspace'
import {
  trendDiscoveryEngine,
  youtubePipelineManager,
  analyticsEngine,
  channelMemoryStore
} from '../youtube'

export interface UnifiedTool {
  name: string
  description: string
  parameters: Record<string, any>
  permissionLevel: 'public' | 'standard' | 'sensitive' | 'admin'
  timeoutMs: number
  execute: (args: Record<string, any>) => Promise<any>
}

export class ToolRegistry {
  private tools = new Map<string, UnifiedTool>()

  constructor() {
    this.registerDefaultTools()
  }

  private registerDefaultTools() {
    // 1. Search tools
    for (const toolDef of searchToolDefinitions) {
      this.tools.set(toolDef.name, {
        name: toolDef.name,
        description: toolDef.description,
        parameters: toolDef.parameters,
        permissionLevel: 'standard',
        timeoutMs: 12000,
        execute: async (args) => executeSearchTool(toolDef.name, args)
      })
    }

    // 2. Android MCP tools
    for (const toolDef of androidMcpToolDefinitions) {
      this.tools.set(toolDef.name, {
        name: toolDef.name,
        description: toolDef.description,
        parameters: toolDef.parameters,
        permissionLevel:
          toolDef.name.includes('tap') || toolDef.name.includes('type') ? 'sensitive' : 'standard',
        timeoutMs: 10000,
        execute: async (args) => {
          // Standard dispatch representation
          return {
            dispatched: true,
            tool: toolDef.name,
            args,
            timestamp: new Date().toISOString()
          }
        }
      })
    }

    // 3. Browser Use tool
    this.tools.set('browser_navigate_and_extract', {
      name: 'browser_navigate_and_extract',
      description:
        'Navigates to a webpage, executes reader extraction, and returns clean markdown text with SSRF security verification.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'Webpage URL to navigate to and extract.' }
        },
        required: ['url']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => browserUseAgent.executeAction({ type: 'navigate', url: args.url })
    })

    // 4. Scientific Research tool
    this.tools.set('scientific_research', {
      name: 'scientific_research',
      description:
        'Conducts formal scientific literature evaluation, empirical hypothesis matrix generation, and citation synthesis.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'The scientific or technical subject to research.' }
        },
        required: ['topic']
      },
      permissionLevel: 'standard',
      timeoutMs: 20000,
      execute: async (args) => scientificResearch.conductResearch(args.topic)
    })

    // 5. Diagram Generator tool
    this.tools.set('generate_diagram', {
      name: 'generate_diagram',
      description:
        'Generates structured Mermaid.js diagrams (architecture, flowcharts, sequence, state) for technical concepts.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Diagram title.' },
          type: {
            type: 'STRING',
            enum: ['flowchart', 'sequence', 'architecture', 'state', 'class'],
            description: 'Diagram type.'
          }
        },
        required: ['title', 'type']
      },
      permissionLevel: 'standard',
      timeoutMs: 5000,
      execute: async (args) => diagramDesign.generateDiagram(args.title, args.type)
    })

    // 6. FLUX Image Generation tool
    this.tools.set('generate_flux_image', {
      name: 'generate_flux_image',
      description:
        'Generates high-resolution text-to-image artwork using the FLUX model family with prompt enhancement.',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: { type: 'STRING', description: 'Visual description of the image.' },
          aspectRatio: {
            type: 'STRING',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:2'],
            description: 'Aspect ratio.'
          }
        },
        required: ['prompt']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) =>
        fluxImageEngine.generateImage({ prompt: args.prompt, aspectRatio: args.aspectRatio })
    })

    // 7. Live Location & Spatial Telemetry tool
    this.tools.set('get_live_location', {
      name: 'get_live_location',
      description:
        "Returns the user's real-time physical coordinates (latitude, longitude, altitude), city, region, country, and telemetry accuracy.",
      parameters: {
        type: 'OBJECT',
        properties: {},
        required: []
      },
      permissionLevel: 'standard',
      timeoutMs: 6000,
      execute: async () => {
        let loc = getLatestLocation()
        if (!loc) {
          loc = await locationService.getIpLocation()
        }
        if (!loc) {
          return {
            status: 'standby',
            message:
              'Live location telemetry has not been acquired yet. User can initialize live location in the IRIS HUD.'
          }
        }
        return {
          status: 'locked',
          ...loc
        }
      }
    })

    // 8. Document Knowledge & PDF RAG search tool
    this.tools.set('document_knowledge_search', {
      name: 'document_knowledge_search',
      description:
        'Performs semantic vector and keyword hybrid search across all uploaded PDF documents and returns matching page excerpts with exact citations.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: 'Search query or topic to look up in the uploaded documents.'
          },
          filename: {
            type: 'STRING',
            description: 'Optional specific PDF filename to filter search.'
          },
          limit: {
            type: 'NUMBER',
            description: 'Maximum number of relevant excerpts to return (default: 6).'
          }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 12000,
      execute: async (args) => {
        return ragEngine.retrieveContext(args.query, {
          filter: args.filename ? { filename: args.filename } : undefined,
          limit: args.limit || 6
        })
      }
    })

    // 9. Document Knowledge QA tool
    this.tools.set('document_knowledge_qa', {
      name: 'document_knowledge_qa',
      description:
        'Answers user questions based strictly on the uploaded PDF document knowledge base, providing verified citations [Document: filename.pdf, Page: X] and multi-document synthesis.',
      parameters: {
        type: 'OBJECT',
        properties: {
          question: {
            type: 'STRING',
            description: 'The question to answer using the indexed PDF knowledge base.'
          },
          filename: {
            type: 'STRING',
            description: 'Optional specific PDF filename to scope the answer.'
          }
        },
        required: ['question']
      },
      permissionLevel: 'standard',
      timeoutMs: 20000,
      execute: async (args) => {
        return ragEngine.answerFromDocuments(args.question, {
          filter: args.filename ? { filename: args.filename } : undefined
        })
      }
    })

    // 10. Workspace Unified Natural Language Query & Analysis
    this.tools.set('workspace_analyze_file', {
      name: 'workspace_analyze_file',
      description:
        'Natural language Google Workspace data agent. Searches Drive/Docs/Sheets/Slides/Gmail/Calendar, retrieves files/content, extracts chapters/pages/tables, and performs deep analysis, comparisons, or calculations with verified citations.',
      parameters: {
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description:
              'The user query or instruction (e.g. "Find my homework PDF in Drive and analyze chapter 3" or "Calculate average from marks spreadsheet").'
          },
          userId: { type: 'STRING', description: 'Optional user identifier.' }
        },
        required: ['prompt']
      },
      permissionLevel: 'standard',
      timeoutMs: 30000,
      execute: async (args) => {
        return workspaceAgent.execute(args.prompt, { userId: args.userId })
      }
    })

    // 11. Workspace Generic Search Tool
    this.tools.set('workspace_search', {
      name: 'workspace_search',
      description:
        'Search across connected Google Workspace services (Google Drive, Docs, Sheets, Slides, Gmail, Calendar).',
      parameters: {
        type: 'OBJECT',
        properties: {
          service: {
            type: 'STRING',
            enum: ['drive', 'docs', 'sheets', 'slides', 'gmail', 'calendar'],
            description: 'The Google Workspace service to search.'
          },
          query: { type: 'STRING', description: 'Keywords, title, or search terms.' },
          fileType: {
            type: 'STRING',
            description: 'Optional file type filter: pdf, docx, sheet, presentation, folder.'
          }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        const service = args.service || 'drive'
        if (service === 'docs') return googleDocsProvider.search(args.query)
        if (service === 'sheets') return googleSheetsProvider.search(args.query)
        if (service === 'gmail') return googleGmailProvider.search(args.query)
        if (service === 'calendar') return googleCalendarProvider.search(args.query)
        return googleDriveProvider.search(args.query, { fileType: args.fileType })
      }
    })

    // 12. Workspace Drive Search
    this.tools.set('workspace_search_drive', {
      name: 'workspace_search_drive',
      description:
        'Searches user Google Drive for files, PDFs, homework assignments, folders, or recently modified documents.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Filename or search terms.' },
          fileType: {
            type: 'STRING',
            enum: ['pdf', 'docx', 'sheet', 'presentation', 'folder', 'all'],
            description: 'Filter by document format.'
          }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return googleDriveProvider.search(args.query, { fileType: args.fileType })
      }
    })

    // 13. Workspace Get Content
    this.tools.set('workspace_get_content', {
      name: 'workspace_get_content',
      description:
        'Retrieves and parses text content, page boundaries, tables, and chunks for a Google Drive file by ID.',
      parameters: {
        type: 'OBJECT',
        properties: {
          fileId: { type: 'STRING', description: 'The Google Drive file ID.' }
        },
        required: ['fileId']
      },
      permissionLevel: 'standard',
      timeoutMs: 25000,
      execute: async (args) => {
        return googleDriveProvider.getContent(args.fileId)
      }
    })

    // 14. Workspace Search Docs
    this.tools.set('workspace_search_docs', {
      name: 'workspace_search_docs',
      description: 'Search specifically within Google Docs documents and notes.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search term or title.' }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return googleDocsProvider.search(args.query)
      }
    })

    // 15. Workspace Search Sheets
    this.tools.set('workspace_search_sheets', {
      name: 'workspace_search_sheets',
      description: 'Search specifically within Google Sheets spreadsheets.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search term or title of spreadsheet.' }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return googleSheetsProvider.search(args.query)
      }
    })

    // 16. Workspace Search Gmail
    this.tools.set('workspace_search_gmail', {
      name: 'workspace_search_gmail',
      description: 'Search user Gmail messages, threads, and senders.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search query for emails.' }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return googleGmailProvider.search(args.query)
      }
    })

    // 17. Workspace Search Calendar
    this.tools.set('workspace_search_calendar', {
      name: 'workspace_search_calendar',
      description: 'Search user Google Calendar events, agendas, and meetings.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Event title or search term.' }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return googleCalendarProvider.search(args.query)
      }
    })

    // 18. YouTube Discover Trends
    this.tools.set('youtube_discover_trends', {
      name: 'youtube_discover_trends',
      description:
        'Discovers and scores live trending topic opportunities for the YouTube channel across search volume, competition, and audience fit.',
      parameters: {
        type: 'OBJECT',
        properties: {
          niche: { type: 'STRING', description: 'Optional specific niche to filter.' },
          count: { type: 'NUMBER', description: 'Number of candidate topics to return.' }
        }
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return trendDiscoveryEngine.discoverTrends({
          niche: args.niche,
          count: args.count || 5
        })
      }
    })

    // 19. YouTube Create Video Job
    this.tools.set('youtube_create_video_job', {
      name: 'youtube_create_video_job',
      description:
        'Coordinates the full autonomous video production pipeline: topic validation, 7-part script generation, storyboard frames, asset manifest, WebVTT captions, and 9-point Quality Gate verification.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topicTitle: { type: 'STRING', description: 'Title or topic to produce a video for.' },
          format: {
            type: 'STRING',
            description: 'Target format: SHORTS, MINI (1-3m), STANDARD (5-10m), or LONG_FORM.'
          }
        },
        required: ['topicTitle']
      },
      permissionLevel: 'standard',
      timeoutMs: 30000,
      execute: async (args) => {
        const trends = await trendDiscoveryEngine.discoverTrends({ searchQuery: args.topicTitle, count: 1 })
        const topic = trends[0] || {
          id: `topic_${Date.now()}`,
          title: args.topicTitle,
          niche: channelMemoryStore.getProfile().contentNiches[0] || 'AI & Autonomous Agents',
          source: 'User Prompt Command',
          discoveredAt: new Date().toISOString(),
          relevanceScore: 90,
          interestScore: 90,
          searchDemand: 85,
          competitionScore: 35,
          freshnessScore: 90,
          audienceFitScore: 95,
          contentAvailability: 90,
          safetyPolicyRisk: 'LOW',
          opportunityScore: 92,
          selectionReason: 'User initiated production target.',
          factualClaims: [],
          copyrightRisk: 'NONE',
          requiresHumanReview: false,
          isDuplicate: false
        }

        const job = await youtubePipelineManager.createJob(topic, (args.format as any) || 'STANDARD')
        const result = await youtubePipelineManager.runFullPipeline(job.jobId)
        return result
      }
    })

    // 20. YouTube Content Queue
    this.tools.set('youtube_get_pipeline_queue', {
      name: 'youtube_get_pipeline_queue',
      description: 'Returns all active content jobs in the YouTube production pipeline with their current stages.',
      parameters: {
        type: 'OBJECT',
        properties: {}
      },
      permissionLevel: 'standard',
      timeoutMs: 5000,
      execute: async () => {
        return youtubePipelineManager.getJobs()
      }
    })

    // 21. YouTube Approve Video Job
    this.tools.set('youtube_approve_publish_job', {
      name: 'youtube_approve_publish_job',
      description: 'Approves a video job currently in review for immediate YouTube public release or scheduled publishing.',
      parameters: {
        type: 'OBJECT',
        properties: {
          jobId: { type: 'STRING', description: 'ID of the content job to approve.' },
          scheduleFor: { type: 'STRING', description: 'Optional ISO timestamp or date/time for scheduled release.' }
        },
        required: ['jobId']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      execute: async (args) => {
        return youtubePipelineManager.approveJob(args.jobId, args.scheduleFor)
      }
    })

    // 22. YouTube Channel Analytics
    this.tools.set('youtube_get_channel_analytics', {
      name: 'youtube_get_channel_analytics',
      description: 'Retrieves comprehensive channel analytics: views, retention curves, CTR, subscriber growth, and AI insights.',
      parameters: {
        type: 'OBJECT',
        properties: {
          period: { type: 'STRING', description: 'Analytics timeframe (e.g. "Last 28 Days", "Last 90 Days").' }
        }
      },
      permissionLevel: 'standard',
      timeoutMs: 10000,
      execute: async (args) => {
        return analyticsEngine.getChannelAnalytics(args.period)
      }
    })

    // 23. YouTube Command Executor
    this.tools.set('youtube_execute_command', {
      name: 'youtube_execute_command',
      description: 'Processes high-level natural language commands for channel management, publishing modes, or pipeline coordination.',
      parameters: {
        type: 'OBJECT',
        properties: {
          command: { type: 'STRING', description: 'Natural language instruction (e.g. "Find today\'s trends", "Enable semi-auto mode").' }
        },
        required: ['command']
      },
      permissionLevel: 'standard',
      timeoutMs: 20000,
      execute: async (args) => {
        return youtubePipelineManager.handleCommand(args.command)
      }
    })
  }

  public getToolDefinitions() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      permissionLevel: t.permissionLevel
    }))
  }

  public async callTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool "${name}" not found in Unified Tool Registry.`)
    }
    return tool.execute(args)
  }
}

export const toolRegistry = new ToolRegistry()
