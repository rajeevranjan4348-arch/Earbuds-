import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
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
  getDocFromServer
} from 'firebase/firestore'
import firebaseConfig from '../../../../firebase-applet-config.json'

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Enable browser local persistence for Auth
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {})
} catch (_e) {}

// Initialize Firestore with offline multi-tab persistent cache and long-polling for reliable cloud connectivity in all environments
let firestoreInstance
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
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
        experimentalForceLongPolling: true
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
        if (onAuthFailure) onAuthFailure()
      }
    } else {
      cachedAccessToken = null
      if (onAuthFailure) onAuthFailure()
    }
  })
}

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true
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
  } catch (error) {
    console.error('Sign in error:', error)
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
  if (typeof window === 'undefined') return
  try {
    const checkPromise = getDocFromServer(doc(firestore, 'test', 'connection'))
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('connection check timeout')), 3000)
    )
    await Promise.race([checkPromise, timeoutPromise])
  } catch (error) {
    // Graceful silent fallback to offline cache
    if (error instanceof Error && (error.message.includes('offline') || error.message.includes('timeout'))) {
      // Client is in offline mode or will sync when online
    }
  }
}

// Run connection verification asynchronously
setTimeout(() => {
  testFirestoreConnection().catch(() => {})
}, 1000)

export default app
