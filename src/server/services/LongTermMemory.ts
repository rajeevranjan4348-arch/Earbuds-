/**
 * Long-Term Memory Service with Vector Database Integration
 *
 * Allows AI agents to persist, index, and retrieve context, user preferences,
 * task execution outcomes, and cross-session learnings with dense semantic vector search
 * and hybrid BM25 token ranking.
 *
 * Key Capabilities:
 * - Dense Vector Embeddings (GenAI text-embedding-004 + TF-IDF cosine fallback)
 * - Hybrid Retrieval (Vector Cosine Similarity + Keyword/Entity BM25 relevance)
 * - Session & Task Context Persistence across application reboots
 * - Automatic Cosine Deduplication (>0.94 similarity merges and updates metadata)
 * - Decay & Recency Scoring (Half-life weighting for stale vs fresh memories)
 * - Role-based Context Extraction for Specialized Agents (Research, Coding, Browser, etc.)
 */

import fs from 'node:fs'
import path from 'node:path'
import { EmbeddingsEngine } from '../rag/embeddings'

export type MemoryType =
  | 'task_outcome'
  | 'user_preference'
  | 'code_pattern'
  | 'error_recovery'
  | 'continuity_context'
  | 'session_context'
  | 'fact'

export interface LongTermMemoryItem {
  id: string
  userId: string
  sessionId?: string
  taskId?: string
  agentRole?: string
  type: MemoryType
  content: string
  embedding: number[]
  metadata: Record<string, any>
  importance: number // 0.0 to 1.0
  createdAt: number
  updatedAt: number
  lastAccessed: number
  accessCount: number
}

export interface MemorySearchOptions {
  userId?: string
  sessionId?: string
  taskId?: string
  agentRole?: string
  topK?: number
  minSimilarity?: number
  type?: MemoryType
  timeWindowMs?: number
  includeSystem?: boolean
}

export interface ScoredMemory extends LongTermMemoryItem {
  similarity: number
  keywordScore?: number
  hybridScore?: number
}

export interface SessionContextSnapshot {
  sessionId: string
  userId: string
  summary: string
  keyEntities: string[]
  topics: string[]
  updatedAt: number
}

export class LongTermMemoryService {
  private static instance: LongTermMemoryService
  private storageDir: string
  private memoryFile: string
  private sessionIndexFile: string
  private memories: Map<string, LongTermMemoryItem> = new Map()
  private sessionSnapshots: Map<string, SessionContextSnapshot> = new Map()
  private isLoaded: boolean = false

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'vector_memory')
    this.memoryFile = path.join(this.storageDir, 'long_term_memories.json')
    this.sessionIndexFile = path.join(this.storageDir, 'session_snapshots.json')
    this.initStorage()
  }

  public static getInstance(): LongTermMemoryService {
    if (!LongTermMemoryService.instance) {
      LongTermMemoryService.instance = new LongTermMemoryService()
    }
    return LongTermMemoryService.instance
  }

  private initStorage(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
      this.loadFromDisk()
    } catch (err) {
      console.warn('[LongTermMemory] Storage initialization notice:', err)
    }
  }

  private loadFromDisk(): void {
    if (this.isLoaded) return
    try {
      if (fs.existsSync(this.memoryFile)) {
        const raw = fs.readFileSync(this.memoryFile, 'utf8')
        const items: LongTermMemoryItem[] = JSON.parse(raw)
        if (Array.isArray(items)) {
          for (const item of items) {
            this.memories.set(item.id, item)
          }
        }
      }

      if (fs.existsSync(this.sessionIndexFile)) {
        const rawSessions = fs.readFileSync(this.sessionIndexFile, 'utf8')
        const sessions: SessionContextSnapshot[] = JSON.parse(rawSessions)
        if (Array.isArray(sessions)) {
          for (const s of sessions) {
            this.sessionSnapshots.set(s.sessionId, s)
          }
        }
      }

      this.isLoaded = true
    } catch (err) {
      console.warn('[LongTermMemory] Load error, initializing clean state:', err)
      this.isLoaded = true
    }
  }

  private saveToDisk(): void {
    try {
      const items = Array.from(this.memories.values())
      fs.writeFileSync(this.memoryFile, JSON.stringify(items, null, 2), 'utf8')

      const sessions = Array.from(this.sessionSnapshots.values())
      fs.writeFileSync(this.sessionIndexFile, JSON.stringify(sessions, null, 2), 'utf8')
    } catch (err) {
      console.warn('[LongTermMemory] Save to disk error:', err)
    }
  }

  private generateId(): string {
    return `ltm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * Stores a new memory item with semantic vector embedding and automatic deduplication
   */
  public async storeMemory(params: {
    userId: string
    content: string
    type?: MemoryType
    sessionId?: string
    taskId?: string
    agentRole?: string
    metadata?: Record<string, any>
    importance?: number
  }): Promise<LongTermMemoryItem> {
    const {
      userId,
      content,
      type = 'continuity_context',
      sessionId,
      taskId,
      agentRole,
      metadata = {},
      importance = 0.5
    } = params

    const cleanContent = content.trim()
    if (!cleanContent) {
      throw new Error('Memory content cannot be empty')
    }

    // 1. Check exact string match first
    const exact = this.findExactMatch(userId, cleanContent)
    if (exact) {
      exact.updatedAt = Date.now()
      exact.lastAccessed = Date.now()
      exact.accessCount++
      if (sessionId) exact.sessionId = sessionId
      if (taskId) exact.taskId = taskId
      if (agentRole) exact.agentRole = agentRole
      exact.metadata = { ...exact.metadata, ...metadata }
      exact.importance = Math.max(exact.importance, importance)
      this.saveToDisk()
      return exact
    }

    // 2. Generate dense vector embedding
    let embedding: number[]
    try {
      embedding = await EmbeddingsEngine.embedQuery(cleanContent)
    } catch (err) {
      console.warn('[LongTermMemory] GenAI Embedding fallback to TF-IDF:', err)
      embedding = EmbeddingsEngine.fallbackTfIdfVector(cleanContent)
    }

    // 3. Cosine semantic deduplication (> 0.94 similarity merges into existing item)
    const semanticDuplicate = this.findSemanticDuplicate(userId, embedding, 0.94)
    if (semanticDuplicate) {
      semanticDuplicate.updatedAt = Date.now()
      semanticDuplicate.lastAccessed = Date.now()
      semanticDuplicate.accessCount++
      if (sessionId) semanticDuplicate.sessionId = sessionId
      if (taskId) semanticDuplicate.taskId = taskId
      if (agentRole) semanticDuplicate.agentRole = agentRole
      semanticDuplicate.metadata = {
        ...semanticDuplicate.metadata,
        ...metadata,
        mergedVersionsCount: (semanticDuplicate.metadata.mergedVersionsCount || 1) + 1
      }
      this.saveToDisk()
      return semanticDuplicate
    }

    const now = Date.now()
    const memoryItem: LongTermMemoryItem = {
      id: this.generateId(),
      userId,
      sessionId,
      taskId,
      agentRole,
      type,
      content: cleanContent,
      embedding,
      metadata,
      importance: Math.max(0, Math.min(1, importance)),
      createdAt: now,
      updatedAt: now,
      lastAccessed: now,
      accessCount: 1
    }

    this.memories.set(memoryItem.id, memoryItem)
    this.saveToDisk()
    return memoryItem
  }

  /**
   * Semantically searches vector memory using hybrid scoring:
   * Score = (CosineSimilarity * 0.75) + (KeywordOverlap * 0.15) + (Importance * 0.05) + (Recency * 0.05)
   */
  public async retrieveContext(
    query: string,
    options: MemorySearchOptions = {}
  ): Promise<ScoredMemory[]> {
    const {
      userId,
      sessionId,
      taskId,
      agentRole,
      topK = 5,
      minSimilarity = 0.28,
      type,
      timeWindowMs,
      includeSystem = true
    } = options

    if (this.memories.size === 0) return []

    let queryVector: number[]
    try {
      queryVector = await EmbeddingsEngine.embedQuery(query)
    } catch (_e) {
      queryVector = EmbeddingsEngine.fallbackTfIdfVector(query)
    }

    const queryTokens = new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    )

    const now = Date.now()
    const candidates: ScoredMemory[] = []

    for (const mem of this.memories.values()) {
      // User partition check
      if (userId && mem.userId !== userId && (!includeSystem || mem.userId !== 'system')) {
        continue
      }
      // Session filter if provided
      if (sessionId && mem.sessionId && mem.sessionId !== sessionId) {
        continue
      }
      // Task filter if provided
      if (taskId && mem.taskId && mem.taskId !== taskId) {
        continue
      }
      // Agent role filter if provided
      if (agentRole && mem.agentRole && mem.agentRole !== agentRole) {
        continue
      }
      // Type filter
      if (type && mem.type !== type) {
        continue
      }
      // Time window check
      if (timeWindowMs && now - mem.updatedAt > timeWindowMs) {
        continue
      }

      // 1. Vector Cosine Similarity
      const vectorSim = EmbeddingsEngine.cosineSimilarity(queryVector, mem.embedding)

      // 2. Keyword BM25 / token overlap
      let keywordScore = 0
      if (queryTokens.size > 0) {
        const memTokens = mem.content.toLowerCase().split(/\s+/)
        let overlap = 0
        for (const qt of queryTokens) {
          if (memTokens.some((mt) => mt.includes(qt))) {
            overlap++
          }
        }
        keywordScore = overlap / queryTokens.size
      }

      // 3. Recency & Half-life decay (30 days half-life)
      const ageHours = (now - mem.lastAccessed) / (1000 * 60 * 60)
      const recencyBoost = Math.max(0, 1 - ageHours / 720) * 0.05
      const importanceBoost = (mem.importance || 0.5) * 0.05

      // 4. Hybrid weighted final score
      const hybridScore = vectorSim * 0.75 + keywordScore * 0.15 + importanceBoost + recencyBoost

      if (vectorSim >= minSimilarity || hybridScore >= minSimilarity) {
        candidates.push({
          ...mem,
          similarity: Number(vectorSim.toFixed(4)),
          keywordScore: Number(keywordScore.toFixed(4)),
          hybridScore: Number(hybridScore.toFixed(4))
        })
      }
    }

    // Sort descending by hybrid score
    candidates.sort((a, b) => (b.hybridScore ?? b.similarity) - (a.hybridScore ?? a.similarity))
    const results = candidates.slice(0, topK)

    // Touch accessed memories
    if (results.length > 0) {
      for (const r of results) {
        const item = this.memories.get(r.id)
        if (item) {
          item.lastAccessed = now
          item.accessCount++
        }
      }
      this.saveToDisk()
    }

    return results
  }

  /**
   * Formats a rich continuity context prompt for LLM generation & Agent reasoning
   */
  public async getContinuityPrompt(query: string, userId?: string): Promise<string> {
    const memories = await this.retrieveContext(query, { userId, topK: 4, minSimilarity: 0.3 })
    if (memories.length === 0) return ''

    const lines = memories.map((m, idx) => {
      const typeTag = m.type ? `[${m.type.toUpperCase()}]` : ''
      const roleTag = m.agentRole ? `(Source: ${m.agentRole})` : ''
      return `${idx + 1}. ${typeTag}${roleTag} ${m.content}`
    })

    return `\n[LONG-TERM VECTOR MEMORY & CROSS-SESSION CONTINUITY]:\n${lines.join('\n')}`
  }

  /**
   * Persists high-level session context snapshot for cross-session continuity
   */
  public async persistSessionContext(params: {
    sessionId: string
    userId: string
    summary: string
    keyEntities?: string[]
    topics?: string[]
  }): Promise<SessionContextSnapshot> {
    const { sessionId, userId, summary, keyEntities = [], topics = [] } = params
    const snapshot: SessionContextSnapshot = {
      sessionId,
      userId,
      summary,
      keyEntities,
      topics,
      updatedAt: Date.now()
    }

    this.sessionSnapshots.set(sessionId, snapshot)

    // Also index the summary as a searchable vector memory item
    await this.storeMemory({
      userId,
      sessionId,
      type: 'session_context',
      content: `Session ${sessionId} Context: ${summary}. Topics: ${topics.join(', ')}`,
      importance: 0.75,
      metadata: { keyEntities, topics }
    })

    this.saveToDisk()
    return snapshot
  }

  /**
   * Retrieves context tailored for a specialized agent role before task execution
   */
  public async retrieveContextForAgent(
    agentRole: string,
    taskDescription: string,
    userId: string = 'default_user'
  ): Promise<string> {
    const memories = await this.retrieveContext(taskDescription, {
      userId,
      topK: 3,
      minSimilarity: 0.32
    })

    if (memories.length === 0) return ''

    const formatted = memories.map((m) => `- [${m.type}] ${m.content}`).join('\n')

    return `\n[RELEVANT CROSS-TASK CONTEXT FOR ${agentRole.toUpperCase()}]:\n${formatted}\n`
  }

  /**
   * Records proven task solutions to strengthen future problem-solving
   */
  public async recordTaskSuccess(
    taskId: string,
    goal: string,
    solution: string,
    userId: string = 'default_user',
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const content = `Task Goal: "${goal}". Proven Solution/Outcome: ${solution}`
    await this.storeMemory({
      userId,
      taskId,
      type: 'task_outcome',
      content,
      importance: 0.85,
      metadata: { ...metadata, goal }
    })
  }

  /**
   * Records failure recovery patterns to avoid repeating execution errors
   */
  public async recordTaskFailureRecovery(
    taskId: string,
    error: string,
    recoverySolution: string,
    userId: string = 'default_user'
  ): Promise<void> {
    const content = `Error Encountered: "${error}". Successful Recovery Strategy: ${recoverySolution}`
    await this.storeMemory({
      userId,
      taskId,
      type: 'error_recovery',
      content,
      importance: 0.9,
      metadata: { error, recoverySolution }
    })
  }

  /**
   * Extracts and stores explicit agent learnings
   */
  public async extractAndStoreLearnings(params: {
    userId: string
    taskId?: string
    agentRole: string
    topic: string
    keyLearning: string
  }): Promise<LongTermMemoryItem> {
    const content = `[Learned Pattern by ${params.agentRole}] Topic: "${params.topic}". Insight: ${params.keyLearning}`
    return await this.storeMemory({
      userId: params.userId,
      taskId: params.taskId,
      agentRole: params.agentRole,
      type: 'code_pattern',
      content,
      importance: 0.8,
      metadata: { topic: params.topic }
    })
  }

  private findExactMatch(userId: string, content: string): LongTermMemoryItem | undefined {
    const norm = content.trim().toLowerCase()
    for (const mem of this.memories.values()) {
      if (mem.userId === userId && mem.content.trim().toLowerCase() === norm) {
        return mem
      }
    }
    return undefined
  }

  private findSemanticDuplicate(
    userId: string,
    embedding: number[],
    threshold: number = 0.94
  ): LongTermMemoryItem | undefined {
    for (const mem of this.memories.values()) {
      if (mem.userId === userId) {
        const sim = EmbeddingsEngine.cosineSimilarity(embedding, mem.embedding)
        if (sim >= threshold) {
          return mem
        }
      }
    }
    return undefined
  }

  public listMemories(userId?: string, limit: number = 50): LongTermMemoryItem[] {
    const all = Array.from(this.memories.values())
    const filtered = userId ? all.filter((m) => m.userId === userId || m.userId === 'system') : all
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
  }

  public getSessionSnapshot(sessionId: string): SessionContextSnapshot | undefined {
    return this.sessionSnapshots.get(sessionId)
  }

  public deleteMemory(id: string): boolean {
    const deleted = this.memories.delete(id)
    if (deleted) {
      this.saveToDisk()
    }
    return deleted
  }

  public clearUserMemories(userId: string): number {
    let count = 0
    for (const [id, mem] of this.memories.entries()) {
      if (mem.userId === userId) {
        this.memories.delete(id)
        count++
      }
    }
    if (count > 0) {
      this.saveToDisk()
    }
    return count
  }
}

export const longTermMemory = LongTermMemoryService.getInstance()
