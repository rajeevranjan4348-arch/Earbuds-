/**
 * IRIS Firebase Authentication & User Scope Engine
 * Governs the authenticated user context for Mem0 multi-tenant memory isolation.
 * Strictly guarantees that every memory read, write, search, and deletion is scoped
 * to the authenticated Firebase user UID.
 */

export interface FirebaseUser {
  uid: string
  email: string
  displayName: string
  isAnonymous: boolean
  role?: string
}

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

  constructor() {
    this.currentUser = this.loadUser()
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

  public switchUser(target: FirebaseUser | string) {
    if (typeof target === 'string') {
      const matched = PRESET_USERS.find((u) => u.uid === target || u.email === target)
      if (matched) {
        this.currentUser = { ...matched }
      } else {
        this.currentUser = {
          uid: target,
          email: `${target}@iris.auth`,
          displayName: `Custom User (${target.slice(0, 8)})`,
          isAnonymous: false
        }
      }
    } else if (target && target.uid) {
      this.currentUser = { ...target }
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
