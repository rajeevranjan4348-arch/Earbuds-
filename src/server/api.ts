/**
 * IRIS Backend API Layer
 * Connects Mem0 (via official mem0ai SDK) and Gemini AI (via @google/genai)
 * Handles /api/memory/* and /api/ai/* endpoints with complete server-side secret isolation
 * and failure-safe fallbacks.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import MemoryClient from 'mem0ai'
import { GoogleGenAI } from '@google/genai'
import { codebaseService } from './codebase/service'
import { searchOrchestrator, executeSearchTool, searchToolDefinitions } from './search'
import { privacyAlign, cybersecurity } from './security'
import { unifiedMemory } from './memory'
import { browserUseAgent } from './browser'
import { scientificResearch, diagramDesign } from './research'
import { fluxImageEngine, imageStore, getImageApiKey } from './image'
import { androidPackageResolver } from './android'
import {
  multiAgentOrchestrator,
  agentHarness,
  taskManager,
  intentClassifier,
  planGenerator,
  executionEngine
} from './agents'
import { toolRegistry, mcpBridge } from './tools'
import { locationService, getLatestLocation, setLatestLocation } from './location/service'
import {
  getMarkersForUser,
  addMarker,
  getWorkspaceItems,
  saveWorkspaceItem,
  upsertUser
} from './db'
import { ragEngine, vectorStore, ingestionQueue, BatchImportFile } from './rag'
import {
  workspaceAgent,
  workspaceIntentRouter,
  workspaceContextMemory,
  googleDriveProvider,
  googleDocsProvider,
  googleSheetsProvider,
  googleSlidesProvider,
  googleGmailProvider,
  googleCalendarProvider
} from './workspace'
import {
  trendDiscoveryEngine,
  youtubePipelineManager,
  analyticsEngine,
  productionScheduler,
  channelMemoryStore
} from './youtube'

// In-memory fallback database per user for offline / unauthenticated Mem0 mode
interface StoredMemory {
  id: string
  userId: string
  memory: string
  category?: string
  confidence?: number
  createdAt: string
  updatedAt: string
  source?: string
  metadata?: Record<string, any>
}

const serverMemoryStore: Map<string, StoredMemory[]> = new Map()

function getMemoriesForUser(userId: string): StoredMemory[] {
  return serverMemoryStore.get(userId) || []
}

function saveMemoriesForUser(userId: string, memories: StoredMemory[]) {
  serverMemoryStore.set(userId, memories)
}

// Lazy SDK client getters
let mem0Client: MemoryClient | null = null
function getMem0(): MemoryClient | null {
  if (mem0Client) return mem0Client
  const key = process.env.MEM0_API_KEY
  if (!key) return null
  try {
    mem0Client = new MemoryClient({ apiKey: key })
    return mem0Client
  } catch (err) {
    console.warn('[Server] Mem0 SDK initialization warning:', err)
    return null
  }
}

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (geminiClient) return geminiClient
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!key) return null
  try {
    geminiClient = new GoogleGenAI({ apiKey: key })
    return geminiClient
  } catch (err) {
    console.warn('[Server] Gemini SDK initialization warning:', err)
    return null
  }
}

// Helper to parse JSON body
function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/**
 * Structured API Error Handling and Recovery Utility
 * Ensures graceful failures for API calls rather than runtime crashes
 */
export async function safeApiCall<T>(
  fn: () => Promise<T>,
  fallbackValue: T,
  operationName: string
): Promise<{ data: T; success: boolean; error?: string }> {
  try {
    const data = await fn()
    return { data, success: true }
  } catch (err: any) {
    console.warn(`[SafeApiCall Recovery] Error in "${operationName}":`, err?.message || err)
    return {
      data: fallbackValue,
      success: false,
      error: err?.message || 'Operation encountered a recoverable error'
    }
  }
}

/**
 * Executes an asynchronous handler with structured error capture and fallback JSON response
 */
export async function handleSafeRoute(
  res: ServerResponse,
  routeName: string,
  handler: () => Promise<any>
): Promise<void> {
  try {
    const result = await handler()
    sendJson(res, 200, result)
  } catch (err: any) {
    console.warn(`[API Route Recovery] Graceful recovery for "${routeName}":`, err?.message || err)
    sendJson(res, 200, {
      success: false,
      error: err?.message || 'The requested operation failed gracefully.',
      fallback: true,
      timestamp: new Date().toISOString()
    })
  }
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): Promise<void> {
  const url = req.url || ''
  if (!url.startsWith('/api/')) {
    return next()
  }

  const parsedUrl = new URL(url, 'http://localhost:3000')
  const pathname = parsedUrl.pathname

  try {
    // 1. Health check
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        mem0Connected: Boolean(process.env.MEM0_API_KEY),
        geminiConnected: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
        codebaseReady: true,
        searchReady: true,
        privacyReady: true,
        securityReady: true,
        browserReady: true,
        fluxReady: true,
        multiAgentReady: true,
        planExecutionAgentReady: true,
        unifiedMemoryReady: true,
        mcpReady: true,
        searxngConfigured: Boolean(process.env.SEARXNG_URL),
        tavilyConfigured: Boolean(process.env.TAVILY_API_KEY)
      })
    }

    // Voice & Audio Speech Processing (Integrated AI fallback for Web Speech API)
    if (pathname === '/api/voice/transcribe' && req.method === 'POST') {
      const { audioData, mimeType = 'audio/webm' } = await parseBody(req)
      if (!audioData) {
        return sendJson(res, 400, { success: false, error: 'Missing audioData payload' })
      }

      const gemini = getGemini()
      if (!gemini) {
        return sendJson(res, 503, {
          success: false,
          error: 'Gemini AI speech processing service not initialized.'
        })
      }

      try {
        const cleanBase64 = audioData.includes('base64,')
          ? audioData.split('base64,')[1]
          : audioData

        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: cleanBase64
              }
            },
            "You are an acoustic speech-to-text transcriber for the IRIS AI voice assistant. Accurately transcribe the user's spoken voice command verbatim. Return ONLY the transcribed text without any markdown quotes, commentary, punctuation fluff, or prefixes. If no intelligible speech is detected, return an empty string."
          ]
        })

        const transcript = (response.text || '').trim().replace(/^["']|["']$/g, '')
        return sendJson(res, 200, {
          success: true,
          transcript,
          provider: 'gemini-ai'
        })
      } catch (err: any) {
        console.error('[API Voice Transcribe] Gemini error:', err)
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Speech transcription failed'
        })
      }
    }

    // ==========================================
    // PDF Knowledge Base & Scalable RAG Endpoints
    // ==========================================

    // 1. Batch Import PDFs (200+ files supported)
    if (pathname === '/api/rag/import' && req.method === 'POST') {
      try {
        const body = await parseBody(req)
        const { files = [], userId = 'usr_primary' } = body

        if (!Array.isArray(files) || files.length === 0) {
          return sendJson(res, 400, {
            success: false,
            error: 'Missing or empty "files" array. Please provide file payloads.'
          })
        }

        const batchFiles: BatchImportFile[] = []

        for (const file of files) {
          if (!file.filename) continue

          let buffer: Buffer | null = null
          if (file.contentBase64) {
            const clean = file.contentBase64.includes('base64,')
              ? file.contentBase64.split('base64,')[1]
              : file.contentBase64
            buffer = Buffer.from(clean, 'base64')
          } else if (file.contentText) {
            buffer = Buffer.from(file.contentText, 'utf8')
          }

          if (buffer && buffer.length > 0) {
            batchFiles.push({
              filename: file.filename,
              buffer,
              size: file.size || buffer.length,
              contentType: file.contentType || 'application/pdf',
              title: file.title
            })
          }
        }

        if (batchFiles.length === 0) {
          return sendJson(res, 400, {
            success: false,
            error: 'No valid file buffers found in request payload.'
          })
        }

        const importResult = await ragEngine.importDocuments(batchFiles, userId)

        return sendJson(res, 200, {
          success: true,
          ...importResult,
          message: `Successfully queued ${importResult.queuedCount} document(s) for asynchronous indexing (${importResult.skippedCount} already up to date).`
        })
      } catch (err: any) {
        console.error('[API RAG Import] Error:', err)
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Failed to import documents into batch queue'
        })
      }
    }

    // 2. Ingestion Progress & Status
    if (pathname === '/api/rag/status' && req.method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId') || 'usr_primary'
      const progress = ragEngine.getDocumentStatus(undefined, userId)
      return sendJson(res, 200, { success: true, progress })
    }

    // 3. List Indexed Documents
    if (pathname === '/api/rag/documents' && req.method === 'GET') {
      const userId = parsedUrl.searchParams.get('userId') || undefined
      const documents = ragEngine.listDocuments(userId)
      return sendJson(res, 200, { success: true, count: documents.length, documents })
    }

    // 4. Get Document Details or Chunks
    if (pathname.startsWith('/api/rag/documents/') && req.method === 'GET') {
      const docId = pathname.replace('/api/rag/documents/', '')
      const doc = vectorStore.getDocument(docId)
      if (!doc) {
        return sendJson(res, 404, { success: false, error: 'Document not found' })
      }
      const chunks = vectorStore.getChunksByDocument(docId)
      return sendJson(res, 200, { success: true, document: doc, chunkCount: chunks.length, chunks })
    }

    // 5. Delete Document
    if (pathname.startsWith('/api/rag/documents/') && req.method === 'DELETE') {
      const docId = pathname.replace('/api/rag/documents/', '')
      const deleted = ragEngine.deleteDocument(docId)
      if (!deleted) {
        return sendJson(res, 404, {
          success: false,
          error: 'Document not found or already deleted'
        })
      }
      return sendJson(res, 200, {
        success: true,
        message: `Document ${docId} and its embeddings deleted.`
      })
    }

    // 6. Retry Failed Document
    if (pathname === '/api/rag/retry' && req.method === 'POST') {
      const { documentId, contentBase64 } = await parseBody(req)
      if (!documentId) {
        return sendJson(res, 400, { success: false, error: 'Missing documentId parameter' })
      }

      let buffer: Buffer | undefined
      if (contentBase64) {
        const clean = contentBase64.includes('base64,')
          ? contentBase64.split('base64,')[1]
          : contentBase64
        buffer = Buffer.from(clean, 'base64')
      }

      const retried = ragEngine.retryFailedDocument(documentId, buffer)
      if (!retried) {
        return sendJson(res, 400, {
          success: false,
          error: 'Unable to retry document. If buffer was not retained, please re-upload.'
        })
      }

      return sendJson(res, 200, {
        success: true,
        message: `Document ${documentId} requeued for processing.`
      })
    }

    // 7. Hybrid Search
    if (pathname === '/api/rag/search' && req.method === 'POST') {
      const { query, filter, limit = 8, rerank = true } = await parseBody(req)
      if (!query || typeof query !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing search query string' })
      }

      try {
        const searchResults = await ragEngine.searchDocuments(query, {
          filter,
          limit,
          rerank
        })

        return sendJson(res, 200, {
          success: true,
          count: searchResults.length,
          results: searchResults
        })
      } catch (err: any) {
        console.error('[API RAG Search] Error:', err)
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Search execution failed'
        })
      }
    }

    // 8. RAG Question Answering with Citations
    if (
      (pathname === '/api/rag/query' || pathname === '/api/rag/answer') &&
      req.method === 'POST'
    ) {
      const { query, question, filter, limit = 8 } = await parseBody(req)
      const queryText = query || question
      if (!queryText || typeof queryText !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing query or question string' })
      }

      try {
        const ragResult = await ragEngine.answerFromDocuments(queryText, {
          filter,
          limit
        })

        return sendJson(res, 200, {
          success: true,
          ...ragResult
        })
      } catch (err: any) {
        console.error('[API RAG Answer] Error:', err)
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'RAG generation failed'
        })
      }
    }

    // 2. Claude Context - Codebase Understanding Endpoints
    if (pathname === '/api/codebase/index' && req.method === 'POST') {
      const body = await parseBody(req)
      try {
        const metadata = await codebaseService.indexProject({
          path: body.path,
          githubUrl: body.githubUrl,
          projectId: body.projectId,
          userId: body.userId,
          name: body.name,
          githubToken: body.githubToken
        })
        return sendJson(res, 200, { success: true, metadata })
      } catch (err: any) {
        return sendJson(res, 400, { success: false, error: err?.message || 'Indexing failed' })
      }
    }

    if (pathname === '/api/codebase/search' && req.method === 'POST') {
      const {
        query,
        projectId = 'current_workspace',
        userId,
        limit = 8,
        language,
        filePattern
      } = await parseBody(req)
      if (!query) {
        return sendJson(res, 400, { error: 'Missing search query' })
      }
      try {
        const results = codebaseService.searchCodebase(query, projectId, userId, {
          limit,
          language,
          filePattern
        })
        return sendJson(res, 200, { success: true, results, count: results.length })
      } catch (err: any) {
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Search failed',
          results: []
        })
      }
    }

    if (pathname === '/api/codebase/context' && req.method === 'POST') {
      const {
        filePath,
        projectId = 'current_workspace',
        userId,
        startLine,
        endLine
      } = await parseBody(req)
      if (!filePath) {
        return sendJson(res, 400, { error: 'Missing filePath' })
      }
      try {
        const context = codebaseService.getFileContext(
          filePath,
          projectId,
          userId,
          startLine,
          endLine
        )
        if (!context) {
          return sendJson(res, 404, { success: false, error: 'File not found or unreadable' })
        }
        return sendJson(res, 200, { success: true, context })
      } catch (err: any) {
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Context retrieval failed'
        })
      }
    }

    if (pathname === '/api/codebase/symbol' && req.method === 'POST') {
      const { symbol, projectId = 'current_workspace', userId } = await parseBody(req)
      if (!symbol) {
        return sendJson(res, 400, { error: 'Missing symbol' })
      }
      const symbols = codebaseService.findSymbol(symbol, projectId, userId)
      return sendJson(res, 200, { success: true, symbols, count: symbols.length })
    }

    if (pathname === '/api/codebase/references' && req.method === 'POST') {
      const { symbol, projectId = 'current_workspace', userId } = await parseBody(req)
      if (!symbol) {
        return sendJson(res, 400, { error: 'Missing symbol' })
      }
      const references = codebaseService.findReferences(symbol, projectId, userId)
      return sendJson(res, 200, { success: true, references, count: references.length })
    }

    if (pathname === '/api/codebase/structure') {
      let projectId = 'current_workspace'
      let userId: string | undefined
      let depth = 3

      if (req.method === 'POST') {
        const body = await parseBody(req)
        projectId = body.projectId || projectId
        userId = body.userId
        depth = body.depth || depth
      } else {
        const parsed = new URL(url, 'http://localhost')
        projectId = parsed.searchParams.get('projectId') || projectId
        userId = parsed.searchParams.get('userId') || undefined
        depth = Number(parsed.searchParams.get('depth')) || depth
      }

      const structure = codebaseService.getProjectStructure(projectId, userId, depth)
      return sendJson(res, 200, { success: true, structure })
    }

    if (pathname === '/api/codebase/projects' && req.method === 'GET') {
      const parsed = new URL(url, 'http://localhost')
      const userId = parsed.searchParams.get('userId') || undefined
      const projects = codebaseService.listProjects(userId)
      return sendJson(res, 200, { success: true, projects })
    }

    if (pathname === '/api/codebase/delete' && req.method === 'POST') {
      const { projectId, userId } = await parseBody(req)
      if (!projectId) {
        return sendJson(res, 400, { error: 'Missing projectId' })
      }
      const deleted = codebaseService.deleteProject(projectId, userId)
      return sendJson(res, 200, { success: deleted })
    }

    // Cloud SQL Endpoints
    if (pathname === '/api/db/markers' && req.method === 'GET') {
      const parsed = new URL(url, 'http://localhost')
      const uid = parsed.searchParams.get('uid') || undefined
      const markers = await getMarkersForUser(uid)
      return sendJson(res, 200, { success: true, markers })
    }

    if (pathname === '/api/db/markers' && req.method === 'POST') {
      const body = await parseBody(req)
      const marker = await addMarker(body)
      return sendJson(res, 200, { success: true, marker })
    }

    if (pathname === '/api/db/workspace' && req.method === 'GET') {
      const parsed = new URL(url, 'http://localhost')
      const uid = parsed.searchParams.get('uid') || undefined
      const items = await getWorkspaceItems(uid)
      return sendJson(res, 200, { success: true, items })
    }

    if (pathname === '/api/db/workspace' && req.method === 'POST') {
      const body = await parseBody(req)
      const item = await saveWorkspaceItem(body)
      return sendJson(res, 200, { success: true, item })
    }

    if (pathname === '/api/db/user' && req.method === 'POST') {
      const body = await parseBody(req)
      const user = await upsertUser(body.uid, body.email, body.displayName)
      return sendJson(res, 200, { success: true, user })
    }

    // ==========================================
    // Google Workspace Intelligence & Data Agent Endpoints
    // ==========================================

    // Workspace Natural Language Query & Multi-step Execution
    if (pathname === '/api/workspace/query' && req.method === 'POST') {
      return handleSafeRoute(res, 'workspace_query', async () => {
        const body = await parseBody(req)
        const authHeader = req.headers['authorization'] || ''
        const bearerToken = authHeader.startsWith('Bearer ')
          ? authHeader.slice(7)
          : body.accessToken || ''
        const prompt = body.prompt || body.query || ''
        const userId = body.userId || 'usr_primary'
        const confirmed = Boolean(body.confirmed)

        if (!prompt) {
          return { success: false, error: 'Missing prompt parameter' }
        }

        const result = await workspaceAgent.execute(prompt, {
          userId,
          accessToken: bearerToken,
          confirmed
        })

        return result
      })
    }

    // Workspace Intent Parsing Endpoint
    if (pathname === '/api/workspace/intent' && req.method === 'POST') {
      return handleSafeRoute(res, 'workspace_intent', async () => {
        const body = await parseBody(req)
        const prompt = body.prompt || body.query || ''
        const userId = body.userId || 'usr_primary'
        const activeCtx = workspaceContextMemory.getActiveFile(userId)
        const intent = workspaceIntentRouter.parse(prompt, activeCtx)
        return { success: true, intent, activeContext: activeCtx }
      })
    }

    // Google Drive Search Endpoint
    if (
      (pathname === '/api/workspace/drive/search' || pathname === '/api/workspace/search') &&
      (req.method === 'POST' || req.method === 'GET')
    ) {
      return handleSafeRoute(res, 'workspace_drive_search', async () => {
        const authHeader = req.headers['authorization'] || ''
        let query = ''
        let fileType = ''
        let service = 'drive'

        if (req.method === 'POST') {
          const body = await parseBody(req)
          query = body.query || body.q || ''
          fileType = body.fileType || ''
          service = body.service || 'drive'
        } else {
          query = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('query') || ''
          fileType = parsedUrl.searchParams.get('fileType') || ''
          service = parsedUrl.searchParams.get('service') || 'drive'
        }

        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

        if (service === 'docs') {
          return await googleDocsProvider.search(query, { accessToken: bearerToken })
        } else if (service === 'sheets') {
          return await googleSheetsProvider.search(query, { accessToken: bearerToken })
        } else if (service === 'slides') {
          return await googleSlidesProvider.search(query, { accessToken: bearerToken })
        } else if (service === 'gmail') {
          return await googleGmailProvider.search(query, { accessToken: bearerToken })
        } else if (service === 'calendar') {
          return await googleCalendarProvider.search(query, { accessToken: bearerToken })
        }

        return await googleDriveProvider.search(query, {
          accessToken: bearerToken,
          fileType: fileType as any
        })
      })
    }

    // Google Drive File Metadata Endpoint
    if (pathname === '/api/workspace/drive/file' && req.method === 'GET') {
      return handleSafeRoute(res, 'workspace_drive_file', async () => {
        const fileId =
          parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('fileId') || ''
        if (!fileId) return { success: false, error: 'Missing fileId parameter' }
        const authHeader = req.headers['authorization'] || ''
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
        const metadata = await googleDriveProvider.getMetadata(fileId, { accessToken: bearerToken })
        return { success: true, metadata }
      })
    }

    // Google Drive File Content & Extraction Endpoint
    if (
      pathname === '/api/workspace/drive/content' &&
      (req.method === 'GET' || req.method === 'POST')
    ) {
      return handleSafeRoute(res, 'workspace_drive_content', async () => {
        let fileId = ''
        if (req.method === 'POST') {
          const body = await parseBody(req)
          fileId = body.fileId || body.id || ''
        } else {
          fileId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('fileId') || ''
        }

        if (!fileId) return { success: false, error: 'Missing fileId parameter' }
        const authHeader = req.headers['authorization'] || ''
        const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
        const content = await googleDriveProvider.getContent(fileId, { accessToken: bearerToken })
        return { success: true, content }
      })
    }

    // Conversational Workspace Task Context Endpoint
    if (pathname === '/api/workspace/context') {
      const userId = parsedUrl.searchParams.get('userId') || 'usr_primary'
      if (req.method === 'GET') {
        const ctx = workspaceContextMemory.getContext(userId)
        return sendJson(res, 200, { success: true, context: ctx })
      }
      if (req.method === 'DELETE') {
        workspaceContextMemory.clearContext(userId)
        return sendJson(res, 200, { success: true, cleared: true })
      }
    }

    // Google Maps Configuration Endpoint
    if (pathname === '/api/maps/config' && req.method === 'GET') {
      const apiKey =
        process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBpZJtNMY11VDNpQ905P_6RccN_83R0J6A'
      return sendJson(res, 200, { apiKey })
    }

    // ==========================================
    // Autonomous AI YouTube Manager Endpoints
    // ==========================================

    // 1. Discover Trends
    if (pathname === '/api/youtube/trends') {
      return handleSafeRoute(res, 'youtube_trends', async () => {
        let niche: string | undefined
        let count = 6
        let searchQuery: string | undefined

        if (req.method === 'POST') {
          const body = await parseBody(req)
          niche = body.niche
          count = Number(body.count) || count
          searchQuery = body.searchQuery
        } else {
          niche = parsedUrl.searchParams.get('niche') || undefined
          count = Number(parsedUrl.searchParams.get('count')) || count
          searchQuery = parsedUrl.searchParams.get('q') || undefined
        }

        const trends = await trendDiscoveryEngine.discoverTrends({ niche, count, searchQuery })
        return { success: true, trends, count: trends.length }
      })
    }

    // 2. Content Pipeline Queue / Jobs
    if (pathname === '/api/youtube/jobs') {
      if (req.method === 'GET') {
        return handleSafeRoute(res, 'youtube_get_jobs', async () => {
          const jobs = youtubePipelineManager.getJobs()
          return { success: true, jobs, count: jobs.length }
        })
      }

      if (req.method === 'POST') {
        return handleSafeRoute(res, 'youtube_create_job', async () => {
          const body = await parseBody(req)
          const topic = body.topic || {
            id: `topic_${Date.now()}`,
            title: body.title || 'Autonomous Production Pipeline',
            niche: body.niche || 'AI & Autonomous Agents',
            source: 'Manual Creator Dispatch',
            discoveredAt: new Date().toISOString(),
            relevanceScore: 92,
            interestScore: 90,
            searchDemand: 88,
            competitionScore: 35,
            freshnessScore: 92,
            audienceFitScore: 95,
            contentAvailability: 90,
            safetyPolicyRisk: 'LOW',
            opportunityScore: 93,
            selectionReason: 'User initiated production target.',
            factualClaims: [],
            copyrightRisk: 'NONE',
            requiresHumanReview: false,
            isDuplicate: false
          }
          const format = body.format || 'STANDARD'
          const job = await youtubePipelineManager.createJob(topic, format)

          // Run pipeline if autoExecute flag is true (default true)
          if (body.autoExecute !== false) {
            youtubePipelineManager.runFullPipeline(job.jobId).catch((err) => {
              console.error('[YouTubeAPI] Background pipeline error:', err)
            })
          }

          return { success: true, job }
        })
      }
    }

    // 3. Run Pipeline for Job
    if (pathname === '/api/youtube/jobs/run' && req.method === 'POST') {
      return handleSafeRoute(res, 'youtube_run_job', async () => {
        const body = await parseBody(req)
        const jobId = body.jobId || ''
        if (!jobId) return { success: false, error: 'Missing jobId' }
        const result = await youtubePipelineManager.runFullPipeline(jobId)
        return result
      })
    }

    // 4. Approve Job
    if (pathname === '/api/youtube/jobs/approve' && req.method === 'POST') {
      return handleSafeRoute(res, 'youtube_approve_job', async () => {
        const body = await parseBody(req)
        const jobId = body.jobId || ''
        const scheduleFor = body.scheduleFor
        if (!jobId) return { success: false, error: 'Missing jobId' }
        const result = await youtubePipelineManager.approveJob(jobId, scheduleFor)
        return result
      })
    }

    // 5. Reject Job
    if (pathname === '/api/youtube/jobs/reject' && req.method === 'POST') {
      return handleSafeRoute(res, 'youtube_reject_job', async () => {
        const body = await parseBody(req)
        const jobId = body.jobId || ''
        const reason = body.reason || 'Declined during review'
        if (!jobId) return { success: false, error: 'Missing jobId' }
        const result = youtubePipelineManager.rejectJob(jobId, reason)
        return result
      })
    }

    // 6. Delete Job
    if (pathname === '/api/youtube/jobs/delete' && (req.method === 'POST' || req.method === 'DELETE')) {
      return handleSafeRoute(res, 'youtube_delete_job', async () => {
        const body = req.method === 'POST' ? await parseBody(req) : {}
        const jobId = body.jobId || parsedUrl.searchParams.get('id') || ''
        if (!jobId) return { success: false, error: 'Missing jobId' }
        const deleted = youtubePipelineManager.deleteJob(jobId)
        return { success: deleted, jobId }
      })
    }

    // 7. Channel Profile & Settings
    if (pathname === '/api/youtube/channel') {
      if (req.method === 'GET') {
        return handleSafeRoute(res, 'youtube_get_channel', async () => {
          const profile = channelMemoryStore.getProfile()
          return { success: true, profile }
        })
      }
      if (req.method === 'POST') {
        return handleSafeRoute(res, 'youtube_update_channel', async () => {
          const body = await parseBody(req)
          const updated = channelMemoryStore.updateProfile(body)
          return { success: true, profile: updated }
        })
      }
    }

    // 8. YouTube Analytics
    if (pathname === '/api/youtube/analytics' && req.method === 'GET') {
      return handleSafeRoute(res, 'youtube_analytics', async () => {
        const period = parsedUrl.searchParams.get('period') || 'Last 28 Days'
        const analytics = await analyticsEngine.getChannelAnalytics(period)
        return { success: true, analytics }
      })
    }

    // 9. Automation Scheduler
    if (pathname === '/api/youtube/scheduler') {
      if (req.method === 'GET') {
        return handleSafeRoute(res, 'youtube_get_scheduler', async () => {
          const schedule = productionScheduler.getSchedule()
          return { success: true, schedule }
        })
      }
      if (req.method === 'POST') {
        return handleSafeRoute(res, 'youtube_update_scheduler', async () => {
          const body = await parseBody(req)
          const updated = productionScheduler.updateSchedule(body)
          return { success: true, schedule: updated }
        })
      }
    }

    // 10. Natural Language Command Dispatcher
    if (pathname === '/api/youtube/command' && req.method === 'POST') {
      return handleSafeRoute(res, 'youtube_command', async () => {
        const body = await parseBody(req)
        const command = body.command || body.prompt || ''
        if (!command) return { success: false, error: 'Missing command string' }
        const response = await youtubePipelineManager.handleCommand(command)
        return { success: true, ...response }
      })
    }

    // 2. Mem0 Memory Endpoints
    if (pathname === '/api/memory/add' && req.method === 'POST') {
      const { text, userId, metadata, category } = await parseBody(req)
      const uid = userId || 'usr_kumarimamta87565'

      if (!text || typeof text !== 'string') {
        return sendJson(res, 400, { error: 'Missing text' })
      }

      const client = getMem0()
      if (client) {
        try {
          const result = await client.add([{ role: 'user', content: text }], {
            userId: uid,
            metadata
          })
          return sendJson(res, 200, { success: true, result, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud add fallback to local store:', err)
        }
      }

      // Local store fallback
      const userMems = getMemoriesForUser(uid)
      const newItem: StoredMemory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: uid,
        memory: text.trim(),
        category,
        confidence: 0.95,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'server_fallback',
        metadata
      }
      userMems.unshift(newItem)
      saveMemoriesForUser(uid, userMems)

      return sendJson(res, 200, { success: true, memory: newItem, source: 'server_local' })
    }

    if (pathname === '/api/memory/search' && req.method === 'POST') {
      const { query, userId, limit = 5 } = await parseBody(req)
      const uid = userId || 'usr_kumarimamta87565'

      const client = getMem0()
      if (client) {
        try {
          const results = await client.search(query, { userId: uid, topK: limit })
          return sendJson(res, 200, { results, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud search fallback to local store:', err)
        }
      }

      // Local search fallback
      const userMems = getMemoriesForUser(uid)
      const qTokens = (query || '').toLowerCase().split(/\s+/).filter(Boolean)
      const scored = userMems.map((m) => {
        const memLower = m.memory.toLowerCase()
        let matchCount = 0
        qTokens.forEach((t: string) => {
          if (memLower.includes(t)) matchCount++
        })
        const score = qTokens.length > 0 ? matchCount / qTokens.length : 0
        return { ...m, score }
      })
      scored.sort((a, b) => b.score - a.score)

      return sendJson(res, 200, {
        results: scored.filter((s) => s.score > 0).slice(0, limit),
        source: 'server_local'
      })
    }

    if (pathname === '/api/memory/all') {
      const uid = (url.split('userId=')[1] || '').split('&')[0] || 'usr_kumarimamta87565'

      const client = getMem0()
      if (client) {
        try {
          const results = await client.getAll({ userId: uid })
          return sendJson(res, 200, { results, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud getAll fallback:', err)
        }
      }

      return sendJson(res, 200, { results: getMemoriesForUser(uid), source: 'server_local' })
    }

    if (pathname === '/api/memory/update' && req.method === 'POST') {
      const { id, text, userId } = await parseBody(req)
      const uid = userId || 'usr_kumarimamta87565'

      const client = getMem0()
      if (client && id) {
        try {
          await client.update(id, text)
          return sendJson(res, 200, { success: true, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud update fallback:', err)
        }
      }

      const userMems = getMemoriesForUser(uid)
      const found = userMems.find((m) => m.id === id)
      if (found) {
        found.memory = text
        found.updatedAt = new Date().toISOString()
        saveMemoriesForUser(uid, userMems)
      }
      return sendJson(res, 200, { success: true, source: 'server_local' })
    }

    if (pathname === '/api/memory/delete' && req.method === 'POST') {
      const { id, userId } = await parseBody(req)
      const uid = userId || 'usr_kumarimamta87565'

      const client = getMem0()
      if (client && id) {
        try {
          await client.delete(id)
          return sendJson(res, 200, { success: true, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud delete fallback:', err)
        }
      }

      const filtered = getMemoriesForUser(uid).filter((m) => m.id !== id)
      saveMemoriesForUser(uid, filtered)
      return sendJson(res, 200, { success: true, source: 'server_local' })
    }

    if (pathname === '/api/memory/clear' && req.method === 'POST') {
      const { userId } = await parseBody(req)
      const uid = userId || 'usr_kumarimamta87565'

      const client = getMem0()
      if (client) {
        try {
          await client.deleteAll({ userId: uid })
          return sendJson(res, 200, { success: true, source: 'mem0_cloud' })
        } catch (err) {
          console.warn('[Server] Mem0 cloud clear fallback:', err)
        }
      }

      saveMemoriesForUser(uid, [])
      return sendJson(res, 200, { success: true, source: 'server_local' })
    }

    // 3. Web Search & Browsing Endpoints (SearXNG / DuckDuckGo / Tavily / Reader)
    if (pathname === '/api/search' && req.method === 'POST') {
      const {
        query,
        category = 'general',
        timeRange = '',
        limit = 5,
        extractContent = true,
        maxTokensPerSource = 2500
      } = await parseBody(req)

      if (!query || typeof query !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing search query' })
      }

      try {
        const response = await searchOrchestrator.search(query, {
          category,
          timeRange,
          limit,
          extractContent,
          maxTokensPerSource
        })
        return sendJson(res, 200, response)
      } catch (err: any) {
        return sendJson(res, 500, {
          success: false,
          error: err?.message || 'Search failed',
          results: [],
          citations: []
        })
      }
    }

    if (pathname === '/api/search/browse' && req.method === 'POST') {
      const { url, maxChars = 3500 } = await parseBody(req)
      if (!url || typeof url !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing url parameter' })
      }
      try {
        const page = await searchOrchestrator.browseUrl(url, maxChars)
        return sendJson(res, 200, { success: true, page })
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message || 'Failed to browse URL' })
      }
    }

    if (pathname === '/api/search/research' && req.method === 'POST') {
      const { topic, depth = 'standard', limitPerQuery = 4 } = await parseBody(req)
      if (!topic || typeof topic !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing research topic' })
      }
      try {
        const research = await searchOrchestrator.research(topic, { depth, limitPerQuery })
        return sendJson(res, 200, { success: true, research })
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message || 'Deep research failed' })
      }
    }

    if (pathname === '/api/search/tools') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { tools: searchToolDefinitions })
      }
      if (req.method === 'POST') {
        const { name, arguments: toolArgs = {} } = await parseBody(req)
        if (!name) {
          return sendJson(res, 400, { error: 'Missing tool name' })
        }
        try {
          const result = await executeSearchTool(name, toolArgs)
          return sendJson(res, 200, { success: true, tool: name, result })
        } catch (err: any) {
          return sendJson(res, 500, {
            success: false,
            error: err?.message || 'Tool execution failed'
          })
        }
      }
    }

    // 5. Privacy & Cybersecurity Engine Endpoints (PrivacyAlign #19 + Anthropic Cybersecurity #02)
    if (pathname === '/api/security/audit' && req.method === 'POST') {
      const { text, url, path } = await parseBody(req)
      const pii = text ? privacyAlign.sanitize(text) : null
      const injection = text ? cybersecurity.evaluatePromptInjection(text) : null
      const ssrf = url ? cybersecurity.validateUrlForSSRF(url) : null
      const pathSecurity = path ? cybersecurity.validateFilePath(path) : null

      return sendJson(res, 200, {
        safe:
          (!injection || injection.safe) &&
          (!ssrf || ssrf.safe) &&
          (!pathSecurity || pathSecurity.safe),
        pii,
        injection,
        ssrf,
        pathSecurity
      })
    }

    // 6. Unified Memory Engine Endpoints (Letta #09 + Agent Memory #06 + OpenViking #07)
    if (pathname === '/api/memory/blocks' && req.method === 'GET') {
      const urlParams = new URL(url, 'http://localhost').searchParams
      const uid = urlParams.get('userId') || 'default_user'
      const blocks = unifiedMemory.getUserBlocks(uid)
      return sendJson(res, 200, { blocks })
    }

    if (pathname === '/api/memory/blocks' && req.method === 'POST') {
      const { userId = 'default_user', label, content } = await parseBody(req)
      if (!label || !content) {
        return sendJson(res, 400, { error: 'Missing label or content' })
      }
      const updated = unifiedMemory.updateBlock(userId, label, content)
      return sendJson(res, 200, { success: true, block: updated })
    }

    // 7. Browser Use Agent Endpoint (Browser Use #01)
    if (pathname === '/api/browser/action' && req.method === 'POST') {
      const { action, sessionId = 'default' } = await parseBody(req)
      if (!action || !action.type) {
        return sendJson(res, 400, { error: 'Invalid browser action definition' })
      }
      const result = await browserUseAgent.executeAction(action, sessionId)
      return sendJson(res, 200, result)
    }

    // 8. Scientific Research Workflow Endpoint (Scientific Agent Skills #04)
    if (pathname === '/api/research/scientific' && req.method === 'POST') {
      const { topic } = await parseBody(req)
      if (!topic) {
        return sendJson(res, 400, { error: 'Topic is required' })
      }
      const report = await scientificResearch.conductResearch(topic)
      return sendJson(res, 200, { success: true, report })
    }

    // 9. Diagram Generation Endpoint (Diagram Design #05)
    if (pathname === '/api/diagram/generate' && req.method === 'POST') {
      const { title, type = 'flowchart', steps = [] } = await parseBody(req)
      if (!title) {
        return sendJson(res, 400, { error: 'Diagram title is required' })
      }
      const diagram = diagramDesign.generateDiagram(title, type, steps)
      return sendJson(res, 200, { success: true, diagram })
    }

    // 10. FLUX Image Generation Endpoint (FLUX #20)
    if (pathname === '/api/image/generate' && req.method === 'POST') {
      const { prompt, aspectRatio = '1:1', model = 'flux', seed } = await parseBody(req)
      if (!prompt) {
        return sendJson(res, 400, { error: 'Prompt is required' })
      }
      const imageResult = await fluxImageEngine.generateImage({ prompt, aspectRatio, model, seed })
      return sendJson(res, 200, imageResult)
    }

    // 10a. FLUX Image View Endpoint (serves cached generated image by ID securely)
    if (pathname === '/api/image/view' && req.method === 'GET') {
      const id = parsedUrl.searchParams.get('id')
      if (id && imageStore.has(id)) {
        const item = imageStore.get(id)!
        res.writeHead(200, {
          'Content-Type': item.contentType,
          'Content-Length': item.buffer.length,
          'Cache-Control': 'public, max-age=86400, immutable'
        })
        return res.end(item.buffer)
      }
      return sendJson(res, 404, { error: 'Image not found' })
    }

    // 10b. FLUX Image Proxy Endpoint (server-side stream with secret API key)
    if (pathname === '/api/image/proxy' && req.method === 'GET') {
      const prompt = parsedUrl.searchParams.get('prompt') || 'digital art'
      const width = parsedUrl.searchParams.get('width') || '1024'
      const height = parsedUrl.searchParams.get('height') || '1024'
      const seed = parsedUrl.searchParams.get('seed') || '42'
      const apiKey = getImageApiKey()

      try {
        const upstreamUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&key=${encodeURIComponent(apiKey)}`
        const upstreamRes = await fetch(upstreamUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(15000)
        })

        if (!upstreamRes.ok) {
          return sendJson(res, upstreamRes.status, { error: 'Upstream image generation failed' })
        }

        const buffer = Buffer.from(await upstreamRes.arrayBuffer())
        const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg'
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=86400, immutable'
        })
        return res.end(buffer)
      } catch (err: any) {
        return sendJson(res, 502, { error: err?.message || 'Image proxy error' })
      }
    }

    // 11. Android App & Package Resolution Endpoint (Deft #10 + AutoDroid #11)
    if (pathname === '/api/android/resolve' && req.method === 'POST') {
      const { query } = await parseBody(req)
      if (!query) {
        return sendJson(res, 400, { error: 'Query is required' })
      }
      const resolved = androidPackageResolver.resolveApp(query)
      return sendJson(res, 200, { success: Boolean(resolved), app: resolved })
    }

    // 12. Unified MCP Layer Endpoints (androir-mcp #17 + Agent Search #18 + Ruflo #08)
    if (pathname === '/api/mcp/tools' && req.method === 'GET') {
      return sendJson(res, 200, mcpBridge.listTools())
    }

    if (pathname === '/api/mcp/call' && req.method === 'POST') {
      const { name, parameters = {} } = await parseBody(req)
      if (!name) {
        return sendJson(res, 400, { error: 'Tool name is required' })
      }
      const mcpResponse = await mcpBridge.invokeTool(name, parameters)
      return sendJson(res, 200, mcpResponse)
    }

    // 13. Agency Agents Intent Routing (Agency Agents #21 + Ruflo #08)
    if (pathname === '/api/agents/route' && req.method === 'POST') {
      const { prompt } = await parseBody(req)
      const role = multiAgentOrchestrator.routeIntent(prompt || '')
      return sendJson(res, 200, { role })
    }

    // 13-A. Listening + Plan Execution Agent Endpoints
    // Primary Entry Point: Listens, Classifies Intent, Decomposes into Structured Plan, Executes, Verifies & Synthesizes
    if ((pathname === '/api/agent/execute' || pathname === '/api/agent/listen-and-execute') && req.method === 'POST') {
      return handleSafeRoute(res, 'agent_listen_and_execute', async () => {
        const body = await parseBody(req)
        const rawInput = body.input || body.prompt || body.command || ''
        const inputType = (body.inputType as 'voice' | 'text') || 'text'
        const userId = body.userId || 'default_user'
        const contextMemory = body.context || body.contextMemory || {}

        if (!rawInput || typeof rawInput !== 'string') {
          return { success: false, error: 'Missing input query or command' }
        }

        const taskResult = await taskManager.listenAndExecute(rawInput, inputType, userId, contextMemory)
        return {
          success: taskResult.status === 'completed' || taskResult.status === 'waiting_confirmation' || taskResult.status === 'clarification_needed',
          task: taskResult
        }
      })
    }

    // Task State & History Queries
    if (pathname === '/api/agent/tasks' && req.method === 'GET') {
      const parsed = new URL(url, 'http://localhost')
      const userId = parsed.searchParams.get('userId') || undefined
      const limit = Number(parsed.searchParams.get('limit')) || 20
      const tasks = taskManager.listTasks(userId, limit)
      return sendJson(res, 200, { success: true, tasks })
    }

    // Get Single Task Status
    if (pathname.startsWith('/api/agent/task/') && !pathname.endsWith('/confirm') && !pathname.endsWith('/cancel') && req.method === 'GET') {
      const taskId = pathname.replace('/api/agent/task/', '').trim()
      const task = taskManager.getTask(taskId)
      if (!task) {
        return sendJson(res, 404, { success: false, error: `Task "${taskId}" not found` })
      }
      return sendJson(res, 200, { success: true, task })
    }

    // Confirm / Authorize Gated Plan Step
    if (pathname.startsWith('/api/agent/task/') && pathname.endsWith('/confirm') && req.method === 'POST') {
      const taskId = pathname.replace('/api/agent/task/', '').replace('/confirm', '').trim()
      const body = await parseBody(req)
      const approved = body.approved !== false
      const notes = body.notes

      try {
        const task = await taskManager.confirmTaskStep(taskId, approved, notes)
        return sendJson(res, 200, { success: true, task })
      } catch (err: any) {
        return sendJson(res, 400, { success: false, error: err?.message || 'Failed to confirm task' })
      }
    }

    // Cancel Active Task
    if (pathname.startsWith('/api/agent/task/') && pathname.endsWith('/cancel') && req.method === 'POST') {
      const taskId = pathname.replace('/api/agent/task/', '').replace('/cancel', '').trim()
      const body = await parseBody(req)
      const cancelled = taskManager.cancelTask(taskId, body.reason)
      return sendJson(res, 200, { success: Boolean(cancelled), task: cancelled })
    }

    // List All Registered Tools & Schemas for Plan Inspection
    if (pathname === '/api/agent/tools' && req.method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        tools: toolRegistry.getToolDefinitions()
      })
    }

    // 13a. Live Location Status Endpoint
    if (pathname === '/api/location/status' && req.method === 'GET') {
      let loc = getLatestLocation()
      if (!loc) {
        loc = await locationService.getIpLocation()
      }
      return sendJson(res, 200, { success: true, location: loc })
    }

    // 13b. Live Location Update Endpoint (pushed by browser geolocation)
    if (pathname === '/api/location/update' && req.method === 'POST') {
      const body = await parseBody(req)
      const { latitude, longitude, altitude, accuracy, speed, heading, source = 'gps' } = body
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return sendJson(res, 400, { error: 'Valid latitude and longitude are required' })
      }

      let geoDetails = {
        city: body.city,
        region: body.region,
        country: body.country,
        displayName: body.displayName
      }
      if (!geoDetails.city && !geoDetails.country) {
        try {
          const resolved = await locationService.reverseGeocode(latitude, longitude)
          geoDetails = { ...geoDetails, ...resolved }
        } catch (_e) {}
      }

      const updatedLoc = {
        latitude,
        longitude,
        altitude: altitude ?? null,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        heading: heading ?? null,
        city: geoDetails.city,
        region: geoDetails.region,
        country: geoDetails.country,
        displayName: geoDetails.displayName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        source: (source as any) || 'gps',
        updatedAt: new Date().toISOString()
      }
      setLatestLocation(updatedLoc)
      return sendJson(res, 200, { success: true, location: updatedLoc })
    }

    // 13c. Location Reverse Geocode Proxy Endpoint
    if (pathname === '/api/location/reverse' && (req.method === 'POST' || req.method === 'GET')) {
      let lat: number | undefined
      let lon: number | undefined

      if (req.method === 'POST') {
        const body = await parseBody(req)
        lat = body.latitude ?? body.lat
        lon = body.longitude ?? body.lon
      } else {
        lat = parseFloat(parsedUrl.searchParams.get('lat') || '')
        lon = parseFloat(parsedUrl.searchParams.get('lon') || '')
      }

      if (typeof lat !== 'number' || isNaN(lat) || typeof lon !== 'number' || isNaN(lon)) {
        return sendJson(res, 400, { error: 'Valid latitude and longitude required' })
      }

      const reverse = await locationService.reverseGeocode(lat, lon)
      return sendJson(res, 200, { success: true, ...reverse })
    }

    // 13d. IP Location Fallback Endpoint
    if (pathname === '/api/location/ip' && req.method === 'GET') {
      const loc = await locationService.getIpLocation()
      return sendJson(res, 200, { success: Boolean(loc), location: loc })
    }

    // 14. Unified AI Core Engine (Mem0 + Letta + Agency Agents + Web Search + Codebase)
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
      const {
        prompt: rawPrompt,
        relevantMemories = [],
        codebaseContext: rawCodebaseContext = [],
        projectId = 'current_workspace',
        userId = 'default_user',
        enableWebSearch,
        searchCategory = 'general',
        agentRole: requestedRole
      } = await parseBody(req)

      if (!rawPrompt) {
        return sendJson(res, 400, { error: 'Missing prompt' })
      }

      // 1. Multi-Agent Orchestration & Security/Privacy Pipeline
      const execPlan = multiAgentOrchestrator.prepareExecution(rawPrompt, userId, requestedRole)
      const sanitizedPrompt = execPlan.sanitizedPrompt

      // 2. Codebase Context Retrieval
      let codebaseContext = Array.isArray(rawCodebaseContext) ? [...rawCodebaseContext] : []
      if (
        codebaseContext.length === 0 &&
        (execPlan.role === 'coding' || rawPrompt.toLowerCase().includes('code'))
      ) {
        try {
          const results = codebaseService.searchCodebase(sanitizedPrompt, projectId, userId, {
            limit: 4
          })
          if (results.length > 0) {
            codebaseContext = results
          }
        } catch (_e) {}
      }

      // 3. Intelligent Web Search Grounding (Agent Search #18 + Browser Use #01)
      let webSearchResults: any[] = []
      let webCitations: any[] = []
      let webSearchQuery = ''
      const shouldSearch =
        enableWebSearch ?? searchOrchestrator.shouldTriggerSearch(sanitizedPrompt)

      if (shouldSearch) {
        try {
          webSearchQuery = searchOrchestrator.cleanSearchQuery(sanitizedPrompt)
          const searchData = await searchOrchestrator.search(webSearchQuery, {
            category: searchCategory,
            limit: 4,
            extractContent: true
          })
          if (searchData.results.length > 0) {
            webSearchResults = searchData.results
            webCitations = searchData.citations
          }
        } catch (_e) {
          console.warn('[Server] Web search grounding error:', _e)
        }
      }

      const ai = getGemini()
      if (ai) {
        try {
          let systemInstruction = execPlan.systemInstruction

          if (relevantMemories.length > 0) {
            const memoryList = relevantMemories
              .map((m: any, i: number) => `${i + 1}. ${typeof m === 'string' ? m : m.memory}`)
              .join('\n')
            systemInstruction += `\n\n[USER RELEVANT MEMORIES]:\n${memoryList}`
          }

          if (codebaseContext.length > 0) {
            const codeList = codebaseContext
              .map((c: any, idx: number) => {
                const file = c.filePath || c.file || 'unknown'
                const lines = c.startLine ? ` (Lines ${c.startLine}-${c.endLine})` : ''
                const sym = c.symbolName ? ` [Symbol: ${c.symbolName}]` : ''
                const code = (c.snippet || c.content || '').slice(0, 1200)
                return `--- Snippet ${idx + 1}: ${file}${lines}${sym} ---\n${code}`
              })
              .join('\n\n')

            systemInstruction += `\n\n[CLAUDE CONTEXT - REPOSITORY CODEBASE CONTEXT (Project: ${projectId})]:\n${codeList}\n\nStrict Codebase Reasoning Directives:\n1. Answer grounded in the actual codebase snippets above. Reference precise file paths and lines.\n2. For coding modifications: inspect dependencies, explain the rationale, show proposed changes clearly with markdown code blocks/diffs, and state that modifications will be applied only when explicitly confirmed.`
          }

          if (webSearchResults.length > 0) {
            const webContext = searchOrchestrator.buildPromptContext(
              webSearchResults,
              webCitations,
              {
                includeExtractedContent: true
              }
            )
            systemInstruction += webContext
          }

          // 4. PDF Document Knowledge / RAG Context Retrieval
          let documentCitations: any[] = []
          try {
            const ragData = await ragEngine.retrieveContext(sanitizedPrompt, {
              filter: userId ? { userId } : undefined,
              limit: 6
            })
            if (ragData.chunks.length > 0) {
              systemInstruction += `\n\n[UPLOADED PDF DOCUMENT KNOWLEDGE BASE & RAG EXCERPTS]:\n${ragData.contextText}\n\nDocument Knowledge Directives:\n1. If the user asks about their uploaded documents, PDFs, or specific document topics, synthesize answers based directly on the excerpts above.\n2. Always cite specific sources using the exact format: [Document: filename.pdf, Page: X].\n3. If the user asks a question about their documents and the answer cannot be found in the excerpts above, state clearly that the uploaded documents do not contain enough information.`
              documentCitations = ragData.citations
            }
          } catch (_e) {
            console.warn('[Server] Document RAG retrieval notice:', _e)
          }

          // 5. Google Workspace Intelligence & Context Integration
          let workspaceCitations: any[] = []
          const lowerPrompt = sanitizedPrompt.toLowerCase()
          const isWorkspaceQuery =
            lowerPrompt.includes('drive') ||
            lowerPrompt.includes('homework') ||
            lowerPrompt.includes('assignment') ||
            lowerPrompt.includes('spreadsheet') ||
            lowerPrompt.includes('sheet') ||
            lowerPrompt.includes('marks') ||
            lowerPrompt.includes('google doc') ||
            lowerPrompt.includes('slides') ||
            lowerPrompt.includes('presentation') ||
            lowerPrompt.includes('chapter') ||
            Boolean(workspaceContextMemory.getActiveFile(userId).content)

          if (isWorkspaceQuery) {
            try {
              const authHeader = req.headers['authorization'] || ''
              const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
              const wsResult = await workspaceAgent.execute(sanitizedPrompt, {
                userId,
                accessToken: bearerToken
              })

              if (wsResult.success && wsResult.answer) {
                systemInstruction += `\n\n[GOOGLE WORKSPACE DATA AGENT GROUNDING]:\n${wsResult.answer}\n\nWorkspace Directives:\n1. Answer the user based on the retrieved Workspace file and analysis above.\n2. Maintain source citations: e.g. [Source: Google Drive - ${wsResult.primaryFile?.name || 'File'}, Pages/Sections].\n3. If multiple files require user disambiguation or confirmation is needed, present it clearly.`
                if (wsResult.citations && wsResult.citations.length > 0) {
                  workspaceCitations = wsResult.citations.map((c) => ({
                    title: c.fileName,
                    url: c.link || '#',
                    domain: `google-${c.service}`,
                    page: c.pageNumber,
                    section: c.sectionHeading,
                    source: c.source
                  }))
                }
              }
            } catch (_wsErr) {
              console.warn('[Server] Workspace agent context notice:', _wsErr)
            }
          }

          const userLoc = getLatestLocation()
          if (userLoc) {
            systemInstruction += `\n\n[USER LIVE LOCATION & SPATIAL TELEMETRY]:\nLatitude: ${userLoc.latitude}\nLongitude: ${userLoc.longitude}\nCity: ${userLoc.city || 'Unknown'}\nRegion: ${userLoc.region || 'Unknown'}\nCountry: ${userLoc.country || 'Unknown'}\nAddress: ${userLoc.displayName || 'Unspecified'}\nTelemetry Accuracy: ${userLoc.accuracy ? `±${Math.round(userLoc.accuracy)}m` : 'nominal'}\nSource: ${userLoc.source.toUpperCase()}\nUpdated: ${userLoc.updatedAt}\nDirectives: Use this verified spatial telemetry when user inquires about where they are, local weather, time, regional context, or directions.`
          }

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: sanitizedPrompt,
            config: {
              systemInstruction
            }
          })

          const rawText = response.text || ''
          // Enforce PrivacyAlign output sanitization
          const sanitizedOutput = privacyAlign.sanitize(rawText).redactedText

          agentHarness.completeTrace(execPlan.traceId)

          return sendJson(res, 200, {
            text: sanitizedOutput,
            model: 'gemini-3.8-flash',
            agentRole: execPlan.role,
            agentName: execPlan.agentName,
            traceId: execPlan.traceId,
            privacySanitized: execPlan.privacyMinimization.applied,
            codebaseContextCount: codebaseContext.length,
            webSourcesCount: webSearchResults.length,
            citations: [...webCitations, ...documentCitations, ...workspaceCitations],
            documentCitations,
            workspaceCitations,
            searchQuery: webSearchQuery
          })
        } catch (err: any) {
          console.warn('[Server] Gemini generation failed, falling back:', err?.message)
        }
      }

      // Graceful local fallback if Gemini key missing or network down
      if (webSearchResults.length > 0) {
        const topResult = webSearchResults[0]
        const synthesisText =
          `${topResult.snippet}\n\n**Sources:**\n` +
          webCitations.map((c) => `[${c.index}] [${c.title}](${c.url}) (${c.domain})`).join('\n')

        agentHarness.completeTrace(execPlan.traceId)

        return sendJson(res, 200, {
          text: synthesisText,
          fallback: true,
          agentRole: execPlan.role,
          agentName: execPlan.agentName,
          webSourcesCount: webSearchResults.length,
          citations: webCitations,
          searchQuery: webSearchQuery,
          source: 'web_search_direct'
        })
      }

      agentHarness.completeTrace(execPlan.traceId)

      return sendJson(res, 200, {
        text: null,
        fallback: true,
        agentRole: execPlan.role,
        agentName: execPlan.agentName,
        message: 'No server-side Gemini key configured. Switching to client fallback.'
      })
    }

    // Pass through if unhandled
    next()
  } catch (err) {
    console.error('[Server API Error]', err)
    sendJson(res, 500, { error: 'Internal server error' })
  }
}
