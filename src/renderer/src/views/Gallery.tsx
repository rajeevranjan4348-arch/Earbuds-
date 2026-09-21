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
  RiLayoutGridFill
} from 'react-icons/ri'
import { motion, AnimatePresence } from 'framer-motion'

interface MediaFile {
  filename: string
  displayName: string
  path: string
  url: string
  createdAt: Date
  type: 'image' | 'video'
}

const GalleryView = () => {
  const [allMedia, setAllMedia] = useState<MediaFile[]>([])
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null)

  const [direction, setDirection] = useState(0)
  const [page, setPage] = useState(1)
  const ITEMS_PER_PAGE = 12
  const observer = useRef<IntersectionObserver | null>(null)

  const visibleMedia = useMemo(() => {
    return allMedia.slice(0, page * ITEMS_PER_PAGE)
  }, [allMedia, page])

  const lastMediaRef = useCallback(
    (node: HTMLDivElement) => {
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && page * ITEMS_PER_PAGE < allMedia.length) {
          setPage((prev) => prev + 1)
        }
      })
      if (node) observer.current.observe(node)
    },
    [page, allMedia.length]
  )

  const fetchGallery = async () => {
    try {
      const data = await window.electron.ipcRenderer.invoke('get-gallery')
      if (Array.isArray(data)) {
        const typedData = data
          .map((item: any) => ({
            ...item,
            type: item.filename.toLowerCase().endsWith('.mp4') ? 'video' : 'image'
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

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

  const deleteMedia = async (filename: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await window.electron.ipcRenderer.invoke('delete-image', filename)

    if (selectedMedia) {
      const currentIndex = allMedia.findIndex((media) => media.filename === selectedMedia.filename)
      const nextMedia = allMedia[currentIndex + 1] || allMedia[currentIndex - 1]
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
      if (!selectedMedia || allMedia.length === 0) return
      setDirection(newDirection)

      const currentIndex = allMedia.findIndex((media) => media.filename === selectedMedia.filename)
      if (currentIndex === -1) return

      let newIndex = currentIndex + newDirection
      if (newIndex >= allMedia.length) newIndex = 0
      if (newIndex < 0) newIndex = allMedia.length - 1

      setSelectedMedia(allMedia[newIndex])
    },
    [selectedMedia, allMedia]
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

  return (
    <div className="flex-1 bg-neutral-950 h-full p-3 sm:p-6 md:p-10 animate-in fade-in duration-500 flex flex-col overflow-hidden selection:bg-emerald-500/30 text-white font-sans pb-24">
      <div className="flex items-center justify-between pb-4 sm:pb-6 border-b border-white/5 mb-4 sm:mb-8 shrink-0 gap-2">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="p-2 sm:p-3 bg-neutral-900 rounded-xl sm:rounded-2xl border border-neutral-800 shadow-md shrink-0">
            <RiLayoutGridFill className="text-emerald-500" size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl font-bold tracking-wider text-white uppercase truncate flex items-center gap-2">
              Media Vault
            </h2>
            <p className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 uppercase tracking-widest truncate">
              Local Device Storage
            </p>
          </div>
        </div>

        <div className="text-[10px] sm:text-xs font-bold tracking-widest text-emerald-500 bg-neutral-900 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-neutral-800 shadow-sm flex items-center gap-1.5 shrink-0">
          <RiDatabase2Line size={12} /> {allMedia.length} FILES
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 sm:pr-2 min-h-0">
        {allMedia.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-600 gap-4 sm:gap-5 py-12">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800 shadow-inner">
              <RiImage2Line size={32} className="opacity-20 sm:w-10 sm:h-10" />
            </div>
            <p className="text-xs sm:text-sm font-bold tracking-widest opacity-40 uppercase">
              No Media Found
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 pb-12 auto-rows-max">
            {visibleMedia.map((media, index) => {
              const isLast = index === visibleMedia.length - 1
              const isVideo = media.type === 'video'

              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  key={`${media.filename}-${index}`}
                  ref={isLast ? lastMediaRef : null}
                  onClick={() => {
                    setDirection(0)
                    setSelectedMedia(media)
                  }}
                  className="group relative aspect-square sm:aspect-4/5 bg-neutral-900 rounded-xl sm:rounded-2xl border border-white/5 overflow-hidden hover:border-emerald-500/50 hover:shadow-lg transition-all duration-300 cursor-pointer"
                >
                  {isVideo ? (
                    <video
                      src={media.url}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
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
                      <source src={media.url} type="video/mp4" />
                    </video>
                  ) : (
                    <img
                      src={media.url}
                      alt={media.displayName}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.classList.remove('hidden')
                      }}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                    />
                  )}

                  <div className="hidden absolute inset-0 items-center justify-center flex-col gap-3 bg-neutral-950">
                    <RiFileWarningLine className="text-red-500/40" size={28} />
                    <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-neutral-500">
                      CANNOT LOAD
                    </span>
                  </div>

                  {isVideo && (
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-black/70 backdrop-blur-md px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border border-white/10 flex items-center gap-1 z-10 pointer-events-none">
                      <RiVideoLine size={10} className="text-emerald-400" />
                      <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-white">
                        VIDEO
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2.5 sm:p-4 pointer-events-none">
                    <div className="mb-2 sm:mb-3">
                      <p className="text-[11px] sm:text-xs text-white font-bold mb-0.5 sm:mb-1 truncate">
                        {media.displayName}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-neutral-400">
                        {new Date(media.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex gap-1.5 sm:gap-2 justify-end pointer-events-auto">
                      <button
                        onClick={(e) => openLocation(media.path, e)}
                        className="p-1.5 sm:p-2 bg-neutral-800 text-white rounded hover:bg-emerald-500 hover:text-black transition-colors"
                        title="Locate File"
                      >
                        <RiFolderOpenLine size={14} />
                      </button>
                      <button
                        onClick={(e) => deleteMedia(media.filename, e)}
                        className="p-1.5 sm:p-2 bg-neutral-800 text-white rounded hover:bg-red-500 hover:text-white transition-colors"
                        title="Delete File"
                      >
                        <RiDeleteBinLine size={14} />
                      </button>
                    </div>
                  </div>

                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      <RiPlayCircleLine size={40} className="text-white drop-shadow-md" />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedMedia && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center"
          >
            <div className="absolute top-0 left-0 right-0 p-3 sm:p-6 flex justify-between items-center z-50 gap-2">
              <div className="text-left px-3 sm:px-4 py-1.5 sm:py-2 bg-neutral-900/80 backdrop-blur-md rounded-lg border border-white/10 min-w-0 max-w-[70%]">
                <h3 className="text-xs sm:text-base font-bold text-white tracking-wide flex items-center gap-1.5 sm:gap-2 truncate">
                  {selectedMedia.type === 'video' ? (
                    <RiVideoLine className="text-emerald-500 shrink-0" />
                  ) : (
                    <RiImage2Line className="text-emerald-500 shrink-0" />
                  )}
                  <span className="truncate">{selectedMedia.displayName}</span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-neutral-400 mt-0.5 truncate">
                  {new Date(selectedMedia.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setSelectedMedia(null)}
                className="cursor-pointer p-2 sm:p-3 bg-neutral-900 hover:bg-red-500 hover:text-white rounded-full text-neutral-400 transition-colors border border-white/10 shrink-0"
              >
                <RiCloseLine size={20} />
              </button>
            </div>

            <div
              className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 md:w-32 z-40 flex items-center justify-start pl-2 sm:pl-4 md:pl-6 group cursor-pointer hover:bg-linear-to-r from-black/40 to-transparent"
              onClick={() => navigateMedia(-1)}
            >
              <div className="p-2 sm:p-3 md:p-4 bg-neutral-900 group-hover:bg-white text-white group-hover:text-black rounded-full transition-colors border border-white/10 shadow-lg">
                <RiArrowLeftSLine size={22} />
              </div>
            </div>

            <div
              className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 md:w-32 z-40 flex items-center justify-end pr-2 sm:pr-4 md:pr-6 group cursor-pointer hover:bg-linear-to-l from-black/40 to-transparent"
              onClick={() => navigateMedia(1)}
            >
              <div className="p-2 sm:p-3 md:p-4 bg-neutral-900 group-hover:bg-white text-white group-hover:text-black rounded-full transition-colors border border-white/10 shadow-lg">
                <RiArrowRightSLine size={22} />
              </div>
            </div>

            <div className="relative w-full h-full flex flex-col items-center justify-center pt-16 sm:pt-20 pb-24 sm:pb-28 px-12 sm:px-20 md:px-32">
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.div
                  key={selectedMedia.filename}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 250, damping: 30 }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  {selectedMedia.type === 'video' ? (
                    <video
                      src={selectedMedia.url}
                      controls
                      autoPlay
                      className="max-w-full max-h-full rounded-lg shadow-2xl border border-white/10 bg-black outline-none"
                    />
                  ) : (
                    <img
                      src={selectedMedia.url}
                      className="max-w-full max-h-full rounded-lg shadow-2xl border border-white/10 object-contain bg-black"
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="absolute bottom-4 sm:bottom-8 z-50 flex gap-2 sm:gap-3 p-1.5 sm:p-2 bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-xl max-w-[calc(100vw-24px)] overflow-x-auto">
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
