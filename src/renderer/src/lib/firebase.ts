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

// Initialize Firestore with offline multi-tab persistent cache
let firestoreInstance
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  })
} catch (_e) {
  firestoreInstance = getFirestore(app)
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

const TOKEN_STORAGE_KEY = 'iris_google_access_token_v2'

// Token cache initialized from persistent storage
let cachedAccessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null
let isSigningIn = false

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken)
      } else if (!isSigningIn) {
        try {
          const idToken = await user.getIdToken()
          if (cachedAccessToken && onAuthSuccess) {
            onAuthSuccess(user, cachedAccessToken)
          } else if (onAuthSuccess && idToken) {
            onAuthSuccess(user, idToken)
          }
        } catch {
          if (onAuthFailure && !cachedAccessToken) onAuthFailure()
        }
      }
    } else {
      cachedAccessToken = null
      try {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
      } catch (_e) {}
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
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, credential.accessToken)
    } catch (_e) {}
    return { user: result.user, accessToken: cachedAccessToken }
  } catch (error) {
    console.error('Sign in error:', error)
    throw error
  } finally {
    isSigningIn = false
  }
}

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken
}

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch (_e) {}
}

export const logOutGoogle = async () => {
  await signOut(auth)
  cachedAccessToken = null
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch (_e) {}
}

// Validate Firestore connection on boot
export const testFirestoreConnection = async () => {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'))
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline status:', error.message)
    }
  }
}

testFirestoreConnection()

export default app
