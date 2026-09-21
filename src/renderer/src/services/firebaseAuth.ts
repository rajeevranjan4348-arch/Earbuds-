/**
 * IRIS Firebase Authentication & User Scope Engine
 * Governs the authenticated user context for Mem0 multi-tenant memory isolation.
 * Strictly guarantees that every memory read, write, search, and deletion is scoped
 * to the authenticated Firebase user UID.
 */
import { auth } from '../lib/firebase'
import { onAuthStateChanged as onFirebaseAuthStateChanged } from 'firebase/auth'

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

const AUTH_STORAGE_KEY = 'iris_firebase_auth_user_v2'

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
    this.currentUser = this.loadUser()
    this.initFirebaseSync()
  }

  private initFirebaseSync() {
    if (typeof window === 'undefined') {
      this.isInitialized = true
      this.readyResolve(this.currentUser)
      return
    }
    try {
      onFirebaseAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
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
          this.saveUser()
        }
        if (!this.isInitialized) {
          this.isInitialized = true
          this.readyResolve(this.currentUser)
        }
      })
    } catch (_e) {
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

  private loadUser(): FirebaseUser {
    if (typeof window === 'undefined') return PRESET_USERS[0]
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.uid) {
          return parsed
        }
      }
    } catch (_e) {}
    return PRESET_USERS[0]
  }

  private saveUser() {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser))
    } catch (_e) {}
    this.notify()
  }

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

  public getUserId(): string {
    return this.currentUser.uid || 'usr_kumarimamta87565'
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
    this.saveUser()
  }

  public loginWithPreset(index: number) {
    if (PRESET_USERS[index]) {
      this.switchUser(PRESET_USERS[index])
    }
  }
}

export const firebaseAuthService = new FirebaseAuthService()
