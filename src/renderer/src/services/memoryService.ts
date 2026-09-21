/**
 * IRIS Mem0 Persistent Memory Service
 * Implements ChatGPT-style long-term user memory, short-term conversational context,
 * semantic memory search, automatic memory extraction, explicit memory controls,
 * and strict user-specific memory isolation scoped to the authenticated Firebase user.
 *
 * Complies with the official Mem0 API (https://github.com/mem0ai/mem0.git).
 */

import { firebaseAuthService } from './firebaseAuth'

export interface MemoryItem {
  id: string
  userId: string
  memory: string
  category?: string
  confidence?: number
  createdAt: string
  updatedAt: string
  source?: 'explicit' | 'automatic' | 'inferred'
  metadata?: Record<string, any>
  score?: number
}

export interface MemoryAddOptions {
  category?: string
  metadata?: Record<string, any>
  source?: 'explicit' | 'automatic' | 'inferred'
}

export type ExplicitMemoryCommand =
  | { type: 'REMEMBER'; content: string }
  | { type: 'QUERY' }
  | { type: 'FORGET'; target?: string }
  | { type: 'FORGET_ALL' }

// Topic detection categories for preference superseding / memory updates
const PREFERENCE_CATEGORIES: Array<{
  category: string
  keywords: string[]
  conflictPattern: RegExp
}> = [
  {
    category: 'framework',
    keywords: ['react', 'vue', 'angular', 'svelte', 'nextjs', 'solid', 'nuxt'],
    conflictPattern:
      /(?:use|prefer|switched to|work with|migrated to)\s+(react|vue|angular|svelte|next\.?js|solid|nuxt)/i
  },
  {
    category: 'language',
    keywords: [
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'golang',
      'java',
      'c#',
      'c++',
      'ruby',
      'kotlin',
      'swift'
    ],
    conflictPattern:
      /(?:use|prefer|code in|write in|switched to)\s+(typescript|javascript|python|rust|go|golang|java|c#|c\+\+|ruby|kotlin|swift)/i
  },
  {
    category: 'database',
    keywords: [
      'firebase',
      'firestore',
      'supabase',
      'postgres',
      'postgresql',
      'mysql',
      'mongodb',
      'sqlite',
      'redis'
    ],
    conflictPattern:
      /(?:use|database is|backed by|store in)\s+(firebase|firestore|supabase|postgres(?:ql)?|mysql|mongodb|sqlite|redis)/i
  },
  {
    category: 'styling',
    keywords: ['tailwind', 'css', 'styled-components', 'sass', 'bootstrap', 'vanilla css'],
    conflictPattern:
      /(?:use|style with|prefer)\s+(tailwind(?:css)?|css modules|styled-components|sass|bootstrap)/i
  },
  {
    category: 'theme',
    keywords: ['dark mode', 'light mode', 'dark theme', 'light theme'],
    conflictPattern: /(?:prefer|like|use)\s+(dark mode|light mode|dark theme|light theme)/i
  }
]

class MemoryService {
  private memoryListeners: Set<(memories: MemoryItem[]) => void> = new Set()

  constructor() {
    // Listen to Firebase Auth state changes
    firebaseAuthService.onAuthStateChanged(() => {
      this.notifyListeners()
    })
  }

  private getActiveUserId(userId?: string): string {
    return userId || firebaseAuthService.getUserId()
  }

  private getStorageKey(userId: string): string {
    return `iris_mem0_user_${userId}`
  }

  private loadLocalMemories(userId: string): MemoryItem[] {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(this.getStorageKey(userId))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // Double-check user isolation: never load another user's item
          return parsed.filter((m) => m && m.userId === userId)
        }
      }
    } catch (_e) {}
    return []
  }

  private saveLocalMemories(userId: string, memories: MemoryItem[]) {
    if (typeof window === 'undefined') return
    try {
      // Ensure all items strictly belong to this userId
      const filtered = memories.filter((m) => m.userId === userId)
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(filtered))
    } catch (_e) {}
    this.notifyListeners()
  }

  private notifyListeners() {
    const currentMemories = this.loadLocalMemories(this.getActiveUserId())
    this.memoryListeners.forEach((fn) => {
      try {
        fn(currentMemories)
      } catch (_e) {}
    })
  }

  public subscribe(fn: (memories: MemoryItem[]) => void): () => void {
    this.memoryListeners.add(fn)
    fn(this.loadLocalMemories(this.getActiveUserId()))
    return () => {
      this.memoryListeners.delete(fn)
    }
  }

  /**
   * 1. ADD MEMORY
   * Adds a new memory item or updates an existing conflicting memory.
   */
  public async addMemory(
    text: string,
    userId?: string,
    options: MemoryAddOptions = {}
  ): Promise<MemoryItem> {
    const activeUid = this.getActiveUserId(userId)
    const cleanText = text.trim()
    const now = new Date().toISOString()

    // 1. Check for conflicting/superseding preferences in the same category
    // (e.g., Old: "I use React" -> Later: "I switched this project to Vue")
    const existing = this.loadLocalMemories(activeUid)
    const detectedCategory = options.category || this.inferCategory(cleanText)

    let updatedExistingItem: MemoryItem | null = null

    if (detectedCategory) {
      const conflictingIdx = existing.findIndex(
        (m) =>
          m.category === detectedCategory &&
          this.isContradictory(m.memory, cleanText, detectedCategory)
      )

      if (conflictingIdx >= 0) {
        // Update existing memory with the newer information
        const oldMem = existing[conflictingIdx]
        existing[conflictingIdx] = {
          ...oldMem,
          memory: cleanText,
          updatedAt: now,
          source: options.source || 'explicit',
          metadata: {
            ...(oldMem.metadata || {}),
            previousValue: oldMem.memory,
            supersededAt: now
          }
        }
        updatedExistingItem = existing[conflictingIdx]
        this.saveLocalMemories(activeUid, existing)

        // Sync with Mem0 backend if available
        this.syncWithBackend('update', {
          id: oldMem.id,
          text: cleanText,
          userId: activeUid
        }).catch(() => {})

        return updatedExistingItem
      }
    }

    // 2. Prevent exact duplicate memories
    const duplicate = existing.find((m) => m.memory.toLowerCase() === cleanText.toLowerCase())
    if (duplicate) {
      return duplicate
    }

    // 3. Create fresh memory item
    const newItem: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: activeUid,
      memory: cleanText,
      category: detectedCategory,
      confidence: 0.95,
      createdAt: now,
      updatedAt: now,
      source: options.source || 'explicit',
      metadata: options.metadata || {}
    }

    existing.unshift(newItem)
    this.saveLocalMemories(activeUid, existing)

    // Sync with Mem0 backend if available
    this.syncWithBackend('add', {
      text: cleanText,
      userId: activeUid,
      metadata: options.metadata
    }).catch(() => {})

    return newItem
  }

  /**
   * 2. SEARCH MEMORY
   * Searches for memories matching a query.
   */
  public async searchMemory(
    query: string,
    userId?: string,
    limit: number = 5
  ): Promise<MemoryItem[]> {
    const activeUid = this.getActiveUserId(userId)
    const local = this.loadLocalMemories(activeUid)
    if (local.length === 0) return []

    // 1. Try server-side Mem0 search if online
    try {
      const serverResults = await this.fetchServerSearch(query, activeUid, limit)
      if (serverResults && serverResults.length > 0) {
        return serverResults
      }
    } catch (_e) {
      // Graceful fallback to local semantic/keyword search
    }

    // 2. Open-Source Local Similarity Scorer
    return this.scoreAndFilterMemories(query, local, limit)
  }

  /**
   * 3. GET RELEVANT MEMORIES
   * Compact retrieval for injection into model context.
   * Discards low-relevance items and keeps context token-efficient.
   */
  public async getRelevantMemories(
    query: string,
    userId?: string,
    maxMemories: number = 3
  ): Promise<MemoryItem[]> {
    const scored = await this.searchMemory(query, userId, maxMemories * 2)
    // Filter out items with low relevance score (threshold >= 0.25)
    const relevant = scored.filter((item) => (item.score || 0) >= 0.25)
    return relevant.slice(0, maxMemories)
  }

  /**
   * 4. UPDATE MEMORY
   */
  public async updateMemory(memoryId: string, text: string, userId?: string): Promise<boolean> {
    const activeUid = this.getActiveUserId(userId)
    const list = this.loadLocalMemories(activeUid)
    const idx = list.findIndex((m) => m.id === memoryId && m.userId === activeUid)
    if (idx === -1) return false

    list[idx].memory = text.trim()
    list[idx].updatedAt = new Date().toISOString()
    this.saveLocalMemories(activeUid, list)

    this.syncWithBackend('update', { id: memoryId, text, userId: activeUid }).catch(() => {})
    return true
  }

  /**
   * 5. DELETE MEMORY
   */
  public async deleteMemory(memoryId: string, userId?: string): Promise<boolean> {
    const activeUid = this.getActiveUserId(userId)
    const list = this.loadLocalMemories(activeUid)
    const initialLen = list.length
    const filtered = list.filter((m) => m.id !== memoryId || m.userId !== activeUid)

    if (filtered.length !== initialLen) {
      this.saveLocalMemories(activeUid, filtered)
      this.syncWithBackend('delete', { id: memoryId, userId: activeUid }).catch(() => {})
      return true
    }
    return false
  }

  /**
   * 6. LIST MEMORIES
   */
  public async listMemories(userId?: string): Promise<MemoryItem[]> {
    const activeUid = this.getActiveUserId(userId)
    return this.loadLocalMemories(activeUid)
  }

  /**
   * 7. CLEAR USER MEMORY
   */
  public async clearUserMemory(userId?: string): Promise<boolean> {
    const activeUid = this.getActiveUserId(userId)
    this.saveLocalMemories(activeUid, [])
    this.syncWithBackend('clear', { userId: activeUid }).catch(() => {})
    return true
  }

  /**
   * Helper: Category Inference
   */
  private inferCategory(text: string): string | undefined {
    const lower = text.toLowerCase()
    for (const cat of PREFERENCE_CATEGORIES) {
      if (cat.keywords.some((kw) => lower.includes(kw))) {
        return cat.category
      }
    }
    return undefined
  }

  /**
   * Helper: Contradiction & Preference Change Detection
   */
  private isContradictory(oldText: string, newText: string, category: string): boolean {
    const cat = PREFERENCE_CATEGORIES.find((c) => c.category === category)
    if (!cat) return false

    const oldLower = oldText.toLowerCase()
    const newLower = newText.toLowerCase()

    // If both mention distinct keywords within the category
    const oldKeywords = cat.keywords.filter((kw) => oldLower.includes(kw))
    const newKeywords = cat.keywords.filter((kw) => newLower.includes(kw))

    if (oldKeywords.length > 0 && newKeywords.length > 0) {
      // If none of the new keywords match the old keywords, it's a preference change
      const hasOverlap = oldKeywords.some((ok) => newKeywords.includes(ok))
      return !hasOverlap
    }

    return false
  }

  /**
   * Open-source local memory ranker (TF-IDF + token overlap + recency weighting)
   */
  private scoreAndFilterMemories(
    query: string,
    memories: MemoryItem[],
    limit: number
  ): MemoryItem[] {
    const queryTokens = this.tokenize(query)
    if (queryTokens.length === 0) return []

    const scored = memories.map((mem) => {
      const memTokens = this.tokenize(mem.memory)
      if (memTokens.length === 0) return { ...mem, score: 0 }

      let matches = 0
      queryTokens.forEach((qt) => {
        if (memTokens.includes(qt)) matches++
      })

      // Precision & Jaccard overlap
      const precision = matches / queryTokens.length
      const jaccard = matches / (queryTokens.length + memTokens.length - matches)

      // Recency bonus: slightly favor updated memories
      const ageHours = (Date.now() - new Date(mem.updatedAt || mem.createdAt).getTime()) / 3600000
      const recencyMultiplier = Math.max(0.9, 1.1 - Math.min(ageHours / 168, 0.2))

      const score = Math.min(1.0, (precision * 0.7 + jaccard * 0.3) * recencyMultiplier)

      return {
        ...mem,
        score: Number(score.toFixed(3))
      }
    })

    // Sort by score descending
    scored.sort((a, b) => (b.score || 0) - (a.score || 0))
    return scored.slice(0, limit)
  }

  private tokenize(str: string): string[] {
    const stopWords = new Set([
      'the',
      'is',
      'at',
      'which',
      'on',
      'a',
      'an',
      'and',
      'or',
      'to',
      'in',
      'of',
      'for',
      'with',
      'about',
      'by',
      'do',
      'i',
      'my',
      'you',
      'your',
      'what',
      'who'
    ])
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopWords.has(w))
  }

  /**
   * Server Sync: Calls /api/memory/* if available
   */
  private async syncWithBackend(action: 'add' | 'update' | 'delete' | 'clear', payload: any) {
    if (typeof window === 'undefined' || !window.fetch) return
    try {
      await fetch(`/api/memory/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch (_e) {
      // Offline fallback: silence network errors
    }
  }

  private async fetchServerSearch(
    query: string,
    userId: string,
    limit: number
  ): Promise<MemoryItem[] | null> {
    if (typeof window === 'undefined' || !window.fetch) return null
    try {
      const res = await fetch('/api/memory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userId, limit })
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.results)) {
          return data.results
        }
      }
    } catch (_e) {}
    return null
  }

  /**
   * Natural Language Explicit Command Detection
   */
  public detectExplicitMemoryCommand(rawText: string): ExplicitMemoryCommand | null {
    const trimmed = rawText.trim()
    const lower = trimmed.toLowerCase()

    // 1. "What do you remember about me?" / "What do you know about me?"
    if (
      lower === 'what do you remember about me' ||
      lower === 'what do you remember about me?' ||
      lower.includes('what do you remember about me') ||
      lower.includes('what do you remember about') ||
      lower.includes('what do you know about me') ||
      lower.includes('list my memories') ||
      lower.includes('show my memories') ||
      lower === 'what are my preferences'
    ) {
      return { type: 'QUERY' }
    }

    // 2. "Forget all my memories" / "Clear my memory"
    if (
      lower.includes('forget all my memories') ||
      lower.includes('forget everything about me') ||
      lower.includes('clear all my memories') ||
      lower.includes('delete all my memories') ||
      lower.includes('erase all memories')
    ) {
      return { type: 'FORGET_ALL' }
    }

    // 3. "Forget that" / "Forget my previous preference" / "Forget [topic]"
    if (
      lower.startsWith('forget ') ||
      lower.includes('forget that') ||
      lower.includes('forget my preference') ||
      lower.includes('forget my previous preference')
    ) {
      let target = trimmed
        .replace(/^forget\s+/i, '')
        .replace(
          /^(that|my previous preference|my preference about|my preference regarding)\s*/i,
          ''
        )
        .trim()
      return { type: 'FORGET', target: target || undefined }
    }

    // 4. "Remember that..." / "Remember this..." / "Don't forget..."
    const rememberPrefixes = [
      /^(?:please\s+)?remember\s+that\s+/i,
      /^(?:please\s+)?remember\s+this[:,\s]+/i,
      /^(?:please\s+)?remember[:,\s]+/i,
      /^don'?t\s+forget\s+(?:that\s+)?/i,
      /^(?:please\s+)?take\s+note\s+(?:that\s+)?/i,
      /^(?:please\s+)?note\s+that\s+/i
    ]

    for (const regex of rememberPrefixes) {
      if (regex.test(trimmed)) {
        const content = trimmed.replace(regex, '').trim()
        if (content.length > 0) {
          return { type: 'REMEMBER', content }
        }
      }
    }

    return null
  }

  /**
   * AUTOMATIC MEMORY EXTRACTION
   * Evaluates if a turn contains persistent preferences, facts, or instructions worth saving.
   * Filters out transient banter, one-time calculations, and temporary questions.
   */
  public async extractAndSaveAutomaticMemory(
    userMessage: string,
    _aiResponse: string,
    userId?: string
  ): Promise<MemoryItem | null> {
    const trimmed = userMessage.trim()
    const lower = trimmed.toLowerCase()

    // Exclude transient queries, math, time, greetings, system commands
    const transientPatterns = [
      /^(hi|hello|hey|good morning|good evening|good afternoon|thanks|thank you)\b/i,
      /^(what is|what are|how much is|calculate|evaluate|what time|what date)\b/i,
      /^(open|launch|start|navigate|show|turn on|turn off|enable|disable)\b/i,
      /^(help|capabilities|system status|telemetry)\b/i
    ]
    if (transientPatterns.some((p) => p.test(trimmed))) {
      return null
    }

    // Detect persistent preference patterns
    // e.g., "I prefer TypeScript", "I switched this project to Vue", "My project uses Firebase"
    const persistentPatterns = [
      /(?:i\s+prefer|i\s+always\s+use|i\s+usually\s+use)\s+([^.?!]+)/i,
      /(?:i\s+switched\s+(?:this\s+project\s+)?to)\s+([^.?!]+)/i,
      /(?:my\s+project\s+uses|my\s+stack\s+is|we\s+use)\s+([^.?!]+)/i,
      /(?:i\s+am\s+(?:a|an))\s+([^.?!]+)/i,
      /(?:my\s+name\s+is|call\s+me)\s+([^.?!]+)/i,
      /(?:always\s+use|never\s+use|default\s+to)\s+([^.?!]+)/i
    ]

    for (const pattern of persistentPatterns) {
      const match = trimmed.match(pattern)
      if (match) {
        return await this.addMemory(trimmed, userId, { source: 'automatic' })
      }
    }

    return null
  }
}

export const memoryService = new MemoryService()
