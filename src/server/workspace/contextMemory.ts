/**
 * Google Workspace Task Context Memory
 * Tracks active documents, recently accessed files, and conversational state per user
 */

import {
  WorkspaceTaskContext,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceServiceType
} from './types'

class WorkspaceContextMemoryStore {
  private userContexts: Map<string, WorkspaceTaskContext> = new Map()

  /**
   * Get or initialize context for a user
   */
  public getContext(userId: string = 'usr_primary'): WorkspaceTaskContext {
    let ctx = this.userContexts.get(userId)
    if (!ctx) {
      ctx = {
        userId,
        recentFiles: [],
        lastTimestamp: Date.now()
      }
      this.userContexts.set(userId, ctx)
    }
    return ctx
  }

  /**
   * Set the currently active document context
   */
  public setActiveFile(
    userId: string = 'usr_primary',
    file: WorkspaceFileMetadata,
    content?: WorkspaceExtractedContent
  ): void {
    const ctx = this.getContext(userId)
    ctx.activeFileId = file.id
    ctx.activeFileName = file.name
    ctx.activeService = file.service
    if (content) {
      ctx.lastRetrievedContent = content
    }

    // Add to recent files (avoid duplicates)
    ctx.recentFiles = [file, ...ctx.recentFiles.filter((f) => f.id !== file.id)].slice(0, 10)
    ctx.lastTimestamp = Date.now()
  }

  /**
   * Cache extracted content for active document
   */
  public setExtractedContent(
    userId: string = 'usr_primary',
    content: WorkspaceExtractedContent
  ): void {
    const ctx = this.getContext(userId)
    ctx.lastRetrievedContent = content
    ctx.activeFileId = content.fileId
    ctx.activeFileName = content.fileName
    ctx.activeService = content.service
    ctx.lastTimestamp = Date.now()
  }

  /**
   * Get currently active document or last retrieved content
   */
  public getActiveFile(userId: string = 'usr_primary'): {
    fileId?: string
    fileName?: string
    service?: WorkspaceServiceType
    content?: WorkspaceExtractedContent
  } {
    const ctx = this.getContext(userId)
    return {
      fileId: ctx.activeFileId,
      fileName: ctx.activeFileName,
      service: ctx.activeService,
      content: ctx.lastRetrievedContent
    }
  }

  /**
   * Record last search query
   */
  public recordQuery(userId: string = 'usr_primary', query: string): void {
    const ctx = this.getContext(userId)
    ctx.lastQuery = query
    ctx.lastTimestamp = Date.now()
  }

  /**
   * Clear context
   */
  public clearContext(userId: string = 'usr_primary'): void {
    this.userContexts.delete(userId)
  }
}

export const workspaceContextMemory = new WorkspaceContextMemoryStore()
