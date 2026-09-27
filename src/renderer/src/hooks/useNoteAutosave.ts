import { useState, useEffect, useCallback, useRef } from 'react'
import {
  noteAutosaveService,
  NoteDraftRecord,
  AutosaveStatus
} from '../services/notes/noteAutosaveService'

interface UseNoteAutosaveProps {
  id?: string | null
  noteId?: string | null
  title: string
  content: string
  isEditorOpen: boolean
  onRestoreDraft?: (draft: NoteDraftRecord) => void
}

export function useNoteAutosave({
  id,
  noteId,
  title,
  content,
  isEditorOpen,
  onRestoreDraft
}: UseNoteAutosaveProps) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastAutosavedAt, setLastAutosavedAt] = useState<Date | null>(null)
  const [pendingDraft, setPendingDraft] = useState<NoteDraftRecord | null>(null)
  const [autosaveCount, setAutosaveCount] = useState<number>(0)

  // Keep references to latest title and content for supplier callback
  const draftRef = useRef({ id, noteId, title, content })
  useEffect(() => {
    draftRef.current = { id, noteId, title, content }
  }, [id, noteId, title, content])

  const currentDraftId = id || (noteId ? `draft_${noteId}` : 'draft_new_note')

  // Check for any pre-existing pending draft on mount or when opening editor
  const checkForPendingDraft = useCallback(async () => {
    if (!currentDraftId) return
    const draft = await noteAutosaveService.getDraft(currentDraftId)
    if (draft && draft.isPending && (draft.title !== title || draft.content !== content)) {
      setPendingDraft(draft)
    } else {
      setPendingDraft(null)
    }
  }, [currentDraftId, title, content])

  // Register supplier with background service whenever editor is active
  useEffect(() => {
    if (isEditorOpen) {
      noteAutosaveService.registerActiveDraft(() => {
        const { id: dId, noteId: dNoteId, title: dTitle, content: dContent } = draftRef.current
        return {
          id: dId || (dNoteId ? `draft_${dNoteId}` : 'draft_new_note'),
          noteId: dNoteId || undefined,
          title: dTitle,
          content: dContent
        }
      })

      checkForPendingDraft()
    } else {
      noteAutosaveService.unregisterActiveDraft()
      setPendingDraft(null)
    }

    return () => {
      noteAutosaveService.unregisterActiveDraft()
    }
  }, [isEditorOpen, checkForPendingDraft])

  // Listen for autosave status changes (every 30 seconds or on manual trigger)
  useEffect(() => {
    const unsubscribe = noteAutosaveService.onStatusChange((event) => {
      setStatus(event.status)
      if (event.lastAutosavedAt) {
        setLastAutosavedAt(event.lastAutosavedAt)
        setAutosaveCount((c) => c + 1)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // Restore the pending draft
  const restoreDraft = useCallback(() => {
    if (pendingDraft) {
      if (onRestoreDraft) {
        onRestoreDraft(pendingDraft)
      }
      setPendingDraft(null)
    }
  }, [pendingDraft, onRestoreDraft])

  // Discard the pending draft
  const discardDraft = useCallback(async () => {
    if (currentDraftId) {
      await noteAutosaveService.deleteDraft(currentDraftId)
      setPendingDraft(null)
    }
  }, [currentDraftId])

  // Force immediate sync to autosave
  const triggerImmediateAutosave = useCallback(async () => {
    const { id: dId, noteId: dNoteId, title: dTitle, content: dContent } = draftRef.current
    return await noteAutosaveService.syncDraft({
      id: dId || (dNoteId ? `draft_${dNoteId}` : 'draft_new_note'),
      noteId: dNoteId || undefined,
      title: dTitle,
      content: dContent
    })
  }, [])

  // Commit and clear draft upon official save
  const commitDraft = useCallback(async () => {
    if (currentDraftId) {
      await noteAutosaveService.commitDraft(currentDraftId)
      setPendingDraft(null)
    }
  }, [currentDraftId])

  return {
    status,
    lastAutosavedAt,
    pendingDraft,
    autosaveCount,
    restoreDraft,
    discardDraft,
    triggerImmediateAutosave,
    commitDraft,
    intervalSeconds: 30
  }
}
