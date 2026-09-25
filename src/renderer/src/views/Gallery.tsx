import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  RiImage2Line,
  RiDeleteBinLine,
  RiFolderOpenLine,
  RiCloseLine,
  RiDatabase2Line,
  RiFileWarningLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiDownloadLine,
  RiVideoLine,
  RiPlayCircleLine,
  RiLayoutGridFill,
  RiUploadCloud2Line,
  RiMusic2Line,
  RiFileTextLine,
  RiFileCodeLine,
  RiFileZipLine,
  RiFile3Line,
  RiSearchLine,
  RiPlayFill,
  RiPauseFill,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiFileCopyLine,
  RiCheckLine,
  RiExternalLinkLine
} from 'react-icons/ri'
import { motion, AnimatePresence } from 'framer-motion'

export type MediaCategory = 'image' | 'video' | 'audio' | 'document' | 'file'

export interface MediaFile {
  filename: string
  displayName: string
  path: string
  url: string
  createdAt: Date | string
  type: MediaCategory
  fileType?: string
  mimeType?: string
  size?: number
  contentSnippet?: string
}

function detectMediaType(filename: string, mimeType?: string, typeAttr?: string): MediaCategory {
  if (typeAttr === 'image' || typeAttr === 'video' || typeAttr === 'audio' || typeAttr === 'document' || typeAttr === 'file') {
    return typeAttr
  }
  const name = (filename || '').toLowerCase()
  const mime = (mimeType || '').toLowerCase()

  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|heic|tiff)$/i.test(name)) {
    return 'image'
  }
  if (mime.startsWith('video/') || /\.(mp4|webm|ogv|mov|avi|mkv|flv|m4v|3gp)$/i.test(name)) {
    return 'video'
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|wma|opus|aiff)$/i.test(name)) {
    return 'audio'
  }
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('text') ||
    mime.includes('json') ||
    mime.includes('zip') ||
    /\.(pdf|txt|doc|docx|xls|xlsx|ppt|pptx|json|csv|md|zip|rar|7z|tar|gz|xml|html|js|ts|py|cpp|c|java|kt|css|scss|rs|sh)$/i.test(name)
  ) {
    return 'document'
  }
  return 'file'
}

function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  if (parts.length > 1) {
    return parts.pop()!.toUpperCase()
  }
  return 'FILE'
}

const GalleryView = () => {
  const [allMedia, setAllMedia] = useState<MediaFile[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'document'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Audio Player State in Modal
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [direction, setDirection] = useState(0)
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 12
  const observer = useRef<IntersectionObserver | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchGallery = async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('get-gallery')
      if (Array.isArray(data)) {
        const typedData: MediaFile[] = data
          .map((item: any) => ({
            ...item,
            type: detectMediaType(item.filename, item.mimeType, item.type)
          }))
          .sort((a: MediaFile, b: MediaFile) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

        setAllMedia(typedData)
      }
    } catch (e) {
      console.error('Failed to load media files.')
    }
  }

  useEffect(() => {
    fetchGallery()
    const interval = setInterval(fetchGallery, 5000)
    return () => clearInterval(interval)
  }, [])

  const filteredMedia = useMemo(() => {
    return allMedia.filter((media) => {
      const matchesCategory =
        categoryFilter === 'all'
          ? true
          : categoryFilter === 'document'
            ? media.type === 'document' || media.type === 'file'
            : media.type === categoryFilter

      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        media.displayName.toLowerCase().includes(q) ||
        media.filename.toLowerCase().includes(q) ||
        (media.fileType && media.fileType.toLowerCase().includes(q))

      return matchesCategory && matchesSearch
    })
  }, [allMedia, categoryFilter, searchQuery])

  const visibleMedia = useMemo(() => {
    return filteredMedia.slice(0, page * ITEMS_PER_PAGE)
  }, [filteredMedia, page])

  const lastMediaRef = useCallback(
    (node: HTMLDivElement) => {
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && page * ITEMS_PER_PAGE < filteredMedia.length) {
          setPage((prev) => prev + 1)
        }
      })
      if (node) observer.current.observe(node)
    },
    [page, filteredMedia.length]
  )

  const processAndSaveFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return
    setIsUploading(true)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const category = detectMediaType(file.name, file.type)

        let url = ''
        let contentSnippet = ''

        const isTextReadable =
          file.type.startsWith('text/') ||
          /\.(json|md|txt|csv|js|ts|py|xml|html|css|scss|sh|log|yml|yaml|sql)$/i.test(file.name)

        if (isTextReadable && file.size < 1000000) {
          contentSnippet = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve(((e.target?.result as string) || '').slice(0, 1500))
            reader.onerror = () => resolve('')
            reader.readAsText(file)
          })
        }

        url = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve((e.target?.result as string) || '')
          reader.onerror = () => resolve('')
          reader.readAsDataURL(file)
        })

        const payload = {
          filename: file.name,
          displayName: file.name,
          url,
          type: category,
          fileType: getFileExtension(file.name),
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          contentSnippet,
          path: `/gallery/${file.name}`
        }

        await window.electron.ipcRenderer.invoke('save-gallery-image', payload)
      }
      await fetchGallery()
    } catch (err) {
      console.error('[IRIS Gallery] Error processing file upload:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processAndSaveFiles(e.target.files)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processAndSaveFiles(e.dataTransfer.files)
    }
  }

  const deleteMedia = async (filename: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await window.electron.ipcRenderer.invoke('delete-image', filename)

    if (selectedMedia) {
      const currentIndex = filteredMedia.findIndex((media) => media.filename === selectedMedia.filename)
      const nextMedia = filteredMedia[currentIndex + 1] || filteredMedia[currentIndex - 1]
      setSelectedMedia(nextMedia || null)
    }
    fetchGallery()
  }

  const openLocation = async (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await window.electron.ipcRenderer.invoke('open-image-location', path)
  }

  const saveCopy = async (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await window.electron.ipcRenderer.invoke('save-image-external', path)
  }

  const navigateMedia = useCallback(
    (newDirection: number) => {
      if (!selectedMedia || filteredMedia.length === 0) return
      setDirection(newDirection)

      const currentIndex = filteredMedia.findIndex((media) => media.filename === selectedMedia.filename)
      if (currentIndex === -1) return

      let newIndex = currentIndex + newDirection
      if (newIndex >= filteredMedia.length) newIndex = 0
      if (newIndex < 0) newIndex = filteredMedia.length - 1

      setSelectedMedia(filteredMedia[newIndex])
      setIsPlayingAudio(false)
    },
    [selectedMedia, filteredMedia]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedMedia) return
      if (e.key === 'ArrowRight') navigateMedia(1)
      if (e.key === 'ArrowLeft') navigateMedia(-1)
      if (e.key === 'Escape') setSelectedMedia(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedMedia, navigateMedia])

  // Reset audio state when modal opens/changes
  useEffect(() => {
    setIsPlayingAudio(false)
    setAudioProgress(0)
    setAudioDuration(0)
    setCopiedSnippet(false)
  }, [selectedMedia])

  const copySnippetToClipboard = () => {
    if (selectedMedia?.contentSnippet) {
      navigator.clipboard.writeText(selectedMedia.contentSnippet)
      setCopiedSnippet(true)
      setTimeout(() => setCopiedSnippet(false), 2000)
    }
  }

  const counts = useMemo(() => {
    return {
      all: allMedia.length,
      image: allMedia.filter((m) => m.type === 'image').length,
      video: allMedia.filter((m) => m.type === 'video').length,
      audio: allMedia.filter((m) => m.type === 'audio').length,
      document: allMedia.filter((m) => m.type === 'document' || m.type === 'file').length
    }
  }, [allMedia])

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 800 : -800,
      opacity: 0,
      scale: 0.9,
      filter: 'blur(10px)'
    }),
    center: { zIndex: 1, x: 0, opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: (dir: number) => ({
      zIndex: 0,
      x: dir < 0 ? 800 : -800,
      opacity: 0,
      scale: 0.9,
      filter: 'blur(10px)'
    })
  }

  const renderGridItem = (media: MediaFile, index: number) => {
    const isLast = index === visibleMedia.length - 1
    const ext = media.fileType || getFileExtension(media.filename)

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35 }}
        key={`${media.filename}-${index}`}
        ref={isLast ? lastMediaRef : null}
        onClick={() => {
          setDirection(0)
          setSelectedMedia(media)
        }}
        className="group relative aspect-4/5 bg-neutral-900 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden hover:border-emerald-500/50 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between"
      >
        {/* Card Content based on type */}
        {media.type === 'image' && (
          <img
            src={media.url}
            alt={media.displayName}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.classList.remove('hidden')
            }}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-85 group-hover:opacity-100"
          />
        )}

        {media.type === 'video' && (
          <video
            src={media.url}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-85 group-hover:opacity-100"
            preload="metadata"
            muted
            playsInline
            loop
            onMouseEnter={(e) => {
              e.currentTarget.play().catch(() => {})
            }}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
          >
            <source src={media.url} type={media.mimeType || 'video/mp4'} />
          </video>
        )}

        {media.type === 'audio' && (
          <div className="w-full h-full bg-linear-to-br from-neutral-900 via-neutral-950 to-emerald-950/40 p-4 flex flex-col justify-between relative overflow-hidden group-hover:scale-102 transition-transform duration-500">
            <div className="flex justify-between items-start z-10">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <RiMusic2Line size={24} />
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-black/60 rounded border border-white/10 text-emerald-400 uppercase">
                {ext}
              </span>
            </div>

            {/* Soundwave Animation Graphic */}
            <div className="flex items-center justify-center gap-1 my-auto h-12">
              {[40, 70, 30, 90, 60, 100, 45, 80, 35, 65, 85, 50].map((h, idx) => (
                <div
                  key={idx}
                  className="w-1 bg-emerald-500/40 group-hover:bg-emerald-400 rounded-full transition-all duration-300"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <div className="z-10">
              <p className="text-xs font-bold text-white truncate">{media.displayName}</p>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{formatFileSize(media.size)}</p>
            </div>
          </div>
        )}

        {(media.type === 'document' || media.type === 'file') && (
          <div className="w-full h-full bg-linear-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-4 flex flex-col justify-between relative overflow-hidden group-hover:scale-102 transition-transform duration-500">
            <div className="flex justify-between items-start z-10">
              <div className="p-2.5 bg-neutral-800 rounded-xl border border-white/10 text-emerald-400">
                {ext === 'PDF' ? (
                  <RiFileTextLine size={24} />
                ) : ext === 'ZIP' || ext === 'RAR' || ext === '7Z' ? (
                  <RiFileZipLine size={24} />
                ) : ['JS', 'TS', 'PY', 'JSON', 'HTML', 'CSS', 'CPP', 'RS'].includes(ext) ? (
                  <RiFileCodeLine size={24} />
                ) : (
                  <RiFile3Line size={24} />
                )}
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-500/20 rounded border border-emerald-500/30 text-emerald-400 uppercase tracking-widest">
                {ext}
              </span>
            </div>

            {/* Text snippet preview if available */}
            {media.contentSnippet ? (
              <div className="my-2 p-2 bg-black/50 rounded border border-white/5 font-mono text-[9px] text-neutral-400 overflow-hidden line-clamp-4 leading-relaxed">
                {media.contentSnippet}
              </div>
            ) : (
              <div className="my-auto flex flex-col items-center justify-center opacity-30 text-neutral-500">
                <RiFileTextLine size={36} />
              </div>
            )}

            <div className="z-10">
              <p className="text-xs font-bold text-white truncate">{media.displayName}</p>
              <p className="text-[10px] text-neutral-400 font-mono mt-0.5">{formatFileSize(media.size)}</p>
            </div>
          </div>
        )}

        {/* Fallback error container */}
        <div className="hidden absolute inset-0 items-center justify-center flex-col gap-3 bg-neutral-950">
          <RiFileWarningLine className="text-red-500/40" size={28} />
          <span className="text-[10px] font-bold tracking-widest text-neutral-500">CANNOT LOAD</span>
        </div>

        {/* Media Badges */}
        {media.type === 'video' && (
          <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1 z-10 pointer-events-none">
            <RiVideoLine size={10} className="text-emerald-400" />
            <span className="text-[9px] font-bold tracking-widest text-white">VIDEO</span>
          </div>
        )}

        {media.type === 'audio' && (
          <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1 z-10 pointer-events-none">
            <RiMusic2Line size={10} className="text-emerald-400" />
            <span className="text-[9px] font-bold tracking-widest text-white">AUDIO</span>
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 pointer-events-none z-20">
          <div className="mb-2">
            <p className="text-xs text-white font-bold truncate">{media.displayName}</p>
            <p className="text-[10px] text-neutral-400">{new Date(media.createdAt).toLocaleDateString()}</p>
          </div>

          <div className="flex gap-1.5 justify-end pointer-events-auto">
            <button
              onClick={(e) => openLocation(media.path, e)}
              className="p-1.5 bg-neutral-800 text-white rounded hover:bg-emerald-500 hover:text-black transition-colors"
              title="Locate File"
            >
              <RiFolderOpenLine size={14} />
            </button>
            <button
              onClick={(e) => deleteMedia(media.filename, e)}
              className="p-1.5 bg-neutral-800 text-white rounded hover:bg-red-500 hover:text-white transition-colors"
              title="Delete File"
            >
              <RiDeleteBinLine size={14} />
            </button>
          </div>
        </div>

        {media.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-15">
            <RiPlayCircleLine size={40} className="text-white drop-shadow-lg" />
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 bg-neutral-950 h-full p-3 sm:p-6 md:p-10 animate-in fade-in duration-500 flex flex-col overflow-hidden selection:bg-emerald-500/30 text-white font-sans pb-24"
    >
      {/* Drag & Drop Visual Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-100 bg-emerald-950/90 backdrop-blur-xl border-4 border-dashed border-emerald-500 rounded-2xl flex flex-col items-center justify-center gap-4 text-emerald-400 p-8 shadow-2xl"
          >
            <RiUploadCloud2Line size={64} className="animate-bounce" />
            <h3 className="text-2xl font-bold uppercase tracking-wider">Drop Files to Add to IRIS Vault</h3>
            <p className="text-sm font-mono text-emerald-300/80">
              Photos, Videos, Audio Recordings, Documents, PDFs, Archives & Code Files
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Upload File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept="*/*"
        className="hidden"
      />

      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 sm:pb-6 border-b border-white/5 mb-4 sm:mb-6 shrink-0 gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="p-2.5 sm:p-3 bg-neutral-900 rounded-xl sm:rounded-2xl border border-neutral-800 shadow-md shrink-0">
            <RiLayoutGridFill className="text-emerald-500" size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold tracking-wider text-white uppercase truncate flex items-center gap-2">
              Media & File Vault
            </h2>
            <p className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 uppercase tracking-widest truncate">
              Local Storage • All Formats Supported
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="cursor-pointer px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 border border-emerald-400 active:scale-95 disabled:opacity-50"
          >
            <RiUploadCloud2Line size={16} />
            <span>{isUploading ? 'IMPORTING...' : 'ADD FILES'}</span>
          </button>

          <div className="text-[10px] sm:text-xs font-bold tracking-widest text-emerald-400 bg-neutral-900 px-3 py-2 rounded-xl border border-neutral-800 shadow-sm flex items-center gap-2">
            <RiDatabase2Line size={14} /> {allMedia.length} ITEMS
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 shrink-0">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          <button
            onClick={() => {
              setCategoryFilter('all')
              setPage(1)
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              categoryFilter === 'all'
                ? 'bg-emerald-500 text-black shadow-md border border-emerald-400'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.all})</span>
          </button>

          <button
            onClick={() => {
              setCategoryFilter('image')
              setPage(1)
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              categoryFilter === 'image'
                ? 'bg-emerald-500 text-black shadow-md border border-emerald-400'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <RiImage2Line size={14} />
            <span>Photos</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.image})</span>
          </button>

          <button
            onClick={() => {
              setCategoryFilter('video')
              setPage(1)
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              categoryFilter === 'video'
                ? 'bg-emerald-500 text-black shadow-md border border-emerald-400'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <RiVideoLine size={14} />
            <span>Videos</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.video})</span>
          </button>

          <button
            onClick={() => {
              setCategoryFilter('audio')
              setPage(1)
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              categoryFilter === 'audio'
                ? 'bg-emerald-500 text-black shadow-md border border-emerald-400'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <RiMusic2Line size={14} />
            <span>Audio</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.audio})</span>
          </button>

          <button
            onClick={() => {
              setCategoryFilter('document')
              setPage(1)
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap flex items-center gap-1.5 ${
              categoryFilter === 'document'
                ? 'bg-emerald-500 text-black shadow-md border border-emerald-400'
                : 'bg-neutral-900 text-neutral-400 hover:text-white border border-white/5'
            }`}
          >
            <RiFileTextLine size={14} />
            <span>Documents & Files</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.document})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 sm:max-w-xs min-w-0">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search gallery files..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            >
              <RiCloseLine size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Grid View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 sm:pr-2 min-h-0">
        {filteredMedia.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-4 sm:gap-5 py-12">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 shadow-inner">
              <RiUploadCloud2Line size={32} className="opacity-30 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-xs sm:text-sm font-bold tracking-widest text-neutral-400 uppercase">
                No Vault Files Found
              </p>
              <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">
                Click <span className="text-emerald-400 font-bold">"ADD FILES"</span> above or drag and drop any photos, videos, audio tracks, or documents here.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 pb-12 auto-rows-max">
            {visibleMedia.map((media, index) => renderGridItem(media, index))}
          </div>
        )}
      </div>

      {/* Detailed Modal Viewer for Selected File */}
      <AnimatePresence>
        {selectedMedia && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center p-4 sm:p-8"
          >
            {/* Modal Header Toolbar */}
            <div className="absolute top-0 left-0 right-0 p-3 sm:p-6 flex justify-between items-center z-50 gap-2">
              <div className="text-left px-3 sm:px-4 py-2 bg-neutral-900/80 backdrop-blur-md rounded-xl border border-white/10 min-w-0 max-w-[70%]">
                <h3 className="text-xs sm:text-base font-bold text-white tracking-wide flex items-center gap-2 truncate">
                  {selectedMedia.type === 'video' ? (
                    <RiVideoLine className="text-emerald-500 shrink-0" />
                  ) : selectedMedia.type === 'audio' ? (
                    <RiMusic2Line className="text-emerald-500 shrink-0" />
                  ) : selectedMedia.type === 'document' ? (
                    <RiFileTextLine className="text-emerald-500 shrink-0" />
                  ) : (
                    <RiImage2Line className="text-emerald-500 shrink-0" />
                  )}
                  <span className="truncate">{selectedMedia.displayName}</span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-0.5 truncate font-mono">
                  {new Date(selectedMedia.createdAt).toLocaleString()} • {formatFileSize(selectedMedia.size)}
                </p>
              </div>

              <button
                onClick={() => setSelectedMedia(null)}
                className="cursor-pointer p-2.5 sm:p-3 bg-neutral-900 hover:bg-red-500 hover:text-white rounded-full text-neutral-400 transition-colors border border-white/10 shrink-0"
              >
                <RiCloseLine size={20} />
              </button>
            </div>

            {/* Navigation Arrows */}
            <div
              className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 md:w-28 z-40 flex items-center justify-start pl-2 sm:pl-4 group cursor-pointer hover:bg-linear-to-r from-black/40 to-transparent"
              onClick={() => navigateMedia(-1)}
            >
              <div className="p-2.5 sm:p-3.5 bg-neutral-900 group-hover:bg-white text-white group-hover:text-black rounded-full transition-colors border border-white/10 shadow-lg">
                <RiArrowLeftSLine size={22} />
              </div>
            </div>

            <div
              className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 md:w-28 z-40 flex items-center justify-end pr-2 sm:pr-4 group cursor-pointer hover:bg-linear-to-l from-black/40 to-transparent"
              onClick={() => navigateMedia(1)}
            >
              <div className="p-2.5 sm:p-3.5 bg-neutral-900 group-hover:bg-white text-white group-hover:text-black rounded-full transition-colors border border-white/10 shadow-lg">
                <RiArrowRightSLine size={22} />
              </div>
            </div>

            {/* Modal Body Content Viewer */}
            <div className="relative w-full h-full flex flex-col items-center justify-center pt-16 sm:pt-20 pb-24 sm:pb-28 px-12 sm:px-20 md:px-28">
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.div
                  key={selectedMedia.filename}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 250, damping: 30 }}
                  className="relative w-full h-full flex items-center justify-center max-w-5xl"
                >
                  {/* Photo Image Viewer */}
                  {selectedMedia.type === 'image' && (
                    <img
                      src={selectedMedia.url}
                      alt={selectedMedia.displayName}
                      className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10 object-contain bg-black"
                    />
                  )}

                  {/* Video Player */}
                  {selectedMedia.type === 'video' && (
                    <video
                      src={selectedMedia.url}
                      controls
                      autoPlay
                      className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10 bg-black outline-none"
                    />
                  )}

                  {/* Audio Player Card */}
                  {selectedMedia.type === 'audio' && (
                    <div className="w-full max-w-lg bg-neutral-900/90 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 text-center">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mx-auto flex items-center justify-center text-emerald-400 shadow-inner">
                        <RiMusic2Line size={48} />
                      </div>

                      <div>
                        <h4 className="text-lg font-bold text-white truncate">{selectedMedia.displayName}</h4>
                        <p className="text-xs text-neutral-400 font-mono mt-1">
                          {selectedMedia.fileType || 'AUDIO'} • {formatFileSize(selectedMedia.size)}
                        </p>
                      </div>

                      {/* Waveform Graphic */}
                      <div className="flex items-center justify-center gap-1.5 h-16 bg-black/40 rounded-xl p-3 border border-white/5">
                        {[40, 75, 30, 90, 60, 100, 45, 80, 35, 65, 85, 50, 95, 70, 40, 85, 60, 90, 30, 70].map((h, i) => (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full transition-all duration-300 ${
                              isPlayingAudio ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/40'
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>

                      {/* HTML5 Audio element */}
                      <audio
                        ref={audioRef}
                        src={selectedMedia.url}
                        onPlay={() => setIsPlayingAudio(true)}
                        onPause={() => setIsPlayingAudio(false)}
                        onTimeUpdate={() => {
                          if (audioRef.current) {
                            setAudioProgress(audioRef.current.currentTime)
                            setAudioDuration(audioRef.current.duration || 0)
                          }
                        }}
                        onEnded={() => setIsPlayingAudio(false)}
                        className="hidden"
                      />

                      {/* Custom Audio Player Controls */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                          <span>
                            {Math.floor(audioProgress / 60)}:
                            {Math.floor(audioProgress % 60)
                              .toString()
                              .padStart(2, '0')}
                          </span>
                          <span>
                            {Math.floor(audioDuration / 60)}:
                            {Math.floor(audioDuration % 60)
                              .toString()
                              .padStart(2, '0')}
                          </span>
                        </div>

                        {/* Progress Bar Scrubber */}
                        <input
                          type="range"
                          min={0}
                          max={audioDuration || 100}
                          value={audioProgress}
                          onChange={(e) => {
                            if (audioRef.current) {
                              audioRef.current.currentTime = parseFloat(e.target.value)
                            }
                          }}
                          className="w-full accent-emerald-500 bg-neutral-800 rounded-lg cursor-pointer h-2"
                        />

                        <div className="flex items-center justify-center gap-4 mt-2">
                          <button
                            onClick={() => {
                              if (audioRef.current) {
                                audioRef.current.muted = !isMuted
                                setIsMuted(!isMuted)
                              }
                            }}
                            className="p-3 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-300 transition-colors"
                          >
                            {isMuted ? <RiVolumeMuteLine size={20} /> : <RiVolumeUpLine size={20} />}
                          </button>

                          <button
                            onClick={() => {
                              if (audioRef.current) {
                                if (isPlayingAudio) audioRef.current.pause()
                                else audioRef.current.play()
                              }
                            }}
                            className="p-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full transition-transform active:scale-95 shadow-xl"
                          >
                            {isPlayingAudio ? <RiPauseFill size={28} /> : <RiPlayFill size={28} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Document & Text Code Viewer */}
                  {(selectedMedia.type === 'document' || selectedMedia.type === 'file') && (
                    <div className="w-full max-w-2xl bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-5 max-h-[70vh]">
                      <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                            <RiFileTextLine size={28} />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-white truncate max-w-md">{selectedMedia.displayName}</h4>
                            <p className="text-xs text-neutral-400 font-mono mt-0.5">
                              {selectedMedia.fileType || 'FILE'} • {formatFileSize(selectedMedia.size)}
                            </p>
                          </div>
                        </div>

                        {selectedMedia.contentSnippet && (
                          <button
                            onClick={copySnippetToClipboard}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            {copiedSnippet ? <RiCheckLine className="text-emerald-400" size={14} /> : <RiFileCopyLine size={14} />}
                            <span>{copiedSnippet ? 'Copied' : 'Copy Text'}</span>
                          </button>
                        )}
                      </div>

                      {/* Content Snippet Reader */}
                      {selectedMedia.contentSnippet ? (
                        <div className="flex-1 bg-black/70 rounded-xl p-4 border border-white/5 font-mono text-xs text-neutral-300 overflow-y-auto custom-scrollbar leading-relaxed whitespace-pre-wrap select-text">
                          {selectedMedia.contentSnippet}
                        </div>
                      ) : (
                        <div className="py-10 flex flex-col items-center justify-center text-center text-neutral-500 gap-3">
                          <RiFile3Line size={48} className="opacity-30" />
                          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Binary Document / Vault File</p>
                          <p className="text-[11px] text-neutral-500 max-w-xs">
                            Use "Locate" or "Export" below to open this file in your default system viewer.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Modal Bottom Action Controls */}
            <div className="absolute bottom-4 sm:bottom-8 z-50 flex gap-2 sm:gap-3 p-2 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-xl max-w-[calc(100vw-24px)] overflow-x-auto shadow-2xl">
              <button
                onClick={(e) => openLocation(selectedMedia.path, e)}
                className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 hover:bg-white text-white hover:text-black rounded-lg text-xs font-bold tracking-wide transition-colors whitespace-nowrap"
              >
                <RiFolderOpenLine size={14} /> Locate
              </button>
              <button
                onClick={(e) => saveCopy(selectedMedia.path, e)}
                className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-black rounded-lg text-xs font-bold tracking-wide transition-colors border border-emerald-500/20 whitespace-nowrap"
              >
                <RiDownloadLine size={14} /> Export
              </button>
              <button
                onClick={(e) => deleteMedia(selectedMedia.filename, e)}
                className="cursor-pointer flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-xs font-bold tracking-wide transition-colors border border-red-500/20 whitespace-nowrap"
              >
                <RiDeleteBinLine size={14} /> Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default GalleryView
