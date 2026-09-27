/**
 * IRIS Central OAuth Connection Manager Hook (useWorkspaceOAuthManager)
 * 
 * Handles multi-scope authentication for Google Workspace services (Drive, Sheets, Docs, Calendar, Gmail, Tasks, etc.),
 * persists access tokens and session data in the secure storage layer, and manages background token auto-refresh.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  auth,
  browserLocalPersistence,
  setPersistence,
  signInWithGoogle,
  logOutGoogle,
  getCachedAccessToken,
  setCachedAccessToken,
  getCachedWorkspaceUser,
  setCachedWorkspaceUser
} from '../lib/firebase'
import { GoogleWorkspaceService } from '../services/workspace'

export interface WorkspaceOAuthSession {
  isConnected: boolean
  userId: string
  email?: string
  displayName?: string
  photoURL?: string
  scopes: string[]
  expiresAt: number
  timeRemainingMinutes: number
  isExpired: boolean
  hasRefreshToken: boolean
  lastVerifiedAt?: number
  lastError?: string
}

export interface UseWorkspaceOAuthManagerReturn {
  session: WorkspaceOAuthSession | null
  isConnected: boolean
  isExpired: boolean
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  accessToken: string | null
  signInWithWorkspace: () => Promise<boolean>
  signOutWorkspace: () => Promise<void>
  refreshToken: () => Promise<boolean>
  storeMemoryToDrive: (memoryText: string, customTitle?: string) => Promise<{ success: boolean; link?: string; fileId?: string; error?: string }>
  storeMemoryToSheets: (memoryText: string, customTitle?: string) => Promise<{ success: boolean; link?: string; spreadsheetId?: string; error?: string }>
}

export function useWorkspaceOAuthManager(): UseWorkspaceOAuthManagerReturn {
  const [session, setSession] = useState<WorkspaceOAuthSession | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(getCachedAccessToken())
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch session from backend / persistent storage
  const fetchSession = useCallback(async () => {
    try {
      const cachedToken = getCachedAccessToken()
      if (cachedToken) {
        setAccessToken(cachedToken)
      }

      const res = await fetch('/api/workspace/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.session) {
          setSession(data.session)
          if (data.session.accessToken) {
            setAccessToken(data.session.accessToken)
            setCachedAccessToken(data.session.accessToken)
          }
        }
      }
    } catch (err: any) {
      console.warn('[useWorkspaceOAuthManager] Session fetch warning:', err)
    }
  }, [])

  useEffect(() => {
    fetchSession()
    const interval = setInterval(fetchSession, 25000)
    return () => clearInterval(interval)
  }, [fetchSession])

  // Sign in with multi-scope Google Workspace OAuth 2.0
  const signInWithWorkspace = useCallback(async (): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      await setPersistence(auth, browserLocalPersistence)
      const res = await signInWithGoogle()
      if (!res?.accessToken) {
        throw new Error('Failed to acquire OAuth access token.')
      }

      setAccessToken(res.accessToken)
      setCachedAccessToken(res.accessToken)

      const userObj = {
        uid: res.user.uid,
        email: res.user.email || 'kumarimamta87565@gmail.com',
        displayName: res.user.displayName || 'Mamta Kumari',
        photoURL: res.user.photoURL || undefined
      }
      setCachedWorkspaceUser(userObj)

      // Sync session to backend persistent storage layer
      await fetch('/api/workspace/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName,
          accessToken: res.accessToken
        })
      })

      await fetchSession()
      return true
    } catch (err: any) {
      const msg = err?.message || 'Google Workspace sign in failed'
      setError(msg)
      console.error('[useWorkspaceOAuthManager] Sign in error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [fetchSession])

  // Sign out
  const signOutWorkspace = useCallback(async () => {
    setIsLoading(true)
    try {
      await logOutGoogle()
      setAccessToken(null)
      setSession(null)
      await fetch('/api/workspace/auth/session', { method: 'DELETE' })
    } catch (err: any) {
      console.warn('[useWorkspaceOAuthManager] Sign out error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refresh OAuth token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    setIsRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/workspace/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success && data.accessToken) {
        setAccessToken(data.accessToken)
        setCachedAccessToken(data.accessToken)
        await fetchSession()
        return true
      } else {
        setError(data.error || 'Token refresh failed.')
        return false
      }
    } catch (err: any) {
      setError(err?.message || 'Token refresh network error.')
      return false
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchSession])

  // Store memory in Google Drive
  const storeMemoryToDrive = useCallback(
    async (memoryText: string, customTitle?: string) => {
      try {
        const title = customTitle || `IRIS Memory - ${new Date().toLocaleDateString()}`
        const res = await fetch('/api/workspace/memory/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({
            memoryText,
            title,
            target: 'drive'
          })
        })

        const data = await res.json()
        if (data.success) {
          return { success: true, link: data.link || data.file?.webViewLink, fileId: data.fileId || data.file?.id }
        }
        return { success: false, error: data.error || 'Failed to save memory to Drive.' }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error storing memory to Drive.' }
      }
    },
    [accessToken]
  )

  // Store memory in Google Spreadsheets
  const storeMemoryToSheets = useCallback(
    async (memoryText: string, customTitle?: string) => {
      try {
        const title = customTitle || `IRIS Memory Spreadsheet - ${new Date().toLocaleDateString()}`
        const res = await fetch('/api/workspace/memory/store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({
            memoryText,
            title,
            target: 'sheets'
          })
        })

        const data = await res.json()
        if (data.success) {
          return {
            success: true,
            link: data.link || data.spreadsheet?.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
            spreadsheetId: data.spreadsheetId || data.spreadsheet?.spreadsheetId
          }
        }
        return { success: false, error: data.error || 'Failed to save memory to Google Sheets.' }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error storing memory to Sheets.' }
      }
    },
    [accessToken]
  )

  return {
    session,
    isConnected: session?.isConnected ?? Boolean(accessToken),
    isExpired: session?.isExpired ?? false,
    isLoading,
    isRefreshing,
    error,
    accessToken,
    signInWithWorkspace,
    signOutWorkspace,
    refreshToken,
    storeMemoryToDrive,
    storeMemoryToSheets
  }
}

export default useWorkspaceOAuthManager
