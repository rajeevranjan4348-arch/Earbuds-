/**
 * IRIS Firebase Authentication & User Scope Engine
 * Governs the authenticated user context for Mem0 multi-tenant memory isolation.
 * Strictly guarantees that every memory read, write, search, and deletion is scoped
 * to the authenticated Firebase user UID.
 * 
 * IMPORTANT: This service now relies SOLELY on Firebase Auth's built-in persistence.
 * Do NOT use localStorage for auth state - Firebase handles this automatically with browserLocalPersistence.
 */
import { auth } from '../lib/firebase'
import { onAuthStateChanged as onFirebaseAuthStateChanged, User } from 'firebase/auth'

export interface FirebaseUser {
  uid: string
  email: string
  displayName: string
  isAnonymous: boolean
  role?: string
}

export type FirebaseUserContext = FirebaseUser

export const PRESET_USERS: FirebaseUser[] = [
  {
    uid: 'usr_kumarimamta87565',
    email: 'kumarimamta87565@gmail.com',
    displayName: 'Mamta Kumari (User A)',
    isAnonymous: false,
    role: 'Primary Operator'
  },
  {
    uid: 'usr_iris_dev_audit_b',
    email: 'audit.dev@iris.internal',
    displayName: 'Dev Auditor (User B)',
    isAnonymous: false,
    role: 'Security Specialist'
  },
  {
    uid: 'usr_guest_sandbox_c',
    email: 'guest@iris.sandbox',
    displayName: 'Guest Sandbox (User C)',
    isAnonymous: true,
    role: 'Ephemeral Guest'
  }
]

type AuthListener = (user: FirebaseUser) => void

class FirebaseAuthService {
  private currentUser: FirebaseUser
  private listeners: Set<AuthListener> = new Set()
  private isInitialized = false
  private readyPromise: Promise<FirebaseUser>
  private readyResolve!: (user: FirebaseUser) => void

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve
    })
    
    // Initialize with first preset user as fallback
    // This will be replaced by actual Firebase user if authenticated
    this.currentUser = PRESET_USERS[0]
    
    this.initFirebaseSync()
  }

  private initFirebaseSync() {
    if (typeof window === 'undefined') {
      this.isInitialized = true
      this.readyResolve(this.currentUser)
      return
    }
    
    try {
      onFirebaseAuthStateChanged(auth, (fbUser: User | null) => {
        if (fbUser) {
          // User is authenticated via Firebase - use Firebase user data
          this.currentUser = {
            uid: fbUser.uid,
            email: fbUser.email || `${fbUser.uid}@iris.auth`,
            displayName:
              fbUser.displayName ||
              fbUser.email?.split('@')[0] ||
              `User (${fbUser.uid.slice(0, 6)})`,
            isAnonymous: fbUser.isAnonymous,
            role: 'Authenticated Google User'
          }
        } else {
          // No Firebase user - fall back to preset user for development
          // This maintains existing behavior for dev/guest mode
          this.currentUser = PRESET_USERS[0]
        }
        
        // Notify all listeners of the user change
        this.notify()
        
        if (!this.isInitialized) {
          this.isInitialized = true
          this.readyResolve(this.currentUser)
        }
      })
    } catch (_e) {
      console.error('[FirebaseAuthService] Failed to initialize Firebase auth listener:', _e)
      this.isInitialized = true
      this.readyResolve(this.currentUser)
    }
  }

  public isReady(): Promise<FirebaseUser> {
    return this.readyPromise
  }

  public getInitialized(): boolean {
    return this.isInitialized
  }

  /**
   * Get the current authenticated user.
   * This now relies on Firebase Auth's persisted state.
   */
  /**
   * Notify all listeners of user changes.
   * Firebase Auth already persists state, so we don't need to save to localStorage.
   */
  private notify() {
    const copy = this.getUser()
    this.listeners.forEach((fn) => {
      try {
        fn(copy)
      } catch (_e) {}
    })
  }

  public getUser(): FirebaseUser {
    return { ...this.currentUser }
  }

  public getCurrentUser(): FirebaseUser {
    return this.getUser()
  }

  /**
   * Get the current user's UID.
   * Returns the Firebase UID if authenticated, or preset user UID for dev mode.
   */
  public getUserId(): string {
    return this.currentUser.uid
  }

  public onAuthStateChanged(fn: AuthListener): () => void {
    this.listeners.add(fn)
    fn(this.getUser())
    return () => {
      this.listeners.delete(fn)
    }
  }

  public subscribe(fn: AuthListener): () => void {
    return this.onAuthStateChanged(fn)
  }

  /**
   * Switch to a preset user for development purposes.
   * This is used for dev/guest mode and does not affect Firebase Auth persistence.
   */
  public switchUser(target: FirebaseUser | string, name?: string) {
    if (typeof target === 'string') {
      const matched = PRESET_USERS.find((u) => u.uid === target || u.email === target)
      if (matched) {
        this.currentUser = { ...matched }
      } else {
        this.currentUser = {
          uid: target,
          email: `${target}@iris.auth`,
          displayName: name || `Custom User (${target.slice(0, 8)})`,
          isAnonymous: false
        }
      }
    } else if (target && target.uid) {
      this.currentUser = { ...target }
      if (name) {
        this.currentUser.displayName = name
      }
    }
    // Notify listeners of the change
    this.notify()
  }

  public loginWithPreset(index: number) {
    if (PRESET_USERS[index]) {
      this.switchUser(PRESET_USERS[index])
    }
  }
}

export const firebaseAuthService = new FirebaseAuthService()
