/**
 * Unified Memory Architecture Types
 * Unifies Letta (Memory Blocks) + Agent Memory (Importance & Decay) + OpenViking (Hierarchical Context) + Mem0
 */

export interface MemoryBlock {
  id: string
  label: 'persona' | 'human' | 'working_context' | 'archival'
  name: string
  content: string
  limitTokens?: number
  updatedAt: string
}

export interface UnifiedMemoryEntry {
  id: string
  userId: string
  namespace: string // OpenViking hierarchical namespace, e.g. "default", "projects/iris", "preferences"
  category: 'core' | 'fact' | 'instruction' | 'preference' | 'experience'
  content: string
  importance: number // 1 to 5 scale (Agent Memory)
  accessCount: number
  lastAccessedAt: string
  createdAt: string
  tags: string[]
  metadata?: Record<string, any>
}

export interface MemoryQueryOptions {
  namespace?: string
  category?: string
  minImportance?: number
  limit?: number
  decayThresholdDays?: number
}
