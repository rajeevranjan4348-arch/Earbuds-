import React, { useState, useEffect, useRef } from 'react'
import {
  Globe,
  Code2,
  Palette,
  Terminal,
  Columns,
  RotateCw,
  ExternalLink,
  Laptop,
  Tablet,
  Smartphone,
  Copy,
  Check,
  Trash2,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Layers,
  FileCode,
  Link as LinkIcon,
  ChevronDown,
  X
} from 'lucide-react'
import {
  projectAssociationEngine,
  AssociatedProjectGroup
} from '../../services/projectBundler/ProjectAssociationEngine'

export interface FileNode {
  id: string
  name: string
  content: string
  language: string
  type?: 'file' | 'folder'
  parentId?: string | null
  isOpen?: boolean
}

export interface PreviewConsoleLog {
  id: string
  level: 'log' | 'warn' | 'error' | 'info'
  args: string[]
  timestamp: string
}

interface TabbedBrowserPreviewProps {
  files: FileNode[]
  currentFileId: string
  activeCode: string
}

export const TabbedBrowserPreview: React.FC<TabbedBrowserPreviewProps> = ({
  files,
  currentFileId,
  activeCode
}) => {
  const [activeTab, setActiveTab] = useState<'app' | 'html' | 'css' | 'js' | 'split'>('app')
  const [secondaryTab, setSecondaryTab] = useState<'html' | 'css' | 'js'>('js')
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<PreviewConsoleLog[]>([])
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'log' | 'warn' | 'error'>('all')
  const [jsEvalInput, setJsEvalInput] = useState('')
  const [urlPath, setUrlPath] = useState('http://localhost:3000/index.html')
  const [copiedUrl, setCopiedUrl] = useState(false)

  // Entry Point HTML Override
  const [overrideEntryId, setOverrideEntryId] = useState<string | undefined>(undefined)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const splitIframeRef = useRef<HTMLIFrameElement>(null)

  // Analyze and bundle cohesive project files
  const projectGroup: AssociatedProjectGroup = projectAssociationEngine.analyzeAndBundleGroup(
    files,
    currentFileId,
    overrideEntryId
  )

  const documentHtml = projectGroup.bundledDocumentHtml

  // Listen for console logs emitted from the preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'IRIS_PREVIEW_CONSOLE_LOG') {
        const newLog: PreviewConsoleLog = {
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          level: event.data.level || 'log',
          args: event.data.args || [],
          timestamp: event.data.timestamp || new Date().toLocaleTimeString()
        }
        setConsoleLogs((prev) => [...prev.slice(-100), newLog])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Auto-refresh preview whenever files or active code changes
  useEffect(() => {
    if (!autoRefreshEnabled) return

    const timer = setTimeout(() => {
      setIsRefreshing(true)
      setLastRefreshedAt(new Date())
      const refreshTimeout = setTimeout(() => setIsRefreshing(false), 300)
      return () => clearTimeout(refreshTimeout)
    }, 200)

    return () => clearTimeout(timer)
  }, [files, activeCode, autoRefreshEnabled, currentFileId, overrideEntryId])

  // Get combined HTML content
  const htmlContent = projectGroup.entryHtmlFile.content || activeCode

  // Get combined CSS content from linked + unlinked stylesheets
  const cssContent =
    [...projectGroup.linkedCssFiles, ...projectGroup.unlinkedCssFiles]
      .map((f) => `/* File: ${f.name} */\n${f.content}`)
      .join('\n\n') || '/* No CSS files found in project */'

  // Get combined JS content from linked + unlinked scripts
  const jsContent =
    [...projectGroup.linkedJsFiles, ...projectGroup.unlinkedJsFiles]
      .map((f) => `// File: ${f.name}\n${f.content}`)
      .join('\n\n') || '// No JS files found in project'

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    setLastRefreshedAt(new Date())
    if (iframeRef.current) {
      iframeRef.current.srcdoc = documentHtml
    }
    if (splitIframeRef.current) {
      splitIframeRef.current.srcdoc = documentHtml
    }
    setTimeout(() => setIsRefreshing(false), 300)
  }

  const handlePopout = () => {
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(documentHtml)
      win.document.close()
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(urlPath)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const handleEvalJsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!jsEvalInput.trim()) return

    const inputCmd = jsEvalInput.trim()
    setJsEvalInput('')

    setConsoleLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}_input`,
        level: 'info',
        args: [`> ${inputCmd}`],
        timestamp: new Date().toLocaleTimeString()
      }
    ])

    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const result = iframeRef.current.contentWindow.eval(inputCmd)
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: `${Date.now()}_res`,
            level: 'log',
            args: [
              `< ${typeof result === 'object' ? JSON.stringify(result) : String(result)}`
            ],
            timestamp: new Date().toLocaleTimeString()
          }
        ])
      }
    } catch (err: any) {
      setConsoleLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}_err`,
          level: 'error',
          args: [`< Error: ${err?.message || err}`],
          timestamp: new Date().toLocaleTimeString()
        }
      ])
    }
  }

  const filteredLogs = consoleLogs.filter((log) => {
    if (consoleFilter === 'all') return true
    return log.level === consoleFilter
  })

  // Get viewport container styling
  const getViewportStyle = () => {
    if (viewportMode === 'mobile')
      return 'max-w-[375px] h-full mx-auto shadow-2xl border-x border-zinc-800'
    if (viewportMode === 'tablet')
      return 'max-w-[768px] h-full mx-auto shadow-2xl border-x border-zinc-800'
    return 'w-full h-full'
  }

  // Available HTML files for Entry Point selection
  const availableHtmlFiles = files.filter(
    (f) => f.type !== 'folder' && (f.name.endsWith('.html') || f.language === 'html')
  )

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 font-sans border-t border-white/10 select-none relative">
      {/* Top Browser Preview Toolbar */}
      <div className="h-10 bg-zinc-900/90 border-b border-white/10 px-3 flex items-center justify-between shrink-0 gap-2">
        {/* Left: Tab Selection */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('app')}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'app'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
            title="Live Web Application Render"
          >
            <Globe size={13} />
            <span>Web App</span>
          </button>

          <button
            onClick={() => setActiveTab('html')}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'html'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
            title="HTML Document & DOM Inspector"
          >
            <Code2 size={13} />
            <span>index.html</span>
          </button>

          <button
            onClick={() => setActiveTab('css')}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'css'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
            title="Generated CSS Rules"
          >
            <Palette size={13} />
            <span>CSS Styles</span>
          </button>

          <button
            onClick={() => setActiveTab('js')}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer relative ${
              activeTab === 'js'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
            title="JavaScript Runtime Console & Logs"
          >
            <Terminal size={13} />
            <span>JS Console</span>
            {consoleLogs.length > 0 && (
              <span className="ml-1 px-1 py-0.2 bg-emerald-500 text-black font-extrabold text-[9px] rounded-full">
                {consoleLogs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('split')}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'split'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
            title="Simultaneous View: HTML Render + CSS/JS Console Side-by-Side"
          >
            <Columns size={13} />
            <span>Split View</span>
          </button>
        </div>

        {/* Center: Address Bar & Cohesive Project Badge */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-2">
          {/* Cohesive Group Indicator Badge */}
          <button
            onClick={() => setIsGroupModalOpen(!isGroupModalOpen)}
            className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400 font-semibold hover:bg-emerald-500/20 transition cursor-pointer shrink-0"
            title="View Cohesive Project File Group & Dependency Graph"
          >
            <Layers size={12} />
            <span>
              Group: {projectGroup.entryHtmlFile.name} ({projectGroup.allAssociatedFiles.length} files)
            </span>
            <ChevronDown size={11} />
          </button>

          <div className="flex items-center gap-1.5 flex-1 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono min-w-0">
            <Globe size={12} className="text-emerald-400 shrink-0" />
            <input
              type="text"
              value={urlPath}
              onChange={(e) => setUrlPath(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-zinc-300 text-[11px] font-mono truncate"
            />
            <button
              onClick={handleCopyUrl}
              className="p-0.5 hover:text-emerald-400 transition text-zinc-500 cursor-pointer shrink-0"
              title="Copy URL"
            >
              {copiedUrl ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Right Controls: Viewport, Refresh & Popout */}
        <div className="flex items-center gap-2">
          {/* Live Auto-Refresh Toggle */}
          <button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
              autoRefreshEnabled
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-800 text-zinc-500 border-zinc-700'
            }`}
            title="Toggle Live Auto-Refresh upon Code Edits"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoRefreshEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            <span className="hidden sm:inline">
              {autoRefreshEnabled ? 'LIVE AUTO-REFRESH' : 'PAUSED'}
            </span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={handleManualRefresh}
            className={`p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-emerald-400 transition cursor-pointer ${
              isRefreshing ? 'animate-spin text-emerald-400' : ''
            }`}
            title="Force Reload Preview"
          >
            <RotateCw size={13} />
          </button>

          {/* Viewport Switchers */}
          <div className="hidden lg:flex items-center bg-black/40 border border-white/10 rounded p-0.5">
            <button
              onClick={() => setViewportMode('desktop')}
              className={`p-1 rounded text-xs cursor-pointer transition ${
                viewportMode === 'desktop'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Desktop View (100%)"
            >
              <Laptop size={12} />
            </button>
            <button
              onClick={() => setViewportMode('tablet')}
              className={`p-1 rounded text-xs cursor-pointer transition ${
                viewportMode === 'tablet'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Tablet View (768px)"
            >
              <Tablet size={12} />
            </button>
            <button
              onClick={() => setViewportMode('mobile')}
              className={`p-1 rounded text-xs cursor-pointer transition ${
                viewportMode === 'mobile'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Mobile View (375px)"
            >
              <Smartphone size={12} />
            </button>
          </div>

          {/* External Window Popout */}
          <button
            onClick={handlePopout}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-emerald-400 transition cursor-pointer"
            title="Open Preview in External Window"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      {/* Cohesive Group & Dependency Graph Modal / Popover */}
      {isGroupModalOpen && (
        <div className="absolute top-11 left-4 z-50 w-96 bg-zinc-900 border border-emerald-500/40 rounded-xl shadow-2xl p-4 font-mono text-xs text-zinc-100 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Layers size={16} />
              <span>COHESIVE PROJECT GROUP</span>
            </div>
            <button
              onClick={() => setIsGroupModalOpen(false)}
              className="p-1 hover:text-red-400 transition cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Entry Point Selector */}
          <div className="space-y-1">
            <label className="text-[10px] text-zinc-400 uppercase font-bold">
              Entry Point HTML File:
            </label>
            <select
              value={projectGroup.entryHtmlFile.id}
              onChange={(e) => setOverrideEntryId(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-emerald-500 cursor-pointer font-mono"
            >
              {availableHtmlFiles.map((htmlFile) => (
                <option key={htmlFile.id} value={htmlFile.id} className="bg-zinc-900 text-zinc-200">
                  {htmlFile.name} {htmlFile.id === projectGroup.entryHtmlFile.id ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Associated CSS Stylesheets */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase font-bold">
              <span>Stylesheets (CSS):</span>
              <span className="text-emerald-400">
                {projectGroup.linkedCssFiles.length} Linked, {projectGroup.unlinkedCssFiles.length} Implicit
              </span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {projectGroup.linkedCssFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-1 bg-black/40 border border-emerald-500/20 rounded text-[11px] text-emerald-300"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <LinkIcon size={11} className="text-emerald-400 shrink-0" />
                    <span>{f.name}</span>
                  </span>
                  <span className="text-[9px] text-emerald-500/80 font-bold">EXPLICIT</span>
                </div>
              ))}
              {projectGroup.unlinkedCssFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-1 bg-black/40 border border-white/5 rounded text-[11px] text-cyan-300"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Palette size={11} className="text-cyan-400 shrink-0" />
                    <span>{f.name}</span>
                  </span>
                  <span className="text-[9px] text-cyan-500/80 font-bold">BUNDLED</span>
                </div>
              ))}
            </div>
          </div>

          {/* Associated JS Scripts */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 uppercase font-bold">
              <span>Scripts (JS/TS):</span>
              <span className="text-emerald-400">
                {projectGroup.linkedJsFiles.length} Linked, {projectGroup.unlinkedJsFiles.length} Implicit
              </span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {projectGroup.linkedJsFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-1 bg-black/40 border border-emerald-500/20 rounded text-[11px] text-emerald-300"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <LinkIcon size={11} className="text-emerald-400 shrink-0" />
                    <span>{f.name}</span>
                  </span>
                  <span className="text-[9px] text-emerald-500/80 font-bold">EXPLICIT</span>
                </div>
              ))}
              {projectGroup.unlinkedJsFiles.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-1 bg-black/40 border border-white/5 rounded text-[11px] text-yellow-300"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <FileCode size={11} className="text-yellow-400 shrink-0" />
                    <span>{f.name}</span>
                  </span>
                  <span className="text-[9px] text-yellow-500/80 font-bold">BUNDLED</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1 text-[10px] text-zinc-500 border-t border-white/10">
            IRIS automatically links explicit &lt;link&gt; / &lt;script&gt; tags and bundles all remaining stylesheets & scripts into a cohesive preview.
          </div>
        </div>
      )}

      {/* Preview Content Area */}
      <div className="flex-1 w-full relative bg-zinc-950 overflow-hidden min-h-0">
        {/* Tab 1: Web App (Full Live Iframe) */}
        {activeTab === 'app' && (
          <div className="w-full h-full bg-zinc-900 relative overflow-hidden flex items-center justify-center">
            <div className={getViewportStyle()}>
              <iframe
                ref={iframeRef}
                key={lastRefreshedAt.getTime()}
                title="IRIS Live Web Application"
                srcDoc={documentHtml}
                className="w-full h-full border-none bg-white"
                sandbox="allow-scripts allow-modals allow-same-origin"
              />
            </div>
          </div>
        )}

        {/* Tab 2: HTML View */}
        {activeTab === 'html' && (
          <div className="w-full h-full p-4 font-mono text-xs overflow-y-auto bg-black text-zinc-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Code2 size={15} />
                <span>ENTRY POINT: {projectGroup.entryHtmlFile.name}</span>
              </div>
              <span className="text-[10px] text-zinc-500">
                Auto-updated {lastRefreshedAt.toLocaleTimeString()}
              </span>
            </div>
            <pre className="bg-zinc-900/80 p-4 rounded-xl border border-white/10 text-emerald-300 overflow-x-auto leading-relaxed">
              <code>{htmlContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 3: CSS View */}
        {activeTab === 'css' && (
          <div className="w-full h-full p-4 font-mono text-xs overflow-y-auto bg-black text-zinc-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <Palette size={15} />
                <span>COMBINED PROJECT STYLESHEETS ({projectGroup.linkedCssFiles.length + projectGroup.unlinkedCssFiles.length} files)</span>
              </div>
              <span className="text-[10px] text-zinc-500">
                {cssContent.split('{').length - 1} Rules Detected
              </span>
            </div>
            <pre className="bg-zinc-900/80 p-4 rounded-xl border border-white/10 text-cyan-300 overflow-x-auto leading-relaxed">
              <code>{cssContent}</code>
            </pre>
          </div>
        )}

        {/* Tab 4: JS Console */}
        {activeTab === 'js' && (
          <div className="w-full h-full flex flex-col bg-black text-zinc-200 font-mono text-xs">
            {/* Console Toolbar */}
            <div className="h-8 bg-zinc-900 border-b border-white/10 px-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={13} className="text-amber-400" />
                <span className="font-bold text-zinc-300 text-[11px]">
                  JAVASCRIPT EXECUTION CONSOLE
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Level Filters */}
                <div className="flex items-center bg-black/50 border border-white/10 rounded p-0.5 text-[10px]">
                  {(['all', 'log', 'warn', 'error'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setConsoleFilter(lvl)}
                      className={`px-2 py-0.5 rounded capitalize cursor-pointer transition ${
                        consoleFilter === lvl
                          ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setConsoleLogs([])}
                  className="p-1 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                  title="Clear Console Logs"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Log Stream */}
            <div className="flex-1 p-3 overflow-y-auto space-y-1.5 font-mono text-[11px]">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-2 p-1.5 rounded border ${
                    log.level === 'error'
                      ? 'bg-red-500/10 border-red-500/30 text-red-300'
                      : log.level === 'warn'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : log.level === 'info'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-zinc-900/60 border-white/5 text-emerald-300'
                  }`}
                >
                  {log.level === 'error' && <XCircle size={13} className="shrink-0 text-red-400 mt-0.5" />}
                  {log.level === 'warn' && <AlertTriangle size={13} className="shrink-0 text-amber-400 mt-0.5" />}
                  {log.level === 'log' && <CheckCircle2 size={13} className="shrink-0 text-emerald-400 mt-0.5" />}
                  {log.level === 'info' && <Info size={13} className="shrink-0 text-blue-400 mt-0.5" />}

                  <span className="text-[10px] text-zinc-500 shrink-0">{log.timestamp}</span>
                  <div className="flex-1 whitespace-pre-wrap break-all">{log.args.join(' ')}</div>
                </div>
              ))}

              {filteredLogs.length === 0 && (
                <div className="text-zinc-600 italic text-[11px] p-4 text-center">
                  Console is ready. Logs from interactive JS execution will appear here.
                </div>
              )}
            </div>

            {/* JS Evaluator REPL */}
            <form
              onSubmit={handleEvalJsSubmit}
              className="h-9 border-t border-white/10 bg-zinc-900/90 px-3 flex items-center gap-2 shrink-0"
            >
              <Zap size={13} className="text-emerald-400 shrink-0" />
              <input
                type="text"
                value={jsEvalInput}
                onChange={(e) => setJsEvalInput(e.target.value)}
                placeholder="Evaluate JavaScript expression against live iframe (e.g. document.title, console.log(123)...)"
                className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-zinc-100 placeholder-zinc-600"
              />
              <button
                type="submit"
                disabled={!jsEvalInput.trim()}
                className="px-2.5 py-0.5 bg-emerald-500 text-black font-bold text-[10px] rounded hover:bg-emerald-400 disabled:opacity-40 transition cursor-pointer"
              >
                EVAL
              </button>
            </form>
          </div>
        )}

        {/* Tab 5: Simultaneous Split View */}
        {activeTab === 'split' && (
          <div className="w-full h-full flex flex-col md:flex-row bg-black">
            {/* Left: Web App Render */}
            <div className="flex-1 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/10 relative bg-zinc-900">
              <div className="h-7 bg-zinc-900/90 border-b border-white/10 px-2.5 flex items-center justify-between text-[11px] font-mono font-bold text-emerald-400">
                <div className="flex items-center gap-1.5">
                  <Globe size={12} />
                  <span>Interactive App Render</span>
                </div>
                <span className="text-[9px] text-zinc-500">Live View</span>
              </div>
              <div className="h-[calc(100%-28px)] w-full">
                <iframe
                  ref={splitIframeRef}
                  key={`split_${lastRefreshedAt.getTime()}`}
                  title="IRIS Split Web Preview"
                  srcDoc={documentHtml}
                  className="w-full h-full border-none bg-white"
                  sandbox="allow-scripts allow-modals allow-same-origin"
                />
              </div>
            </div>

            {/* Right: Secondary Code / Styles / Console Inspector */}
            <div className="flex-1 h-1/2 md:h-full flex flex-col bg-zinc-950">
              <div className="h-7 bg-zinc-900/90 border-b border-white/10 px-2 flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSecondaryTab('html')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                      secondaryTab === 'html'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    HTML
                  </button>
                  <button
                    onClick={() => setSecondaryTab('css')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                      secondaryTab === 'css'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    CSS Rules
                  </button>
                  <button
                    onClick={() => setSecondaryTab('js')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                      secondaryTab === 'js'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    JS Console
                  </button>
                </div>

                <span className="text-[9px] text-zinc-500">Simultaneous Output</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
                {secondaryTab === 'html' && (
                  <pre className="text-emerald-300 bg-zinc-900/80 p-3 rounded border border-white/10 overflow-x-auto text-[11px]">
                    <code>{htmlContent}</code>
                  </pre>
                )}

                {secondaryTab === 'css' && (
                  <pre className="text-cyan-300 bg-zinc-900/80 p-3 rounded border border-white/10 overflow-x-auto text-[11px]">
                    <code>{cssContent}</code>
                  </pre>
                )}

                {secondaryTab === 'js' && (
                  <div className="space-y-1 text-[11px]">
                    {consoleLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-1 bg-zinc-900 rounded border border-white/5 text-emerald-300"
                      >
                        <span className="text-zinc-500 mr-2">[{log.timestamp}]</span>
                        {log.args.join(' ')}
                      </div>
                    ))}
                    {consoleLogs.length === 0 && (
                      <div className="text-zinc-600 italic text-[10px]">
                        No console logs emitted yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TabbedBrowserPreview
