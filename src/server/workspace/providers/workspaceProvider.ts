/**
 * Base Google Workspace Provider Interface
 */

import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'

export interface WorkspaceProviderOptions {
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
  public abstract getMetadata(itemId: string): Promise<WorkspaceFileMetadata>

  /**
   * Get extracted textual content of an item/file
   */
  public abstract getContent(
    itemId: string,
    options?: Record<string, any>
  ): Promise<WorkspaceExtractedContent>

  /**
   * Helper to perform authenticated Google API fetch with retry & timeout
   */
  protected async fetchWithRetry(
    url: string,
    options: RequestInit & { accessToken?: string },
    retries = 2,
    timeoutMs = 15000
  ): Promise<Response> {
    const token = options.accessToken || process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN || ''

    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {})
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    let lastError: any = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const res = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal
        })
        clearTimeout(timer)

        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          // Rate limit or server error - exponential backoff
          const waitTime = Math.pow(2, attempt) * 500
          await new Promise((r) => setTimeout(r, waitTime))
          continue
        }

        return res
      } catch (err: any) {
        clearTimeout(timer)
        lastError = err
        if (attempt < retries) {
          const waitTime = Math.pow(2, attempt) * 400
          await new Promise((r) => setTimeout(r, waitTime))
        }
      }
    }

    throw (
      lastError || new Error(`Failed request to Google Workspace API after ${retries + 1} attempts`)
    )
  }
}
