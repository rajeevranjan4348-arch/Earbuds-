import { AppItem, AppCategory } from './types'

const FAVORITES_STORAGE_KEY = 'iris_launcher_favorites_v1'
const RECENTS_STORAGE_KEY = 'iris_launcher_recents_v1'
const FREQUENCY_STORAGE_KEY = 'iris_launcher_freq_v1'

export const DEFAULT_APP_CATALOG: AppItem[] = [
  // --- INTERNAL APPS & WORKSPACES ---
  {
    id: 'dashboard',
    name: 'Command Dashboard',
    description: 'System telemetry, hardware health, quick launcher, and active neural modules',
    category: 'apps',
    type: 'internal',
    icon: 'RiLayoutGridLine',
    target: 'DASHBOARD',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['dashboard', 'home', 'main', 'command', 'status', 'overview', 'telemetry', 'system'],
    aliases: ['home', 'command center', 'hud'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'chat',
    name: 'AI Chat Assistant',
    description: 'Conversational reasoning, multimodal chat, document query, and memory vault',
    category: 'apps',
    type: 'internal',
    icon: 'RiChat3Line',
    target: 'CHAT',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['chat', 'ai chat', 'assistant', 'conversation', 'talk', 'ask', 'prompt', 'gemini'],
    aliases: ['talk to iris', 'ai', 'chatbot'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'youtube-studio',
    name: 'YouTube Studio & Pipeline',
    description: 'Autonomous YouTube automation, trending topics, video scripts, and upload manager',
    category: 'media',
    type: 'internal',
    icon: 'RiYoutubeFill',
    target: 'YOUTUBE',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['youtube', 'video', 'studio', 'pipeline', 'script', 'trends', 'upload', 'stream'],
    aliases: ['yt', 'yt studio', 'youtube studio'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'workspace',
    name: 'Google Workspace',
    description: 'Integrated Google Drive, Docs, Sheets, and Slides synchronization',
    category: 'productivity',
    type: 'internal',
    icon: 'RiGoogleFill',
    target: 'WORKSPACE',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['workspace', 'google', 'drive', 'docs', 'sheets', 'slides', 'cloud', 'office'],
    aliases: ['gsuite', 'google drive', 'docs'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'maps',
    name: 'Google Maps & Places',
    description: 'Geospatial intelligence, real-time traffic, navigation, and nearby search',
    category: 'tools',
    type: 'internal',
    icon: 'RiCompass3Line',
    target: 'MAPS',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['maps', 'navigation', 'gps', 'traffic', 'routes', 'places', 'directions', 'location'],
    aliases: ['google maps', 'directions', 'geo'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'notes',
    name: 'Neural Notes & Vault',
    description: 'Markdown knowledge notes, persistent memory, and AI thought records',
    category: 'productivity',
    type: 'internal',
    icon: 'RiFolderOpenLine',
    target: 'NOTES',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['notes', 'vault', 'memo', 'scratchpad', 'documents', 'records', 'memory'],
    aliases: ['notepad', 'notebook', 'scratchpad'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'gallery',
    name: 'Visual Gallery',
    description: 'Neural image generations, diagram artifacts, and captured camera frames',
    category: 'media',
    type: 'internal',
    icon: 'RiImageLine',
    target: 'GALLERY',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['gallery', 'images', 'photos', 'visuals', 'pictures', 'artifacts', 'diagrams'],
    aliases: ['photos', 'images', 'art'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'phone-companion',
    name: 'Android Mobile Hub',
    description: 'ADB uplink, device battery, notification stream, and companion phone controls',
    category: 'system',
    type: 'internal',
    icon: 'RiPhoneLine',
    target: 'PHONE',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['phone', 'android', 'mobile', 'adb', 'companion', 'device', 'battery', 'notifications'],
    aliases: ['mobile', 'smartphone', 'adb phone'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'settings',
    name: 'System Settings',
    description: 'Configure neural voices, appearance, API credentials, and hotkeys',
    category: 'settings',
    type: 'internal',
    icon: 'RiSettings4Line',
    target: 'SETTINGS',
    launchMethod: 'internal_route',
    availability: 'available',
    keywords: ['settings', 'preferences', 'configuration', 'voice settings', 'keys', 'shortcuts', 'appearance'],
    aliases: ['preferences', 'config', 'options'],
    isFavorite: true,
    contextScope: ['ALL']
  },

  // --- INTERNAL TOOLS & MODES ---
  {
    id: 'voice-mode',
    name: 'Open Voice Mode',
    description: 'Activate bi-directional real-time speech and auditory dialogue',
    category: 'tools',
    type: 'tool',
    icon: 'RiMicLine',
    target: 'ACTION_TOGGLE_VOICE',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['voice', 'microphone', 'speak', 'audio', 'listening', 'speech', 'talk'],
    aliases: ['voice mode', 'turn on mic', 'start listening'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'camera-vision',
    name: 'Camera Vision Mode',
    description: 'Initiate optical neural scanner with real-time video feed analysis',
    category: 'tools',
    type: 'tool',
    icon: 'RiCameraLine',
    target: 'ACTION_CAMERA_VISION',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['camera', 'vision', 'optical', 'video', 'webcam', 'scan', 'lens'],
    aliases: ['open camera', 'turn on camera', 'eye mode'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'screen-vision',
    name: 'Screen Share Vision',
    description: 'Capture and inspect desktop windows or displays with Gemini Vision',
    category: 'tools',
    type: 'tool',
    icon: 'RiTvLine',
    target: 'ACTION_SCREEN_VISION',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['screen', 'share', 'capture', 'desktop', 'display', 'inspect screen'],
    aliases: ['share screen', 'read screen', 'ocr'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'pdf-knowledge',
    name: 'PDF Ingestion & Knowledge Base',
    description: 'Examine uploaded PDFs, vector indexes, and chunked document embeddings',
    category: 'tools',
    type: 'tool',
    icon: 'RiFileTextLine',
    target: 'ACTION_KNOWLEDGE_OVERLAY',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['pdf', 'documents', 'knowledge', 'embeddings', 'rag', 'files', 'upload'],
    aliases: ['knowledge base', 'pdf viewer', 'docs'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'minimal-hud',
    name: 'Toggle Minimalist HUD',
    description: 'Hide navigation chrome for immersive distraction-free workspace',
    category: 'settings',
    type: 'tool',
    icon: 'RiFullscreenLine',
    target: 'ACTION_MINIMAL_HUD',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['minimal', 'zen', 'hud', 'fullscreen', 'hide chrome', 'focus mode'],
    aliases: ['zen mode', 'focus mode', 'hide navbar'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'gesture-guide',
    name: 'Hands-Free Gesture Sandbox',
    description: 'Camera optical gesture recognition calibration and live test guide',
    category: 'tools',
    type: 'tool',
    icon: 'RiHandCoinLine',
    target: 'ACTION_GESTURE_GUIDE',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['gesture', 'hand', 'hands free', 'camera gesture', 'motion', 'touchless'],
    aliases: ['gestures', 'hand motions', 'touchless mode'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'github-fixer',
    name: 'GitHub Project Control & Fixer',
    description: 'Autonomous inspect, diagnose, repair, and test pipeline for codebases',
    category: 'developer',
    type: 'tool',
    icon: 'RiGithubFill',
    target: 'ACTION_GITHUB_FIXER',
    launchMethod: 'command',
    availability: 'available',
    keywords: ['github', 'code', 'git', 'fixer', 'diagnose', 'repair', 'bugs', 'pipeline'],
    aliases: ['code assistant', 'repo fixer', 'auto debug'],
    isFavorite: false,
    contextScope: ['ALL']
  },

  // --- EXTERNAL APPLICATIONS (WITH SMART DEEP LINKING & FALLBACK) ---
  {
    id: 'youtube-ext',
    name: 'YouTube',
    description: 'Watch video content, playlists, tutorials, and music streams',
    category: 'media',
    type: 'external',
    icon: 'RiYoutubeFill',
    target: 'https://www.youtube.com',
    deepLink: 'vnd.youtube://',
    webFallbackUrl: 'https://www.youtube.com',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['youtube', 'video', 'watch', 'music', 'streaming', 'clips', 'youtube video', 'youtube app'],
    aliases: ['yt', 'videos', 'youtube app', 'youtube on device', 'open youtube'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Chat, call, and message contacts via WhatsApp Web or native app',
    category: 'communication',
    type: 'external',
    icon: 'RiWhatsappFill',
    target: 'https://web.whatsapp.com',
    deepLink: 'whatsapp://',
    webFallbackUrl: 'https://web.whatsapp.com',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['whatsapp', 'chat', 'message', 'text', 'call', 'contact'],
    aliases: ['wa', 'whatsapp web'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'github-ext',
    name: 'GitHub',
    description: 'Browse repositories, pull requests, issues, and developer projects',
    category: 'developer',
    type: 'external',
    icon: 'RiGithubFill',
    target: 'https://github.com',
    webFallbackUrl: 'https://github.com',
    launchMethod: 'web_fallback',
    availability: 'available',
    keywords: ['github', 'git', 'repo', 'code', 'open source', 'projects', 'prs'],
    aliases: ['gh', 'git hub'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'web-browser',
    name: 'Web Browser',
    description: 'Open web navigation, research, and Google search engine',
    category: 'productivity',
    type: 'external',
    icon: 'RiGlobalLine',
    target: 'https://www.google.com',
    webFallbackUrl: 'https://www.google.com',
    launchMethod: 'web_fallback',
    availability: 'available',
    keywords: ['browser', 'web', 'internet', 'search', 'google', 'chrome', 'surf'],
    aliases: ['chrome', 'internet', 'web search'],
    isFavorite: true,
    contextScope: ['ALL']
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Stream music, playlists, audiobooks, and podcasts',
    category: 'media',
    type: 'external',
    icon: 'RiSpotifyFill',
    target: 'https://open.spotify.com',
    deepLink: 'spotify://',
    webFallbackUrl: 'https://open.spotify.com',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['spotify', 'music', 'songs', 'tracks', 'playlist', 'audio', 'podcast'],
    aliases: ['music app', 'songs'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Compose and read emails on Google Mail',
    category: 'communication',
    type: 'external',
    icon: 'RiMailLine',
    target: 'https://mail.google.com',
    deepLink: 'googlegmail://',
    webFallbackUrl: 'https://mail.google.com',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['gmail', 'email', 'inbox', 'messages', 'mail', 'google mail'],
    aliases: ['email', 'mail'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Voice, video, and text communities and server channels',
    category: 'communication',
    type: 'external',
    icon: 'RiDiscordFill',
    target: 'https://discord.com/app',
    deepLink: 'discord://',
    webFallbackUrl: 'https://discord.com/app',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['discord', 'chat', 'server', 'gaming', 'voice chat', 'community'],
    aliases: ['dc'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Encrypted cloud messaging, channels, and instant broadcasts',
    category: 'communication',
    type: 'external',
    icon: 'RiTelegramFill',
    target: 'https://web.telegram.org',
    deepLink: 'tg://',
    webFallbackUrl: 'https://web.telegram.org',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['telegram', 'tg', 'messages', 'channel', 'encrypted chat'],
    aliases: ['tg', 'tele'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Connected workspace for wiki, project management, and team docs',
    category: 'productivity',
    type: 'external',
    icon: 'RiBookOpenLine',
    target: 'https://www.notion.so',
    deepLink: 'notion://',
    webFallbackUrl: 'https://www.notion.so',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['notion', 'wiki', 'docs', 'projects', 'tasks', 'notes'],
    aliases: ['workspace notion'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Code editor, extensions, terminal, and development workspace',
    category: 'developer',
    type: 'external',
    icon: 'RiCodeBoxLine',
    target: 'https://vscode.dev',
    deepLink: 'vscode://',
    webFallbackUrl: 'https://vscode.dev',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['vscode', 'vs code', 'code', 'editor', 'programming', 'ide'],
    aliases: ['visual studio code', 'editor'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'x-twitter',
    name: 'X (Twitter)',
    description: 'Real-time social discussions, news headlines, and trends',
    category: 'social',
    type: 'external',
    icon: 'RiTwitterXFill',
    target: 'https://x.com',
    deepLink: 'twitter://',
    webFallbackUrl: 'https://x.com',
    launchMethod: 'deep_link',
    availability: 'available',
    keywords: ['x', 'twitter', 'social', 'tweets', 'posts', 'feed', 'news'],
    aliases: ['twitter', 'x.com'],
    isFavorite: false,
    contextScope: ['ALL']
  },
  {
    id: 'reddit',
    name: 'Reddit',
    description: 'Community forums, discussions, subreddits, and questions',
    category: 'social',
    type: 'external',
    icon: 'RiRedditFill',
    target: 'https://www.reddit.com',
    webFallbackUrl: 'https://www.reddit.com',
    launchMethod: 'web_fallback',
    availability: 'available',
    keywords: ['reddit', 'forum', 'subreddits', 'threads', 'discussions', 'news'],
    aliases: ['reddit forums'],
    isFavorite: false,
    contextScope: ['ALL']
  },

  // --- SENSITIVE / DESTRUCTIVE ACTIONS (REQUIRES CONFIRMATION UI) ---
  {
    id: 'clear-chat-history',
    name: 'Delete All Chat History',
    description: 'Permanently purge all saved conversations and thread messages',
    category: 'settings',
    type: 'command',
    icon: 'RiDeleteBin6Line',
    target: 'ACTION_CLEAR_CHATS',
    launchMethod: 'command',
    availability: 'available',
    destructive: true,
    keywords: ['delete', 'clear', 'purge', 'remove', 'chats', 'history', 'reset'],
    aliases: ['clear chat', 'delete chats', 'reset conversation'],
    confirmationPrompt: {
      title: 'Confirm Chat Purge',
      message: 'Are you sure you want to delete all saved chat history? This action cannot be undone.',
      confirmLabel: 'Delete All Chats',
      cancelLabel: 'Keep History'
    },
    contextScope: ['CHAT', 'SETTINGS', 'ALL']
  },
  {
    id: 'clear-memory-vault',
    name: 'Reset Neural Memory Vault',
    description: 'Erase all long-term user facts, contextual preferences, and learned profile points',
    category: 'settings',
    type: 'command',
    icon: 'RiBrainLine',
    target: 'ACTION_CLEAR_MEMORY',
    launchMethod: 'command',
    availability: 'available',
    destructive: true,
    keywords: ['clear memory', 'reset memory', 'wipe memory', 'mem0', 'vault'],
    aliases: ['forget everything', 'wipe brain', 'clear memories'],
    confirmationPrompt: {
      title: 'Wipe Neural Memory',
      message: 'Are you sure you want to wipe all long-term memory facts stored in your personal vault?',
      confirmLabel: 'Erase Memories',
      cancelLabel: 'Cancel'
    },
    contextScope: ['SETTINGS', 'ALL']
  },
  {
    id: 'emergency-halt',
    name: 'Emergency Stop All Tasks',
    description: 'Instantly terminate background agents, pause speech, and cancel active streams',
    category: 'system',
    type: 'command',
    icon: 'RiShieldCrossLine',
    target: 'ACTION_EMERGENCY_STOP',
    launchMethod: 'command',
    availability: 'available',
    destructive: true,
    keywords: ['emergency', 'stop', 'halt', 'kill', 'terminate', 'abort', 'cancel all'],
    aliases: ['emergency stop', 'kill switch', 'abort'],
    confirmationPrompt: {
      title: 'Trigger Emergency Kill-Switch',
      message: 'Immediately abort all running agent operations, tasks, and speech audio playback?',
      confirmLabel: 'Emergency Halt',
      cancelLabel: 'Resume'
    },
    contextScope: ['ALL']
  }
]

export class AppRegistry {
  private apps: Map<string, AppItem> = new Map()
  private favorites: Set<string> = new Set()
  private recents: string[] = []
  private frequencies: Map<string, number> = new Map()

  constructor() {
    this.loadCatalog()
    this.loadPersistedState()
  }

  private loadCatalog() {
    DEFAULT_APP_CATALOG.forEach((app) => {
      this.apps.set(app.id, { ...app })
    })
  }

  private loadPersistedState() {
    try {
      if (typeof window === 'undefined') return

      const favData = localStorage.getItem(FAVORITES_STORAGE_KEY)
      if (favData) {
        const parsed = JSON.parse(favData)
        if (Array.isArray(parsed)) {
          this.favorites = new Set(parsed)
        }
      } else {
        // Seed default favorites
        DEFAULT_APP_CATALOG.filter((a) => a.isFavorite).forEach((a) => this.favorites.add(a.id))
      }

      const recData = localStorage.getItem(RECENTS_STORAGE_KEY)
      if (recData) {
        const parsed = JSON.parse(recData)
        if (Array.isArray(parsed)) {
          this.recents = parsed
        }
      }

      const freqData = localStorage.getItem(FREQUENCY_STORAGE_KEY)
      if (freqData) {
        const parsed = JSON.parse(freqData)
        this.frequencies = new Map(Object.entries(parsed))
      }
    } catch (_err) {
      console.warn('[AppRegistry] Could not load persisted state')
    }
  }

  private saveFavorites() {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(this.favorites)))
    } catch (_e) {}
  }

  private saveRecents() {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(this.recents.slice(0, 15)))
    } catch (_e) {}
  }

  private saveFrequencies() {
    try {
      if (typeof window === 'undefined') return
      const obj: Record<string, number> = {}
      this.frequencies.forEach((val, key) => {
        obj[key] = val
      })
      localStorage.setItem(FREQUENCY_STORAGE_KEY, JSON.stringify(obj))
    } catch (_e) {}
  }

  public getAll(): AppItem[] {
    return Array.from(this.apps.values()).map((app) => ({
      ...app,
      isFavorite: this.favorites.has(app.id),
      recent: this.recents.includes(app.id),
      launchCount: this.frequencies.get(app.id) || 0
    }))
  }

  public getById(id: string): AppItem | undefined {
    const app = this.apps.get(id)
    if (!app) return undefined
    return {
      ...app,
      isFavorite: this.favorites.has(app.id),
      recent: this.recents.includes(app.id),
      launchCount: this.frequencies.get(app.id) || 0
    }
  }

  public getFavorites(): AppItem[] {
    return this.getAll().filter((a) => this.favorites.has(a.id))
  }

  public getRecents(limit = 6): AppItem[] {
    const list: AppItem[] = []
    for (const id of this.recents) {
      const app = this.getById(id)
      if (app) list.push(app)
      if (list.length >= limit) break
    }
    return list
  }

  public toggleFavorite(id: string): boolean {
    if (this.favorites.has(id)) {
      this.favorites.delete(id)
    } else {
      this.favorites.add(id)
    }
    this.saveFavorites()
    return this.favorites.has(id)
  }

  public recordLaunch(id: string): void {
    const app = this.apps.get(id)
    if (!app) return

    // Update recents list (uniquely prepended)
    this.recents = [id, ...this.recents.filter((r) => r !== id)].slice(0, 15)
    this.saveRecents()

    // Update frequency
    const current = this.frequencies.get(id) || 0
    this.frequencies.set(id, current + 1)
    this.saveFrequencies()

    app.lastLaunched = Date.now()
  }

  public getByContext(currentTab: string): AppItem[] {
    const upper = currentTab.toUpperCase()
    return this.getAll().filter((app) => {
      if (!app.contextScope || app.contextScope.includes('ALL')) return true
      return app.contextScope.includes(upper)
    })
  }

  public registerCustomApp(app: AppItem): void {
    this.apps.set(app.id, app)
  }

  public search(query: string): AppItem[] {
    const q = query.toLowerCase().trim()
    if (!q) return this.getAll()
    return this.getAll().filter((app) => {
      if (app.name.toLowerCase().includes(q)) return true
      if (app.description.toLowerCase().includes(q)) return true
      if (app.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true
      if (app.aliases?.some((al) => al.toLowerCase().includes(q))) return true
      return false
    })
  }

  public matchVoiceCommand(text: string): AppItem | null {
    const q = text.toLowerCase().trim()
    const all = this.getAll()
    const directMatch = all.find(
      (a) =>
        a.name.toLowerCase() === q ||
        a.id.toLowerCase() === q ||
        a.aliases?.some((al) => al.toLowerCase() === q)
    )
    if (directMatch) return directMatch

    const partialMatch = all.find(
      (a) =>
        q.includes(a.name.toLowerCase()) ||
        a.keywords?.some((kw) => q.includes(kw.toLowerCase())) ||
        a.aliases?.some((al) => q.includes(al.toLowerCase()))
    )
    return partialMatch || null
  }
}

export const appRegistry = new AppRegistry()
