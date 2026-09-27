import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiGoogleFill,
  RiDriveLine,
  RiFileExcelLine,
  RiMailLine,
  RiCalendarLine,
  RiFileTextLine,
  RiPresentationLine,
  RiTaskLine,
  RiChat3Line,
  RiSurveyLine,
  RiVideoChatLine,
  RiContactsLine,
  RiFolderDownloadLine,
  RiGraduationCapLine,
  RiDatabase2Line,
  RiCheckLine,
  RiRefreshLine,
  RiAddLine,
  RiExternalLinkLine,
  RiLogoutBoxRLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiStickyNoteLine,
  RiDeleteBinLine,
  RiPushpinLine,
  RiPushpinFill,
  RiCheckboxCircleLine,
  RiCheckboxBlankCircleLine,
  RiFileCopyLine,
  RiCloseLine,
  RiListCheck
} from 'react-icons/ri'
import {
  auth,
  browserLocalPersistence,
  setPersistence,
  signInWithGoogle,
  logOutGoogle,
  getCachedAccessToken,
  setCachedAccessToken,
  getCachedWorkspaceUser,
  setCachedWorkspaceUser,
  useAuth,
  syncSessionToBackend
} from '../lib/firebase'
import { GoogleWorkspaceService, WorkspaceItem } from '../services/workspace'
import { User } from 'firebase/auth'
import WorkspaceHub from '../components/UI/WorkspaceHub'
import AuthFailureView from '../components/UI/AuthFailureView'
import WorkspaceTelemetryAnalytics from '../components/UI/WorkspaceTelemetryAnalytics'
import { WorkspaceLoginHistoryView } from '../components/UI/WorkspaceLoginHistoryView'
import { WorkspaceSkeleton } from '../components/UI/SkeletonLoader'
import { ShieldAlert, Activity } from 'lucide-react'

type WorkspaceTab =
  | 'HUB'
  | 'HISTORY'
  | 'TELEMETRY'
  | 'DIAGNOSTICS'
  | 'DRIVE'
  | 'KEEP'
  | 'GMAIL'
  | 'CALENDAR'
  | 'TASKS'
  | 'MEET'
  | 'CONTACTS'
  | 'SHEETS'
  | 'DOCS'
  | 'SLIDES'
  | 'FORMS'
  | 'CHAT'
  | 'CLASSROOM'
  | 'PICKER'

export const GoogleWorkspaceView = ({ glassPanel }: { glassPanel?: string }) => {
  const { authLoading, user: authUser } = useAuth()
  const [user, setUser] = useState<any>(() => auth.currentUser || getCachedWorkspaceUser())
  const [token, setToken] = useState<string | null>(getCachedAccessToken())
  const [activeSubTab, setActiveSubTab] = useState<WorkspaceTab>('HUB')
  const [items, setItems] = useState<WorkspaceItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isSyncingSql, setIsSyncingSql] = useState(false)
  const [createdMeetUrl, setCreatedMeetUrl] = useState<string | null>(null)

  // Quick action form states
  const [taskInput, setTaskInput] = useState('')
  const [docTitleInput, setDocTitleInput] = useState('')
  const [sheetTitleInput, setSheetTitleInput] = useState('')
  const [calTitleInput, setCalTitleInput] = useState('')

  // Google Keep states
  const [keepNotes, setKeepNotes] = useState<any[]>([])
  const [keepTitle, setKeepTitle] = useState('')
  const [keepText, setKeepText] = useState('')
  const [keepListItems, setKeepListItems] = useState<string[]>([])
  const [keepItemInput, setKeepItemInput] = useState('')
  const [keepColor, setKeepColor] = useState('amber')
  const [keepIsPinned, setKeepIsPinned] = useState(false)
  const [isChecklistMode, setIsChecklistMode] = useState(false)
  const [keepSearchQuery, setKeepSearchQuery] = useState('')
  const [keepFilter, setKeepFilter] = useState<'all' | 'pinned' | 'checklist'>('all')
  const [noteToDelete, setNoteToDelete] = useState<any | null>(null)
  const [isDeletingNote, setIsDeletingNote] = useState(false)

  // Listen to auth and synchronize with Centralized Session Manager
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedToken = getCachedAccessToken()
        const savedUser = getCachedWorkspaceUser()
        if (savedToken) {
          setToken(savedToken)
        }
        if (savedUser) {
          setUser((prev: any) => prev || savedUser)
        }

        const currentUid = auth.currentUser?.uid || savedUser?.uid || ''
        const res = await fetch(`/api/workspace/auth/session${currentUid ? `?userId=${encodeURIComponent(currentUid)}` : ''}`)
        if (res.ok) {
          const data = await res.json()
          if (data.session) {
            if (data.session.accessToken) {
              setToken(data.session.accessToken)
              setCachedAccessToken(data.session.accessToken)
            }
            if (data.session.email) {
              const restoredUser: any = {
                uid: data.session.userId || savedUser?.uid || 'usr_kumarimamta87565',
                email: data.session.email,
                displayName: data.session.displayName || 'Mamta Kumari',
                photoURL: savedUser?.photoURL
              }
              setUser(restoredUser)
              setCachedWorkspaceUser(restoredUser)
            }
          }
        }
      } catch (_e) {}
    }

    checkSession()

    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        setUser(u)
        setCachedWorkspaceUser({
          uid: u.uid,
          email: u.email || 'kumarimamta87565@gmail.com',
          displayName: u.displayName || 'Mamta Kumari',
          photoURL: u.photoURL || undefined
        })
      } else {
        const cached = getCachedWorkspaceUser()
        if (cached) {
          setUser(cached)
        }
      }
      const currentToken = getCachedAccessToken()
      if (currentToken) {
        setToken(currentToken)
        if (u) {
          syncSessionToBackend({ accessToken: currentToken, user: u })
        }
      }
    })

    const handleSelectService = (e: any) => {
      const svc = (e.detail?.service || '').toUpperCase()
      if (svc && ['HUB', 'HISTORY', 'TELEMETRY', 'DIAGNOSTICS', 'DRIVE', 'KEEP', 'GMAIL', 'CALENDAR', 'TASKS', 'MEET', 'CONTACTS', 'SHEETS', 'DOCS', 'SLIDES', 'FORMS', 'CHAT', 'CLASSROOM', 'PICKER'].includes(svc)) {
        setActiveSubTab(svc as WorkspaceTab)
      }
    }
    window.addEventListener('iris:workspace-select-service', handleSelectService)

    return () => {
      unsub()
      window.removeEventListener('iris:workspace-select-service', handleSelectService)
    }
  }, [])

  // Google Sign-In Handler
  const handleSignIn = async () => {
    try {
      setStatusMessage('Authenticating with Google Workspace...')
      await setPersistence(auth, browserLocalPersistence)
      const res = await signInWithGoogle()
      setUser(res.user)
      setToken(res.accessToken)
      setCachedAccessToken(res.accessToken)
      setStatusMessage(`Authenticated as ${res.user.email}`)
      setTimeout(() => setStatusMessage(null), 3000)

      // Register user in Cloud SQL
      fetch('/api/db/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: res.user.uid,
          email: res.user.email,
          displayName: res.user.displayName
        })
      }).catch(() => {})
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setStatusMessage('Sign-in cancelled.')
      } else {
        console.error('Google Sign In failed:', err)
        setStatusMessage(`Sign in failed: ${err.message || 'Access popup closed'}`)
      }
      setTimeout(() => setStatusMessage(null), 3000)
    }
  }

  const handleSignOut = async () => {
    await logOutGoogle()
    setUser(null)
    setToken(null)
    setItems([])
    setStatusMessage('Logged out from Google Workspace')
    setTimeout(() => setStatusMessage(null), 2500)
  }

  // Load items for active sub-tab
  const loadTabItems = useCallback(async () => {
    setIsLoading(true)
    const client = new GoogleWorkspaceService(token)

    try {
      let results: WorkspaceItem[] = []
      switch (activeSubTab) {
        case 'DRIVE':
          results = await client.listDriveFiles()
          break
        case 'KEEP': {
          const keepData = await client.listKeepNotes()
          setKeepNotes(keepData)
          results = keepData.map((k: any) => ({
            id: k.id,
            service: 'keep',
            title: k.title,
            subtitle: k.text || (k.listItems && k.listItems.length > 0 ? `${k.listItems.length} checklist items` : ''),
            date: k.updatedAt || k.createdAt,
            extra: k
          }))
          break
        }
        case 'GMAIL':
          results = await client.listGmailMessages()
          break
        case 'CALENDAR':
          results = await client.listCalendarEvents()
          break
        case 'TASKS':
          results = await client.listTasks()
          break
        case 'CONTACTS':
          results = await client.listContacts()
          break
        case 'CHAT':
          results = await client.listChatSpaces()
          break
        case 'CLASSROOM':
          results = await client.listClassroomCourses()
          break
        default:
          results = []
      }
      setItems(results)
    } catch (err: any) {
      console.warn(`Error loading ${activeSubTab}:`, err)
      const rawMsg = err?.message || ''
      const isAuthError =
        rawMsg.toLowerCase().includes('token expired') ||
        rawMsg.toLowerCase().includes('unauthorized') ||
        rawMsg.toLowerCase().includes('401') ||
        rawMsg.toLowerCase().includes('invalid authentication credentials') ||
        rawMsg.toLowerCase().includes('expected oauth 2 access token')

      if (isAuthError) {
        // Attempt silent refresh via backend first
        try {
          const refRes = await fetch('/api/workspace/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          })
          const refData = await refRes.json()
          if (refData.success && refData.accessToken) {
            setToken(refData.accessToken)
            setCachedAccessToken(refData.accessToken)
            // Retry loading with fresh token
            const freshClient = new GoogleWorkspaceService(refData.accessToken)
            let retryResults: WorkspaceItem[] = []
            switch (activeSubTab) {
              case 'DRIVE':
                retryResults = await freshClient.listDriveFiles()
                break
              case 'KEEP': {
                const keepData = await freshClient.listKeepNotes()
                setKeepNotes(keepData)
                retryResults = keepData.map((k: any) => ({
                  id: k.id,
                  service: 'keep',
                  title: k.title,
                  subtitle: k.text || (k.listItems && k.listItems.length > 0 ? `${k.listItems.length} checklist items` : ''),
                  date: k.updatedAt || k.createdAt,
                  extra: k
                }))
                break
              }
              case 'GMAIL':
                retryResults = await freshClient.listGmailMessages()
                break
              case 'CALENDAR':
                retryResults = await freshClient.listCalendarEvents()
                break
              case 'TASKS':
                retryResults = await freshClient.listTasks()
                break
              case 'CONTACTS':
                retryResults = await freshClient.listContacts()
                break
              case 'CHAT':
                retryResults = await freshClient.listChatSpaces()
                break
              case 'CLASSROOM':
                retryResults = await freshClient.listClassroomCourses()
                break
            }
            setItems(retryResults)
            return
          }
        } catch (_refreshErr) {}

        setToken(null)
        setCachedAccessToken(null)
        setItems([])
        setStatusMessage('Google Workspace connection required. Please connect your account below.')
      } else if (rawMsg.trim()) {
        setStatusMessage(rawMsg.startsWith('Notice:') ? rawMsg : `Notice: ${rawMsg}`)
      }
    } finally {
      setIsLoading(false)
    }
  }, [activeSubTab, token])

  useEffect(() => {
    if (token) {
      loadTabItems()
    }
  }, [token, activeSubTab, loadTabItems])

  // Sync current items to Cloud SQL
  const syncToCloudSql = async () => {
    if (!items.length) return
    setIsSyncingSql(true)
    try {
      for (const item of items.slice(0, 5)) {
        await fetch('/api/db/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user?.uid || 'usr_kumarimamta87565',
            service: item.service,
            itemId: item.id,
            title: item.title,
            url: item.link || '',
            snippet: item.subtitle || ''
          })
        })
      }
      setStatusMessage('Active Workspace items mirrored to Cloud SQL (asia-southeast1)')
      setTimeout(() => setStatusMessage(null), 3000)
    } catch (e) {
      console.error('SQL Sync failed:', e)
    } finally {
      setIsSyncingSql(false)
    }
  }

  // Quick Action: Google Meet Space Creation
  const handleCreateMeet = async () => {
    if (!token) return
    setIsLoading(true)
    try {
      const client = new GoogleWorkspaceService(token)
      const data = await client.createMeetSpace()
      const meetUri =
        data.meetingUri ||
        (data.name
          ? `https://meet.google.com/lookup/${data.name.split('/').pop()}`
          : 'https://meet.google.com/new')
      setCreatedMeetUrl(meetUri)
      setStatusMessage('New Google Meet Space generated!')
    } catch (err: any) {
      // Fallback
      setCreatedMeetUrl('https://meet.google.com/new')
    } finally {
      setIsLoading(false)
    }
  }

  // Quick Action: Create Doc
  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !docTitleInput.trim()) return
    setIsLoading(true)
    try {
      const client = new GoogleWorkspaceService(token)
      const doc = await client.createDocument(docTitleInput.trim())
      setStatusMessage(`Google Doc created: ${doc.title || docTitleInput}`)
      setDocTitleInput('')
      loadTabItems()
    } catch (err: any) {
      setStatusMessage(`Failed: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Quick Action: Create Sheet
  const handleCreateSheet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !sheetTitleInput.trim()) return
    setIsLoading(true)
    try {
      const client = new GoogleWorkspaceService(token)
      const sheet = await client.createSpreadsheet(sheetTitleInput.trim())
      setStatusMessage(`Google Sheet created: ${sheet.properties?.title || sheetTitleInput}`)
      setSheetTitleInput('')
    } catch (err: any) {
      setStatusMessage(`Failed: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Quick Action: Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !taskInput.trim()) return
    setIsLoading(true)
    try {
      const client = new GoogleWorkspaceService(token)
      await client.createTask(taskInput.trim())
      setTaskInput('')
      setStatusMessage('Task added to Google Tasks')
      loadTabItems()
    } catch (err: any) {
      setStatusMessage(`Failed: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Google Keep Handlers
  const handleCreateKeepNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!keepTitle.trim()) {
      setStatusMessage('Please provide a title for the Google Keep note.')
      setTimeout(() => setStatusMessage(null), 3000)
      return
    }

    setIsLoading(true)
    try {
      const client = new GoogleWorkspaceService(token)
      const created = await client.createKeepNote({
        title: keepTitle.trim(),
        text: keepText.trim(),
        listItems: keepListItems,
        color: keepColor,
        isPinned: keepIsPinned
      })
      setKeepTitle('')
      setKeepText('')
      setKeepListItems([])
      setKeepItemInput('')
      setKeepIsPinned(false)
      setIsChecklistMode(false)
      setStatusMessage(`Google Keep note created: "${created.title}"`)
      setTimeout(() => setStatusMessage(null), 3500)
      loadTabItems()
    } catch (err: any) {
      setStatusMessage(`Failed to create Keep note: ${err?.message}`)
      setTimeout(() => setStatusMessage(null), 4000)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteKeepNote = async (note: any) => {
    setIsDeletingNote(true)
    try {
      const client = new GoogleWorkspaceService(token)
      await client.deleteKeepNote(note.id)
      setNoteToDelete(null)
      setStatusMessage(`Deleted Keep note: "${note.title}"`)
      setTimeout(() => setStatusMessage(null), 3500)
      loadTabItems()
    } catch (err: any) {
      setStatusMessage(`Failed to delete note: ${err?.message}`)
      setTimeout(() => setStatusMessage(null), 4000)
    } finally {
      setIsDeletingNote(false)
    }
  }

  const handleToggleKeepListItem = async (noteId: string, index: number) => {
    try {
      const client = new GoogleWorkspaceService(token)
      await client.toggleKeepListItem(noteId, index)
      loadTabItems()
    } catch (err: any) {
      console.warn('Failed to toggle item:', err)
    }
  }

  const handleExportToIrisNotes = async (note: any) => {
    try {
      const noteContent = [
        note.text || '',
        note.listItems && note.listItems.length > 0
          ? '\n\n### Checklist:\n' + note.listItems.map((li: any) => `- [${li.checked ? 'x' : ' '}] ${li.text}`).join('\n')
          : ''
      ].join('')

      const raw = localStorage.getItem('iris_persisted_notes')
      const list = raw ? JSON.parse(raw) : []
      list.unshift({
        id: `note_keep_${Date.now()}`,
        filename: `keep_${Date.now()}`,
        title: note.title || 'Imported Keep Note',
        content: noteContent,
        createdAt: new Date().toISOString()
      })
      localStorage.setItem('iris_persisted_notes', JSON.stringify(list))

      setStatusMessage(`Exported "${note.title}" to IRIS Neural Notes!`)
      setTimeout(() => setStatusMessage(null), 3500)
    } catch (err: any) {
      setStatusMessage(`Export error: ${err?.message}`)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const addChecklistItem = () => {
    if (!keepItemInput.trim()) return
    setKeepListItems((prev) => [...prev, keepItemInput.trim()])
    setKeepItemInput('')
  }

  const removeChecklistItem = (index: number) => {
    setKeepListItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Google Picker API Launcher
  const launchGooglePicker = () => {
    if (!token) return

    const loadPickerScript = () => {
      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      script.onload = () => {
        ;(window as any).gapi.load('picker', () => {
          const pickerOrigin =
            window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
              ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
              : window.location.origin

          const google = (window as any).google
          const picker = new google.picker.PickerBuilder()
            .addView(google.picker.ViewId.DOCS)
            .addView(google.picker.ViewId.SPREADSHEETS)
            .addView(google.picker.ViewId.PRESENTATIONS)
            .setOAuthToken(token)
            .setCallback((data: any) => {
              if (data.action === google.picker.Action.PICKED) {
                const doc = data.docs[0]
                setStatusMessage(`File Selected via Picker: ${doc.name}`)
                setTimeout(() => setStatusMessage(null), 4000)
              }
            })
            .setOrigin(pickerOrigin)
            .build()
          picker.setVisible(true)
        })
      }
      document.body.appendChild(script)
    }

    if ((window as any).gapi) {
      ;(window as any).gapi.load('picker', () => {
        const pickerOrigin =
          window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
            ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
            : window.location.origin

        const google = (window as any).google
        const picker = new google.picker.PickerBuilder()
          .addView(google.picker.ViewId.DOCS)
          .setOAuthToken(token)
          .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
              const doc = data.docs[0]
              setStatusMessage(`Picked: ${doc.name}`)
            }
          })
          .setOrigin(pickerOrigin)
          .build()
        picker.setVisible(true)
      })
    } else {
      loadPickerScript()
    }
  }

  const subTabs = [
    { id: 'HUB', label: 'Hub & Status', icon: <RiShieldCheckLine size={15} /> },
    { id: 'HISTORY', label: 'Login History', icon: <RiTimeLine size={15} className="text-cyan-400" /> },
    { id: 'TELEMETRY', label: 'Telemetry & Latency', icon: <Activity size={15} className="text-[#00ff41]" /> },
    { id: 'DIAGNOSTICS', label: 'Auth Failures', icon: <ShieldAlert size={15} className="text-red-400" /> },
    { id: 'DRIVE', label: 'Drive', icon: <RiDriveLine size={15} /> },
    { id: 'KEEP', label: 'Keep', icon: <RiStickyNoteLine size={15} className="text-amber-400" /> },
    { id: 'SHEETS', label: 'Sheets', icon: <RiFileExcelLine size={15} /> },
    { id: 'GMAIL', label: 'Gmail', icon: <RiMailLine size={15} /> },
    { id: 'CALENDAR', label: 'Calendar', icon: <RiCalendarLine size={15} /> },
    { id: 'DOCS', label: 'Docs', icon: <RiFileTextLine size={15} /> },
    { id: 'SLIDES', label: 'Slides', icon: <RiPresentationLine size={15} /> },
    { id: 'TASKS', label: 'Tasks', icon: <RiTaskLine size={15} /> },
    { id: 'MEET', label: 'Meet', icon: <RiVideoChatLine size={15} /> },
    { id: 'CHAT', label: 'Chat', icon: <RiChat3Line size={15} /> },
    { id: 'CONTACTS', label: 'Contacts', icon: <RiContactsLine size={15} /> },
    { id: 'CLASSROOM', label: 'Classroom', icon: <RiGraduationCapLine size={15} /> },
    { id: 'FORMS', label: 'Forms', icon: <RiSurveyLine size={15} /> },
    { id: 'PICKER', label: 'Picker', icon: <RiFolderDownloadLine size={15} /> }
  ]

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full w-full gap-3 overflow-hidden text-zinc-100 font-mono">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/80 border border-white/10 rounded-xl backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <RiGoogleFill size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs tracking-wider uppercase text-zinc-100">
                Google Workspace 1P Gateway
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                OAuth 2.0 Linked
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Drive, Sheets, Gmail, Calendar, Docs, Slides, Tasks, Chat, Forms, Meet, Contacts,
              Picker & Classroom
            </p>
          </div>
        </div>

        {/* Auth status & Action buttons */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-white/10 rounded-lg text-xs">
                {user.photoURL && (
                  <img src={user.photoURL} alt="Avatar" className="w-4 h-4 rounded-full" />
                )}
                <span className="text-zinc-300 text-[11px] max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
              </div>

              <button
                onClick={syncToCloudSql}
                disabled={isSyncingSql || !items.length}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-emerald-400 text-xs rounded-lg transition-colors"
                title="Sync current items to Cloud SQL PostgreSQL"
              >
                <RiDatabase2Line size={13} />
                <span className="text-[10px]">Sync to SQL</span>
              </button>

              <button
                onClick={handleSignOut}
                className="p-1.5 bg-zinc-900 hover:bg-red-950/40 border border-white/10 text-zinc-400 hover:text-red-400 text-xs rounded-lg transition-colors"
                title="Disconnect Account"
              >
                <RiLogoutBoxRLine size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-white text-zinc-900 hover:bg-zinc-200 text-xs font-bold rounded-lg tracking-wider transition-all shadow-md active:scale-95"
            >
              <RiGoogleFill size={15} />
              <span>Connect Google Workspace</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-zinc-900/90 border border-blue-500/30 text-blue-300 rounded-lg">
          <div className="flex items-center gap-2">
            <RiShieldCheckLine size={14} className="shrink-0" />
            <span>{statusMessage}</span>
          </div>
          {!token && (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[11px] shrink-0 transition-all shadow"
            >
              <RiGoogleFill size={12} />
              <span>Connect Now</span>
            </button>
          )}
        </div>
      )}

      {/* Workspace Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1.5 bg-zinc-950/70 border border-white/5 rounded-xl shrink-0 relative">
        {subTabs.map((tab) => (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveSubTab(tab.id as WorkspaceTab)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wider uppercase transition-colors shrink-0 cursor-pointer ${
              activeSubTab === tab.id
                ? 'text-blue-300 font-bold'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            {activeSubTab === tab.id && (
              <motion.div
                layoutId="workspaceSubTabPill"
                className="absolute inset-0 bg-blue-500/20 border border-blue-500/40 rounded-lg shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10">{tab.icon}</span>
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'HUB' ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <WorkspaceHub onSelectServiceTab={(tabId) => setActiveSubTab(tabId as WorkspaceTab)} />
        </div>
      ) : activeSubTab === 'HISTORY' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkspaceLoginHistoryView
            onReauthenticate={handleSignIn}
            onSignOut={handleSignOut}
          />
        </div>
      ) : activeSubTab === 'TELEMETRY' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkspaceTelemetryAnalytics />
        </div>
      ) : activeSubTab === 'DIAGNOSTICS' ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <AuthFailureView
            onReauthenticate={handleSignIn}
            onNavigateService={(tabId) => setActiveSubTab(tabId as WorkspaceTab)}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-zinc-950/80 border border-white/10 rounded-xl p-4 flex flex-col overflow-hidden shadow-2xl">
          {authLoading ? (
            <div className="h-full w-full flex items-center justify-center">
              <WorkspaceSkeleton />
            </div>
          ) : !token ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <RiGoogleFill size={26} />
              </div>
              <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">
                Authentication Required
              </h3>
              <p className="text-xs text-zinc-400 max-w-md leading-relaxed">
                Connect your authorized Google Workspace account to unlock live bidirectional
                synchronization with Drive, Gmail, Calendar, Sheets, Docs, Tasks, Meet, and Classroom.
              </p>
              <button
                onClick={handleSignIn}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl tracking-wider uppercase shadow-lg shadow-blue-500/20 transition-all active:scale-95"
              >
                <RiGoogleFill size={15} />
                <span>Authenticate Workspace</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full min-h-0 overflow-hidden">
            {/* Context Header for Sub-Tab */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <span className="font-bold text-blue-400">{activeSubTab}</span>
                <span className="text-zinc-600">|</span>
                <span className="text-[11px] text-zinc-500">Live 1P REST Service</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadTabItems}
                  disabled={isLoading}
                  className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-xs rounded transition-colors"
                >
                  <RiRefreshLine size={13} className={isLoading ? 'animate-spin' : ''} />
                  <span className="text-[10px]">Refresh</span>
                </button>
              </div>
            </div>

            {/* Sub-tab view bodies */}
            <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1 space-y-3">
              {/* GOOGLE KEEP */}
              {activeSubTab === 'KEEP' && (
                <div className="space-y-4">
                  {/* Top Bar: Controls & Filters */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900/70 border border-white/10 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <RiStickyNoteLine size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs uppercase text-zinc-100">Google Keep Notes & Lists</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {keepNotes.length} Notes Synced
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400">
                          Create checklists, memos, and thoughts synchronized with Google Keep
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={keepSearchQuery}
                        onChange={(e) => setKeepSearchQuery(e.target.value)}
                        placeholder="Search Keep notes..."
                        className="bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 w-44"
                      />
                      <div className="flex items-center p-0.5 bg-black/40 border border-white/10 rounded-lg text-[10px]">
                        <button
                          onClick={() => setKeepFilter('all')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${keepFilter === 'all' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setKeepFilter('pinned')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${keepFilter === 'pinned' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          Pinned
                        </button>
                        <button
                          onClick={() => setKeepFilter('checklist')}
                          className={`px-2 py-0.5 rounded cursor-pointer ${keepFilter === 'checklist' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                          Lists
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Create Note Input Card */}
                  <form onSubmit={handleCreateKeepNote} className="p-4 bg-zinc-900/80 border border-white/10 rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={keepTitle}
                        onChange={(e) => setKeepTitle(e.target.value)}
                        placeholder="Note Title or Topic..."
                        className="flex-1 bg-transparent font-bold text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setKeepIsPinned((prev) => !prev)}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          keepIsPinned
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-zinc-800 border-white/10 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={keepIsPinned ? 'Pinned Note' : 'Pin Note'}
                      >
                        {keepIsPinned ? <RiPushpinFill size={15} /> : <RiPushpinLine size={15} />}
                      </button>
                    </div>

                    {!isChecklistMode ? (
                      <textarea
                        value={keepText}
                        onChange={(e) => setKeepText(e.target.value)}
                        placeholder="Take a note, type details, markdown supported..."
                        rows={3}
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none font-sans"
                      />
                    ) : (
                      <div className="space-y-2 bg-black/30 p-2.5 rounded-lg border border-white/10">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={keepItemInput}
                            onChange={(e) => setKeepItemInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addChecklistItem()
                              }
                            }}
                            placeholder="Add checklist item & press Enter..."
                            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={addChecklistItem}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                        {keepListItems.length > 0 && (
                          <div className="space-y-1 max-h-32 overflow-y-auto pt-1">
                            {keepListItems.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1 bg-zinc-900/60 rounded text-xs text-zinc-300">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3.5 h-3.5 border border-zinc-500 rounded-sm" />
                                  <span>{item}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeChecklistItem(idx)}
                                  className="text-zinc-500 hover:text-red-400 cursor-pointer"
                                >
                                  <RiCloseLine size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        {/* Toggle checklist mode */}
                        <button
                          type="button"
                          onClick={() => setIsChecklistMode((prev) => !prev)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                            isChecklistMode
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold'
                              : 'bg-zinc-800 border-white/10 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <RiListCheck size={14} />
                          <span className="text-[11px]">{isChecklistMode ? 'Checklist Mode' : 'Add Checklist'}</span>
                        </button>

                        {/* Color Picker */}
                        <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
                          {[
                            { id: 'amber', bg: 'bg-amber-500', label: 'Amber' },
                            { id: 'emerald', bg: 'bg-emerald-500', label: 'Green' },
                            { id: 'blue', bg: 'bg-blue-500', label: 'Blue' },
                            { id: 'purple', bg: 'bg-purple-500', label: 'Purple' },
                            { id: 'rose', bg: 'bg-rose-500', label: 'Red' },
                            { id: 'default', bg: 'bg-zinc-700', label: 'Dark' }
                          ].map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setKeepColor(c.id)}
                              className={`w-4 h-4 rounded-full ${c.bg} transition-transform cursor-pointer ${
                                keepColor === c.id ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                              }`}
                              title={c.label}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading || !keepTitle.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <RiAddLine size={15} />
                        <span>Save to Google Keep</span>
                      </button>
                    </div>
                  </form>

                  {/* Notes Masonry/Grid Display */}
                  {(() => {
                    const filtered = keepNotes.filter((note) => {
                      if (keepSearchQuery.trim()) {
                        const q = keepSearchQuery.toLowerCase()
                        const matchTitle = (note.title || '').toLowerCase().includes(q)
                        const matchText = (note.text || '').toLowerCase().includes(q)
                        const matchItems = (note.listItems || []).some((li: any) => (li.text || '').toLowerCase().includes(q))
                        if (!matchTitle && !matchText && !matchItems) return false
                      }
                      if (keepFilter === 'pinned' && !note.isPinned) return false
                      if (keepFilter === 'checklist' && (!note.listItems || note.listItems.length === 0)) return false
                      return true
                    })

                    const pinnedList = filtered.filter((n) => n.isPinned)
                    const otherList = filtered.filter((n) => !n.isPinned)

                    const renderNoteCard = (note: any) => {
                      const colorStyles: Record<string, string> = {
                        amber: 'border-amber-500/40 bg-amber-950/20 hover:border-amber-500/70',
                        emerald: 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-500/70',
                        blue: 'border-blue-500/40 bg-blue-950/20 hover:border-blue-500/70',
                        purple: 'border-purple-500/40 bg-purple-950/20 hover:border-purple-500/70',
                        rose: 'border-rose-500/40 bg-rose-950/20 hover:border-rose-500/70',
                        default: 'border-white/10 bg-zinc-900/60 hover:border-white/20'
                      }
                      const cardStyle = colorStyles[note.color] || colorStyles.amber

                      return (
                        <div
                          key={note.id}
                          className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all shadow-md group ${cardStyle}`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 pb-1.5">
                              <h5 className="font-bold text-xs text-zinc-100 leading-snug break-words flex-1">
                                {note.title}
                              </h5>
                              {note.isPinned && (
                                <RiPushpinFill size={13} className="text-amber-400 shrink-0 mt-0.5" title="Pinned Note" />
                              )}
                            </div>

                            {note.text && (
                              <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed py-1 line-clamp-6 font-sans">
                                {note.text}
                              </p>
                            )}

                            {note.listItems && note.listItems.length > 0 && (
                              <div className="space-y-1.5 py-1.5">
                                {note.listItems.map((item: any, idx: number) => (
                                  <div
                                    key={idx}
                                    onClick={() => handleToggleKeepListItem(note.id, idx)}
                                    className="flex items-center gap-2 text-xs cursor-pointer select-none group/item"
                                  >
                                    {item.checked ? (
                                      <RiCheckboxCircleLine size={14} className="text-emerald-400 shrink-0" />
                                    ) : (
                                      <RiCheckboxBlankCircleLine size={14} className="text-zinc-500 group-hover/item:text-zinc-300 shrink-0" />
                                    )}
                                    <span
                                      className={`text-[11px] leading-tight ${
                                        item.checked ? 'line-through text-zinc-500' : 'text-zinc-300'
                                      }`}
                                    >
                                      {item.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-zinc-500">
                            <span>
                              {note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : 'Active'}
                            </span>
                            <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  const textToCopy = `${note.title}\n\n${note.text || ''}\n${(note.listItems || []).map((li: any) => `- [${li.checked ? 'x' : ' '}] ${li.text}`).join('\n')}`
                                  navigator.clipboard.writeText(textToCopy)
                                  setStatusMessage('Note copied to clipboard!')
                                  setTimeout(() => setStatusMessage(null), 2500)
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-white/10 cursor-pointer"
                                title="Copy note"
                              >
                                <RiFileCopyLine size={13} />
                              </button>
                              <button
                                onClick={() => handleExportToIrisNotes(note)}
                                className="p-1 text-zinc-400 hover:text-emerald-300 rounded hover:bg-white/10 cursor-pointer"
                                title="Export to IRIS Notes"
                              >
                                <RiFolderDownloadLine size={13} />
                              </button>
                              <button
                                onClick={() => setNoteToDelete(note)}
                                className="p-1 text-zinc-400 hover:text-red-400 rounded hover:bg-red-500/10 cursor-pointer"
                                title="Delete note"
                              >
                                <RiDeleteBinLine size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-12 text-zinc-500 text-xs">
                          No Google Keep notes match your query. Create one above!
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-4">
                        {pinnedList.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                              <RiPushpinFill size={12} />
                              <span>Pinned Notes ({pinnedList.length})</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {pinnedList.map(renderNoteCard)}
                            </div>
                          </div>
                        )}

                        {otherList.length > 0 && (
                          <div className="space-y-2">
                            {pinnedList.length > 0 && (
                              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                                All Notes ({otherList.length})
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {otherList.map(renderNoteCard)}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* GOOGLE MEET */}
              {activeSubTab === 'MEET' && (
                <div className="space-y-4 max-w-xl mx-auto py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                    <RiVideoChatLine size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-200 uppercase">
                    Instant Google Meet Space
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Generate an instant Google Meet room using Google Meet v2 API.
                  </p>
                  <button
                    onClick={handleCreateMeet}
                    disabled={isLoading}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl tracking-wider uppercase transition-colors"
                  >
                    {isLoading ? 'Generating Room...' : 'Create Instant Meet Space'}
                  </button>

                  {createdMeetUrl && (
                    <div className="mt-4 p-3 bg-zinc-900 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                      <span className="text-xs text-emerald-300 truncate">{createdMeetUrl}</span>
                      <a
                        href={createdMeetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1 bg-emerald-500 text-black font-bold text-xs rounded-lg"
                      >
                        <span>Join</span>
                        <RiExternalLinkLine size={12} />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* GOOGLE PICKER */}
              {activeSubTab === 'PICKER' && (
                <div className="space-y-4 max-w-xl mx-auto py-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mx-auto">
                    <RiFolderDownloadLine size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-200 uppercase">
                    Google Picker Dialog Widget
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Launch the official interactive Google Drive Picker dialog to select files,
                    spreadsheets, and presentations.
                  </p>
                  <button
                    onClick={launchGooglePicker}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl tracking-wider uppercase transition-colors"
                  >
                    Launch Google Picker
                  </button>
                </div>
              )}

              {/* GOOGLE TASKS */}
              {activeSubTab === 'TASKS' && (
                <div className="space-y-3">
                  <form onSubmit={handleCreateTask} className="flex gap-2">
                    <input
                      type="text"
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      placeholder="Add a new Google Task item..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !taskInput.trim()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg tracking-wider uppercase"
                    >
                      <RiAddLine size={16} />
                    </button>
                  </form>
                </div>
              )}

              {/* GOOGLE DOCS */}
              {activeSubTab === 'DOCS' && (
                <div className="space-y-3">
                  <form onSubmit={handleCreateDoc} className="flex gap-2">
                    <input
                      type="text"
                      value={docTitleInput}
                      onChange={(e) => setDocTitleInput(e.target.value)}
                      placeholder="New Google Doc Title..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !docTitleInput.trim()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg tracking-wider uppercase"
                    >
                      Create Doc
                    </button>
                  </form>
                </div>
              )}

              {/* GOOGLE SHEETS */}
              {activeSubTab === 'SHEETS' && (
                <div className="space-y-3">
                  <form onSubmit={handleCreateSheet} className="flex gap-2">
                    <input
                      type="text"
                      value={sheetTitleInput}
                      onChange={(e) => setSheetTitleInput(e.target.value)}
                      placeholder="New Google Spreadsheet Title..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !sheetTitleInput.trim()}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg tracking-wider uppercase"
                    >
                      Create Sheet
                    </button>
                  </form>
                </div>
              )}

              {/* ITEMS LIST (DRIVE, GMAIL, CALENDAR, CONTACTS, CLASSROOM, CHAT) */}
              {['DRIVE', 'GMAIL', 'CALENDAR', 'TASKS', 'CONTACTS', 'CHAT', 'CLASSROOM'].includes(
                activeSubTab
              ) && (
                <div className="space-y-2">
                  {isLoading ? (
                    <WorkspaceSkeleton />
                  ) : items.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs">
                      No records found for {activeSubTab}.
                    </div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 hover:border-white/20 rounded-xl flex items-center justify-between transition-all"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="text-xs font-semibold text-zinc-100 truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                              {item.subtitle}
                            </div>
                          )}
                          {item.date && (
                            <div className="text-[10px] text-zinc-500 mt-1">
                              {new Date(item.date).toLocaleString()}
                            </div>
                          )}
                        </div>

                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors shrink-0"
                            title="Open in Google Workspace"
                          >
                            <RiExternalLinkLine size={14} />
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Google Keep Note Deletion User Confirmation Modal (Workspace API safety requirement) */}
      {noteToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-500/40 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <RiDeleteBinLine size={24} />
              <h3 className="font-bold text-sm uppercase text-white">Delete Google Keep Note?</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-amber-300">"{noteToDelete.title}"</strong>? This action cannot be undone and will remove the note from Google Keep.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setNoteToDelete(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteKeepNote(noteToDelete)}
                disabled={isDeletingNote}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeletingNote ? <RiRefreshLine className="animate-spin" size={14} /> : <RiDeleteBinLine size={14} />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleWorkspaceView
