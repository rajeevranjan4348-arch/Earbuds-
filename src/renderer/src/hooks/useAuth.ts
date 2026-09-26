import { useState, useEffect } from 'react'
import { User, onAuthStateChanged } from 'firebase/auth'
import { auth, ensureLocalPersistence } from '../lib/firebase'

export interface UseAuthReturn {
  user: User | null
  authLoading: boolean
  loading: boolean
  error: Error | null
  isAuthenticated: boolean
}

/**
 * Custom useAuth hook that manages authLoading and user states
 * to correctly handle session restoration across page reloads and refreshes.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [authLoading, setAuthLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Ensure persistence is verified
    ensureLocalPersistence().catch(() => {})

    // Sync immediate currentUser if available
    if (auth.currentUser) {
      setUser(auth.currentUser)
      setAuthLoading(false)
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser)
        setAuthLoading(false)
        setError(null)
      },
      (err) => {
        console.error('[useAuth] Error observing auth state:', err)
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

export default useAuth
