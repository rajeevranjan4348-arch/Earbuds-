import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  RiStickyNoteLine,
  RiDeleteBinLine,
  RiFileTextLine,
  RiMarkdownLine,
  RiAddLine,
  RiSave3Line,
  RiCloseLine,
  RiEditLine,
  RiArrowLeftLine,
  RiCloudLine
} from 'react-icons/ri'
import { auth, firestore } from '../lib/firebase'
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'

interface Note {
  id: string
  filename: string
  title: string
  content: string
  createdAt: Date | string
}

const MarkdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    return !inline ? (
      <div className="bg-black/50 rounded-lg p-3 my-2 border border-white/10 font-mono text-xs overflow-x-auto">
        <code {...props}>{children}</code>
      </div>
    ) : (
      <code
        className="bg-white/10 px-1 py-0.5 rounded text-emerald-400 font-mono text-xs"
        {...props}
      >
        {children}
      </code>
    )
  }
}

const LOCAL_STORAGE_KEY = 'iris_persisted_notes'

const NotesView = ({ glassPanel }: { glassPanel?: string }) => {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [isCloudSynced, setIsCloudSynced] = useState(false)

  // Listen to Firestore if authenticated, or localStorage
  useEffect(() => {
    // Wait for Firebase Auth to restore persisted session before deciding to show local notes
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // User is authenticated - load from Firestore
        const notesRef = collection(firestore, 'users', user.uid, 'notes')
        const q = query(notesRef, orderBy('createdAt', 'desc'))
        const unsubFirestore = onSnapshot(
          q,
          (snapshot) => {
            const loaded: Note[] = []
            snapshot.forEach((d) => {
              const data = d.data()
              loaded.push({
                id: d.id,
                filename: d.id,
                title: data.title || 'Untitled Note',
                content: data.content || '',
                createdAt: data.createdAt?.toDate
                  ? data.createdAt.toDate()
                  : data.createdAt || new Date()
              })
            })
            setNotes(loaded)
            setIsCloudSynced(true)
          },
          (err) => {
            console.warn('Firestore snapshot notice:', err.message)
            loadLocalNotes()
          }
        )
        return () => unsubFirestore()
      } else {
        // No user authenticated - check if Firebase is still initializing
        // If auth is still loading, don't show local notes yet
        // The onAuthStateChanged will fire again when Firebase finishes initializing
        loadLocalNotes()
        return undefined
      }
    })

    return () => unsubAuth()
  }, [])

  const loadLocalNotes = () => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setNotes(parsed)
      } else {
        // Initial welcome note
        const initial: Note[] = [
          {
            id: 'note_intro_01',
            filename: 'note_intro_01',
            title: 'IRIS NEURAL MEMORY ARCHITECTURE',
            content:
              '# Welcome to IRIS Memory Bank\n\n- **Cloud Storage**: Firebase Firestore & Cloud SQL PostgreSQL (asia-southeast1)\n- **Live Workspace**: Bidirectional link with Google Drive, Gmail, Docs, Sheets, Calendar & Tasks\n- **Spatial Engine**: Google Maps GIS telemetry with custom waypoints\n\nAll notes and transcripts persist securely across sessions.',
            createdAt: new Date()
          }
        ]
        setNotes(initial)
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initial))
      }
    } catch {
      // Fallback
    }
  }

  const startCreating = () => {
    setSelectedNote(null)
    setEditId(null)
    setNewTitle('')
    setNewContent('')
    setIsEditorOpen(true)
  }

  const startEditing = () => {
    if (!selectedNote) return
    setEditId(selectedNote.id)
    setNewTitle(selectedNote.title)
    setNewContent(selectedNote.content)
    setIsEditorOpen(true)
  }

  const cancelEditor = () => {
    setIsEditorOpen(false)
    setEditId(null)
  }

  const saveManualNote = async () => {
    if (!newTitle.trim() || !newContent.trim()) return

    const user = auth.currentUser
    const id = editId || `note_${Date.now()}`
    const noteObj: Note = {
      id,
      filename: id,
      title: newTitle.trim(),
      content: newContent.trim(),
      createdAt: new Date().toISOString()
    }

    if (user) {
      try {
        await setDoc(doc(firestore, 'users', user.uid, 'notes', id), {
          id,
          userId: user.uid,
          title: newTitle.trim(),
          content: newContent.trim(),
          createdAt: new Date()
        })
      } catch (err) {
        console.warn('Firestore write fallback to local:', err)
      }
    }

    // Always update local state & localStorage
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== id)
      const nextList = [noteObj, ...filtered]
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList))
      return nextList
    })

    setIsEditorOpen(false)
    setEditId(null)
    setSelectedNote(noteObj)
  }

  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    // Use Firebase Auth state to get current user
    // Firebase Auth automatically persists, so auth.currentUser will be correct
    const user = auth.currentUser
    if (user) {
      try {
        await deleteDoc(doc(firestore, 'users', user.uid, 'notes', id))
      } catch (err) {
        console.warn('Firestore delete error:', err)
      }
    }

    setNotes((prev) => {
      const nextList = prev.filter((n) => n.id !== id)
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList))
      return nextList
    })

    if (selectedNote?.id === id) setSelectedNote(null)
  }

  return (
    <div className="flex-1 bg-white/5 h-full flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-6 p-2.5 sm:p-4 md:p-6 animate-in fade-in zoom-in duration-300 overflow-hidden">
      {/* Note List column: visible on desktop or when no note/editor is active on mobile */}
      <div
        className={`${
          isEditorOpen || selectedNote ? 'hidden md:flex' : 'flex'
        } col-span-12 md:col-span-4 flex-col gap-3 md:gap-4 h-full overflow-hidden`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2 text-zinc-100">
            <RiStickyNoteLine className="text-emerald-400" />
            <span className="text-xs font-bold tracking-widest">MEMORY BANK</span>
          </div>

          <div className="flex items-center gap-2">
            {isCloudSynced ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                <RiCloudLine size={12} />
                <span>FIRESTORE</span>
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500 font-mono mr-2">{notes.length} ITEMS</span>
            )}
            <button
              onClick={startCreating}
              className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500 hover:text-black transition-all cursor-pointer"
              title="Create Manual Note"
            >
              <RiAddLine size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 sm:pr-2 scrollbar-small">
          {notes.length === 0 ? (
            <div className="text-center text-zinc-400 text-xs mt-10">
              <p>No memories saved.</p>
              <p className="mt-2 opacity-50">Click + or ask IRIS.</p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  setIsEditorOpen(false)
                  setSelectedNote(note)
                }}
                className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  selectedNote?.id === note.id && !isEditorOpen
                    ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                    : 'bg-zinc-900/40 border-white/5 hover:bg-white/5 hover:border-white/10'
                }`}
              >
                <div className="overflow-hidden">
                  <h3
                    className={`text-xs font-bold truncate ${
                      selectedNote?.id === note.id && !isEditorOpen
                        ? 'text-emerald-100'
                        : 'text-zinc-200'
                    }`}
                  >
                    {note.title.toUpperCase()}
                  </h3>
                  <p className="text-[9px] text-zinc-500 mt-1 font-mono">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <button
                  onClick={(e) => deleteNote(note.id, e)}
                  className="opacity-60 md:opacity-0 md:group-hover:opacity-100 p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor / Reader column: visible on desktop or when active on mobile */}
      <div
        className={`${
          isEditorOpen || selectedNote ? 'flex' : 'hidden md:flex'
        } col-span-12 md:col-span-8 ${glassPanel || ''} bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl flex-col overflow-hidden relative h-full`}
      >
        {isEditorOpen ? (
          <div className="flex-1 flex flex-col p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4 gap-2">
              <button
                onClick={cancelEditor}
                className="md:hidden p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5"
                title="Back to list"
              >
                <RiArrowLeftLine size={18} />
              </button>
              <input
                type="text"
                placeholder="ENTER NOTE TITLE..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-transparent border-none outline-none text-base sm:text-lg font-bold text-white placeholder-zinc-500 w-full tracking-wider"
                autoFocus
              />
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={cancelEditor}
                  className="p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <RiCloseLine size={20} />
                </button>
              </div>
            </div>

            <textarea
              placeholder="Write your note in Markdown..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none resize-none text-xs sm:text-sm font-mono text-zinc-50 placeholder-zinc-500 leading-relaxed p-2 scrollbar-small"
            />

            <div className="flex justify-end pt-3 sm:pt-4">
              <button
                onClick={saveManualNote}
                disabled={!newTitle || !newContent}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-emerald-500 text-black font-bold text-xs rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <RiSave3Line /> {editId ? 'UPDATE MEMORY' : 'SAVE TO MEMORY'}
              </button>
            </div>
          </div>
        ) : selectedNote ? (
          <>
            <div className="h-12 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 bg-white/5 shrink-0">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <button
                  onClick={() => setSelectedNote(null)}
                  className="md:hidden p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5"
                  title="Back to list"
                >
                  <RiArrowLeftLine size={18} />
                </button>
                <RiMarkdownLine size={18} className="opacity-50 shrink-0" />
                <span className="text-xs font-bold tracking-wider truncate">
                  {selectedNote.title}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <span className="text-[9px] font-mono text-zinc-400 bg-black/20 px-2 py-1 rounded">
                  READ ONLY
                </span>
                <button
                  onClick={startEditing}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors p-1"
                  title="Edit Note"
                >
                  <RiEditLine size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 scrollbar-small bg-zinc-950/30">
              <div className="prose prose-invert prose-sm max-w-none text-zinc-300 break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                  {selectedNote.content}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-200 gap-4 p-4 text-center">
            <RiFileTextLine size={48} className="opacity-20" />
            <span className="text-xs tracking-widest opacity-50">
              SELECT A DATA NODE OR CREATE NEW
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default NotesView
