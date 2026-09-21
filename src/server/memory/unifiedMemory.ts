/**
 * Unified Memory Architecture (Letta + Agent Memory + OpenViking + Ruflo Shared Blackboard)
 * Maintains stateful memory blocks, hierarchical namespaces, and relevance decay
 * without creating a separate competing system. Sanitizes PII via PrivacyAlign.
 */

import { privacyAlign } from '../security/privacyAlign'
import type { MemoryBlock, UnifiedMemoryEntry, MemoryQueryOptions } from './types'

export class UnifiedMemoryEngine {
  // In-memory persistent state per user
  private memoryStores = new Map<string, UnifiedMemoryEntry[]>()
  private memoryBlocks = new Map<string, Map<string, MemoryBlock>>()

  /**
   * Initializes default Letta memory blocks for a user
   */
  public getUserBlocks(userId: string): MemoryBlock[] {
    if (!this.memoryBlocks.has(userId)) {
      const defaultBlocks = new Map<string, MemoryBlock>()

      defaultBlocks.set('persona', {
        id: 'block_persona',
        label: 'persona',
        name: 'Persona',
        content:
          'IRIS: Advanced voice-first neural AI assistant and device operating layer with Android control, web search, and multi-agent problem solving.',
        limitTokens: 400,
        updatedAt: new Date().toISOString()
      })

      defaultBlocks.set('human', {
        id: 'block_human',
        label: 'human',
        name: 'User Profile',
        content: 'Active user of IRIS AI operating system.',
        limitTokens: 600,
        updatedAt: new Date().toISOString()
      })

      defaultBlocks.set('working_context', {
        id: 'block_working_context',
        label: 'working_context',
        name: 'Working Context',
        content: 'System ready. No active background long-running multi-step task.',
        limitTokens: 800,
        updatedAt: new Date().toISOString()
      })

      this.memoryBlocks.set(userId, defaultBlocks)
    }

    return Array.from(this.memoryBlocks.get(userId)!.values())
  }

  /**
   * Updates a Letta memory block
   */
  public updateBlock(
    userId: string,
    label: 'persona' | 'human' | 'working_context' | 'archival',
    content: string
  ): MemoryBlock {
    this.getUserBlocks(userId) // Ensure init
    const blocks = this.memoryBlocks.get(userId)!
    const sanitized = privacyAlign.sanitize(content).redactedText

    const block: MemoryBlock = {
      id: `block_${label}`,
      label,
      name: label.replace('_', ' ').toUpperCase(),
      content: sanitized,
      updatedAt: new Date().toISOString()
    }
    blocks.set(label, block)
    return block
  }

  /**
   * Adds an entry to hierarchical long-term memory (OpenViking + Agent Memory)
   */
  public addMemory(
    userId: string,
    content: string,
    options: {
      namespace?: string
      category?: 'core' | 'fact' | 'instruction' | 'preference' | 'experience'
      importance?: number
      tags?: string[]
      metadata?: Record<string, any>
    } = {}
  ): UnifiedMemoryEntry {
    const sanitized = privacyAlign.sanitize(content).redactedText

    const entry: UnifiedMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      namespace: options.namespace || 'default',
      category: options.category || 'fact',
      content: sanitized,
      importance: Math.max(1, Math.min(5, options.importance ?? 3)),
      accessCount: 0,
      lastAccessedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      tags: options.tags || [],
      metadata: options.metadata || {}
    }

    if (!this.memoryStores.has(userId)) {
      this.memoryStores.set(userId, [])
    }

    const store = this.memoryStores.get(userId)!
    // Deduplicate exact or near-identical content
    const existingIndex = store.findIndex(
      (m) => m.content.toLowerCase() === sanitized.toLowerCase()
    )
    if (existingIndex >= 0) {
      store[existingIndex].importance = Math.max(store[existingIndex].importance, entry.importance)
      store[existingIndex].lastAccessedAt = new Date().toISOString()
      return store[existingIndex]
    }

    store.unshift(entry)
    return entry
  }

  /**
   * Retrieves memories matching query with relevance, recency, and decay scoring
   */
  public queryMemories(
    userId: string,
    query: string,
    options: MemoryQueryOptions = {}
  ): UnifiedMemoryEntry[] {
    const store = this.memoryStores.get(userId) || []
    if (store.length === 0) return []

    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    const now = Date.now()
    const limit = options.limit || 5

    const scored = store
      .filter((entry) => {
        if (options.namespace && entry.namespace !== options.namespace) return false
        if (options.category && entry.category !== options.category) return false
        if (options.minImportance && entry.importance < options.minImportance) return false
        return true
      })
      .map((entry) => {
        const text = `${entry.content} ${entry.tags.join(' ')} ${entry.namespace}`.toLowerCase()

        // Lexical token match score
        let tokenScore = 0
        for (const token of queryTokens) {
          if (text.includes(token)) tokenScore += 2
        }

        // Time decay (Agent Memory): older memories decay slightly unless reinforced
        const daysOld = (now - new Date(entry.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24)
        const decayFactor = Math.max(0.5, 1 - daysOld * 0.05)

        // Final score: token match + importance * decay
        const totalScore =
          tokenScore * 1.5 + entry.importance * decayFactor + (entry.accessCount > 2 ? 1 : 0)

        return { entry, score: totalScore }
      })

    scored.sort((a, b) => b.score - a.score)

    const results = scored.slice(0, limit).map((s) => {
      // Touch memory access count
      s.entry.accessCount++
      s.entry.lastAccessedAt = new Date().toISOString()
      return s.entry
    })

    return results
  }

  /**
   * Builds prompt context block combining Letta memory blocks and OpenViking knowledge
   */
  public buildContextBlock(userId: string, query: string): string {
    const blocks = this.getUserBlocks(userId)
    const persona = blocks.find((b) => b.label === 'persona')?.content || ''
    const human = blocks.find((b) => b.label === 'human')?.content || ''
    const working = blocks.find((b) => b.label === 'working_context')?.content || ''

    const relevantMemories = this.queryMemories(userId, query, { limit: 4 })

    let context = `\n[LETTA STATEFUL MEMORY BLOCKS]:\n- Persona: ${persona}\n- User Profile: ${human}\n- Working Task Context: ${working}`

    if (relevantMemories.length > 0) {
      context += `\n\n[RETRIEVED ARCHIVAL MEMORIES (OpenViking/AgentMemory)]:\n`
      context += relevantMemories
        .map((m, i) => `${i + 1}. [${m.namespace}/${m.category}] ${m.content}`)
        .join('\n')
    }

    return context
  }

  /**
   * Clears memories for a user
   */
  public clearUserMemories(userId: string): void {
    this.memoryStores.delete(userId)
    this.memoryBlocks.delete(userId)
  }
}

export const unifiedMemory = new UnifiedMemoryEngine()
