import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  setLogLevel
} from 'firebase/firestore'
import { useState, useEffect } from 'react'
import firebaseConfig from '../../../../firebase-applet-config.json'

// Suppress non-fatal Firestore network timeout warnings in SDK logs
try {
  setLogLevel('error')
} catch (_e) {}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * Ensures browserLocalPersistence is active on the centralized auth instance
 */
export const ensureLocalPersistence = async (): Promise<void> => {
  try {
    await setPersistence(auth, browserLocalPersistence)
  } catch (err) {
    console.warn('[FirebaseAuth] Persistence setup error:', err)
  }
}

// Enable browser local persistence immediately upon initialization
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {})
} catch (_e) {}

// Initialize Firestore with offline multi-tab persistent cache and auto long-polling detection
let firestoreInstance
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    (firebaseConfig as any).firestoreDatabaseId
  )
} catch (_e) {
  try {
    firestoreInstance = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true
      },
      (firebaseConfig as any).firestoreDatabaseId
    )
  } catch (_e2) {
    firestoreInstance = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  }
}

export const firestore = firestoreInstance

export const WORKSPACE_SCOPES = [
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

export const googleAuthProvider = new GoogleAuthProvider()
// Request Workspace scopes
WORKSPACE_SCOPES.forEach((scope) => googleAuthProvider.addScope(scope))
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
  access_type: 'offline'
})

// Local storage persistent key for OAuth access token, user profile, and login history
const WORKSPACE_TOKEN_STORAGE_KEY = 'iris_workspace_access_token'
const WORKSPACE_USER_STORAGE_KEY = 'iris_workspace_user'
const WORKSPACE_LOGIN_HISTORY_KEY = 'iris_workspace_login_history'

export interface CachedWorkspaceUser {
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  role?: string
  lastActiveAt?: number
}

export interface ClientLoginHistoryEntry {
  id: string
  userId: string
  email: string
  displayName?: string
  timestamp: number
  provider: string
  status: 'active' | 'logged_out'
  lastActiveAt?: number
}

// In-memory token cache backed by localStorage
let cachedAccessToken: string | null = null
try {
  if (typeof window !== 'undefined') {
    cachedAccessToken = localStorage.getItem(WORKSPACE_TOKEN_STORAGE_KEY)
  }
} catch (_e) {}

let isSigningIn = false

export const getCachedWorkspaceUser = (): CachedWorkspaceUser | null => {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(WORKSPACE_USER_STORAGE_KEY)
      if (stored) return JSON.parse(stored)
    }
  } catch (_e) {}
  return null
}

export const setCachedWorkspaceUser = (user: CachedWorkspaceUser | null) => {
  try {
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem(WORKSPACE_USER_STORAGE_KEY, JSON.stringify(user))
      } else {
        localStorage.removeItem(WORKSPACE_USER_STORAGE_KEY)
      }
    }
  } catch (_e) {}
}

/**
 * Record a login event in persistent local storage
 */
export const recordWorkspaceLogin = (
  user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
  provider = 'Google Workspace OAuth 2.0'
) => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(WORKSPACE_LOGIN_HISTORY_KEY)
    const list: ClientLoginHistoryEntry[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    const email = user.email || 'kumarimamta87565@gmail.com'
    const displayName = user.displayName || 'Mamta Kumari'

    // Update active user profile
    setCachedWorkspaceUser({
      uid: user.uid,
      email,
      displayName,
      photoURL: user.photoURL || undefined,
      lastActiveAt: now
    })

    // Check if user already has an active entry
    const existingActive = list.find((e) => (e.userId === user.uid || e.email === email) && e.status === 'active')
    if (existingActive) {
      existingActive.lastActiveAt = now
      existingActive.displayName = displayName
      existingActive.email = email
    } else {
      const entry: ClientLoginHistoryEntry = {
        id: `login_${now}_${Math.random().toString(36).slice(2, 6)}`,
        userId: user.uid,
        email,
        displayName,
        timestamp: now,
        provider,
        status: 'active',
        lastActiveAt: now
      }
      list.unshift(entry)
    }
    const trimmed = list.slice(0, 100)
    localStorage.setItem(WORKSPACE_LOGIN_HISTORY_KEY, JSON.stringify(trimmed))
  } catch (_e) {}
}

/**
 * Retrieve persistent login history
 */
export const getWorkspaceLoginHistory = (): ClientLoginHistoryEntry[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(WORKSPACE_LOGIN_HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (_e) {}

  // Fallback to active operator session if user profile exists
  const user = getCachedWorkspaceUser()
  const token = getCachedAccessToken()
  if (user || token) {
    const now = Date.now()
    const fallbackEntry: ClientLoginHistoryEntry = {
      id: `login_${now}_init`,
      userId: user?.uid || 'usr_kumarimamta87565',
      email: user?.email || 'kumarimamta87565@gmail.com',
      displayName: user?.displayName || 'Mamta Kumari',
      timestamp: now,
      provider: 'Google Workspace OAuth 2.0',
      status: 'active',
      lastActiveAt: now
    }
    try {
      localStorage.setItem(WORKSPACE_LOGIN_HISTORY_KEY, JSON.stringify([fallbackEntry]))
    } catch (_e) {}
    return [fallbackEntry]
  }

  return []
}

/**
 * Synchronize credentials with the centralized backend OAuth session manager
 */
export const syncSessionToBackend = async (params: {
  accessToken: string
  user: User | CachedWorkspaceUser
  expiresIn?: number
}) => {
  try {
    const res = await fetch('/api/workspace/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.user.uid,
        email: params.user.email,
        displayName: params.user.displayName,
        accessToken: params.accessToken,
        expiresIn: params.expiresIn || 3600,
        expiresAt: Date.now() + (params.expiresIn || 3600) * 1000,
        scopes: WORKSPACE_SCOPES,
        loginHistory: getWorkspaceLoginHistory()
      })
    })
    if (!res.ok) {
      console.warn('[FirebaseAuth] Backend session sync notice:', res.statusText)
    }
  } catch (err) {
    console.warn('[FirebaseAuth] Backend session sync exception:', err)
  }
}

/**
 * Check backend centralized session status
 */
export const fetchBackendSession = async (): Promise<{ isConnected: boolean; accessToken?: string; session?: any }> => {
  try {
    const res = await fetch('/api/workspace/auth/session')
    if (res.ok) {
      const data = await res.json()
      return {
        isConnected: Boolean(data.session?.isConnected),
        session: data.session
      }
    }
  } catch (err) {
    console.warn('[FirebaseAuth] Failed to check backend session:', err)
  }
  return { isConnected: false }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        // Sync to backend to make sure backend session is warm
        syncSessionToBackend({ accessToken: cachedAccessToken, user })
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken)
      } else {
        // Check if backend already has a valid restored session
        const backendStatus = await fetchBackendSession()
        if (backendStatus.isConnected) {
          // Trigger a refresh to get fresh access token
          try {
            const refRes = await fetch('/api/workspace/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.uid })
            })
            const refData = await refRes.json()
            if (refData.success && refData.accessToken) {
              setCachedAccessToken(refData.accessToken)
              if (onAuthSuccess) onAuthSuccess(user, refData.accessToken)
              return
            }
          } catch (_e) {}
        }
        if (onAuthSuccess) onAuthSuccess(user, '')
      }
    } else {
      cachedAccessToken = null
      if (onAuthFailure) onAuthFailure()
    }
  })
}

/**
 * Sign in with Email and Password using persistent browser storage
 */
export const signInWithEmail = async (email: string, pass: string): Promise<User> => {
  await ensureLocalPersistence()
  const cred = await signInWithEmailAndPassword(auth, email, pass)
  return cred.user
}

/**
 * Create user with Email and Password using persistent browser storage
 */
export const signUpWithEmail = async (email: string, pass: string): Promise<User> => {
  await ensureLocalPersistence()
  const cred = await createUserWithEmailAndPassword(auth, email, pass)
  return cred.user
}

/**
 * Sign in with Google Popup using persistent browser storage
 */
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true
    await ensureLocalPersistence()
    const result = await signInWithPopup(auth, googleAuthProvider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Auth credential')
    }

    cachedAccessToken = credential.accessToken
    try {
      localStorage.setItem(WORKSPACE_TOKEN_STORAGE_KEY, credential.accessToken)
    } catch (_e) {}

    // Record login into persistent history
    recordWorkspaceLogin({
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName
    })

    // Persist and synchronize to Centralized Backend Session Manager
    await syncSessionToBackend({
      accessToken: credential.accessToken,
      user: result.user,
      expiresIn: 3600
    })

    return { user: result.user, accessToken: cachedAccessToken }
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.info('[FirebaseAuth] Sign-in popup closed or cancelled by user.')
    } else {
      console.error('Sign in error:', error)
    }
    throw error
  } finally {
    isSigningIn = false
  }
}

export const triggerWorkspaceOAuthPopup = async (): Promise<string | null> => {
  const result = await signInWithGoogle()
  return result?.accessToken || null
}

export const getCachedAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(WORKSPACE_TOKEN_STORAGE_KEY)
      if (stored) {
        cachedAccessToken = stored
        return stored
      }
    }
  } catch (_e) {}
  return null
}

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token
  try {
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem(WORKSPACE_TOKEN_STORAGE_KEY, token)
      } else {
        localStorage.removeItem(WORKSPACE_TOKEN_STORAGE_KEY)
      }
    }
  } catch (_e) {}
}

export const logOutGoogle = async () => {
  await signOut(auth)
  cachedAccessToken = null
  setCachedWorkspaceUser(null)
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WORKSPACE_TOKEN_STORAGE_KEY)
      // Update login history entries to logged_out on explicit user logout
      const raw = localStorage.getItem(WORKSPACE_LOGIN_HISTORY_KEY)
      if (raw) {
        const list: ClientLoginHistoryEntry[] = JSON.parse(raw)
        const updated = list.map((item) => ({ ...item, status: 'logged_out' as const, lastActiveAt: Date.now() }))
        localStorage.setItem(WORKSPACE_LOGIN_HISTORY_KEY, JSON.stringify(updated))
      }
    }
  } catch (_e) {}
  
  // Clear centralized backend session
  try {
    await fetch('/api/workspace/auth/session', { method: 'DELETE' })
  } catch (_e) {}
}

// Validate Firestore connection on boot per Firebase guidelines
export const testFirestoreConnection = async () => {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'))
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection notice: Client is offline or establishing connection.")
    } else if (error instanceof Error) {
      console.warn("Firestore connection check notice:", error.message)
    }
  }
}
testFirestoreConnection()

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string
  operationType: OperationType
  path: string | null
  authInfo: {
    userId?: string | null
    email?: string | null
    emailVerified?: boolean | null
    isAnonymous?: boolean | null
    tenantId?: string | null
    providerInfo?: {
      providerId?: string | null
      email?: string | null
    }[]
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo))
  throw new Error(JSON.stringify(errInfo))
}

/**
 * Custom useAuth hook managing authLoading, loading, and user state across page reloads
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authLoading, setAuthLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Check initial cached user if available
    if (auth.currentUser) {
      setUser(auth.currentUser)
      setAuthLoading(false)
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser)
        setAuthLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[useAuth] Auth state error:', err)
        setError(err)
        setAuthLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  return {
    user,
    authLoading,
    loading: authLoading,
    error,
    isAuthenticated: !!user
  }
}

export {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
}

export default app
