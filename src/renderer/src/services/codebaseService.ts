/**
 * IRIS Claude Context Client Service
 * Front-end agent bridge for codebase indexing, hybrid semantic code search,
 * symbol resolution, and file context retrieval.
 */

export interface ClientSearchResult {
  chunkId: string
  filePath: string
  startLine: number
  endLine: number
  snippet: string
  score: number
  matchType: 'semantic' | 'bm25' | 'symbol' | 'hybrid'
  symbolName?: string
  language?: string
}

export interface ClientSymbolDef {
  name: string
  kind: string
  filePath: string
  line: number
  signature: string
  docstring?: string
}

export interface ClientFileContext {
  filePath: string
  totalLines: number
  content: string
  symbols: ClientSymbolDef[]
  imports: string[]
  relatedFiles: string[]
}

export interface ClientProjectMetadata {
  projectId: string
  userId: string
  name: string
  rootPath: string
  sourceType: 'local' | 'github'
  githubUrl?: string
  fileCount: number
  chunkCount: number
  symbolCount: number
  lastIndexedAt: string
  indexingStatus: 'idle' | 'indexing' | 'ready' | 'failed'
  errorMessage?: string
}

export interface ClientProjectStructure {
  projectId: string
  rootName: string
  tree: any[]
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number>
    topDirectories: string[]
  }
}

class ClientCodebaseService {
  private activeProjectId = 'current_workspace'

  public setActiveProject(projectId: string) {
    this.activeProjectId = projectId
  }

  public getActiveProject(): string {
    return this.activeProjectId
  }

  /**
   * Tool: index_project
   */
  public async indexProject(params: {
    path?: string
    githubUrl?: string
    projectId?: string
    name?: string
  }): Promise<{ success: boolean; metadata?: ClientProjectMetadata; error?: string }> {
    try {
      const res = await fetch('/api/codebase/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      const data = await res.json()
      if (data.metadata?.projectId) {
        this.activeProjectId = data.metadata.projectId
      }
      return data
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' }
    }
  }

  /**
   * Tool: search_codebase / codebase_search
   */
  public async searchCodebase(
    query: string,
    projectId = this.activeProjectId,
    limit = 6
  ): Promise<ClientSearchResult[]> {
    try {
      const res = await fetch('/api/codebase/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, projectId, limit })
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.results || []
    } catch (_e) {
      return []
    }
  }

  /**
   * Tool: get_file_context
   */
  public async getFileContext(
    filePath: string,
    projectId = this.activeProjectId,
    startLine?: number,
    endLine?: number
  ): Promise<ClientFileContext | null> {
    try {
      const res = await fetch('/api/codebase/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, projectId, startLine, endLine })
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.context || null
    } catch (_e) {
      return null
    }
  }

  /**
   * Tool: find_symbol
   */
  public async findSymbol(
    symbol: string,
    projectId = this.activeProjectId
  ): Promise<ClientSymbolDef[]> {
    try {
      const res = await fetch('/api/codebase/symbol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, projectId })
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.symbols || []
    } catch (_e) {
      return []
    }
  }

  /**
   * Tool: find_references
   */
  public async findReferences(
    symbol: string,
    projectId = this.activeProjectId
  ): Promise<ClientSearchResult[]> {
    try {
      const res = await fetch('/api/codebase/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, projectId })
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.references || []
    } catch (_e) {
      return []
    }
  }

  /**
   * Tool: get_project_structure
   */
  public async getProjectStructure(
    projectId = this.activeProjectId,
    depth = 3
  ): Promise<ClientProjectStructure | null> {
    try {
      const res = await fetch(
        `/api/codebase/structure?projectId=${encodeURIComponent(projectId)}&depth=${depth}`
      )
      if (!res.ok) return null
      const data = await res.json()
      return data.structure || null
    } catch (_e) {
      return null
    }
  }

  /**
   * List all projects
   */
  public async listProjects(): Promise<ClientProjectMetadata[]> {
    try {
      const res = await fetch('/api/codebase/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.projects || []
    } catch (_e) {
      return []
    }
  }
}

export const clientCodebaseService = new ClientCodebaseService()
