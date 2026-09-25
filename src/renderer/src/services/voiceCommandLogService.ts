/**
 * VoiceCommandLogService - Persistent, Searchable Ledger for Voice Commands and AI Responses
 *
 * Tracks every voice command parsed, planned, or executed by IRIS-AI, along with
 * the assistant's spoken responses, actions taken, and execution latency.
 * Supports real-time subscribers, query filters, search, and export.
 */

export interface VoiceCommandLogEntry {
  id: string
  command: string
  intent: string
  status: 'completed' | 'executing' | 'failed' | 'confirmed' | 'needs_clarification'
  spokenResponse?: string
  displayText?: string
  actionExecuted?: string
  targetTab?: string
  executionTimeMs?: number
  timestamp: number
  category?: 'YOUTUBE' | 'NAVIGATION' | 'SYSTEM' | 'WORKSPACE' | 'OPTICS' | 'SEARCH' | 'AI_CHAT'
  toolsUsed?: string[]
  metadata?: Record<string, any>
}

export type VoiceLogListener = (entries: VoiceCommandLogEntry[]) => void

const STORAGE_KEY = 'iris_voice_command_history_v2'
const MAX_ENTRIES = 250

/**
 * High-fidelity initial seed entries reflecting real IRIS-AI operations
 */
const SEED_ENTRIES: VoiceCommandLogEntry[] = [
  {
    id: 'vcmd_seed_01',
    command: 'Show YouTube channel analytics for IRIS Intelligence Labs',
    intent: 'YOUTUBE_ANALYTICS',
    status: 'completed',
    spokenResponse:
      'Opening YouTube Studio analytics. Displaying views, retention, and subscriber growth curves.',
    displayText:
      'Navigated to YouTube Studio > Channel Analytics. Loading Recharts performance metrics.',
    actionExecuted: 'Switched to YouTube Studio Analytics view with multi-channel metrics.',
    targetTab: 'YOUTUBE',
    executionTimeMs: 340,
    timestamp: Date.now() - 1000 * 60 * 12, // 12 mins ago
    category: 'YOUTUBE',
    toolsUsed: ['youtube_get_analytics', 'switch_tab']
  },
  {
    id: 'vcmd_seed_02',
    command: 'Generate a new short-form video script on Gemini 2.5 agent orchestration',
    intent: 'YOUTUBE_GENERATE_VIDEO',
    status: 'completed',
    spokenResponse:
      'Drafted 60-second Short script with high-curiosity hook and architecture diagram visual cues.',
    displayText: 'Script generated in Production Queue for review. Estimated duration: 58 seconds.',
    actionExecuted: 'Dispatched automated video creation job in YouTube Pipeline.',
    targetTab: 'YOUTUBE',
    executionTimeMs: 1420,
    timestamp: Date.now() - 1000 * 60 * 45, // 45 mins ago
    category: 'YOUTUBE',
    toolsUsed: ['gemini_content_generate', 'pipeline_queue_job']
  },
  {
    id: 'vcmd_seed_03',
    command: 'Switch to system telemetry and show neural core load',
    intent: 'NAVIGATION_TELEMETRY',
    status: 'completed',
    spokenResponse: 'Switching to Command Telemetry. Neural core load is nominal at 22%.',
    displayText: 'Displaying live hardware utilization and memory telemetry visualizer.',
    actionExecuted: 'Switched view to DASHBOARD and activated Telemetry widget.',
    targetTab: 'DASHBOARD',
    executionTimeMs: 210,
    timestamp: Date.now() - 1000 * 60 * 110, // ~2 hours ago
    category: 'SYSTEM',
    toolsUsed: ['switch_tab', 'telemetry_stream']
  },
  {
    id: 'vcmd_seed_04',
    command: 'Search web for latest Google Maps Platform real-time navigation release',
    intent: 'WEB_SEARCH',
    status: 'completed',
    spokenResponse:
      'Retrieved 4 release updates detailing route optimization and eco-friendly routing APIs.',
    displayText: 'Indexed official Google Maps Platform release changelog from March 2026.',
    actionExecuted: 'Executed search query and synthesized key API capabilities.',
    targetTab: 'CHAT',
    executionTimeMs: 890,
    timestamp: Date.now() - 1000 * 60 * 240, // ~4 hours ago
    category: 'SEARCH',
    toolsUsed: ['search_web', 'summarize_query']
  },
  {
    id: 'vcmd_seed_05',
    command: 'Sync connected Android phone contacts and check notifications',
    intent: 'PHONE_SYNC',
    status: 'completed',
    spokenResponse:
      'Phone connected via local ADB bridge. 2 unread SMS messages and battery at 88%.',
    displayText: 'Mobile daemon synchronized. Verified 148 contacts and telemetry status.',
    actionExecuted: 'Queried mobile companion daemon and refreshed phone view.',
    targetTab: 'PHONE',
    executionTimeMs: 620,
    timestamp: Date.now() - 1000 * 60 * 360, // ~6 hours ago
    category: 'WORKSPACE',
    toolsUsed: ['adb_query_status', 'phone_sync']
  },
  {
    id: 'vcmd_seed_06',
    command: 'Inspect screen for visual anomalies or code errors',
    intent: 'OPTICS_INSPECTION',
    status: 'completed',
    spokenResponse: 'Screen capture analyzed. No fatal syntax issues detected in editor buffer.',
    displayText: 'Optics pipeline processed 1080p frame buffer. Clean layout verified.',
    actionExecuted: 'Captured screen buffer and passed to multi-modal vision interpreter.',
    targetTab: 'DASHBOARD',
    executionTimeMs: 1150,
    timestamp: Date.now() - 1000 * 60 * 720, // ~12 hours ago
    category: 'OPTICS',
    toolsUsed: ['screen_capture', 'gemini_vision_analyze']
  }
]

class VoiceCommandLogService {
  private entries: VoiceCommandLogEntry[] = []
  private listeners: Set<VoiceLogListener> = new Set()
  private initialized: boolean = false

  constructor() {
    this.init()
  }

  private init() {
    if (this.initialized) return
    this.initialized = true

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.entries = parsed
          } else {
            this.entries = [...SEED_ENTRIES]
            this.persist()
          }
        } else {
          this.entries = [...SEED_ENTRIES]
          this.persist()
        }
      } catch (err) {
        console.warn('[VoiceCommandLogService] Failed to load history from localStorage:', err)
        this.entries = [...SEED_ENTRIES]
      }

      // Listen to voice toast and processed events to capture dynamic commands
      window.addEventListener(
        'iris:voice-command-processed',
        this.handleCommandProcessedEvent as EventListener
      )
    } else {
      this.entries = [...SEED_ENTRIES]
    }
  }

  private handleCommandProcessedEvent = (e: CustomEvent<any>) => {
    if (!e.detail) return
    const detail = e.detail
    // If it's already logged, don't duplicate
    if (this.entries.some((entry) => entry.id === detail.id)) return

    this.addEntry({
      id: detail.id,
      command: detail.command || 'Spoken Command',
      intent: detail.intent || 'VOICE_COMMAND',
      status: detail.status === 'failed' ? 'failed' : 'completed',
      spokenResponse: detail.response,
      displayText: detail.actionExecuted || detail.response,
      actionExecuted: detail.actionExecuted,
      targetTab: detail.targetTab,
      timestamp: detail.timestamp || Date.now()
    })
  }

  private persist() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(0, MAX_ENTRIES)))
      } catch (err) {
        console.warn('[VoiceCommandLogService] Failed to persist history:', err)
      }
    }
  }

  private notify() {
    const list = [...this.entries]
    this.listeners.forEach((fn) => {
      try {
        fn(list)
      } catch (err) {
        console.error('[VoiceCommandLogService] Listener error:', err)
      }
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris:voice-log-updated', {
          detail: { count: this.entries.length, latest: this.entries[0] }
        })
      )
    }
  }

  private categorizeIntent(intent: string, command: string): VoiceCommandLogEntry['category'] {
    const lower = `${intent} ${command}`.toLowerCase()
    if (
      lower.includes('youtube') ||
      lower.includes('video') ||
      lower.includes('script') ||
      lower.includes('channel')
    ) {
      return 'YOUTUBE'
    }
    if (
      lower.includes('nav') ||
      lower.includes('tab') ||
      lower.includes('switch to') ||
      lower.includes('go to')
    ) {
      return 'NAVIGATION'
    }
    if (
      lower.includes('system') ||
      lower.includes('telemetry') ||
      lower.includes('volume') ||
      lower.includes('mute') ||
      lower.includes('core')
    ) {
      return 'SYSTEM'
    }
    if (
      lower.includes('search') ||
      lower.includes('web') ||
      lower.includes('google') ||
      lower.includes('find on internet')
    ) {
      return 'SEARCH'
    }
    if (
      lower.includes('vision') ||
      lower.includes('camera') ||
      lower.includes('screen') ||
      lower.includes('optics') ||
      lower.includes('inspect')
    ) {
      return 'OPTICS'
    }
    if (
      lower.includes('workspace') ||
      lower.includes('doc') ||
      lower.includes('file') ||
      lower.includes('phone') ||
      lower.includes('adb')
    ) {
      return 'WORKSPACE'
    }
    return 'AI_CHAT'
  }

  /**
   * Appends or updates a voice command entry in the history ledger
   */
  public addEntry(
    item: Omit<VoiceCommandLogEntry, 'id' | 'timestamp' | 'category'> & {
      id?: string
      timestamp?: number
      category?: VoiceCommandLogEntry['category']
    }
  ): VoiceCommandLogEntry {
    const category = item.category || this.categorizeIntent(item.intent, item.command)
    const newEntry: VoiceCommandLogEntry = {
      id: item.id || `vcmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: item.timestamp || Date.now(),
      category,
      ...item
    }

    // Insert at front (newest first)
    // If id exists, replace it
    const existingIdx = this.entries.findIndex((e) => e.id === newEntry.id)
    if (existingIdx >= 0) {
      this.entries[existingIdx] = { ...this.entries[existingIdx], ...newEntry }
    } else {
      this.entries.unshift(newEntry)
      if (this.entries.length > MAX_ENTRIES) {
        this.entries = this.entries.slice(0, MAX_ENTRIES)
      }
    }

    this.persist()
    this.notify()
    return newEntry
  }

  /**
   * Returns current list of entries
   */
  public getEntries(): VoiceCommandLogEntry[] {
    return [...this.entries]
  }

  /**
   * Subscribes to changes in voice command entries
   */
  public subscribe(listener: VoiceLogListener): () => void {
    this.listeners.add(listener)
    listener([...this.entries])
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Deletes a single entry by id
   */
  public deleteEntry(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id)
    this.persist()
    this.notify()
  }

  /**
   * Clears all entries and resets with clean state
   */
  public clearAll(): void {
    this.entries = []
    this.persist()
    this.notify()
  }

  /**
   * Resets with default seed entries
   */
  public resetToDefaultSeeds(): void {
    this.entries = [...SEED_ENTRIES]
    this.persist()
    this.notify()
  }

  /**
   * Search and filter entries
   */
  public query({
    search = '',
    category = 'ALL',
    status = 'ALL'
  }: {
    search?: string
    category?: string
    status?: string
  }): VoiceCommandLogEntry[] {
    const q = search.trim().toLowerCase()
    return this.entries.filter((entry) => {
      if (category !== 'ALL' && entry.category !== category) {
        return false
      }
      if (status !== 'ALL' && entry.status !== status) {
        return false
      }
      if (!q) return true

      return (
        entry.command.toLowerCase().includes(q) ||
        (entry.spokenResponse && entry.spokenResponse.toLowerCase().includes(q)) ||
        (entry.displayText && entry.displayText.toLowerCase().includes(q)) ||
        (entry.actionExecuted && entry.actionExecuted.toLowerCase().includes(q)) ||
        entry.intent.toLowerCase().includes(q)
      )
    })
  }

  /**
   * Exports entries as formatted JSON or Markdown string
   */
  public exportLog(format: 'json' | 'markdown' = 'markdown'): string {
    if (format === 'json') {
      return JSON.stringify(this.entries, null, 2)
    }

    let md = `# IRIS-AI Voice Command & Task Ledger\n`
    md += `*Exported on ${new Date().toLocaleString()}* · Total Entries: ${this.entries.length}\n\n---\n\n`

    this.entries.forEach((entry, i) => {
      md += `### ${i + 1}. "${entry.command}"\n`
      md += `- **Date/Time**: ${new Date(entry.timestamp).toLocaleString()}\n`
      md += `- **Intent**: \`${entry.intent}\` (${entry.category || 'GENERAL'})\n`
      md += `- **Status**: **${entry.status.toUpperCase()}**\n`
      if (entry.actionExecuted) {
        md += `- **Action**: ${entry.actionExecuted}\n`
      }
      if (entry.spokenResponse) {
        md += `- **Response**: ${entry.spokenResponse}\n`
      }
      if (entry.executionTimeMs) {
        md += `- **Latency**: ${entry.executionTimeMs}ms\n`
      }
      md += `\n`
    })

    return md
  }
}

export const voiceCommandLogService = new VoiceCommandLogService()
