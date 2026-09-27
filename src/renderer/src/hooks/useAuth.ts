import { useState, useEffect, useCallback } from 'react'
import { User } from 'firebase/auth'
import { auth, ensureLocalPersistence } from '../lib/firebase'
import {
  persistentAuthStateManager,
  PersistentUser,
  PersistentSession
} from '../services/persistentAuthStateManager'

export interface UseAuthReturn {
  user: User | PersistentUser | null
  session: PersistentSession | null
  authLoading: boolean
  loading: boolean
  error: Error | null
  isAuthenticated: boolean
  loginWithGoogle: () => Promise<{ session: PersistentSession; user: PersistentUser }>
  loginWithEmail: (email: string, pass: string) => Promise<{ session: PersistentSession; user: PersistentUser }>
  signUpWithEmail: (email: string, pass: string) => Promise<{ session: PersistentSession; user: PersistentUser }>
  logout: () => Promise<void>
  switchUser: (user: PersistentUser | string, name?: string) => void
  switchPreset: (index: number) => void
  refreshSession: () => Promise<{ success: boolean; session?: PersistentSession }>
}

/**
 * Custom useAuth hook powered by PersistentAuthStateManager.
 * Guarantees zero-flicker persistent authentication across page refreshes,
 * browser restarts, and tab switching via localStorage.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<PersistentUser | User | null>(() => {
    return persistentAuthStateManager.getUser() || (auth.currentUser as any)
  })
  const [session, setSession] = useState<PersistentSession | null>(() => {
    return persistentAuthStateManager.getSession()
  })
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    return !persistentAuthStateManager.getUser() && !auth.currentUser
  })
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Ensure Firebase local persistence is active
    ensureLocalPersistence().catch(() => {})

    // Subscribe to PersistentAuthStateManager updates
    const unsubscribeManager = persistentAuthStateManager.subscribe((newSession, newUser) => {
      setSession(newSession)
      setUser(newUser)
      setAuthLoading(false)
      setError(null)
    })

    return () => {
      unsubscribeManager()
    }
  }, [])

  const loginWithGoogle = useCallback(async () => {
    try {
      setAuthLoading(true)
      const res = await persistentAuthStateManager.signInWithGoogle()
      setUser(res.user)
      setSession(res.session)
      return res
    } catch (err: any) {
      setError(err)
      throw err
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    try {
      setAuthLoading(true)
      const res = await persistentAuthStateManager.signInWithEmail(email, pass)
      setUser(res.user)
      setSession(res.session)
      return res
    } catch (err: any) {
      setError(err)
      throw err
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const signUpWithEmail = useCallback(async (email: string, pass: string) => {
    try {
      setAuthLoading(true)
      const res = await persistentAuthStateManager.signUpWithEmail(email, pass)
      setUser(res.user)
      setSession(res.session)
      return res
    } catch (err: any) {
      setError(err)
      throw err
    } finally {
      setAuthLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await persistentAuthStateManager.logout()
      setUser(null)
      setSession(null)
    } catch (err: any) {
      setError(err)
    }
  }, [])

  const switchUser = useCallback((target: PersistentUser | string, name?: string) => {
    persistentAuthStateManager.switchUser(target, name)
  }, [])

  const switchPreset = useCallback((index: number) => {
    persistentAuthStateManager.switchPreset(index)
  }, [])

  const refreshSession = useCallback(async () => {
    return persistentAuthStateManager.refreshSession()
  }, [])

  return {
    user,
    session,
    authLoading,
    loading: authLoading,
    error,
    isAuthenticated: Boolean(user && session?.status !== 'logged_out'),
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout,
    switchUser,
    switchPreset,
    refreshSession
  }
}

export default useAuth
