import '../lib/safeJson'
// IRIS Browser Shim for Electron IPC and Neural Operating Layer Bridge
import { launch_app, get_installed_apps, resolve_app } from '../services/launcher'

import { agentOrchestrator } from '../../../main/agent/agent-orchestrator'
import { permissionManager } from '../../../main/agent/permission-manager'

interface SystemStats {
  cpu: string
  memory: {
    total: string
    free: string
    usedPercentage: string
  }
  temperature: number
  os: {
    type: string
    uptime: string
  }
  network: {
    tx: number
    rx: number
    latency: number
  }
}

interface NoteItem {
  filename: string
  title: string
  content: string
  createdAt: string
}

interface GalleryItem {
  filename: string
  displayName: string
  path: string
  url: string
  createdAt: string
  type?: 'image' | 'video' | 'audio' | 'document' | 'file'
  fileType?: string
  mimeType?: string
  size?: number
  contentSnippet?: string
}

const DEFAULT_NOTES: NoteItem[] = [
  {
    filename: 'iris-architecture.md',
    title: 'IRIS Architecture & Neural Core Protocols',
    content: `# IRIS AI Operating Layer v1.7\n\n### Core Directives\n1. **Continuous Telemetry**: Real-time environmental and computing metrics monitoring.\n2. **Vision Optics**: Neural frame ingestion from lens and display matrix.\n3. **Decentralized Vault**: Local encrypted storage for user configuration and inference parameters.\n\n### System State\n- **Neural Engine**: Active\n- **Telemetry Latency**: < 25ms\n- **Security Enclave**: Verified`,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    filename: 'workflow-automation.md',
    title: 'Autonomous Workspace Orchestration',
    content: `# Workspace Orchestration Specs\n\n- Automated context capture across terminal, browser, and design tooling.\n- Voice-first natural execution for cross-application task flows.\n- Standby state optimized for minimal memory footprint and instant wake triggers.`,
    createdAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    filename: 'device-sync-telemetry.md',
    title: 'Mobile Telemetry & Hardware Interop',
    content: `# Mobile & Peripheral Bridge\n\nADB connection over Wi-Fi allows hands-free remote device orchestration, notification mirroring, and optical feed relay.`,
    createdAt: new Date(Date.now() - 14400000).toISOString()
  }
]

const DEFAULT_GALLERY: GalleryItem[] = [
  {
    filename: 'quantum-core-matrix.png',
    displayName: 'Quantum Core Matrix',
    path: '/gallery/quantum-core-matrix.png',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
    type: 'image',
    fileType: 'PNG',
    mimeType: 'image/png',
    size: 2450000,
    createdAt: new Date(Date.now() - 1800000).toISOString()
  },
  {
    filename: 'neural-topology.png',
    displayName: 'Neural Synapse Topology',
    path: '/gallery/neural-topology.png',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    type: 'image',
    fileType: 'PNG',
    mimeType: 'image/png',
    size: 1820000,
    createdAt: new Date(Date.now() - 5400000).toISOString()
  },
  {
    filename: 'neural-synthesis-stream.mp4',
    displayName: 'Neural Synthesis Stream',
    path: '/gallery/neural-synthesis-stream.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    type: 'video',
    fileType: 'MP4',
    mimeType: 'video/mp4',
    size: 15800000,
    createdAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    filename: 'iris-ambient-soundscape.mp3',
    displayName: 'IRIS Ambient Soundscape',
    path: '/gallery/iris-ambient-soundscape.mp3',
    url: 'https://actions.google.com/sounds/v1/ambiences/humming_drone.ogg',
    type: 'audio',
    fileType: 'MP3',
    mimeType: 'audio/mp3',
    size: 4200000,
    createdAt: new Date(Date.now() - 9000000).toISOString()
  },
  {
    filename: 'neural-architecture-spec.pdf',
    displayName: 'IRIS Neural Architecture Spec v1.7.pdf',
    path: '/gallery/neural-architecture-spec.pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    type: 'document',
    fileType: 'PDF',
    mimeType: 'application/pdf',
    size: 890000,
    contentSnippet: 'IRIS Hardware & AI Specifications. Decentralized Local Neural Vault, GPU Acceleration, Multi-Agent Interop, Low-Latency Voice Engine.',
    createdAt: new Date(Date.now() - 10800000).toISOString()
  }
]

const DEFAULT_APPS = [
  { name: 'Google Chrome', id: 'chrome' },
  { name: 'Visual Studio Code', id: 'vscode' },
  { name: 'Terminal Console', id: 'terminal' },
  { name: 'Spotify Music', id: 'spotify' },
  { name: 'Discord Chat', id: 'discord' },
  { name: 'Obsidian Notes', id: 'obsidian' },
  { name: 'Docker Desktop', id: 'docker' },
  { name: 'Figma Design', id: 'figma' },
  { name: 'Steam Games', id: 'steam' },
  { name: 'System Settings', id: 'settings' }
]

const startTime = Date.now()

function getUptimeString(): string {
  const diffSec = Math.floor((Date.now() - startTime) / 1000) + 7200
  const hours = (diffSec / 3600).toFixed(1)
  return `${hours}h`
}

function getStoredNotes(): NoteItem[] {
  try {
    const raw = localStorage.getItem('iris_notes')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  localStorage.setItem('iris_notes', JSON.stringify(DEFAULT_NOTES))
  return DEFAULT_NOTES
}

function saveStoredNotes(notes: NoteItem[]) {
  localStorage.setItem('iris_notes', JSON.stringify(notes))
}

function getStoredGallery(): GalleryItem[] {
  try {
    const raw = localStorage.getItem('iris_gallery')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  localStorage.setItem('iris_gallery', JSON.stringify(DEFAULT_GALLERY))
  return DEFAULT_GALLERY
}

function saveStoredGallery(gallery: GalleryItem[]) {
  localStorage.setItem('iris_gallery', JSON.stringify(gallery))
}

// Initialize window.electron shim
const ipcListeners = new Map<string, Set<(...args: any[]) => void>>()

const DEFAULT_GLOBAL_SHORTCUTS = [
  {
    accelerator: 'CommandOrControl+Shift+V',
    action: 'toggle-voice-chat',
    description: 'Toggle Real-Time Voice Chat Modal',
    defaultKey: 'CommandOrControl+Shift+V',
    enabled: true
  },
  {
    accelerator: 'CommandOrControl+Shift+Space',
    action: 'toggle-voice-chat',
    description: 'Quick Voice Trigger',
    defaultKey: 'CommandOrControl+Shift+Space',
    enabled: true
  },
  {
    accelerator: 'CommandOrControl+Shift+O',
    action: 'toggle-os-workspace',
    description: 'Toggle IRIS Neural OS Workspace',
    defaultKey: 'CommandOrControl+Shift+O',
    enabled: true
  },
  {
    accelerator: 'CommandOrControl+Shift+M',
    action: 'toggle-mute',
    description: 'Toggle Microphone Mute / Unmute',
    defaultKey: 'CommandOrControl+Shift+M',
    enabled: true
  },
  {
    accelerator: 'CommandOrControl+Shift+X',
    action: 'stop-speech',
    description: 'Interrupt & Stop AI Speech Output',
    defaultKey: 'CommandOrControl+Shift+X',
    enabled: true
  }
]

let registeredWebShortcuts = [...DEFAULT_GLOBAL_SHORTCUTS]

const electronShim = {
  process: {
    platform:
      typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')
        ? 'darwin'
        : 'linux'
  },
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      console.log(`[IRIS IPC send] ${channel}`, args)
      if (channel === 'window-min') {
        console.log('[IRIS] Window minimized')
      } else if (channel === 'window-max') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {})
        } else {
          document.exitFullscreen().catch(() => {})
        }
      } else if (channel === 'window-close') {
        console.log('[IRIS] Window close requested')
      }
    },
    on: (channel: string, func: (...args: any[]) => void) => {
      if (!ipcListeners.has(channel)) {
        ipcListeners.set(channel, new Set())
      }
      ipcListeners.get(channel)!.add(func)
      return () => {
        ipcListeners.get(channel)?.delete(func)
      }
    },
    removeListener: (channel: string, func: (...args: any[]) => void) => {
      ipcListeners.get(channel)?.delete(func)
    },
    emit: (channel: string, ...args: any[]) => {
      ipcListeners.get(channel)?.forEach((fn) => {
        try {
          fn(...args)
        } catch (e) {
          console.error(`[IRIS IPC Listener Error on ${channel}]:`, e)
        }
      })
    },
    invoke: async (channel: string, ...args: any[]) => {
      console.log(`[IRIS IPC invoke] ${channel}`, args)

      switch (channel) {
        case 'get-global-shortcuts': {
          return registeredWebShortcuts
        }

        case 'register-global-shortcut': {
          const item = args[0]
          if (item?.accelerator) {
            registeredWebShortcuts = registeredWebShortcuts.filter(
              (s) => s.accelerator !== item.accelerator
            )
            registeredWebShortcuts.push(item)
          }
          return { success: true, shortcuts: registeredWebShortcuts }
        }

        case 'unregister-global-shortcut': {
          const accelerator = args[0]
          registeredWebShortcuts = registeredWebShortcuts.filter(
            (s) => s.accelerator !== accelerator
          )
          return { success: true, shortcuts: registeredWebShortcuts }
        }

        case 'reset-global-shortcuts': {
          registeredWebShortcuts = [...DEFAULT_GLOBAL_SHORTCUTS]
          return { success: true, shortcuts: registeredWebShortcuts }
        }
        case 'get-system-stats': {
          const t = Date.now() / 1000
          const cpuVal = (18 + Math.sin(t * 0.8) * 8 + Math.random() * 4).toFixed(1)
          const cpuNum = parseFloat(cpuVal)
          return {
            cpu: cpuVal,
            memory: {
              total: '16.0',
              free: (9.6 - (cpuNum / 100) * 2).toFixed(1),
              usedPercentage: (39.5 + cpuNum * 0.25).toFixed(1)
            },
            temperature: Math.round(41 + cpuNum * 0.3),
            os: {
              type: navigator.userAgent.toLowerCase().includes('mac') ? 'MACOS' : 'LINUX',
              uptime: getUptimeString()
            },
            network: {
              tx: Math.floor(Math.random() * 30 + 15),
              rx: Math.floor(Math.random() * 45 + 25),
              latency: Math.floor(Math.random() * 8 + 18)
            }
          } as SystemStats
        }

        case 'get-installed-apps': {
          return DEFAULT_APPS
        }

        case 'get-drives': {
          return [
            { Name: '/dev/nvme0n1p2 (Root)', FreeGB: '418.4 GB', TotalGB: '1024.0 GB' },
            { Name: '/dev/sda1 (Data Vault)', FreeGB: '1420.6 GB', TotalGB: '2048.0 GB' }
          ]
        }

        case 'open-app': {
          const appName = args[0] || 'Application'
          console.log(`[IRIS] Launching application: ${appName}`)
          return { success: true, app: appName }
        }

        case 'get-notes': {
          return getStoredNotes()
        }

        case 'save-note': {
          const payload = args[0] || {}
          const notes = getStoredNotes()
          const originalFilename = payload.originalFilename
          const title = payload.title || 'Untitled Note'
          const content = payload.content || ''
          const filename =
            originalFilename ||
            `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'note'}-${Date.now()}.md`

          let updated: NoteItem[]
          const existingIndex = notes.findIndex(
            (n) => n.filename === originalFilename || n.filename === filename
          )
          if (existingIndex >= 0) {
            updated = [...notes]
            updated[existingIndex] = {
              ...updated[existingIndex],
              title,
              content
            }
          } else {
            const newNote: NoteItem = {
              filename,
              title,
              content,
              createdAt: new Date().toISOString()
            }
            updated = [newNote, ...notes]
          }
          saveStoredNotes(updated)
          return updated
        }

        case 'delete-note': {
          const filename = args[0]
          const notes = getStoredNotes().filter((n) => n.filename !== filename)
          saveStoredNotes(notes)
          return { success: true }
        }

        case 'get-gallery': {
          return getStoredGallery()
        }

        case 'save-gallery-image': {
          const payload = args[0] || {}
          const gallery = getStoredGallery()
          const filename = payload.filename || `iris-vault-${Date.now()}`
          const newItem: GalleryItem = {
            filename,
            displayName: payload.displayName || payload.filename || `IRIS Vault File ${new Date().toLocaleTimeString()}`,
            path: payload.path || `/gallery/${filename}`,
            url:
              payload.url ||
              payload.data ||
              'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80',
            type: payload.type,
            fileType: payload.fileType,
            mimeType: payload.mimeType,
            size: payload.size,
            contentSnippet: payload.contentSnippet,
            createdAt: new Date().toISOString()
          }
          const updated = [newItem, ...gallery]
          saveStoredGallery(updated)
          return newItem
        }

        case 'clear-gallery': {
          saveStoredGallery([])
          return { success: true }
        }

        case 'delete-image': {
          const filename = args[0]
          const gallery = getStoredGallery().filter((g) => g.filename !== filename)
          saveStoredGallery(gallery)
          return { success: true }
        }

        case 'open-image-location': {
          console.log(`[IRIS] Locating image: ${args[0]}`)
          return { success: true }
        }

        case 'save-image-external': {
          console.log(`[IRIS] Exporting image: ${args[0]}`)
          return { success: true }
        }

        case 'adb-get-history': {
          try {
            const raw = localStorage.getItem('iris_adb_history')
            if (raw) return JSON.parse(raw)
          } catch (e) {}
          const def = [
            { ip: '192.168.1.104', port: '5555', lastConnected: new Date().toISOString() }
          ]
          localStorage.setItem('iris_adb_history', JSON.stringify(def))
          return def
        }

        case 'adb-connect': {
          const { ip, port } = args[0] || {}
          const history = [
            {
              ip: ip || '192.168.1.104',
              port: port || '5555',
              lastConnected: new Date().toISOString()
            }
          ]
          localStorage.setItem('iris_adb_history', JSON.stringify(history))
          return {
            success: true,
            message: `Connected to ${ip || '192.168.1.104'}:${port || '5555'}`
          }
        }

        case 'adb-disconnect': {
          return { success: true }
        }

        case 'adb-get-notifications': {
          return {
            success: true,
            data: [
              'IRIS Voice Sync: Telemetry linked via ADB port 5555',
              'Security Enclave: Biometric authorization active',
              'Task Orchestrator: 3 background routines completed'
            ]
          }
        }

        case 'adb-quick-action': {
          console.log(`[IRIS ADB Quick Action]`, args[0])
          return { success: true }
        }

        case 'adb-launch-app': {
          const payload = args[0] || {}
          const { packageName, launchActivity, name } = payload
          console.log(
            `[IRIS ADB Launch Intent] Executing: am start -n ${packageName}/${launchActivity || 'Main'} (${name})`
          )
          return {
            success: true,
            packageName,
            launchActivity,
            name,
            message: `Dispatched Android launch intent for ${packageName}`
          }
        }

        case 'adb-get-installed-packages': {
          // If connected via ADB, queries device packages
          return []
        }

        case 'launch-android-app': {
          const payload = args[0] || {}
          console.log(`[IRIS Android Launch Intent]`, payload)
          return {
            success: true,
            payload
          }
        }

        case 'adb-telemetry': {
          return {
            success: true,
            data: {
              model: 'Pixel 9 Pro (Simulated)',
              os: 'Android 15 (AP2A)',
              battery: {
                level: 94,
                isCharging: true,
                temp: '31.5'
              },
              storage: {
                used: '62.4 GB',
                total: '256 GB TOTAL',
                percent: 24
              }
            }
          }
        }

        case 'adb-screenshot': {
          const fallback =
            'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=600&q=80'
          return {
            success: true,
            image: fallback,
            url: fallback
          }
        }

        case 'accessibility-check-permission': {
          return {
            granted: true,
            status: 'READY'
          }
        }

        case 'accessibility-dispatch-action': {
          console.log(`[IRIS Accessibility Action]`, args[0])
          return { success: true }
        }

        case 'secure-get-keys': {
          try {
            const raw = localStorage.getItem('iris_api_keys')
            if (raw) return JSON.parse(raw)
          } catch (e) {}
          return {
            geminiKey: '',
            groqKey: '',
            hfKey: '',
            tavilyKey: ''
          }
        }

        case 'secure-save-keys': {
          const keys = args[0] || {}
          localStorage.setItem('iris_api_keys', JSON.stringify(keys))
          // Mirror credentials into the server runtime (browser mode has no
          // OS keychain, so the backend store is the secure sink).
          fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(keys)
          }).catch(() => {})
          return { success: true }
        }

        default:
          console.warn(`[IRIS IPC] Unhandled channel: ${channel}`)
          return null
      }
    }
  }
}

// Chat History storage
export interface ChatHistoryItem {
  id: string
  requestId?: string
  role: 'user' | 'model' | 'system'
  text: string
  timestamp?: number
}

const DEFAULT_CHAT_HISTORY: ChatHistoryItem[] = [
  {
    id: 'sys-init-1',
    role: 'system',
    text: 'IRIS Voice-First Operating Layer initialized.',
    timestamp: Date.now() - 60000
  },
  {
    id: 'sys-init-2',
    role: 'model',
    text: 'IRIS Neural Core active. Ambient sensors, optics feed, and telemetry pipelines ready.',
    timestamp: Date.now() - 30000
  }
]

function getStoredChatHistory(): ChatHistoryItem[] {
  try {
    const raw = localStorage.getItem('iris_chat_history')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Deduplicate and ensure each has a unique ID
        const seenIds = new Set<string>()
        const sanitized: ChatHistoryItem[] = []
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i]
          if (!item || !item.text) continue
          const id =
            item.id ||
            `hist_${item.role || 'sys'}_${i}_${item.text.slice(0, 16).replace(/\s+/g, '')}`
          if (!seenIds.has(id)) {
            seenIds.add(id)
            sanitized.push({
              id,
              requestId: item.requestId,
              role: (item.role || 'system').toLowerCase() as 'user' | 'model' | 'system',
              text: item.text,
              timestamp: item.timestamp || Date.now()
            })
          }
        }
        return sanitized
      }
    }
  } catch (_e) {}
  localStorage.setItem('iris_chat_history', JSON.stringify(DEFAULT_CHAT_HISTORY))
  return DEFAULT_CHAT_HISTORY
}

function saveStoredChatHistory(history: ChatHistoryItem[]) {
  try {
    // Deduplicate before saving
    const seen = new Set<string>()
    const unique: ChatHistoryItem[] = []
    for (const item of history) {
      const key = item.id || `${item.role}:${item.text.trim()}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(item)
      }
    }
    localStorage.setItem('iris_chat_history', JSON.stringify(unique.slice(-50)))
  } catch (_e) {}
}

const transcriptListeners = new Set<
  (data: {
    id?: string
    requestId?: string
    role: string
    text: string
    isFinal?: boolean
    chunkIndex?: number
    mode?: 'delta' | 'cumulative'
  }) => void
>()

const transcriptCompleteListeners = new Set<
  (data?: { id?: string; requestId?: string; role?: string; text?: string }) => void
>()

// Attach to window
if (typeof window !== 'undefined') {
  ;(window as any).electron = electronShim

  ;(window as any).iris = {
    getHistory: async (): Promise<ChatHistoryItem[]> => {
      return getStoredChatHistory()
    },
    addHistory: (item: {
      id?: string
      requestId?: string
      role: string
      text: string
      timestamp?: number
    }) => {
      if (!item || !item.text || !item.text.trim()) return
      const history = getStoredChatHistory()
      const cleanText = item.text.trim()
      const id =
        item.id || `hist_${item.role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      // Prevent duplicate entry by ID or role + identical text within recent messages
      const isDuplicate = history.some(
        (h) => h.id === id || (h.role === item.role && h.text.trim() === cleanText)
      )
      if (isDuplicate) return

      history.push({
        id,
        requestId: item.requestId,
        role: item.role as 'user' | 'model' | 'system',
        text: cleanText,
        timestamp: item.timestamp || Date.now()
      })
      saveStoredChatHistory(history)
    },
    clearHistory: () => {
      localStorage.setItem('iris_chat_history', JSON.stringify(DEFAULT_CHAT_HISTORY))
    },
    onTranscript: (
      callback: (data: {
        id?: string
        requestId?: string
        role: string
        text: string
        isFinal?: boolean
        chunkIndex?: number
        mode?: 'delta' | 'cumulative'
      }) => void
    ) => {
      transcriptListeners.add(callback)
      return () => {
        transcriptListeners.delete(callback)
      }
    },
    offTranscript: (callback: any) => {
      transcriptListeners.delete(callback)
    },
    onTranscriptComplete: (callback: (data?: any) => void) => {
      transcriptCompleteListeners.add(callback)
      return () => {
        transcriptCompleteListeners.delete(callback)
      }
    },
    offTranscriptComplete: (callback: any) => {
      transcriptCompleteListeners.delete(callback)
    },
    emitTranscript: (data: {
      id?: string
      requestId?: string
      role: string
      text: string
      isFinal?: boolean
      chunkIndex?: number
      mode?: 'delta' | 'cumulative'
    }) => {
      transcriptListeners.forEach((fn) => {
        try {
          fn(data)
        } catch (err) {
          console.error('[IRIS] Transcript listener error:', err)
        }
      })
    },
    emitTranscriptComplete: (data?: {
      id?: string
      requestId?: string
      role?: string
      text?: string
    }) => {
      transcriptCompleteListeners.forEach((fn) => {
        try {
          fn(data)
        } catch (err) {
          console.error('[IRIS] Transcript complete listener error:', err)
        }
      })
    },
    sendVisionFrame: (base64: string) => {
      if (typeof window !== 'undefined') {
        ;(window as any).iris._latestVisionFrame = base64
      }
    },
    getLatestVisionFrame: () => {
      if (typeof window !== 'undefined') {
        return (window as any).iris._latestVisionFrame || null
      }
      return null
    },
    launch_app: (appName: string) => launch_app(appName),
    get_installed_apps: (forceRefresh?: boolean) => get_installed_apps(forceRefresh),
    resolve_app: (appName: string) => resolve_app(appName),
    executeAgentTask: (prompt: string) => {
      if (typeof (window as any).electronAPI?.invoke === 'function') {
        return (window as any).electronAPI.invoke('agent-execute-task', prompt)
      }
      return agentOrchestrator.executeTask(prompt)
    },
    getAgentTrace: (taskId: string) => {
      if (typeof (window as any).electronAPI?.invoke === 'function') {
        return (window as any).electronAPI.invoke('agent-get-trace', taskId)
      }
      return agentOrchestrator.getTrace(taskId)
    },
    sendPermissionDecision: (payload: { taskId: string; requestId: string; decision: 'APPROVED' | 'DENIED' }) => {
      if (typeof (window as any).electronAPI?.invoke === 'function') {
        return (window as any).electronAPI.invoke('agent-permission-decision', payload)
      }
      return agentOrchestrator.resumeWithPermissionDecision(payload.taskId, payload.requestId, payload.decision)
    },
    cancelAgentTask: (taskId: string) => {
      if (typeof (window as any).electronAPI?.invoke === 'function') {
        return (window as any).electronAPI.invoke('agent-cancel-task', taskId)
      }
      return agentOrchestrator.cancelTask(taskId)
    }
  }
}

export { electronShim }
