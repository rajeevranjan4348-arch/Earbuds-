import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Upload,
  RefreshCw,
  Trash2,
  X,
  Search,
  ChevronRight,
  Maximize2,
  Minimize2,
  Database,
  Layers,
  Sparkles,
  BookOpen,
  Filter,
  Check,
  ExternalLink,
  HelpCircle,
  BarChart3
} from 'lucide-react'
import {
  ragService,
  DocumentMetadata,
  IngestionProgress,
  RAGCitation
} from '../../services/ragService'

interface DocumentStatusOverlayProps {
  isOpen: boolean
  onClose: () => void
  onOpen?: () => void
  userId?: string
}

type FilterStatus = 'ALL' | 'queued' | 'processing' | 'indexed' | 'failed'

export default function DocumentStatusOverlay({
  isOpen,
  onClose,
  onOpen,
  userId = 'usr_primary'
}: DocumentStatusOverlayProps) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([])
  const [progress, setProgress] = useState<IngestionProgress | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'documents' | 'sandbox'>('documents')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [inspectDoc, setInspectDoc] = useState<{ doc: DocumentMetadata; chunks: any[] } | null>(
    null
  )
  const [isInspecting, setIsInspecting] = useState(false)

  // Sandbox QA state
  const [qaPrompt, setQaPrompt] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [qaAnswer, setQaAnswer] = useState<string | null>(null)
  const [qaCitations, setQaCitations] = useState<RAGCitation[]>([])
  const [qaError, setQaError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch documents and progress
  const fetchStatusAndDocs = async () => {
    try {
      const [prog, docs] = await Promise.all([
        ragService.getProgress(userId),
        ragService.listDocuments(userId)
      ])
      if (prog) setProgress(prog)
      if (docs) setDocuments(docs)
    } catch (err) {
      console.warn('[StatusOverlay] Polling notice:', err)
    }
  }

  // Polling management: interval when open
  useEffect(() => {
    fetchStatusAndDocs()
    if (!isOpen) return

    pollTimerRef.current = setInterval(fetchStatusAndDocs, 3000)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [isOpen])

  // Handle batch file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files).filter(
      (f) =>
        f.name.toLowerCase().endsWith('.pdf') || f.type.includes('pdf') || f.type.includes('text')
    )

    if (fileArray.length === 0) {
      setUploadMessage('Please select valid PDF documents to index.')
      setTimeout(() => setUploadMessage(null), 4000)
      return
    }

    setIsUploading(true)
    setUploadMessage(`Importing and queuing ${fileArray.length} document(s)...`)

    try {
      const result = await ragService.importDocuments(fileArray, userId)
      if (result.success) {
        setUploadMessage(
          `Queued ${result.queuedCount} file(s) for asynchronous background ingestion (${result.skippedCount} already up to date).`
        )
        fetchStatusAndDocs()
      } else {
        setUploadMessage(`Import notice: ${result.message || 'Error occurred'}`)
      }
    } catch (err: any) {
      setUploadMessage(`Upload failed: ${err?.message || 'Network error'}`)
    } finally {
      setIsUploading(false)
      setTimeout(() => setUploadMessage(null), 6000)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle document retry
  const handleRetry = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const success = await ragService.retryDocument(docId)
      if (success) {
        fetchStatusAndDocs()
      }
    } catch (err) {
      console.error('Failed to retry document:', err)
    }
  }

  // Handle document delete
  const handleDelete = async (docId: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Remove "${filename}" and all its vector embeddings from knowledge base?`)) {
      return
    }
    try {
      const success = await ragService.deleteDocument(docId)
      if (success) {
        setDocuments((prev) => prev.filter((d) => d.documentId !== docId))
        fetchStatusAndDocs()
        if (inspectDoc?.doc.documentId === docId) {
          setInspectDoc(null)
        }
      }
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }

  // Inspect chunks
  const handleInspect = async (doc: DocumentMetadata) => {
    setSelectedDocId(doc.documentId)
    setIsInspecting(true)
    try {
      const details = await ragService.getDocumentDetails(doc.documentId)
      if (details.success && details.chunks) {
        setInspectDoc({ doc, chunks: details.chunks })
      } else {
        setInspectDoc({ doc, chunks: [] })
      }
    } catch {
      setInspectDoc({ doc, chunks: [] })
    } finally {
      setIsInspecting(false)
    }
  }

  // Test RAG QA Sandbox
  const handleRunQA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qaPrompt.trim() || qaLoading) return

    setQaLoading(true)
    setQaError(null)
    setQaAnswer(null)
    setQaCitations([])

    try {
      const res = await ragService.askDocuments(qaPrompt)
      if (res.answer) {
        setQaAnswer(res.answer)
        setQaCitations(res.citations || [])
      } else {
        setQaError('No synthesized answer returned.')
      }
    } catch (err: any) {
      setQaError(err?.message || 'Failed to query document knowledge base.')
    } finally {
      setQaLoading(false)
    }
  }

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter = filterStatus === 'ALL' || doc.status === filterStatus
      const matchesSearch =
        !searchQuery.trim() ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesFilter && matchesSearch
    })
  }, [documents, filterStatus, searchQuery])

  // Aggregate stats
  const stats = useMemo(() => {
    const total = documents.length
    const queued = documents.filter((d) => d.status === 'queued').length
    const processing = documents.filter((d) => d.status === 'processing').length
    const indexed = documents.filter((d) => d.status === 'indexed').length
    const failed = documents.filter((d) => d.status === 'failed').length
    const totalChunks = documents.reduce((acc, d) => acc + (d.chunkCount || 0), 0)
    const totalPages = documents.reduce((acc, d) => acc + (d.pageCount || 0), 0)
    const percent = total > 0 ? Math.round(((indexed + failed) / total) * 100) : 100

    return { total, queued, processing, indexed, failed, totalChunks, totalPages, percent }
  }, [documents])

  const isIngesting = stats.queued > 0 || stats.processing > 0

  return (
    <>
      {/* 1. NON-BLOCKING FLOATING STATUS PILL (Visible when minimized or closed during active processing) */}
      <AnimatePresence>
        {!isOpen && (isIngesting || documents.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-4 right-4 z-40"
          >
            <button
              onClick={onOpen}
              className={`group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl backdrop-blur-xl border shadow-2xl transition-all duration-200 cursor-pointer ${
                isIngesting
                  ? 'bg-zinc-950/90 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:border-emerald-400'
                  : 'bg-zinc-950/80 border-white/10 text-zinc-300 hover:border-white/20 hover:text-white'
              }`}
            >
              <div className="relative flex items-center justify-center">
                {isIngesting ? (
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 text-emerald-400" />
                )}
                {isIngesting && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>

              <div className="flex flex-col items-start text-left">
                <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider">
                  <span>PDF Knowledge Base</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-md">
                    {stats.indexed}/{stats.total}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                  {isIngesting ? (
                    <span className="text-emerald-400 font-medium">
                      Indexing ({stats.percent}%) • {stats.processing} active
                    </span>
                  ) : (
                    <span>{stats.totalChunks} chunks indexed</span>
                  )}
                </div>
              </div>

              <ChevronRight
                size={14}
                className="text-zinc-500 group-hover:translate-x-0.5 transition-transform"
              />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. FULL MODAL STATUS DASHBOARD OVERLAY */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-5xl h-[92vh] max-h-[850px] bg-zinc-950/95 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans select-none"
            >
              {/* Overlay Top Navigation Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-900/60 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                    <Database size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold tracking-wide text-zinc-100 flex items-center gap-2">
                        PDF Knowledge & Ingestion Lifecycle
                      </h2>
                      {isIngesting && (
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          PROCESSING {stats.percent}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">
                      Asynchronous batch indexing pipeline supporting 200+ PDFs with live lifecycle
                      tracking
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchStatusAndDocs}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    title="Refresh status"
                  >
                    <RefreshCw
                      size={16}
                      className={isIngesting ? 'animate-spin text-emerald-400' : ''}
                    />
                  </button>

                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/30 text-zinc-400 transition-colors cursor-pointer"
                    title="Close overlay"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Ingestion Progress Bar Shimmer */}
              <div className="w-full bg-black/50 h-1.5 relative overflow-hidden shrink-0">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-400 transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(stats.percent, isIngesting ? 5 : 0)}%` }}
                />
                {isIngesting && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                )}
              </div>

              {/* High-Level Lifecycle Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 sm:p-5 bg-black/40 border-b border-white/5 shrink-0">
                {/* 1. Queued Card */}
                <div
                  onClick={() => setFilterStatus('queued')}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    filterStatus === 'queued'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'bg-zinc-900/40 border-white/5 hover:border-amber-500/20 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Clock size={13} /> Queued
                    </span>
                    <span className="text-base sm:text-lg font-bold font-mono text-zinc-100">
                      {stats.queued}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    Waiting in background queue
                  </p>
                </div>

                {/* 2. Processing Card */}
                <div
                  onClick={() => setFilterStatus('processing')}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    filterStatus === 'processing'
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.15)]'
                      : 'bg-zinc-900/40 border-white/5 hover:border-cyan-500/20 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Loader2 size={13} className={stats.processing > 0 ? 'animate-spin' : ''} />{' '}
                      Processing
                    </span>
                    <span className="text-base sm:text-lg font-bold font-mono text-zinc-100">
                      {stats.processing}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    OCR, chunking & embeddings
                  </p>
                </div>

                {/* 3. Indexed Card */}
                <div
                  onClick={() => setFilterStatus('indexed')}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    filterStatus === 'indexed'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'bg-zinc-900/40 border-white/5 hover:border-emerald-500/20 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Indexed
                    </span>
                    <span className="text-base sm:text-lg font-bold font-mono text-zinc-100">
                      {stats.indexed}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    {stats.totalChunks} chunks active for RAG
                  </p>
                </div>

                {/* 4. Failed Card */}
                <div
                  onClick={() => setFilterStatus('failed')}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    filterStatus === 'failed'
                      ? 'bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                      : 'bg-zinc-900/40 border-white/5 hover:border-red-500/20 text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                      <AlertTriangle size={13} /> Failed
                    </span>
                    <span className="text-base sm:text-lg font-bold font-mono text-zinc-100">
                      {stats.failed}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    {stats.failed > 0 ? 'Action required: click to retry' : 'No pipeline failures'}
                  </p>
                </div>
              </div>

              {/* View Sub-Tabs & Actions Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-5 py-3 border-b border-white/5 bg-zinc-950 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('documents')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'documents'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <Layers size={14} /> Document Catalog ({stats.total})
                  </button>

                  <button
                    onClick={() => setActiveTab('sandbox')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'sandbox'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    <Sparkles size={14} /> Citation QA Sandbox
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Hidden File Input for Batch Upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,application/pdf"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-xl tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)] cursor-pointer disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>Batch Import PDFs</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status Notice Toast / Message */}
              <AnimatePresence>
                {uploadMessage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-emerald-950/40 border-b border-emerald-500/20 px-5 py-2 text-xs text-emerald-300 flex items-center justify-between shrink-0"
                  >
                    <span>{uploadMessage}</span>
                    <button
                      onClick={() => setUploadMessage(null)}
                      className="text-emerald-400 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main Content Area */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
                {activeTab === 'documents' ? (
                  <div className="space-y-4">
                    {/* Filter & Search Toolbar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                        {(
                          ['ALL', 'queued', 'processing', 'indexed', 'failed'] as FilterStatus[]
                        ).map((st) => (
                          <button
                            key={st}
                            onClick={() => setFilterStatus(st)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold uppercase transition-colors cursor-pointer shrink-0 ${
                              filterStatus === st
                                ? 'bg-white/10 text-white border border-white/20'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>

                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-2.5 text-zinc-500" size={14} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search document name..."
                          className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40"
                        />
                      </div>
                    </div>

                    {/* Empty State */}
                    {filteredDocuments.length === 0 && (
                      <div className="flex flex-col items-center justify-center p-12 text-center bg-zinc-900/20 rounded-3xl border border-dashed border-white/10 space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-500">
                          <FileText size={24} />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-zinc-300">
                            No Documents Found
                          </h4>
                          <p className="text-xs text-zinc-500 max-w-sm">
                            {documents.length === 0
                              ? 'Batch import PDF documents using the button above to index them into the AI knowledge base.'
                              : 'No documents match your active status filter or search query.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Document List Grid */}
                    <div className="grid grid-cols-1 gap-2.5">
                      {filteredDocuments.map((doc) => {
                        const isDocProcessing = doc.status === 'processing'
                        const isDocQueued = doc.status === 'queued'
                        const isDocFailed = doc.status === 'failed'
                        const isDocIndexed = doc.status === 'indexed'

                        return (
                          <div
                            key={doc.documentId}
                            onClick={() => handleInspect(doc)}
                            className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-emerald-500/20 rounded-2xl transition-all duration-200 cursor-pointer gap-3"
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                  isDocIndexed
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : isDocProcessing
                                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                                      : isDocQueued
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                                }`}
                              >
                                {isDocIndexed && <CheckCircle2 size={16} />}
                                {isDocProcessing && <Loader2 size={16} className="animate-spin" />}
                                {isDocQueued && <Clock size={16} />}
                                {isDocFailed && <AlertTriangle size={16} />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate group-hover:text-emerald-300 transition-colors">
                                    {doc.filename}
                                  </h4>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider shrink-0 ${
                                      isDocIndexed
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        : isDocProcessing
                                          ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                                          : isDocQueued
                                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                    }`}
                                  >
                                    {doc.status}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-zinc-500 font-mono mt-1">
                                  <span>{doc.pageCount || 1} Pages</span>
                                  <span>•</span>
                                  <span>{Math.round((doc.fileSize || 0) / 1024)} KB</span>
                                  <span>•</span>
                                  <span className="text-emerald-400">
                                    {doc.chunkCount || 0} Chunks
                                  </span>
                                  {doc.errorReason && (
                                    <span className="text-red-400 truncate max-w-xs">
                                      • Error: {doc.errorReason}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {isDocFailed && (
                                <button
                                  onClick={(e) => handleRetry(doc.documentId, e)}
                                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                  title="Retry document indexing"
                                >
                                  <RefreshCw size={12} /> Retry
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleInspect(doc)
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-xs font-mono transition-colors cursor-pointer"
                                title="Inspect chunks and metadata"
                              >
                                Inspect
                              </button>

                              <button
                                onClick={(e) => handleDelete(doc.documentId, doc.filename, e)}
                                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/30 text-zinc-500 transition-colors cursor-pointer"
                                title="Delete document"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  /* 2. CITATION QA SANDBOX TAB */
                  <div className="space-y-4 max-w-3xl mx-auto">
                    <div className="bg-zinc-900/40 p-5 rounded-3xl border border-white/5 space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          <BookOpen size={16} className="text-emerald-400" /> Test RAG Synthesis &
                          Citations
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Verify how the AI queries indexed PDF chunks and returns verified
                          citations `[Document: filename.pdf, Page: X]`
                        </p>
                      </div>

                      <form onSubmit={handleRunQA} className="space-y-3">
                        <div className="relative">
                          <input
                            type="text"
                            value={qaPrompt}
                            onChange={(e) => setQaPrompt(e.target.value)}
                            placeholder="Ask a question about your uploaded documents..."
                            className="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-2xl text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/40"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={!qaPrompt.trim() || qaLoading}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs rounded-xl tracking-wider uppercase transition-all duration-200 flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.25)] cursor-pointer disabled:opacity-50"
                          >
                            {qaLoading ? (
                              <>
                                <Loader2 size={14} className="animate-spin" /> Synthesizing...
                              </>
                            ) : (
                              <>
                                <Sparkles size={14} /> Run RAG Query
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* QA Answer & Citation Results */}
                    {qaAnswer && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-zinc-900/60 p-5 rounded-3xl border border-emerald-500/30 shadow-xl space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 size={14} /> Grounded Synthesis
                          </h4>
                          <span className="text-[11px] font-mono text-zinc-500">
                            {qaCitations.length} verified citation(s)
                          </span>
                        </div>

                        <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {qaAnswer}
                        </div>

                        {qaCitations.length > 0 && (
                          <div className="pt-3 border-t border-white/5 space-y-2">
                            <h5 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                              Source Citations
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {qaCitations.map((cit, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-xs space-y-1 font-mono"
                                >
                                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                                    <FileText size={12} /> {cit.filename} (Page {cit.pageNumber})
                                  </div>
                                  <p className="text-[11px] text-zinc-400 line-clamp-2 italic">
                                    "{cit.snippet}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {qaError && (
                      <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-2xl text-xs text-red-300">
                        {qaError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. CHUNK INSPECTOR MODAL */}
      <AnimatePresence>
        {inspectDoc && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl max-h-[80vh] bg-zinc-950 border border-white/10 rounded-3xl p-5 flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="text-emerald-400" size={18} />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 truncate max-w-md">
                      {inspectDoc.doc.filename}
                    </h3>
                    <p className="text-[11px] font-mono text-zinc-400">
                      {inspectDoc.chunks.length} Semantic Chunks • {inspectDoc.doc.pageCount} Pages
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectDoc(null)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-3">
                {inspectDoc.chunks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-zinc-500">
                    No chunk vectors indexed yet for this document.
                  </div>
                ) : (
                  inspectDoc.chunks.map((chunk, idx) => (
                    <div
                      key={chunk.chunkId || idx}
                      className="p-3 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 border-b border-white/5 pb-1.5">
                        <span className="text-emerald-400 font-bold">
                          Chunk #{chunk.chunkIndex + 1 || idx + 1} (Page {chunk.pageNumber || 1})
                        </span>
                        <span>{chunk.tokenCount || 0} Tokens</span>
                      </div>
                      <p className="text-zinc-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
