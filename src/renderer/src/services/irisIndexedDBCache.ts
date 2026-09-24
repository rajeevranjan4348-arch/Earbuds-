/**
 * IRIS-AI IndexedDB Local Caching & Offline Storage Engine
 *
 * Provides high-capacity, non-volatile local storage for:
 * 1. Complete chat sessions & conversation histories
 * 2. Active workspace context, documents, system memory & preferences
 * 3. Cached AI responses & offline semantic lookup
 * 4. Offline outbox queues for automatic syncing when internet is restored
 * 5. Local knowledge base for autonomous offline operation
 */

import { Message, ChatSession } from './chatHistoryService'

const DB_NAME = 'IRIS_AI_STORE_V1'
const DB_VERSION = 2

export interface CachedAiResponse {
  promptHash: string
  prompt: string
  response: string
  provider?: string
  timestamp: number
  contextSummary?: string
  hitCount: number
}

export interface OfflineQueueItem {
  id: string
  sessionId: string
  userMessage: Message
  offlineAiResponse?: Message
  timestamp: number
  status: 'pending_sync' | 'synced'
}

export interface StorageStats {
  sessionCount: number
  messageCount: number
  cachedResponsesCount: number
  outboxPending: number
  isOffline: boolean
  lastSyncTimestamp: number
  storageEstimate?: {
    usageBytes: number
    quotaBytes: number
    usageFormatted: string
    quotaFormatted: string
  }
}

class IrisIndexedDBCache {
  private db: IDBDatabase | null = null
  private initPromise: Promise<IDBDatabase> | null = null
  private isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true
  private listeners: Set<(stats: StorageStats) => void> = new Set()
  private lastSyncTimestamp: number = Date.now()

  constructor() {
    if (typeof window !== 'undefined') {
      this.init().catch((err) => console.warn('[IndexedDB] Init warning:', err))
      this.setupNetworkListeners()
    }
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnlineState = true
      this.notifyListeners()
      window.dispatchEvent(
        new CustomEvent('iris:network-status', { detail: { online: true } })
      )
      this.processOfflineOutbox().catch(() => {})
    })

    window.addEventListener('offline', () => {
      this.isOnlineState = false
      this.notifyListeners()
      window.dispatchEvent(
        new CustomEvent('iris:network-status', { detail: { online: false } })
      )
    })
  }

  public isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : this.isOnlineState
  }

  /**
   * Initializes and opens IndexedDB with required Object Stores
   */
  public async init(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this environment'))
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 1. Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
          sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false })
          sessionStore.createIndex('userId', 'userId', { unique: false })
        }

        // 2. AI Response Cache store
        if (!db.objectStoreNames.contains('ai_response_cache')) {
          const aiStore = db.createObjectStore('ai_response_cache', { keyPath: 'promptHash' })
          aiStore.createIndex('timestamp', 'timestamp', { unique: false })
          aiStore.createIndex('prompt', 'prompt', { unique: false })
        }

        // 3. Context & Knowledge store
        if (!db.objectStoreNames.contains('context_store')) {
          const contextStore = db.createObjectStore('context_store', { keyPath: 'id' })
          contextStore.createIndex('type', 'type', { unique: false })
          contextStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        // 4. Offline Outbox queue
        if (!db.objectStoreNames.contains('offline_outbox')) {
          const outboxStore = db.createObjectStore('offline_outbox', { keyPath: 'id' })
          outboxStore.createIndex('status', 'status', { unique: false })
          outboxStore.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'))
      }
    })

    return this.initPromise
  }

  // ==========================================
  // 1. SESSIONS & CONVERSATION STORAGE
  // ==========================================

  public async saveSession(session: ChatSession, userId: string = 'local_user'): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readwrite')
      const store = tx.objectStore('sessions')

      const record = {
        ...session,
        userId: userId || 'local_user',
        cachedLocallyAt: Date.now()
      }

      await new Promise<void>((resolve, reject) => {
        const req = store.put(record)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })

      this.notifyListeners()
    } catch (err) {
      console.warn('[IndexedDB] saveSession failed:', err)
    }
  }

  public async saveSessionsBatch(
    sessions: ChatSession[],
    userId: string = 'local_user'
  ): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readwrite')
      const store = tx.objectStore('sessions')

      for (const session of sessions) {
        store.put({
          ...session,
          userId: userId || 'local_user',
          cachedLocallyAt: Date.now()
        })
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      this.notifyListeners()
    } catch (err) {
      console.warn('[IndexedDB] saveSessionsBatch error:', err)
    }
  }

  public async getSessions(userId?: string): Promise<ChatSession[]> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readonly')
      const store = tx.objectStore('sessions')

      return new Promise<ChatSession[]>((resolve) => {
        const req = store.getAll()
        req.onsuccess = () => {
          let results = (req.result || []) as (ChatSession & { userId?: string })[]
          if (userId) {
            results = results.filter((s) => !s.userId || s.userId === userId || s.userId === 'local_user')
          }
          results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          resolve(results)
        }
        req.onerror = () => resolve([])
      })
    } catch (err) {
      console.warn('[IndexedDB] getSessions failed:', err)
      return []
    }
  }

  public async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readonly')
      const store = tx.objectStore('sessions')

      return new Promise<ChatSession | null>((resolve) => {
        const req = store.get(sessionId)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => resolve(null)
      })
    } catch (err) {
      return null
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readwrite')
      const store = tx.objectStore('sessions')

      await new Promise<void>((resolve, reject) => {
        const req = store.delete(sessionId)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })

      this.notifyListeners()
    } catch (err) {
      console.warn('[IndexedDB] deleteSession failed:', err)
    }
  }

  public async clearAllSessions(): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('sessions', 'readwrite')
      tx.objectStore('sessions').clear()
      this.notifyListeners()
    } catch (_e) {}
  }

  // ==========================================
  // 2. CONTEXT & KNOWLEDGE STORE
  // ==========================================

  public async saveContext(id: string, type: string, payload: any): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('context_store', 'readwrite')
      const store = tx.objectStore('context_store')

      await new Promise<void>((resolve, reject) => {
        const req = store.put({
          id,
          type,
          data: payload,
          updatedAt: Date.now()
        })
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch (err) {
      console.warn('[IndexedDB] saveContext error:', err)
    }
  }

  public async getContext(id: string): Promise<any> {
    try {
      const db = await this.init()
      const tx = db.transaction('context_store', 'readonly')
      const store = tx.objectStore('context_store')

      return new Promise<any>((resolve) => {
        const req = store.get(id)
        req.onsuccess = () => resolve(req.result?.data || null)
        req.onerror = () => resolve(null)
      })
    } catch (err) {
      return null
    }
  }

  public async getContextByType(type: string): Promise<any[]> {
    try {
      const db = await this.init()
      const tx = db.transaction('context_store', 'readonly')
      const store = tx.objectStore('context_store')
      const index = store.index('type')

      return new Promise<any[]>((resolve) => {
        const req = index.getAll(type)
        req.onsuccess = () => resolve((req.result || []).map((r: any) => r.data))
        req.onerror = () => resolve([])
      })
    } catch (err) {
      return []
    }
  }

  // ==========================================
  // 3. AI RESPONSE CACHING & OFFLINE MATCHING
  // ==========================================

  private hashPrompt(prompt: string): string {
    const clean = prompt.trim().toLowerCase()
    let hash = 0
    for (let i = 0; i < clean.length; i++) {
      const char = clean.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0
    }
    return `hash_${Math.abs(hash)}_${clean.slice(0, 32).replace(/[^a-z0-9]/gi, '_')}`
  }

  public async cacheAiResponse(
    prompt: string,
    response: string,
    provider: string = 'gemini',
    contextSummary?: string
  ): Promise<void> {
    if (!prompt || !response || response.length < 5) return
    try {
      const db = await this.init()
      const tx = db.transaction('ai_response_cache', 'readwrite')
      const store = tx.objectStore('ai_response_cache')
      const hash = this.hashPrompt(prompt)

      const existingReq = store.get(hash)
      existingReq.onsuccess = () => {
        const existing = existingReq.result as CachedAiResponse | undefined
        const record: CachedAiResponse = {
          promptHash: hash,
          prompt: prompt.trim(),
          response,
          provider,
          timestamp: Date.now(),
          contextSummary,
          hitCount: (existing?.hitCount || 0) + 1
        }
        store.put(record)
      }
    } catch (err) {
      console.warn('[IndexedDB] cacheAiResponse failed:', err)
    }
  }

  public async findCachedResponse(prompt: string): Promise<string | null> {
    try {
      const db = await this.init()
      const tx = db.transaction('ai_response_cache', 'readonly')
      const store = tx.objectStore('ai_response_cache')
      const hash = this.hashPrompt(prompt)

      return new Promise<string | null>((resolve) => {
        const req = store.get(hash)
        req.onsuccess = () => {
          if (req.result && req.result.response) {
            resolve(req.result.response)
          } else {
            resolve(null)
          }
        }
        req.onerror = () => resolve(null)
      })
    } catch (err) {
      return null
    }
  }

  /**
   * Fuzzy / keyword search on cached responses for offline inference
   */
  public async searchCachedResponses(
    queryText: string
  ): Promise<Array<{ prompt: string; response: string; score: number }>> {
    try {
      const db = await this.init()
      const tx = db.transaction('ai_response_cache', 'readonly')
      const store = tx.objectStore('ai_response_cache')

      return new Promise((resolve) => {
        const req = store.getAll()
        req.onsuccess = () => {
          const records = (req.result || []) as CachedAiResponse[]
          const terms = queryText
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 2)
          if (terms.length === 0) return resolve([])

          const matches: Array<{ prompt: string; response: string; score: number }> = []

          for (const item of records) {
            const promptLower = item.prompt.toLowerCase()
            let score = 0
            for (const term of terms) {
              if (promptLower.includes(term)) score += 1
            }
            if (score > 0) {
              matches.push({
                prompt: item.prompt,
                response: item.response,
                score
              })
            }
          }

          matches.sort((a, b) => b.score - a.score)
          resolve(matches.slice(0, 3))
        }
        req.onerror = () => resolve([])
      })
    } catch (err) {
      return []
    }
  }

  // ==========================================
  // 4. OFFLINE OUTBOX & SYNC
  // ==========================================

  public async enqueueOfflineMessage(
    sessionId: string,
    userMessage: Message,
    offlineAiResponse?: Message
  ): Promise<void> {
    try {
      const db = await this.init()
      const tx = db.transaction('offline_outbox', 'readwrite')
      const store = tx.objectStore('offline_outbox')

      const item: OfflineQueueItem = {
        id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        userMessage,
        offlineAiResponse,
        timestamp: Date.now(),
        status: 'pending_sync'
      }

      await new Promise<void>((resolve, reject) => {
        const req = store.put(item)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })

      this.notifyListeners()
    } catch (err) {
      console.warn('[IndexedDB] enqueueOfflineMessage error:', err)
    }
  }

  public async getOfflineOutbox(): Promise<OfflineQueueItem[]> {
    try {
      const db = await this.init()
      const tx = db.transaction('offline_outbox', 'readonly')
      const store = tx.objectStore('offline_outbox')

      return new Promise<OfflineQueueItem[]>((resolve) => {
        const req = store.getAll()
        req.onsuccess = () => {
          const items = (req.result || []) as OfflineQueueItem[]
          resolve(items.filter((i) => i.status === 'pending_sync'))
        }
        req.onerror = () => resolve([])
      })
    } catch (err) {
      return []
    }
  }

  public async processOfflineOutbox(): Promise<number> {
    if (!this.isOnline()) return 0
    try {
      const items = await this.getOfflineOutbox()
      if (items.length === 0) return 0

      const db = await this.init()
      const tx = db.transaction('offline_outbox', 'readwrite')
      const store = tx.objectStore('offline_outbox')

      for (const item of items) {
        item.status = 'synced'
        store.put(item)
      }

      this.lastSyncTimestamp = Date.now()
      this.notifyListeners()

      window.dispatchEvent(
        new CustomEvent('iris:offline-outbox-synced', {
          detail: { count: items.length, timestamp: this.lastSyncTimestamp }
        })
      )

      return items.length
    } catch (err) {
      console.warn('[IndexedDB] Outbox processing error:', err)
      return 0
    }
  }

  // ==========================================
  // 5. STORAGE METRICS & SUBSCRIBERS
  // ==========================================

  public async getStats(): Promise<StorageStats> {
    try {
      const db = await this.init()
      const sessionCount = await this.countStore('sessions')
      const cachedResponsesCount = await this.countStore('ai_response_cache')
      const outbox = await this.getOfflineOutbox()

      // Calculate total messages
      const sessions = await this.getSessions()
      const messageCount = sessions.reduce((acc, s) => acc + (s.messages?.length || 0), 0)

      let storageEstimate: any = undefined
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate()
          const usage = estimate.usage || 0
          const quota = estimate.quota || 0
          storageEstimate = {
            usageBytes: usage,
            quotaBytes: quota,
            usageFormatted: this.formatBytes(usage),
            quotaFormatted: this.formatBytes(quota)
          }
        } catch (_e) {}
      }

      return {
        sessionCount,
        messageCount,
        cachedResponsesCount,
        outboxPending: outbox.length,
        isOffline: !this.isOnline(),
        lastSyncTimestamp: this.lastSyncTimestamp,
        storageEstimate
      }
    } catch (err) {
      return {
        sessionCount: 0,
        messageCount: 0,
        cachedResponsesCount: 0,
        outboxPending: 0,
        isOffline: !this.isOnline(),
        lastSyncTimestamp: this.lastSyncTimestamp
      }
    }
  }

  private countStore(storeName: string): Promise<number> {
    return new Promise((resolve) => {
      if (!this.db) return resolve(0)
      try {
        const tx = this.db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const req = store.count()
        req.onsuccess = () => resolve(req.result || 0)
        req.onerror = () => resolve(0)
      } catch (_e) {
        resolve(0)
      }
    })
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  public subscribe(listener: (stats: StorageStats) => void): () => void {
    this.listeners.add(listener)
    this.getStats().then((s) => listener(s))
    return () => this.listeners.delete(listener)
  }

  private notifyListeners() {
    this.getStats().then((stats) => {
      this.listeners.forEach((l) => {
        try {
          l(stats)
        } catch (_e) {}
      })
    })
  }
}

export const irisIndexedDBCache = new IrisIndexedDBCache()
