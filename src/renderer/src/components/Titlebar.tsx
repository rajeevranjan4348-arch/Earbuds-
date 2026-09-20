import { useState, useEffect } from 'react'
import {
  RiSubtractLine,
  RiCloseLine,
  RiCheckboxBlankLine,
  RiCheckboxMultipleBlankLine,
  RiPulseLine
} from 'react-icons/ri'

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if (window.electron && window.electron.process) {
      setIsMac(window.electron.process.platform === 'darwin')
    } else {
      setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
    }
  }, [])

  const minimize = () => window.electron.ipcRenderer.send('window-min')
  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
    window.electron.ipcRenderer.send('window-max')
  }
  const close = () => window.electron.ipcRenderer.send('window-close')

  return (
    <div className="w-full h-12 flex items-center justify-between bg-[#08080a] backdrop-blur-3xl border-b border-white/5 drag-region select-none z-50 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div className="flex items-center h-full min-w-0 sm:min-w-37.5 pl-2.5 sm:pl-4 no-drag">
        {isMac ? (
          <div className="flex items-center gap-2 group/mac">
            <button
              onClick={close}
              className="w-3 h-3 rounded-full bg-zinc-800 hover:bg-[#ff5f56] border border-black/20 transition-colors flex items-center justify-center shadow-inner"
            >
              <RiCloseLine
                size={8}
                className="opacity-0 group-hover/mac:opacity-100 text-[#4c0002]"
              />
            </button>
            <button
              onClick={minimize}
              className="w-3 h-3 rounded-full bg-zinc-800 hover:bg-[#ffbd2e] border border-black/20 transition-colors flex items-center justify-center shadow-inner"
            >
              <RiSubtractLine
                size={8}
                className="opacity-0 group-hover/mac:opacity-100 text-[#5c3e00]"
              />
            </button>
            <button
              onClick={toggleMaximize}
              className="w-3 h-3 rounded-full bg-zinc-800 hover:bg-[#27c93f] border border-black/20 transition-colors flex items-center justify-center shadow-inner"
            >
              <RiCheckboxBlankLine
                size={6}
                className="opacity-0 group-hover/mac:opacity-100 text-[#024d04]"
              />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.4)] pointer-events-none">
              <div className="relative flex items-center justify-center w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              </div>

              <span className="text-[7.5px] sm:text-[8.6px] font-mono tracking-[0.15em] sm:tracking-[0.2em] text-zinc-300 uppercase truncate">
                <span className="hidden sm:inline">Desktop </span>Voice Assistant
              </span>

              <span className="text-[10px] text-zinc-700">|</span>

              <div className="flex items-center gap-1 sm:gap-1.5 text-emerald-400 shrink-0">
                <RiPulseLine size={12} className="animate-pulse" />
                <span className="text-[8px] sm:text-[9px] font-mono tracking-widest font-bold uppercase drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">
                  Active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-full min-w-0 sm:min-w-37.5 justify-end no-drag">
        {!isMac ? (
          <div className="flex h-full items-center">
            <button
              onClick={minimize}
              className="w-8 sm:w-12 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RiSubtractLine size={15} />
            </button>
            <button
              onClick={toggleMaximize}
              className="w-8 sm:w-12 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isMaximized ? (
                <RiCheckboxMultipleBlankLine size={13} />
              ) : (
                <RiCheckboxBlankLine size={13} />
              )}
            </button>
            <button
              onClick={close}
              className="w-8 sm:w-12 h-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-500/90 hover:shadow-[inset_0_0_15px_rgba(255,255,255,0.2)] transition-all"
            >
              <RiCloseLine size={17} />
            </button>
          </div>
        ) : (
          <div className="w-8 sm:w-12 h-full pointer-events-none" />
        )}
      </div>
    </div>
  )
}
