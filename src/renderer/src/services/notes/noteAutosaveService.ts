/**
 * IRIS — Notes Background Auto-Save Service
 *
 * Automatically syncs pending drafts of notes to a local 'autosave' folder
 * in electron-store every 30 seconds to prevent data loss.
 */

export interface NoteDraftRecord {
  id: string
  noteId?: string
  title: string
  content: string
  createdAt: string
  lastAutosavedAt: string
  isPending: boolean
  wordCount?: number
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface AutosaveEvent {
  status: AutosaveStatus
  lastAutosavedAt?: Date
  draftId?: string
  error?: string
  message?: string
}

type DraftSupplier = () => {
  id?: string
  noteId?: string
  title: string
  content: string
} | null

type StatusListener = (event: AutosaveEvent) => void

class NoteAutosaveManager {
  private intervalId: any = null
  private draftSupplier: DraftSupplier | null = null
  private listeners = new Set<StatusListener>()
  private lastSavedHash = ''
  private lastSavedTime: Date | null = null
  private isSyncing = false
  public readonly INTERVAL_MS = 30000 // 30 seconds interval as specified

  constructor() {
    this.startBackgroundLoop()
  }

  /**
   * Start or restart background 30-second loop
   */
  public startBackgroundLoop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    this.intervalId = setInterval(() => {
      this.checkAndSyncPendingDraft()
    }, this.INTERVAL_MS)
  }

  /**
   * Register active draft supplier callback when editor is open
   */
  public registerActiveDraft(supplier: DraftSupplier) {
    this.draftSupplier = supplier
    // Reset change hash when a new note/editor is registered
    const current = supplier()
    if (current) {
      this.lastSavedHash = this.computeHash(current.title, current.content)
    }
  }

  /**
   * Unregister draft supplier when editor is closed
   */
  public unregisterActiveDraft() {
    this.draftSupplier = null
    this.lastSavedHash = ''
    this.emitStatus({ status: 'idle' })
  }

  /**
   * Subscribe to status change updates (for UI indicators)
   */
  public onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener)
    // Send current status immediately
    listener({
      status: this.isSyncing ? 'saving' : this.lastSavedTime ? 'saved' : 'idle',
      lastAutosavedAt: this.lastSavedTime || undefined
    })
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emitStatus(event: AutosaveEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (err) {
        console.error('[IRIS Autosave] Listener callback error:', err)
      }
    })
  }

  private computeHash(title: string, content: string): string {
    return `${title.trim()}:::${content.trim()}`
  }

  /**
   * Background check executed every 30 seconds
   */
  public async checkAndSyncPendingDraft(): Promise<boolean> {
    if (!this.draftSupplier || this.isSyncing) return false

    const draft = this.draftSupplier()
    if (!draft) return false

    const title = (draft.title || '').trim()
    const content = (draft.content || '').trim()

    // Nothing entered yet
    if (!title && !content) return false

    const currentHash = this.computeHash(title, content)
    // No changes since last autosave
    if (currentHash === this.lastSavedHash) return false

    return this.syncDraft(draft)
  }

  /**
   * Perform immediate sync of pending draft to electron-store autosave folder
   */
  public async syncDraft(draft: {
    id?: string
    noteId?: string
    title: string
    content: string
  }): Promise<boolean> {
    this.isSyncing = true
    this.emitStatus({
      status: 'saving',
      message: 'Syncing pending draft to electron-store autosave folder...'
    })

    try {
      const now = new Date()
      const draftId = draft.id || (draft.noteId ? `draft_${draft.noteId}` : 'draft_new_note')

      const payload: Partial<NoteDraftRecord> = {
        id: draftId,
        noteId: draft.noteId,
        title: draft.title,
        content: draft.content,
        createdAt: now.toISOString(),
        lastAutosavedAt: now.toISOString(),
        isPending: true
      }

      // Sync to electron-store via IPC
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        await electron.ipcRenderer.invoke('autosave-note-draft', payload)
      } else {
        // Fallback local storage simulation
        const raw = localStorage.getItem('iris_electron_store_autosave_notes')
        const drafts = raw ? JSON.parse(raw) : {}
        drafts[draftId] = payload
        localStorage.setItem('iris_electron_store_autosave_notes', JSON.stringify(drafts))
      }

      this.lastSavedHash = this.computeHash(draft.title, draft.content)
      this.lastSavedTime = now
      this.isSyncing = false

      this.emitStatus({
        status: 'saved',
        lastAutosavedAt: now,
        draftId,
        message: `Draft autosaved to electron-store (${now.toLocaleTimeString()})`
      })

      return true
    } catch (err: any) {
      console.error('[IRIS Autosave] Failed syncing pending draft:', err)
      this.isSyncing = false
      this.emitStatus({
        status: 'error',
        error: err?.message || 'Failed to sync draft to electron-store'
      })
      return false
    }
  }

  /**
   * Commit draft: called when note is officially saved to database
   * Removes the temporary draft from electron-store
   */
  public async commitDraft(draftId: string): Promise<void> {
    try {
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        await electron.ipcRenderer.invoke('delete-note-draft', draftId)
      } else {
        const raw = localStorage.getItem('iris_electron_store_autosave_notes')
        if (raw) {
          const drafts = JSON.parse(raw)
          delete drafts[draftId]
          localStorage.setItem('iris_electron_store_autosave_notes', JSON.stringify(drafts))
        }
      }
      this.lastSavedHash = ''
      this.emitStatus({ status: 'idle' })
    } catch (err) {
      console.warn('[IRIS Autosave] Notice committing draft:', err)
    }
  }

  /**
   * Load a draft for a note or new note if available
   */
  public async getDraft(draftId: string): Promise<NoteDraftRecord | null> {
    try {
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        return await electron.ipcRenderer.invoke('get-note-draft', draftId)
      }
      const raw = localStorage.getItem('iris_electron_store_autosave_notes')
      if (raw) {
        const drafts = JSON.parse(raw)
        return drafts[draftId] || null
      }
    } catch (err) {
      console.warn('[IRIS Autosave] Error reading draft:', err)
    }
    return null
  }

  /**
   * Get all pending drafts currently stored in electron-store autosave folder
   */
  public async listAllDrafts(): Promise<NoteDraftRecord[]> {
    try {
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        return await electron.ipcRenderer.invoke('get-note-drafts')
      }
      const raw = localStorage.getItem('iris_electron_store_autosave_notes')
      if (raw) {
        return Object.values(JSON.parse(raw))
      }
    } catch (err) {
      console.warn('[IRIS Autosave] Error listing drafts:', err)
    }
    return []
  }

  /**
   * Delete an autosaved draft
   */
  public async deleteDraft(draftId: string): Promise<boolean> {
    try {
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        await electron.ipcRenderer.invoke('delete-note-draft', draftId)
      } else {
        const raw = localStorage.getItem('iris_electron_store_autosave_notes')
        if (raw) {
          const drafts = JSON.parse(raw)
          delete drafts[draftId]
          localStorage.setItem('iris_electron_store_autosave_notes', JSON.stringify(drafts))
        }
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Get autosave status telemetry
   */
  public async getAutosaveStatus(): Promise<{
    folder: string
    count: number
    lastSync: string
    drafts: Array<{ id: string; title: string; lastAutosavedAt: string }>
  } | null> {
    try {
      const electron = (window as any).electron
      if (electron?.ipcRenderer?.invoke) {
        return await electron.ipcRenderer.invoke('get-autosave-status')
      }
      const drafts = await this.listAllDrafts()
      return {
        folder: 'electron-store/autosave',
        count: drafts.length,
        lastSync: drafts[0]?.lastAutosavedAt || new Date().toISOString(),
        drafts: drafts.map((d) => ({
          id: d.id,
          title: d.title,
          lastAutosavedAt: d.lastAutosavedAt
        }))
      }
    } catch {
      return null
    }
  }

  public destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.listeners.clear()
  }
}

export const noteAutosaveService = new NoteAutosaveManager()
