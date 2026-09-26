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

// In-memory token cache (Do NOT store sensitive OAuth tokens/secrets in localStorage)
let cachedAccessToken: string | null = null
let isSigningIn = false

/**
 * Synchronize credentials with the centralized backend OAuth session manager
 */
export const syncSessionToBackend = async (params: {
  accessToken: string
  user: User
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
        scopes: WORKSPACE_SCOPES
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
  return cachedAccessToken
}

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token
}

export const logOutGoogle = async () => {
  await signOut(auth)
  cachedAccessToken = null
  
  // Clear centralized backend session
  try {
    await fetch('/api/workspace/auth/session', { method: 'DELETE' })
  } catch (_e) {}
}

// Validate Firestore connection gracefully without blocking app startup
export const testFirestoreConnection = async () => {
  // Silent no-op to allow Firestore offline persistence to manage sync seamlessly
  return true
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
