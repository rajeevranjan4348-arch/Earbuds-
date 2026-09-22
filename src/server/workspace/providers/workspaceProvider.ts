/**
 * Base Google Workspace Provider Interface
 * Integrated with Centralized Session Manager and Google API Client
 */

import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { googleWorkspaceApiClient } from '../googleApiClient'
import { workspaceSessionManager } from '../sessionManager'

export interface WorkspaceProviderOptions {
  userId?: string
  accessToken?: string
  timeoutMs?: number
  retryCount?: number
}

export abstract class WorkspaceProvider {
  public abstract readonly service: WorkspaceServiceType

  /**
   * Search items in the service
   */
  public abstract search(
    query: string,
    options?: Record<string, any>
  ): Promise<WorkspaceSearchResult>

  /**
   * Get metadata for a specific item/file
   */
  public abstract getMetadata(
    itemId: string,
    options?: WorkspaceProviderOptions
  ): Promise<WorkspaceFileMetadata>

  /**
   * Get extracted textual content of an item/file
   */
  public abstract getContent(
    itemId: string,
    options?: Record<string, any>
  ): Promise<WorkspaceExtractedContent>

  /**
   * Helper to perform authenticated Google API fetch through centralized client
   */
  protected async fetchWithRetry(
    url: string,
    options: RequestInit & { accessToken?: string; userId?: string },
    retries = 2,
    timeoutMs = 15000
  ): Promise<Response> {
    const res = await googleWorkspaceApiClient.execute({
      service: this.service,
      url,
      method: (options.method as any) || 'GET',
      headers: (options.headers as any) || {},
      body: options.body,
      userId: options.userId,
      overrideAccessToken: options.accessToken,
      retries,
      timeoutMs
    })

    // Return a standard fetch Response object for backwards compatibility with existing parsers
    const responseInit: ResponseInit = {
      status: res.status,
      statusText: res.ok ? 'OK' : 'Error',
      headers: res.headers
    }

    const bodyString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    return new Response(bodyString, responseInit)
  }
}
