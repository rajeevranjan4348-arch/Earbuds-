/**
 * AgentPermissionDialog
 * UI component that intercepts sensitive agent tool calls (file deletions, terminal commands, adb operations, messaging)
 * and requires explicit user 'Allow' or 'Deny' input before execution.
 */

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, Check, X, AlertTriangle, Terminal, Trash2, Send, Cpu } from 'lucide-react'
import { permissionManager as rendererPermissionManager } from '../launcher/PermissionManager'

export interface AgentPermissionRequest {
  id: string
  taskId?: string
  toolName: string
  actionName?: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  parameters: Record<string, any>
  reason?: string
}

export const AgentPermissionDialog: React.FC = () => {
  const [activeRequest, setActiveRequest] = useState<AgentPermissionRequest | null>(null)

  useEffect(() => {
    // 1. Subscribe to local renderer permission manager
    const unsubRenderer = rendererPermissionManager.subscribe((req) => {
      if (req) {
        setActiveRequest({
          id: `req_${Date.now()}`,
          toolName: req.title || 'Sensitive Tool',
          riskLevel: 'HIGH',
          parameters: { message: req.message },
          reason: req.message
        })
      }
    })

    // 2. Poll IPC / AgentOrchestrator for pending backend permissions
    const pollInterval = setInterval(async () => {
      try {
        if (typeof (window as any).electronAPI?.invoke === 'function') {
          const pending = await (window as any).electronAPI.invoke('agent-get-pending-permissions')
          if (Array.isArray(pending) && pending.length > 0) {
            const req = pending[0]
            setActiveRequest({
              id: req.id,
              taskId: req.taskId,
              toolName: req.toolName,
              actionName: req.actionName,
              riskLevel: req.riskLevel,
              parameters: req.parameters || {},
              reason: req.reason
            })
          }
        }
      } catch (_e) {}
    }, 1000)

    return () => {
      unsubRenderer()
      clearInterval(pollInterval)
    }
  }, [])

  const handleDecision = async (decision: 'APPROVED' | 'DENIED') => {
    if (!activeRequest) return

    if (activeRequest.id && (window as any).electronAPI?.invoke) {
      try {
        await (window as any).electronAPI.invoke('agent-permission-decision', {
          taskId: activeRequest.taskId,
          requestId: activeRequest.id,
          decision
        })
      } catch (_e) {}
    }

    if (decision === 'APPROVED') {
      rendererPermissionManager.getPendingRequest()?.onConfirm()
    } else {
      rendererPermissionManager.cancelPending()
    }

    setActiveRequest(null)
  }

  if (!activeRequest) return null

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'border-rose-500/60 bg-rose-950/90 text-rose-300'
      case 'HIGH':
        return 'border-amber-500/60 bg-amber-950/90 text-amber-300'
      default:
        return 'border-cyan-500/60 bg-cyan-950/90 text-cyan-300'
    }
  }

  const getIcon = (toolName: string) => {
    const lower = toolName.toLowerCase()
    if (lower.includes('terminal') || lower.includes('shell') || lower.includes('exec')) {
      return <Terminal className="w-6 h-6 text-amber-400" />
    }
    if (lower.includes('delete') || lower.includes('remove') || lower.includes('unlink')) {
      return <Trash2 className="w-6 h-6 text-rose-400" />
    }
    if (lower.includes('send') || lower.includes('message') || lower.includes('email')) {
      return <Send className="w-6 h-6 text-emerald-400" />
    }
    return <Cpu className="w-6 h-6 text-cyan-400" />
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 380 }}
          className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 text-left select-none relative overflow-hidden"
        >
          {/* Top Risk Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/10">
                {getIcon(activeRequest.toolName)}
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100 tracking-wide">
                  Permission Confirmation Required
                </h3>
                <p className="text-xs text-zinc-400">
                  IRIS Agent requested execution of a sensitive tool call.
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 text-[11px] font-mono font-bold tracking-wider rounded-md border ${getRiskColor(
                activeRequest.riskLevel
              )}`}
            >
              {activeRequest.riskLevel} RISK
            </span>
          </div>

          {/* Details Card */}
          <div className="space-y-2 p-3.5 bg-zinc-900/80 border border-white/5 rounded-xl text-xs font-mono">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="text-zinc-500">Tool:</span>
              <span className="font-semibold text-cyan-300">{activeRequest.toolName}</span>
            </div>
            {activeRequest.actionName && (
              <div className="flex items-center justify-between text-zinc-300">
                <span className="text-zinc-500">Action:</span>
                <span className="text-zinc-200">{activeRequest.actionName}</span>
              </div>
            )}
            <div className="pt-2 border-t border-white/5 text-zinc-400 leading-relaxed">
              {activeRequest.reason || 'Explicit confirmation required before executing this action.'}
            </div>
            {Object.keys(activeRequest.parameters).length > 0 && (
              <div className="pt-2 border-t border-white/5 text-[11px] text-zinc-400 space-y-1">
                <span className="text-zinc-500 block">Parameters:</span>
                <pre className="p-2 rounded bg-black/50 text-amber-300/90 overflow-x-auto max-h-24">
                  {JSON.stringify(activeRequest.parameters, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* User Decision Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => handleDecision('DENIED')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white font-mono text-xs font-bold border border-white/10 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <X size={15} className="text-rose-400" />
              Deny Execution
            </button>

            <button
              onClick={() => handleDecision('APPROVED')}
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
            >
              <Check size={15} className="text-black" />
              Allow Execution
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
