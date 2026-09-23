import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiCloseLine,
  RiAlertFill,
  RiExternalLinkLine,
  RiRefreshLine,
  RiShieldCheckLine
} from 'react-icons/ri'
import { CommandPalette } from './CommandPalette'
import { AppItem, SensitiveActionRequest } from './types'
import { permissionManager } from './PermissionManager'
import { launchManager } from './LaunchManager'

interface LauncherModalProps {
  currentTab: string
  onNavigate?: (tab: string) => void
  isOpen?: boolean
  onClose?: () => void
}

export const LauncherModal: React.FC<LauncherModalProps> = ({
  currentTab,
  onNavigate,
  isOpen: propIsOpen,
  onClose: propOnClose
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen

  const handleClose = () => {
    if (propOnClose) {
      propOnClose()
    } else {
      setInternalIsOpen(false)
    }
  }

  // Confirmation dialog state from PermissionManager
  const [pendingConfirm, setPendingConfirm] = useState<SensitiveActionRequest | null>(null)

  // Error fallback dialog state
  const [errorDialog, setErrorDialog] = useState<{
    app: AppItem
    message: string
    fallbackUrl?: string
  } | null>(null)

  // Subscribe to Permission Manager
  useEffect(() => {
    const unsub = permissionManager.subscribe((req) => {
      setPendingConfirm(req)
    })
    return () => unsub()
  }, [])

  // Listen to custom global window events
  useEffect(() => {
    const handleOpen = () => setInternalIsOpen(true)
    const handleCloseEv = () => setInternalIsOpen(false)
    const handleToggle = () => setInternalIsOpen((prev) => !prev)

    window.addEventListener('iris:open-launcher', handleOpen)
    window.addEventListener('iris:close-launcher', handleCloseEv)
    window.addEventListener('iris:toggle-launcher', handleToggle)

    return () => {
      window.removeEventListener('iris:open-launcher', handleOpen)
      window.removeEventListener('iris:close-launcher', handleCloseEv)
      window.removeEventListener('iris:toggle-launcher', handleToggle)
    }
  }, [])

  // Global Keyboard shortcuts:
  // - Ctrl+Space or Cmd+Space -> Toggle launcher
  // - Escape -> Close launcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle launcher with Ctrl+Space or Meta+Space
      if ((e.ctrlKey || e.metaKey) && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault()
        setInternalIsOpen((prev) => !prev)
        return
      }

      // Close on Escape if no confirmation dialog is open
      if (e.key === 'Escape' && isOpen) {
        if (pendingConfirm) {
          permissionManager.cancelPending()
        } else if (errorDialog) {
          setErrorDialog(null)
        } else {
          handleClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, pendingConfirm, errorDialog])

  const modalRef = useRef<HTMLDivElement>(null)

  // Backdrop click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      if (pendingConfirm) {
        permissionManager.cancelPending()
      } else if (errorDialog) {
        setErrorDialog(null)
      } else {
        handleClose()
      }
    }
  }

  // Handle retry
  const handleRetryLaunch = async () => {
    if (!errorDialog) return
    const app = errorDialog.app
    setErrorDialog(null)
    const res = await launchManager.launch(app)
    if (!res.success) {
      setErrorDialog({
        app,
        message: res.message,
        fallbackUrl: res.fallbackUrl
      })
    }
  }

  // Handle open web version
  const handleOpenWebFallback = () => {
    if (errorDialog?.fallbackUrl) {
      window.open(errorDialog.fallbackUrl, '_blank', 'noopener,noreferrer')
      setErrorDialog(null)
      handleClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md overflow-hidden"
          onClick={handleBackdropClick}
        >
          {/* Modal Container with Spring Scale Transition */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 420 }}
            className="w-full max-w-2xl relative mt-4 sm:mt-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Command Palette Main View */}
            <CommandPalette
              currentTab={currentTab}
              onNavigate={onNavigate}
              onClose={handleClose}
              onErrorPrompt={(app, msg, fallback) => {
                setErrorDialog({ app, message: msg, fallbackUrl: fallback })
              }}
            />

            {/* SENSITIVE ACTION CONFIRMATION DIALOG */}
            <AnimatePresence>
              {pendingConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md rounded-2xl">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="w-full max-w-md bg-zinc-950 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4 text-center select-none"
                  >
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                      <RiAlertFill size={26} />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-bold tracking-wider text-rose-300 uppercase font-mono">
                        {pendingConfirm.title}
                      </h3>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {pendingConfirm.message}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => pendingConfirm.onCancel?.()}
                        className="flex-1 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs font-semibold rounded-xl border border-white/10 transition-colors cursor-pointer"
                      >
                        {pendingConfirm.cancelLabel || 'Cancel'}
                      </button>

                      <button
                        onClick={() => pendingConfirm.onConfirm()}
                        className="flex-1 py-2.5 px-4 bg-rose-500 hover:bg-rose-400 text-black font-mono text-xs font-bold rounded-xl tracking-wider uppercase transition-colors cursor-pointer shadow-lg shadow-rose-500/20"
                      >
                        {pendingConfirm.confirmLabel || 'Confirm Action'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* ERROR FALLBACK DIALOG */}
            <AnimatePresence>
              {errorDialog && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md rounded-2xl">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="w-full max-w-md bg-zinc-950 border border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-4 text-center select-none"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                      <RiAlertFill size={26} />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-bold tracking-wider text-amber-300 uppercase font-mono">
                        Unable to open this app
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {errorDialog.message ||
                          `An error occurred while launching ${errorDialog.app.name}.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleRetryLaunch}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs font-semibold rounded-xl border border-white/10 transition-colors cursor-pointer"
                      >
                        <RiRefreshLine size={14} />
                        <span>Try Again</span>
                      </button>

                      {errorDialog.fallbackUrl && (
                        <button
                          onClick={handleOpenWebFallback}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold rounded-xl tracking-wider uppercase transition-colors cursor-pointer shadow-lg shadow-emerald-500/20"
                        >
                          <RiExternalLinkLine size={14} />
                          <span>Open Web Version</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
