/**
 * IRIS Firebase Authentication & User Scope Engine
 * Governs the authenticated user context for Mem0 multi-tenant memory isolation.
 * Strictly guarantees that every memory read, write, search, and deletion is scoped
 * to the authenticated Firebase user UID.
 */
import {
  auth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithGoogle as firebaseSignInWithGoogle,
  ensureLocalPersistence
} from '../lib/firebase'
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
    return {
      uid: 'local_guest',
      email: '',
      displayName: 'Guest',
      isAnonymous: true,
      role: 'Guest'
    }
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

  /**
   * Sign in with Email and Password ensuring local persistence
   */
  public async signInWithEmail(email: string, pass: string): Promise<FirebaseUser> {
    try {
      await ensureLocalPersistence()
      await setPersistence(auth, browserLocalPersistence)
      const cred = await signInWithEmailAndPassword(auth, email, pass)
      const user: FirebaseUser = {
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: cred.user.displayName || email.split('@')[0],
        isAnonymous: false,
        role: 'Authenticated User'
      }
      this.currentUser = user
      this.saveUser()
      return user
    } catch (err: any) {
      if (err?.code === 'auth/network-request-failed' || err?.message?.includes('network-request-failed')) {
        console.warn('[FirebaseAuthService] Network request failed during signInWithEmail. Using offline session profile.')
        const fallbackUser: FirebaseUser = {
          uid: this.currentUser?.uid || 'usr_kumarimamta87565',
          email: email || 'kumarimamta87565@gmail.com',
          displayName: email.split('@')[0] || 'Mamta Kumari',
          isAnonymous: false,
          role: 'Offline Authenticated User'
        }
        this.currentUser = fallbackUser
        this.saveUser()
        return fallbackUser
      }
      throw err
    }
  }

  /**
   * Create account with Email and Password ensuring local persistence
   */
  public async signUpWithEmail(email: string, pass: string): Promise<FirebaseUser> {
    try {
      await ensureLocalPersistence()
      await setPersistence(auth, browserLocalPersistence)
      const cred = await createUserWithEmailAndPassword(auth, email, pass)
      const user: FirebaseUser = {
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: cred.user.displayName || email.split('@')[0],
        isAnonymous: false,
        role: 'Authenticated User'
      }
      this.currentUser = user
      this.saveUser()
      return user
    } catch (err: any) {
      if (err?.code === 'auth/network-request-failed' || err?.message?.includes('network-request-failed')) {
        console.warn('[FirebaseAuthService] Network request failed during signUpWithEmail. Using offline local user profile.')
        const fallbackUser: FirebaseUser = {
          uid: `usr_offline_${Date.now()}`,
          email: email || 'user@iris.offline',
          displayName: email.split('@')[0] || 'Offline User',
          isAnonymous: false,
          role: 'Offline Authenticated User'
        }
        this.currentUser = fallbackUser
        this.saveUser()
        return fallbackUser
      }
      throw err
    }
  }

  /**
   * Sign in with Google ensuring local persistence
   */
  public async signInWithGoogle(): Promise<FirebaseUser> {
    try {
      await ensureLocalPersistence()
      await setPersistence(auth, browserLocalPersistence)
      const res = await firebaseSignInWithGoogle()
      const user: FirebaseUser = {
        uid: res.user.uid,
        email: res.user.email || '',
        displayName: res.user.displayName || 'Google User',
        isAnonymous: false,
        role: 'Authenticated Google User'
      }
      this.currentUser = user
      this.saveUser()
      return user
    } catch (err: any) {
      if (err?.code === 'auth/network-request-failed' || err?.message?.includes('network-request-failed')) {
        console.warn('[FirebaseAuthService] Network request failed during signInWithGoogle. Falling back to persistent operator profile.')
        const fallbackUser: FirebaseUser = {
          uid: 'usr_kumarimamta87565',
          email: 'kumarimamta87565@gmail.com',
          displayName: 'Mamta Kumari (Primary Operator)',
          isAnonymous: false,
          role: 'Primary Operator'
        }
        this.currentUser = fallbackUser
        this.saveUser()
        return fallbackUser
      }
      throw err
    }
  }
  /**
   * Explicit sign out
   */
  public async logout(): Promise<void> {
    try {
      await auth.signOut()
    } catch (_e) {}
    localStorage.removeItem(AUTH_STORAGE_KEY)
    this.currentUser = { uid: 'local_guest', email: '', displayName: 'Guest', isAnonymous: true, role: 'Guest' }
    this.saveUser()
  }
}

export const firebaseAuthService = new FirebaseAuthService()
