/**
 * Claude Context - Multi-Tenant Project Store & Index Cache
 * Keeps project data isolated by userId and projectId, persisting cached indices to disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import type { CodeChunk, FileContextResult, ProjectMetadata, SymbolDef } from './types'

const STORE_DIR = '/tmp/iris_indices'

try {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true })
  }
} catch (_e) {}

export interface StoredProjectData {
  metadata: ProjectMetadata
  chunks: CodeChunk[]
  symbols: SymbolDef[]
}

class ProjectStore {
  private memoryCache: Map<string, StoredProjectData> = new Map()

  constructor() {
    this.loadAllFromDisk()
  }

  private getDiskPath(projectId: string): string {
    const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(STORE_DIR, `${safeId}.json`)
  }

  private loadAllFromDisk() {
    try {
      if (!existsSync(STORE_DIR)) return
      // Lazy load will load per projectId
    } catch (_e) {}
  }

  public getProject(projectId: string, userId?: string): StoredProjectData | null {
    if (this.memoryCache.has(projectId)) {
      const data = this.memoryCache.get(projectId)!
      if (userId && data.metadata.userId && data.metadata.userId !== userId) {
        // Enforce user isolation
        return null
      }
      return data
    }

    // Try loading from disk
    const diskPath = this.getDiskPath(projectId)
    if (existsSync(diskPath)) {
      try {
        const raw = readFileSync(diskPath, 'utf-8')
        const data: StoredProjectData = JSON.parse(raw)
        if (userId && data.metadata.userId && data.metadata.userId !== userId) {
          return null
        }
        this.memoryCache.set(projectId, data)
        return data
      } catch (_e) {}
    }

    return null
  }

  public saveProject(data: StoredProjectData) {
    const { projectId } = data.metadata
    this.memoryCache.set(projectId, data)

    try {
      const diskPath = this.getDiskPath(projectId)
      writeFileSync(diskPath, JSON.stringify(data), 'utf-8')
    } catch (err) {
      console.warn('[Store] Failed to write index cache to disk:', err)
    }
  }

  public listProjects(userId?: string): ProjectMetadata[] {
    const list: ProjectMetadata[] = []
    this.memoryCache.forEach((data) => {
      if (!userId || data.metadata.userId === userId) {
        list.push(data.metadata)
      }
    })
    return list
  }

  public deleteProject(projectId: string, userId?: string): boolean {
    const existing = this.getProject(projectId, userId)
    if (!existing) return false

    this.memoryCache.delete(projectId)
    try {
      const diskPath = this.getDiskPath(projectId)
      if (existsSync(diskPath)) {
        unlinkSync(diskPath)
      }
    } catch (_e) {}

    return true
  }

  /**
   * Retrieves precise file context with related symbols and dependencies
   */
  public getFileContext(
    projectId: string,
    filePath: string,
    userId?: string,
    startLine?: number,
    endLine?: number
  ): FileContextResult | null {
    const project = this.getProject(projectId, userId)
    if (!project) return null

    const rootPath = project.metadata.rootPath
    const fullPath = resolve(rootPath, filePath)

    // Path traversal check
    if (!fullPath.startsWith(rootPath)) {
      throw new Error('Access denied: Path traversal detected')
    }

    if (!existsSync(fullPath)) return null

    try {
      const content = readFileSync(fullPath, 'utf-8')
      const allLines = content.split(/\r?\n/)
      const totalLines = allLines.length

      let selectedContent = content
      if (startLine !== undefined && endLine !== undefined) {
        const s = Math.max(1, startLine) - 1
        const e = Math.min(totalLines, endLine)
        selectedContent = allLines.slice(s, e).join('\n')
      }

      // Find symbols belonging to this file
      const symbols = project.symbols.filter((sym) => sym.filePath === filePath)

      // Find imports in this file
      const imports: string[] = []
      allLines.forEach((l) => {
        const t = l.trim()
        if (t.startsWith('import ') || t.startsWith('require(') || t.startsWith('from ')) {
          imports.push(t)
        }
      })

      // Resolve related local files
      const relatedFiles: string[] = []
      imports.forEach((imp) => {
        const match = imp.match(/['"](\.[^'"]+)['"]/)
        if (match) {
          relatedFiles.push(match[1])
        }
      })

      return {
        filePath,
        totalLines,
        content: selectedContent,
        symbols,
        imports,
        relatedFiles
      }
    } catch (_e) {
      return null
    }
  }
}

export const projectStore = new ProjectStore()
