import React, { useState } from 'react'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { RiDownload2Line, RiSmartphoneLine, RiCloseLine, RiCheckLine } from 'react-icons/ri'

interface PWAInstallButtonProps {
  className?: string
  variant?: 'button' | 'badge' | 'card'
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'button'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [installedSuccess, setInstalledSuccess] = useState(false)

  if (isInstalled && !installedSuccess) {
    return null
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install()
      if (success) {
        setInstalledSuccess(true)
      }
    } else if (isIOS) {
      setShowIOSGuide(true)
    }
  }

  if (installedSuccess) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold ${className}`}>
        <RiCheckLine className="w-4 h-4" />
        Installed on Device
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={`p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <RiDownload2Line className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-100">Install IRIS App</h4>
              <p className="text-xs text-zinc-400">Run independently on browser, desktop & mobile</p>
            </div>
          </div>
        </div>

        {isIOS ? (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <RiSmartphoneLine className="w-4 h-4" />
            Install on iOS Device
          </button>
        ) : (
          <button
            onClick={handleInstallClick}
            disabled={!isInstallable}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              isInstallable
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black cursor-pointer shadow-lg shadow-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700/50'
            }`}
          >
            <RiDownload2Line className="w-4 h-4" />
            {isInstallable ? 'Install IRIS Desktop/Mobile App' : 'App Ready / Standalone Mode'}
          </button>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl relative text-zinc-100">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
              >
                <RiCloseLine className="w-5 h-5" />
              </button>
              <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <RiSmartphoneLine className="text-emerald-400" />
                Install IRIS on iPhone / iPad
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed space-y-2 mb-4">
                <span>1. Tap the <strong className="text-emerald-400">Share</strong> icon in Safari toolbar.</span><br />
                <span>2. Scroll down and select <strong className="text-emerald-400">Add to Home Screen</strong>.</span><br />
                <span>3. Launch IRIS from your home screen for uninterrupted background voice execution!</span>
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        title="Install IRIS on your device for background running mode"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
          isInstallable || isIOS
            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            : 'bg-zinc-900 text-zinc-400 border-zinc-800 opacity-80'
        } ${className}`}
      >
        <RiDownload2Line className="w-3.5 h-3.5 text-emerald-400" />
        <span>Install App</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl relative text-zinc-100">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <RiSmartphoneLine className="text-emerald-400" />
              Install IRIS on iPhone / iPad
            </h3>
            <div className="text-xs text-zinc-300 leading-relaxed space-y-2 mb-4">
              <p>1. Tap the <strong className="text-emerald-400">Share</strong> icon in Safari toolbar.</p>
              <p>2. Scroll down and select <strong className="text-emerald-400">Add to Home Screen</strong>.</p>
              <p>3. Launch IRIS for native background execution support!</p>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
