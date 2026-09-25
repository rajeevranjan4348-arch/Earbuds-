// ============================================================================
// 2. CENTRALIZED GOOGLE WORKSPACE API CLIENT (src/server/workspace/googleApiClient.ts)
// ============================================================================

import { workspaceSessionManager } from './sessionManager'

export interface GoogleApiRequestOptions extends RequestInit {
  service: string
  url: string
  userId?: string
  overrideAccessToken?: string
  retries?: number
  timeoutMs?: number
  isRetryAfterRefresh?: boolean
}

export class GoogleWorkspaceApiClient {
  public async execute<T = any>(
    options: GoogleApiRequestOptions
  ): Promise<{ ok: boolean; status: number; data: T; headers: Headers }> {
    const {
      service,
      url,
      userId,
      overrideAccessToken,
      retries = 2,
      timeoutMs = 15000,
      isRetryAfterRefresh = false,
      ...fetchOptions
    } = options

    let token = overrideAccessToken
    const sessionToken = await workspaceSessionManager.getValidAccessToken(userId, service)
    if (sessionToken) {
      token = sessionToken
    } else if (!token) {
      token = (await workspaceSessionManager.getValidAccessToken(userId, service)) || undefined
    }

    if (!token) {
      const err = new Error(
        `Session expired or unauthenticated. Please reconnect your Google Workspace account.`
      )
      workspaceSessionManager.logAuthFailure(service, err.message, 401, url)
      throw err
    }

    const reqHeaders = new Headers(fetchOptions.headers || {})
    reqHeaders.set('Authorization', `Bearer ${token}`)
    if (
      !reqHeaders.has('Content-Type') &&
      fetchOptions.body &&
      typeof fetchOptions.body === 'string'
    ) {
      reqHeaders.set('Content-Type', 'application/json')
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          headers: reqHeaders,
          signal: controller.signal
        })
        clearTimeout(timer)

        if (response.status === 401) {
          if (!isRetryAfterRefresh) {
            const refreshResult = await workspaceSessionManager.refreshToken(userId, service)
            if (refreshResult.success && refreshResult.accessToken) {
              return await this.execute<T>({
                ...options,
                overrideAccessToken: refreshResult.accessToken,
                isRetryAfterRefresh: true
              })
            }
          }
          throw new Error(
            `Session expired or unauthenticated. Please reconnect your Google Workspace account.`
          )
        }

        if (response.status === 403) {
          const errJson = await response.json().catch(() => null)
          const errText = errJson?.error?.message || response.statusText
          const isScope =
            errText.toLowerCase().includes('insufficient') ||
            errText.toLowerCase().includes('scope')
          throw new Error(
            isScope
              ? `Insufficient permissions or missing scopes for Google Workspace service "${service}". Please re-authorize.`
              : `Access denied: ${errText}`
          )
        }

        if (!response.ok) {
          throw new Error(`Google API request failed (${response.status}): ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type') || ''
        const data = contentType.includes('application/json')
          ? await response.json()
          : await response.text()
        return { ok: true, status: response.status, data, headers: response.headers }
      } catch (err: any) {
        clearTimeout(timer)
        if (attempt >= retries || isRetryAfterRefresh) throw err
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 400))
      }
    }
    throw new Error(`Google Workspace request failed after retries`)
  }
}

export const googleWorkspaceApiClient = new GoogleWorkspaceApiClient()
