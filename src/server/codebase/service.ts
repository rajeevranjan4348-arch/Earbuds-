/**
 * Claude Context - Core Codebase Service & Tool Orchestrator
 * Integrates indexing, search, symbol resolution, and GitHub synchronization
 * into a unified backend interface.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'
import { syncGithubRepository } from './git'
import { indexCodebase, buildProjectStructure } from './indexer'
import { searchCodebase, findSymbolInIndex, findReferencesInIndex } from './search'
import { projectStore } from './store'
import type {
  FileContextResult,
  ProjectMetadata,
  ProjectStructure,
  SearchCodebaseOptions,
  SearchResult,
  SymbolDef
} from './types'

export class CodebaseService {
  private defaultProjectId = 'current_workspace'

  constructor() {
    // Automatically index the current workspace in the background on startup
    setTimeout(() => {
      this.ensureWorkspaceIndexed().catch((err) => {
        console.warn('[CodebaseService] Background workspace index notice:', err?.message)
      })
    }, 1500)
  }

  /**
   * Automatically indexes the active application codebase for immediate out-of-the-box querying
   */
  public async ensureWorkspaceIndexed(): Promise<ProjectMetadata> {
    const cwd = process.cwd()
    const existing = projectStore.getProject(this.defaultProjectId)
    if (existing && existing.metadata.indexingStatus === 'ready') {
      return existing.metadata
    }

    return this.indexProject({
      path: cwd,
      projectId: this.defaultProjectId,
      userId: 'system',
      name: 'IRIS AI Workspace'
    })
  }

  /**
   * Tool: index_project
   * Indexes a local directory path or a remote GitHub repository
   */
  public async indexProject(params: {
    path?: string
    githubUrl?: string
    projectId?: string
    userId?: string
    name?: string
    githubToken?: string
  }): Promise<ProjectMetadata> {
    const userId = params.userId || 'usr_default'
    let rootPath = params.path
    let projectId = params.projectId

    if (params.githubUrl) {
      // GitHub repo flow
      const cleanProjId = projectId || `gh_${Date.now()}`
      const syncResult = await syncGithubRepository(params.githubUrl, cleanProjId, params.githubToken)
      rootPath = syncResult.repoPath
      projectId = cleanProjId
    }

    if (!rootPath) {
      rootPath = process.cwd()
      projectId = projectId || this.defaultProjectId
    }

    const resolvedRoot = resolve(rootPath)
    if (!existsSync(resolvedRoot)) {
      throw new Error(`Directory not found: ${resolvedRoot}`)
    }

    const finalProjectId = projectId || `proj_${Date.now()}`
    const existing = projectStore.getProject(finalProjectId, userId)

    const indexed = await indexCodebase(
      resolvedRoot,
      finalProjectId,
      userId,
      params.name,
      existing || undefined
    )

    projectStore.saveProject(indexed)
    return indexed.metadata
  }

  /**
   * Tool: search_codebase / codebase_search
   * Hybrid semantic + BM25 search across indexed code chunks
   */
  public searchCodebase(
    query: string,
    projectId = this.defaultProjectId,
    userId?: string,
    options: SearchCodebaseOptions = {}
  ): SearchResult[] {
    const project = projectStore.getProject(projectId, userId) || projectStore.getProject(this.defaultProjectId)
    if (!project) {
      return []
    }

    return searchCodebase(project.chunks, project.symbols, query, options)
  }

  /**
   * Tool: get_file_context
   * Retrieves precise file content, related symbols, and imports
   */
  public getFileContext(
    filePath: string,
    projectId = this.defaultProjectId,
    userId?: string,
    startLine?: number,
    endLine?: number
  ): FileContextResult | null {
    return projectStore.getFileContext(projectId, filePath, userId, startLine, endLine)
  }

  /**
   * Tool: find_symbol
   * Finds symbol definitions across codebase
   */
  public findSymbol(
    symbolName: string,
    projectId = this.defaultProjectId,
    userId?: string
  ): SymbolDef[] {
    const project = projectStore.getProject(projectId, userId) || projectStore.getProject(this.defaultProjectId)
    if (!project) return []

    return findSymbolInIndex(project.symbols, symbolName)
  }

  /**
   * Tool: find_references
   * Finds references / call sites of a symbol across the project
   */
  public findReferences(
    symbolName: string,
    projectId = this.defaultProjectId,
    userId?: string
  ): SearchResult[] {
    const project = projectStore.getProject(projectId, userId) || projectStore.getProject(this.defaultProjectId)
    if (!project) return []

    return findReferencesInIndex(project.chunks, symbolName)
  }

  /**
   * Tool: get_project_structure
   * Returns directory tree and project summary stats
   */
  public getProjectStructure(
    projectId = this.defaultProjectId,
    userId?: string,
    depth = 3
  ): ProjectStructure | null {
    const project = projectStore.getProject(projectId, userId) || projectStore.getProject(this.defaultProjectId)
    if (!project) return null

    return buildProjectStructure(project.metadata.rootPath, project.metadata.projectId, depth)
  }

  /**
   * List all projects
   */
  public listProjects(userId?: string): ProjectMetadata[] {
    return projectStore.listProjects(userId)
  }

  /**
   * Delete project
   */
  public deleteProject(projectId: string, userId?: string): boolean {
    return projectStore.deleteProject(projectId, userId)
  }
}

export const codebaseService = new CodebaseService()
