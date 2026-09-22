/**
 * Google Workspace Centralized Client Service
 * 
 * Routes requests through the centralized backend session & API proxy layer,
 * with transparent token refresh, retry on 401, error classification,
 * and fallback handling.
 */

import { getCachedAccessToken, setCachedAccessToken } from '../lib/firebase'

export interface WorkspaceItem {
  id: string
  service: string
  title: string
  subtitle?: string
  date?: string
  snippet?: string
  link?: string
  extra?: any
}

export interface AuthFailureLog {
  service: string
  endpoint?: string
  timestamp: number
  error: string
  statusCode?: number
}

export class GoogleWorkspaceService {
  private token: string | null

  static async getAuthFailures(): Promise<AuthFailureLog[]> {
    try {
      const res = await fetch('/api/workspace/auth/failures')
      if (res.ok) {
        const data = await res.json()
        return data.logs || []
      }
    } catch (err) {
      console.warn('[WorkspaceService] Failed to fetch auth failures:', err)
    }
    return []
  }

  static async clearAuthFailures(): Promise<boolean> {
    try {
      const res = await fetch('/api/workspace/auth/failures', { method: 'DELETE' })
      return res.ok
    } catch (err) {
      console.warn('[WorkspaceService] Failed to clear auth failures:', err)
      return false
    }
  }

  constructor(token?: string | null) {
    this.token = token || getCachedAccessToken()
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    const currentToken = this.token || getCachedAccessToken()
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`
    }
    return headers
  }

  /**
   * Attempt silent token refresh via centralized backend session manager
   */
  private async attemptSilentRefresh(): Promise<string | null> {
    try {
      console.log('[WorkspaceService] Attempting silent token refresh via backend...')
      const res = await fetch('/api/workspace/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.accessToken) {
          this.token = data.accessToken
          setCachedAccessToken(data.accessToken)
          console.log('[WorkspaceService] Token refreshed successfully.')
          return data.accessToken
        }
      }
    } catch (err) {
      console.warn('[WorkspaceService] Silent refresh exception:', err)
    }
    return null
  }

  /**
   * Unified request handler with auto-refresh and retry on 401
   */
  private async executeWithAutoRefresh<T>(
    backendUrl: string,
    options: RequestInit = {},
    serviceName = 'Workspace'
  ): Promise<T> {
    const headers = { ...this.getHeaders(), ...(options.headers as Record<string, string> || {}) }

    try {
      const res = await fetch(backendUrl, {
        ...options,
        headers
      })

      if (res.status === 401) {
        console.warn(`[WorkspaceService] Received 401 from ${backendUrl}. Attempting automatic refresh and retry...`)
        const newToken = await this.attemptSilentRefresh()
        if (newToken) {
          const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${newToken}`
          }
          const retryRes = await fetch(backendUrl, {
            ...options,
            headers: retryHeaders
          })
          if (retryRes.ok) {
            const retryData = await retryRes.json()
            return retryData
          }
          throw await this.parseError(serviceName, retryRes)
        }
        throw await this.parseError(serviceName, res)
      }

      if (!res.ok) {
        throw await this.parseError(serviceName, res)
      }

      const data = await res.json()
      return data
    } catch (err: any) {
      // If error indicates auth failure, try one last refresh before failing
      if (
        err.message?.includes('Session expired') ||
        err.message?.includes('401') ||
        err.message?.includes('unauthenticated')
      ) {
        const refreshedToken = await this.attemptSilentRefresh()
        if (refreshedToken) {
          const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${refreshedToken}`
          }
          const finalRes = await fetch(backendUrl, {
            ...options,
            headers: retryHeaders
          })
          if (finalRes.ok) {
            return await finalRes.json()
          }
        }
      }
      throw err
    }
  }

  private async parseError(serviceName: string, res: Response): Promise<Error> {
    let errorDetail = ''
    try {
      const errJson = await res.json()
      if (errJson?.error) {
        errorDetail = typeof errJson.error === 'string' ? errJson.error : errJson.error.message || JSON.stringify(errJson.error)
      }
    } catch (_e) {
      // not json
    }

    if (
      res.status === 401 ||
      errorDetail.toLowerCase().includes('invalid authentication credentials') ||
      errorDetail.toLowerCase().includes('expected oauth 2 access token') ||
      errorDetail.toLowerCase().includes('unauthenticated')
    ) {
      errorDetail = 'Session expired or unauthenticated. Please reconnect your Google Workspace account.'
    } else if (res.status === 403) {
      const isScope =
        errorDetail.toLowerCase().includes('insufficient') ||
        errorDetail.toLowerCase().includes('scope') ||
        errorDetail.toLowerCase().includes('permission')
      errorDetail = isScope
        ? `Insufficient permissions or missing scopes for ${serviceName}. Please re-authorize with required permissions.`
        : `Access denied for ${serviceName}: ${errorDetail || res.statusText}`
    } else if (!errorDetail) {
      errorDetail = res.statusText ? `${res.statusText} (${res.status})` : `Request failed with HTTP status ${res.status}`
    }

    return new Error(`${serviceName}: ${errorDetail}`)
  }

  // 1. Google Drive
  async listDriveFiles(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/drive/files?pageSize=15', { method: 'GET' }, 'Drive')
    const files = data.files || []
    return files.map((f: any) => ({
      id: f.id,
      service: 'drive',
      title: f.name,
      subtitle: f.mimeType?.replace('application/vnd.google-apps.', ''),
      date: f.modifiedTime,
      link: f.webViewLink,
      extra: f
    }))
  }

  // 2. Google Sheets
  async createSpreadsheet(title: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/sheets/create',
      {
        method: 'POST',
        body: JSON.stringify({ title: title || 'IRIS Telemetry Log' })
      },
      'Sheets'
    )
    return data.sheet || data
  }

  // 3. Gmail
  async listGmailMessages(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/gmail/messages?maxResults=8', { method: 'GET' }, 'Gmail')
    return data.messages || []
  }

  // 4. Google Calendar
  async listCalendarEvents(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/calendar/events', { method: 'GET' }, 'Calendar')
    const events = data.events || []
    return events.map((e: any) => ({
      id: e.id,
      service: 'calendar',
      title: e.summary || 'Scheduled Session',
      subtitle: e.location || (e.hangoutLink ? 'Google Meet Video' : 'Online'),
      date: e.start?.dateTime || e.start?.date,
      link: e.htmlLink,
      extra: e
    }))
  }

  async createCalendarEvent(summary: string, startIso: string, endIso: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/calendar/events',
      {
        method: 'POST',
        body: JSON.stringify({ summary, startIso, endIso })
      },
      'Calendar'
    )
    return data.event || data
  }

  // 5. Google Docs
  async createDocument(title: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/docs/create',
      {
        method: 'POST',
        body: JSON.stringify({ title })
      },
      'Docs'
    )
    return data.doc || data
  }

  // 6. Google Slides
  async createPresentation(title: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/slides/create',
      {
        method: 'POST',
        body: JSON.stringify({ title })
      },
      'Slides'
    )
    return data.presentation || data
  }

  // 7. Google Tasks
  async listTasks(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/tasks/list', { method: 'GET' }, 'Tasks')
    const tasks = data.tasks || []
    return tasks.map((t: any) => ({
      id: t.id,
      service: 'tasks',
      title: t.title,
      subtitle: t.status === 'completed' ? 'Completed' : 'Pending',
      date: t.due || t.updated,
      extra: t
    }))
  }

  async createTask(title: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/tasks/create',
      {
        method: 'POST',
        body: JSON.stringify({ title })
      },
      'Tasks'
    )
    return data.task || data
  }

  // 8. Google Chat Spaces
  async listChatSpaces(): Promise<WorkspaceItem[]> {
    try {
      const data: any = await this.executeWithAutoRefresh('/api/workspace/chat/spaces', { method: 'GET' }, 'Chat')
      const spaces = data.spaces || []
      return spaces.map((s: any) => ({
        id: s.name,
        service: 'chat',
        title: s.displayName || 'Google Chat Space',
        subtitle: s.spaceType || 'Chat Channel',
        link: s.spaceUri
      }))
    } catch {
      return []
    }
  }

  // 9. Google Forms
  async createForm(title: string): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/forms/create',
      {
        method: 'POST',
        body: JSON.stringify({ title })
      },
      'Forms'
    )
    return data.form || data
  }

  // 10. Google Meet
  async createMeetSpace(): Promise<any> {
    const data: any = await this.executeWithAutoRefresh(
      '/api/workspace/meet/create',
      {
        method: 'POST',
        body: JSON.stringify({})
      },
      'Meet'
    )
    return data.space || data
  }

  // 11. Google Contacts / People
  async listContacts(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/contacts/list', { method: 'GET' }, 'Contacts')
    const connections = data.connections || []
    return connections.map((c: any) => {
      const name = c.names?.[0]?.displayName || 'Unnamed Contact'
      const email = c.emailAddresses?.[0]?.value || ''
      const phone = c.phoneNumbers?.[0]?.value || ''
      return {
        id: c.resourceName || Math.random().toString(),
        service: 'contacts',
        title: name,
        subtitle: [email, phone].filter(Boolean).join(' • ') || 'No contact details'
      }
    })
  }

  // 12. Google Classroom
  async listClassroomCourses(): Promise<WorkspaceItem[]> {
    const data: any = await this.executeWithAutoRefresh('/api/workspace/classroom/courses', { method: 'GET' }, 'Classroom')
    const courses = data.courses || []
    return courses.map((c: any) => ({
      id: c.id,
      service: 'classroom',
      title: c.name,
      subtitle: c.section ? `Section: ${c.section}` : c.room || 'Course Room',
      link: c.alternateLink
    }))
  }
}
