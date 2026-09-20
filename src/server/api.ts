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

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): Promise<void> {
  const url = req.url || ''
  if (!url.startsWith('/api/')) {
    return next()
  }

  const pathname = url.split('?')[0]

  try {
    // 1. Health check
    if (pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        mem0Connected: Boolean(process.env.MEM0_API_KEY),
        geminiConnected: Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
        codebaseReady: true
      })
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
      const { query, projectId = 'current_workspace', userId, limit = 8, language, filePattern } = await parseBody(req)
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
        return sendJson(res, 500, { success: false, error: err?.message || 'Search failed', results: [] })
      }
    }

    if (pathname === '/api/codebase/context' && req.method === 'POST') {
      const { filePath, projectId = 'current_workspace', userId, startLine, endLine } = await parseBody(req)
      if (!filePath) {
        return sendJson(res, 400, { error: 'Missing filePath' })
      }
      try {
        const context = codebaseService.getFileContext(filePath, projectId, userId, startLine, endLine)
        if (!context) {
          return sendJson(res, 404, { success: false, error: 'File not found or unreadable' })
        }
        return sendJson(res, 200, { success: true, context })
      } catch (err: any) {
        return sendJson(res, 500, { success: false, error: err?.message || 'Context retrieval failed' })
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
          const result = await client.add(
            [{ role: 'user', content: text }],
            { userId: uid, metadata }
          )
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

    // 3. AI Chat Proxy Route with Context Builder (Mem0 + Claude Context)
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
      const {
        prompt,
        relevantMemories = [],
        codebaseContext: rawCodebaseContext = [],
        projectId = 'current_workspace',
        userId,
        _history = []
      } = await parseBody(req)

      if (!prompt) {
        return sendJson(res, 400, { error: 'Missing prompt' })
      }

      // Auto-retrieve codebase context if prompt has coding intent and none was passed
      let codebaseContext = Array.isArray(rawCodebaseContext) ? [...rawCodebaseContext] : []
      if (codebaseContext.length === 0) {
        const lowerPrompt = prompt.toLowerCase()
        const isCodingQuery =
          lowerPrompt.includes('code') ||
          lowerPrompt.includes('function') ||
          lowerPrompt.includes('class') ||
          lowerPrompt.includes('search codebase') ||
          lowerPrompt.includes('file') ||
          lowerPrompt.includes('api') ||
          lowerPrompt.includes('how does') ||
          lowerPrompt.includes('where is') ||
          lowerPrompt.includes('architecture') ||
          lowerPrompt.includes('component') ||
          lowerPrompt.includes('service') ||
          lowerPrompt.includes('import') ||
          lowerPrompt.includes('explain') ||
          lowerPrompt.includes('refactor') ||
          lowerPrompt.includes('symbol') ||
          lowerPrompt.includes('bug')

        if (isCodingQuery) {
          try {
            const results = codebaseService.searchCodebase(prompt, projectId, userId, { limit: 4 })
            if (results.length > 0) {
              codebaseContext = results
            }
          } catch (_e) {}
        }
      }

      const ai = getGemini()
      if (ai) {
        try {
          // Context Builder: Inject system identity + relevant memories + Claude Context codebase
          let systemInstruction = `You are IRIS, an advanced voice-first neural AI assistant and operating layer.
Be direct, articulate, concise, and helpful. You speak naturally to the user.`

          if (relevantMemories.length > 0) {
            const memoryList = relevantMemories
              .map((m: any, i: number) => `${i + 1}. ${typeof m === 'string' ? m : m.memory}`)
              .join('\n')
            systemInstruction += `\n\n[USER RELEVANT MEMORIES]:\nThe following persistent memories were retrieved for this user:\n${memoryList}\nUse these memories naturally when answering questions about the user's preferences, project, or instructions.`
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

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              systemInstruction
            }
          })

          const text = response.text || ''
          return sendJson(res, 200, {
            text,
            model: 'gemini-2.5-flash',
            codebaseContextCount: codebaseContext.length
          })
        } catch (err: any) {
          console.warn('[Server] Gemini generation failed, falling back:', err?.message)
        }
      }

      // Graceful local fallback if Gemini key missing or network down
      return sendJson(res, 200, {
        text: null,
        fallback: true,
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
