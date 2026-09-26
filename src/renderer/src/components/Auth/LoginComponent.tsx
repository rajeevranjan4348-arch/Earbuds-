import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  auth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithGoogle
} from '../../lib/firebase'
import { Mail, Lock, LogIn, UserPlus, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { RiGoogleFill } from 'react-icons/ri'

interface LoginComponentProps {
  onSuccess?: (user: any) => void
  onCancel?: () => void
  className?: string
  isModal?: boolean
}

export const LoginComponent: React.FC<LoginComponentProps> = ({
  onSuccess,
  onCancel,
  className = '',
  isModal = false
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  /**
   * Email and password sign-in with explicit local persistence
   */
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.')
      return
    }

    setIsLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // 1. Explicitly set browserLocalPersistence on the auth instance before signing in
      await setPersistence(auth, browserLocalPersistence)

      let userCredential
      if (mode === 'signin') {
        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)
        setSuccessMsg(`Welcome back, ${userCredential.user.email}!`)
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        setSuccessMsg(`Account created for ${userCredential.user.email}!`)
      }

      if (onSuccess) {
        onSuccess(userCredential.user)
      }
    } catch (err: any) {
      console.error('[LoginComponent] Authentication error:', err)
      let message = err.message || 'Authentication failed'
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Invalid email or password. Please check credentials.'
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Try signing in.'
      } else if (err.code === 'auth/weak-password') {
        message = 'Password should be at least 6 characters.'
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please provide a valid email address.'
      }
      setErrorMsg(message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Google Sign-in with explicit local persistence
   */
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // 1. Explicitly ensure browserLocalPersistence before Google popup
      await setPersistence(auth, browserLocalPersistence)

      // 2. Trigger Google OAuth
      const res = await signInWithGoogle()
      setSuccessMsg(`Signed in with Google as ${res.user.email}`)

      if (onSuccess) {
        onSuccess(res.user)
      }
    } catch (err: any) {
      console.error('[LoginComponent] Google sign in failed:', err)
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err.message || 'Google authentication could not be completed.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const content = (
    <div className={`flex flex-col gap-4 text-left ${className}`}>
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">
              {mode === 'signin' ? 'Sign In to Iris AI' : 'Create Iris Account'}
            </h2>
            <p className="text-xs text-zinc-400">
              Persistent local authentication across refreshes and sessions
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-3 bg-red-950/50 border border-red-500/30 rounded-xl text-red-200 text-xs"
          >
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-3 bg-emerald-950/50 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs"
          >
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Google Sign-in Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-zinc-100 text-xs font-semibold rounded-xl transition-all shadow-md active:scale-[0.99] cursor-pointer disabled:opacity-50"
      >
        <RiGoogleFill size={17} className="text-blue-400" />
        <span>Continue with Google</span>
      </button>

      <div className="relative flex items-center justify-center my-1">
        <div className="border-t border-white/10 w-full" />
        <span className="bg-zinc-950 px-3 text-[11px] font-mono text-zinc-500 uppercase tracking-wider absolute">
          or email
        </span>
      </div>

      {/* Email / Password Form */}
      <form onSubmit={handleEmailAuth} className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-zinc-300 mb-1">Email Address</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={isLoading}
              className="w-full bg-zinc-900/90 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-300 mb-1">Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
              className="w-full bg-zinc-900/90 border border-white/10 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.99] cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : mode === 'signin' ? (
            <>
              <LogIn size={15} />
              <span>Sign In</span>
            </>
          ) : (
            <>
              <UserPlus size={15} />
              <span>Create Account</span>
            </>
          )}
        </button>
      </form>

      {/* Switch between signin & signup */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
        <span>
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
        </span>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setErrorMsg(null)
          }}
          className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline transition-colors"
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden"
        >
          {onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
          {content}
        </motion.div>
      </div>
    )
  }

  return content
}

export default LoginComponent
