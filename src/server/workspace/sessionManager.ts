// ============================================================================
// 1. CENTRALIZED GOOGLE WORKSPACE SESSION MANAGER (src/server/workspace/sessionManager.ts)
// ============================================================================

import fs from 'fs'
import path from 'path'

export interface WorkspaceSessionData {
  userId: string
  email: string
  displayName?: string
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt: number
  issuedAt: number
  tokenType: string
  scopes: string[]
  isConnected: boolean
  lastVerifiedAt: number
  lastError?: string
  lastFailedService?: string
}

export interface AuthFailureLog {
  service: string
  endpoint?: string
  timestamp: number
  error: string
  statusCode?: number
}

export const DEFAULT_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/classroom.courses.readonly'
]

const SESSION_FILE_PATH = path.join(process.cwd(), 'data', 'workspace_session.json')

export class CentralizedWorkspaceSessionManager {
  private sessions: Map<string, WorkspaceSessionData> = new Map()
  private primaryUserId: string = 'usr_kumarimamta87565'
  private authFailures: AuthFailureLog[] = []
  private refreshPromises: Map<
    string,
    Promise<{ success: boolean; accessToken?: string; error?: string }>
  > = new Map()

  constructor() {
    this.ensureDataDirectory()
    this.loadPersistedSessions()
  }

  private ensureDataDirectory() {
    try {
      const dataDir = path.join(process.cwd(), 'data')
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
    } catch (err: any) {
      console.warn('[WorkspaceSessionManager] Notice creating data directory:', err?.message)
    }
  }

  private loadPersistedSessions() {
    try {
      if (fs.existsSync(SESSION_FILE_PATH)) {
        const raw = fs.readFileSync(SESSION_FILE_PATH, 'utf-8')
        const data = JSON.parse(raw)
        if (data && typeof data === 'object') {
          Object.keys(data).forEach((uid) => {
            const sess = data[uid]
            if (sess && sess.accessToken) {
              this.sessions.set(uid, sess)
              if (sess.isConnected) {
                this.primaryUserId = uid
              }
            }
          })
        }
      }
    } catch (err: any) {
      console.warn('[WorkspaceSessionManager] Notice loading persisted session:', err?.message)
    }
  }

  private persistSessions() {
    try {
      this.ensureDataDirectory()
      const dataToSave: Record<string, WorkspaceSessionData> = {}
      this.sessions.forEach((sess, uid) => {
        dataToSave[uid] = { ...sess }
      })
      fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(dataToSave, null, 2), 'utf-8')
    } catch (err: any) {
      console.warn('[WorkspaceSessionManager] Notice persisting session:', err?.message)
    }
  }

  public resolveUserId(userId?: string): string {
    if (userId && this.sessions.has(userId)) return userId
    if (this.sessions.has(this.primaryUserId)) return this.primaryUserId
    for (const [uid, sess] of this.sessions.entries()) {
      if (sess.isConnected && sess.accessToken) return uid
    }
    for (const uid of this.sessions.keys()) {
      return uid
    }
    return userId || this.primaryUserId
  }

  public isTokenValid(userId?: string, bufferSeconds = 300): boolean {
    const uid = this.resolveUserId(userId)
    const session = this.sessions.get(uid)
    if (!session || !session.accessToken || !session.isConnected) {
      return false
    }
    const now = Date.now()
    const bufferMs = bufferSeconds * 1000
    if (session.expiresAt && session.expiresAt > 0) {
      return now < session.expiresAt - bufferMs
    }
    return true
  }

  public async getValidAccessToken(
    userId?: string,
    callingService = 'workspace'
  ): Promise<string | null> {
    const uid = this.resolveUserId(userId)
    const session = this.sessions.get(uid)

    if (!session || !session.accessToken) {
      if (process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
        return process.env.GOOGLE_WORKSPACE_ACCESS_TOKEN
      }
      this.logAuthFailure(callingService, 'No active Google Workspace session found for user', 401)
      return null
    }

    if (this.isTokenValid(uid, 300)) {
      return session.accessToken
    }

    const refreshResult = await this.refreshToken(uid, callingService)
    if (refreshResult.success && refreshResult.accessToken) {
      return refreshResult.accessToken
    }

    return session.accessToken
  }

  public async refreshToken(
    userId?: string,
    callingService = 'workspace'
  ): Promise<{ success: boolean; accessToken?: string; error?: string }> {
    const uid = this.resolveUserId(userId)

    if (this.refreshPromises.has(uid)) {
      return await this.refreshPromises.get(uid)!
    }

    const refreshPromise = (async () => {
      const session = this.sessions.get(uid)
      const refreshToken =
        session?.refreshToken ||
        process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN ||
        process.env.GOOGLE_REFRESH_TOKEN ||
        process.env.YOUTUBE_REFRESH_TOKEN
      const clientId =
        process.env.GOOGLE_WORKSPACE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.YOUTUBE_CLIENT_ID ||
        '692533244658-0pl49eo1pq8d5ljrtp8pdi6g5vrrfemp.apps.googleusercontent.com'
      const clientSecret =
        process.env.GOOGLE_WORKSPACE_CLIENT_SECRET ||
        process.env.GOOGLE_CLIENT_SECRET ||
        process.env.YOUTUBE_CLIENT_SECRET ||
        ''

      if (!refreshToken) {
        return {
          success: false,
          error: 'No refresh token available. Reconnection required.'
        }
      }

      try {
        const params = new URLSearchParams()
        params.append('client_id', clientId)
        if (clientSecret) {
          params.append('client_secret', clientSecret)
        }
        params.append('refresh_token', refreshToken)
        params.append('grant_type', 'refresh_token')

        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })

        const data = await response.json()

        if (!response.ok || data.error) {
          const errDetail = data.error_description || data.error || response.statusText
          if (data.error === 'invalid_grant' && session) {
            session.isConnected = false
            session.lastError = 'Google OAuth authorization revoked or expired'
            this.persistSessions()
          }
          this.logAuthFailure(
            callingService,
            `OAuth token refresh failed: ${errDetail}`,
            response.status
          )
          return { success: false, error: errDetail }
        }

        const newAccessToken = data.access_token
        const expiresInSec = data.expires_in || 3600
        const now = Date.now()

        if (session) {
          session.accessToken = newAccessToken
          session.expiresAt = now + expiresInSec * 1000
          session.issuedAt = now
          session.isConnected = true
          session.lastVerifiedAt = now
          session.lastError = undefined
          if (data.id_token) session.idToken = data.id_token
        } else {
          this.sessions.set(uid, {
            userId: uid,
            email: 'kumarimamta87565@gmail.com',
            displayName: 'Mamta Kumari',
            accessToken: newAccessToken,
            refreshToken,
            expiresAt: now + expiresInSec * 1000,
            issuedAt: now,
            tokenType: 'Bearer',
            scopes: DEFAULT_WORKSPACE_SCOPES,
            isConnected: true,
            lastVerifiedAt: now
          })
        }

        this.persistSessions()
        return { success: true, accessToken: newAccessToken }
      } catch (err: any) {
        this.logAuthFailure(callingService, `Token refresh exception: ${err?.message}`)
        return { success: false, error: err?.message }
      }
    })()

    this.refreshPromises.set(uid, refreshPromise)
    try {
      return await refreshPromise
    } finally {
      this.refreshPromises.delete(uid)
    }
  }

  public updateSession(params: {
    userId?: string
    email?: string
    displayName?: string
    accessToken: string
    refreshToken?: string
    idToken?: string
    expiresIn?: number
    expiresAt?: number
    scopes?: string[]
  }): WorkspaceSessionData {
    const uid = params.userId || this.primaryUserId
    const now = Date.now()
    const expiresIn = params.expiresIn || 3600
    const expiresAt = params.expiresAt || now + expiresIn * 1000
    const existing = this.sessions.get(uid)

    const sessionData: WorkspaceSessionData = {
      userId: uid,
      email: params.email || existing?.email || 'kumarimamta87565@gmail.com',
      displayName: params.displayName || existing?.displayName || 'Mamta Kumari',
      accessToken: params.accessToken,
      refreshToken: params.refreshToken || existing?.refreshToken,
      idToken: params.idToken || existing?.idToken,
      expiresAt,
      issuedAt: now,
      tokenType: 'Bearer',
      scopes: Array.from(
        new Set([...(existing?.scopes || DEFAULT_WORKSPACE_SCOPES), ...(params.scopes || [])])
      ),
      isConnected: true,
      lastVerifiedAt: now
    }

    this.sessions.set(uid, sessionData)
    this.primaryUserId = uid
    this.persistSessions()
    return sessionData
  }

  public getSessionInfo(userId?: string) {
    const uid = this.resolveUserId(userId)
    const session = this.sessions.get(uid)

    if (!session) {
      return {
        isConnected: false,
        userId: uid,
        hasSession: false,
        scopes: DEFAULT_WORKSPACE_SCOPES
      }
    }

    const now = Date.now()
    const isValid = this.isTokenValid(uid, 0)
    const timeRemainingMs = Math.max(0, session.expiresAt - now)

    return {
      isConnected:
        session.isConnected &&
        (isValid || Boolean(session.refreshToken || process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN)),
      userId: session.userId,
      email: session.email,
      displayName: session.displayName,
      scopes: session.scopes,
      expiresAt: session.expiresAt,
      timeRemainingMinutes: Math.round(timeRemainingMs / 60000),
      isExpired: now >= session.expiresAt,
      hasRefreshToken: Boolean(session.refreshToken || process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN),
      lastVerifiedAt: session.lastVerifiedAt,
      lastError: session.lastError,
      lastFailedService: session.lastFailedService
    }
  }

  public clearSession(userId?: string) {
    const uid = this.resolveUserId(userId)
    const session = this.sessions.get(uid)
    if (session) {
      session.isConnected = false
      session.accessToken = ''
      session.lastError = 'Disconnected by user'
    }
    this.persistSessions()
  }

  public logAuthFailure(service: string, error: string, statusCode?: number, endpoint?: string) {
    const failureLog: AuthFailureLog = {
      service,
      endpoint,
      timestamp: Date.now(),
      error,
      statusCode
    }
    this.authFailures.unshift(failureLog)
    if (this.authFailures.length > 50) this.authFailures.pop()
    console.error(
      `[WorkspaceAuthFailure] [${service.toUpperCase()}] [HTTP ${statusCode || 'ERR'}] ${error}`
    )
  }

  public getAuthFailures(): AuthFailureLog[] {
    return [...this.authFailures]
  }

  public clearAuthFailures() {
    this.authFailures = []
  }
}

export const workspaceSessionManager = new CentralizedWorkspaceSessionManager()
