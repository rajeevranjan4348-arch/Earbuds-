/**
 * Mem0 Memory Context Provider & React Hook
 * Integrates Mem0 persistent memory layer for long-term user interaction memory,
 * semantic memory retrieval, automatic interaction extraction, and context-aware LLM prompt enrichment.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { memoryService, MemoryItem, MemoryAddOptions } from '../services/memoryService'
import { firebaseAuthService } from '../services/firebaseAuth'

export interface Mem0Stats {
  totalMemories: number
  explicitCount: number
  automaticCount: number
  categoriesCount: number
  categoryCounts: Record<string, number>
}

export interface PromptEnrichmentResult {
  systemInstruction: string
  contextText: string
  relevantMemories: MemoryItem[]
  memoryCount: number
}

export interface Mem0ContextType {
  memories: MemoryItem[]
  categories: string[]
  activeUserId: string
  isLoading: boolean
  isExtracting: boolean
  lastExtractedMemory: MemoryItem | null
  stats: Mem0Stats

  // Memory Mutation & Actions
  addMemory: (text: string, options?: MemoryAddOptions) => Promise<MemoryItem>
  remember: (statement: string) => Promise<MemoryItem>
  forget: (targetOrId: string) => Promise<boolean>
  deleteMemory: (id: string) => Promise<boolean>
  updateMemory: (id: string, newText: string) => Promise<boolean>
  clearAllMemories: () => Promise<boolean>

  // Search & Filtering
  searchMemories: (query: string, limit?: number) => Promise<MemoryItem[]>
  filterByCategory: (category: string) => MemoryItem[]

  // Long-Term Interaction & Automatic Context Extraction
  recordInteraction: (userText: string, modelText?: string) => Promise<MemoryItem[]>

  // Context-Aware Prompt Synthesis
  getContextForPrompt: (query: string) => Promise<string>
  enrichPrompt: (
    userPrompt: string,
    baseSystemInstruction?: string
  ) => Promise<PromptEnrichmentResult>

  // Import / Export
  exportMemoriesAsJson: () => string
  importMemoriesFromJson: (jsonStr: string) => Promise<number>

  // Force Refresh
  refresh: () => void
}

const Mem0Context = createContext<Mem0ContextType | null>(null)

export interface Mem0ProviderProps {
  children: React.ReactNode
  autoExtract?: boolean
}

export const Mem0Provider: React.FC<Mem0ProviderProps> = ({ children, autoExtract = true }) => {
  const [activeUserId, setActiveUserId] = useState<string>(() => firebaseAuthService.getUserId())
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isExtracting, setIsExtracting] = useState<boolean>(false)
  const [lastExtractedMemory, setLastExtractedMemory] = useState<MemoryItem | null>(null)

  // Sync with MemoryService & Firebase Auth
  const refresh = useCallback(() => {
    const currentUid = firebaseAuthService.getUserId()
    setActiveUserId(currentUid)
    const list = memoryService.getAllMemories(currentUid)
    setMemories(list)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const unsubMemory = memoryService.subscribe((updatedList) => {
      setMemories(updatedList)
      setIsLoading(false)
    })

    const unsubAuth = firebaseAuthService.subscribe((user) => {
      setActiveUserId(user.uid)
      const list = memoryService.getAllMemories(user.uid)
      setMemories(list)
    })

    return () => {
      unsubMemory()
      unsubAuth()
    }
  }, [refresh])

  // Extract dynamic categories list
  const categories = useMemo(() => {
    const cats = new Set<string>()
    memories.forEach((m) => {
      if (m.category && m.category.trim()) {
        cats.add(m.category.trim().toLowerCase())
      }
    })
    return Array.from(cats).sort()
  }, [memories])

  // Calculate memory metrics and distribution
  const stats = useMemo<Mem0Stats>(() => {
    let explicit = 0
    let automatic = 0
    const catMap: Record<string, number> = {}

    memories.forEach((m) => {
      if (m.source === 'explicit') explicit++
      else automatic++

      const cat = (m.category || 'general').toLowerCase()
      catMap[cat] = (catMap[cat] || 0) + 1
    })

    return {
      totalMemories: memories.length,
      explicitCount: explicit,
      automaticCount: automatic,
      categoriesCount: Object.keys(catMap).length,
      categoryCounts: catMap
    }
  }, [memories])

  // Direct explicit memory addition
  const addMemory = useCallback(
    async (text: string, options?: MemoryAddOptions): Promise<MemoryItem> => {
      const item = await memoryService.addMemory(text, activeUserId, options)
      refresh()
      return item
    },
    [activeUserId, refresh]
  )

  // Natural language "Remember that..." statement
  const remember = useCallback(
    async (statement: string): Promise<MemoryItem> => {
      const clean = statement
        .replace(/^(please\s+)?(remember\s+(that\s+)?|note\s+(that\s+)?)/i, '')
        .trim()
      const item = await memoryService.addMemory(clean || statement, activeUserId, {
        source: 'explicit'
      })
      refresh()
      return item
    },
    [activeUserId, refresh]
  )

  // Forget by target keyword or ID
  const forget = useCallback(
    async (targetOrId: string): Promise<boolean> => {
      // First try deleting by exact ID
      const exactMatch = memories.find((m) => m.id === targetOrId)
      if (exactMatch) {
        const ok = await memoryService.deleteMemory(targetOrId, activeUserId)
        refresh()
        return ok
      }

      // If text query, find closest matching memory
      const results = await memoryService.searchMemories(targetOrId, activeUserId, 3)
      if (results.length > 0) {
        const ok = await memoryService.deleteMemory(results[0].id, activeUserId)
        refresh()
        return ok
      }

      return false
    },
    [activeUserId, memories, refresh]
  )

  const deleteMemory = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await memoryService.deleteMemory(id, activeUserId)
      refresh()
      return ok
    },
    [activeUserId, refresh]
  )

  const updateMemory = useCallback(
    async (id: string, newText: string): Promise<boolean> => {
      const ok = await memoryService.updateMemory(id, newText, activeUserId)
      refresh()
      return ok
    },
    [activeUserId, refresh]
  )

  const clearAllMemories = useCallback(async (): Promise<boolean> => {
    const ok = await memoryService.clearAllMemories(activeUserId)
    refresh()
    return ok
  }, [activeUserId, refresh])

  const searchMemories = useCallback(
    async (query: string, limit = 5): Promise<MemoryItem[]> => {
      return memoryService.searchMemories(query, activeUserId, limit)
    },
    [activeUserId]
  )

  const filterByCategory = useCallback(
    (category: string): MemoryItem[] => {
      const catLower = category.toLowerCase()
      return memories.filter((m) => (m.category || 'general').toLowerCase() === catLower)
    },
    [memories]
  )

  // Automatically extracts long-term facts, preferences, or project settings from user dialogue
  const recordInteraction = useCallback(
    async (userText: string, _modelText?: string): Promise<MemoryItem[]> => {
      if (!autoExtract || !userText || userText.trim().length < 4) return []

      setIsExtracting(true)
      try {
        const extracted = await memoryService.processAutomaticMemoryExtraction(
          userText,
          'user',
          activeUserId
        )

        if (extracted.length > 0) {
          setLastExtractedMemory(extracted[0])
          refresh()
        }

        return extracted
      } catch (err) {
        console.warn('[Mem0Context] Automatic interaction extraction notice:', err)
        return []
      } finally {
        setIsExtracting(false)
      }
    },
    [activeUserId, autoExtract, refresh]
  )

  // Builds formatted context text for LLM injection
  const getContextForPrompt = useCallback(
    async (query: string): Promise<string> => {
      return memoryService.buildContextPrompt(query, activeUserId)
    },
    [activeUserId]
  )

  // Context-aware Prompt Synthesizer
  const enrichPrompt = useCallback(
    async (userPrompt: string, baseSystemInstruction = ''): Promise<PromptEnrichmentResult> => {
      const relevant = await memoryService.searchMemories(userPrompt, activeUserId, 5)
      const contextText = await memoryService.buildContextPrompt(userPrompt, activeUserId)

      let systemInstruction = baseSystemInstruction
      if (contextText) {
        systemInstruction = `${baseSystemInstruction}\n\n${contextText}\n\n[MEM0 CONTEXT-AWARE PERSONALIZATION INSTRUCTION]:\nPersonalize your responses seamlessly using the long-term user memories and preferences above. Do not contradict stored preferences unless the user explicitly updates them.`
      }

      return {
        systemInstruction: systemInstruction.trim(),
        contextText,
        relevantMemories: relevant,
        memoryCount: relevant.length
      }
    },
    [activeUserId]
  )

  const exportMemoriesAsJson = useCallback((): string => {
    return JSON.stringify(
      {
        version: '1.0',
        userId: activeUserId,
        exportedAt: new Date().toISOString(),
        count: memories.length,
        memories
      },
      null,
      2
    )
  }, [activeUserId, memories])

  const importMemoriesFromJson = useCallback(
    async (jsonStr: string): Promise<number> => {
      try {
        const parsed = JSON.parse(jsonStr)
        const itemsToImport = Array.isArray(parsed) ? parsed : parsed.memories
        if (!Array.isArray(itemsToImport)) return 0

        let count = 0
        for (const rawItem of itemsToImport) {
          const text = rawItem.memory || rawItem.text || ''
          if (typeof text === 'string' && text.trim()) {
            await memoryService.addMemory(text.trim(), activeUserId, {
              category: rawItem.category,
              source: rawItem.source || 'explicit',
              metadata: rawItem.metadata
            })
            count++
          }
        }
        refresh()
        return count
      } catch (err) {
        console.error('[Mem0Context] Failed to import memories JSON:', err)
        return 0
      }
    },
    [activeUserId, refresh]
  )

  const value = useMemo<Mem0ContextType>(
    () => ({
      memories,
      categories,
      activeUserId,
      isLoading,
      isExtracting,
      lastExtractedMemory,
      stats,
      addMemory,
      remember,
      forget,
      deleteMemory,
      updateMemory,
      clearAllMemories,
      searchMemories,
      filterByCategory,
      recordInteraction,
      getContextForPrompt,
      enrichPrompt,
      exportMemoriesAsJson,
      importMemoriesFromJson,
      refresh
    }),
    [
      memories,
      categories,
      activeUserId,
      isLoading,
      isExtracting,
      lastExtractedMemory,
      stats,
      addMemory,
      remember,
      forget,
      deleteMemory,
      updateMemory,
      clearAllMemories,
      searchMemories,
      filterByCategory,
      recordInteraction,
      getContextForPrompt,
      enrichPrompt,
      exportMemoriesAsJson,
      importMemoriesFromJson,
      refresh
    ]
  )

  return <Mem0Context.Provider value={value}>{children}</Mem0Context.Provider>
}

/**
 * useMem0 Hook
 * Accesses Mem0 long-term memory context or creates a standalone fallback
 */
export function useMem0(): Mem0ContextType {
  const context = useContext(Mem0Context)
  if (!context) {
    // Graceful fallback for components rendered outside Mem0Provider
    const activeUserId = firebaseAuthService.getUserId()
    const memories = memoryService.getAllMemories(activeUserId)

    return {
      memories,
      categories: [],
      activeUserId,
      isLoading: false,
      isExtracting: false,
      lastExtractedMemory: null,
      stats: {
        totalMemories: memories.length,
        explicitCount: memories.filter((m) => m.source === 'explicit').length,
        automaticCount: memories.filter((m) => m.source !== 'explicit').length,
        categoriesCount: 0,
        categoryCounts: {}
      },
      addMemory: (text, opts) => memoryService.addMemory(text, activeUserId, opts),
      remember: (stmt) => memoryService.addMemory(stmt, activeUserId, { source: 'explicit' }),
      forget: async (target) => {
        const res = await memoryService.searchMemories(target, activeUserId, 1)
        if (res.length > 0) {
          return memoryService.deleteMemory(res[0].id, activeUserId)
        }
        return false
      },
      deleteMemory: (id) => memoryService.deleteMemory(id, activeUserId),
      updateMemory: (id, text) => memoryService.updateMemory(id, text, activeUserId),
      clearAllMemories: () => memoryService.clearAllMemories(activeUserId),
      searchMemories: (q, limit) => memoryService.searchMemories(q, activeUserId, limit),
      filterByCategory: (cat) => memories.filter((m) => m.category === cat),
      recordInteraction: (u) =>
        memoryService.processAutomaticMemoryExtraction(u, 'user', activeUserId),
      getContextForPrompt: (q) => memoryService.buildContextPrompt(q, activeUserId),
      enrichPrompt: async (prompt, base) => {
        const relevant = await memoryService.searchMemories(prompt, activeUserId, 5)
        const contextText = await memoryService.buildContextPrompt(prompt, activeUserId)
        const systemInstruction = contextText
          ? `${base || ''}\n\n${contextText}\n\n[MEM0 CONTEXT-AWARE PERSONALIZATION INSTRUCTION]:\nPersonalize your responses seamlessly using the stored user memories above.`
          : base || ''
        return {
          systemInstruction: systemInstruction.trim(),
          contextText,
          relevantMemories: relevant,
          memoryCount: relevant.length
        }
      },
      exportMemoriesAsJson: () => JSON.stringify(memories, null, 2),
      importMemoriesFromJson: async () => 0,
      refresh: () => {}
    }
  }
  return context
}
