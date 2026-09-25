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
  RiShieldCheckLine
} from 'react-icons/ri'
import {
  auth,
  signInWithGoogle,
  logOutGoogle,
  getCachedAccessToken,
  setCachedAccessToken
} from '../lib/firebase'
import { GoogleWorkspaceService, WorkspaceItem } from '../services/workspace'
import { User } from 'firebase/auth'
import WorkspaceHub from '../components/UI/WorkspaceHub'
import AuthFailureView from '../components/UI/AuthFailureView'
import WorkspaceTelemetryAnalytics from '../components/UI/WorkspaceTelemetryAnalytics'
import { WorkspaceSkeleton } from '../components/UI/SkeletonLoader'
import { ShieldAlert, Activity } from 'lucide-react'

type WorkspaceTab =
  | 'HUB'
  | 'TELEMETRY'
  | 'DIAGNOSTICS'
  | 'DRIVE'
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
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
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

  // Listen to auth and synchronize with Centralized Session Manager
  useEffect(() => {
    // Set auth loading state - we need to wait for Firebase to restore persisted session
    setAuthLoading(true)
    
    const checkSession = async () => {
      try {
        const res = await fetch('/api/workspace/auth/session')
        if (res.ok) {
          const data = await res.json()
          if (data.session?.isConnected) {
            // Check if we need to refresh token from backend
            const refRes = await fetch('/api/workspace/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            })
            const refData = await refRes.json()
            if (refData.success && refData.accessToken) {
              setToken(refData.accessToken)
              setCachedAccessToken(refData.accessToken)
            }
          }
        }
      } catch (_e) {
        console.warn('[GoogleWorkspaceView] Failed to check backend session:', _e)
      } finally {
        // Auth initialization complete (Firebase has restored or confirmed no user)
        setAuthLoading(false)
      }
    }

    checkSession()

    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      const currentToken = getCachedAccessToken()
      if (currentToken) setToken(currentToken)
      // Firebase auth state has been restored - mark loading as complete
      setAuthLoading(false)
    })

    const handleSelectService = (e: any) => {
      const svc = (e.detail?.service || '').toUpperCase()
      if (
        svc &&
        [
          'HUB',
          'TELEMETRY',
          'DIAGNOSTICS',
          'DRIVE',
          'GMAIL',
          'CALENDAR',
          'TASKS',
          'MEET',
          'CONTACTS',
          'SHEETS',
          'DOCS',
          'SLIDES',
          'FORMS',
          'CHAT',
          'CLASSROOM',
          'PICKER'
        ].includes(svc)
      ) {
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
      console.error('Google Sign In failed:', err)
      setStatusMessage(`Sign in failed: ${err.message || 'Access popup closed'}`)
      setTimeout(() => setStatusMessage(null), 4000)
    }
  }

  const handleSignOut = async () => {
    // Only sign out from Firebase Auth - this will clear persisted session
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
    {
      id: 'TELEMETRY',
      label: 'Telemetry & Latency',
      icon: <Activity size={15} className="text-[#00ff41]" />
    },
    {
      id: 'DIAGNOSTICS',
      label: 'Auth Failures',
      icon: <ShieldAlert size={15} className="text-red-400" />
    },
    { id: 'DRIVE', label: 'Drive', icon: <RiDriveLine size={15} /> },
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
    <div className="flex flex-col h-full w-full gap-3 overflow-hidden text-zinc-100 font-mono">
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <WorkspaceHub onSelectServiceTab={(tabId) => setActiveSubTab(tabId as WorkspaceTab)} />
        </div>
      ) : activeSubTab === 'TELEMETRY' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkspaceTelemetryAnalytics />
        </div>
      ) : activeSubTab === 'DIAGNOSTICS' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AuthFailureView onReauthenticate={handleSignIn} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-zinc-950/80 border border-white/10 rounded-xl p-4 flex flex-col overflow-hidden shadow-2xl">
          {!token ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <RiGoogleFill size={26} />
              </div>
              <h3 className="text-sm font-bold tracking-wider text-zinc-100 uppercase">
                Authentication Required
              </h3>
              <p className="text-xs text-zinc-400 max-w-md leading-relaxed">
                Connect your authorized Google Workspace account to unlock live bidirectional
                synchronization with Drive, Gmail, Calendar, Sheets, Docs, Tasks, Meet, and
                Classroom.
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
            <div className="flex flex-col h-full overflow-hidden">
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
    </div>
  )
}

export default GoogleWorkspaceView
