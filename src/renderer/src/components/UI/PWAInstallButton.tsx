import React, { useState } from 'react'
import { usePWAInstall } from '../../hooks/usePWAInstall'
import { RiDownload2Line, RiSmartphoneLine, RiCloseLine, RiCheckLine } from 'react-icons/ri'
import { FaAndroid } from 'react-icons/fa6'
import { AndroidApkDownloadModal } from './AndroidApkDownloadModal'

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
  const [showApkModal, setShowApkModal] = useState(false)
  const [installedSuccess, setInstalledSuccess] = useState(false)

  React.useEffect(() => {
    const handleOpen = () => setShowApkModal(true)
    window.addEventListener('iris:open-apk-download', handleOpen)
    return () => window.removeEventListener('iris:open-apk-download', handleOpen)
  }, [])

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install()
      if (success) {
        setInstalledSuccess(true)
      }
    } else if (isIOS) {
      setShowIOSGuide(true)
    } else {
      setShowApkModal(true)
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
      <>
        <div className={`p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-3 ${className}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <RiDownload2Line className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-100">Install IRIS App</h4>
                <p className="text-xs text-zinc-400">Android APK package & PWA web app</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowApkModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <FaAndroid className="w-4 h-4" />
              <span>Download Android APK (.apk)</span>
            </button>

            {isIOS ? (
              <button
                onClick={() => setShowIOSGuide(true)}
                className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RiSmartphoneLine className="w-4 h-4" />
                Install on iOS Safari
              </button>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer border border-zinc-700/50"
              >
                <RiDownload2Line className="w-4 h-4 text-emerald-400" />
                <span>Install as PWA Web App</span>
              </button>
            )}
          </div>
        </div>

        <AndroidApkDownloadModal
          isOpen={showApkModal}
          onClose={() => setShowApkModal(false)}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowApkModal(true)}
          title="Download Android APK file format"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-pointer ${className}`}
        >
          <FaAndroid className="w-3.5 h-3.5" />
          <span>Android APK</span>
        </button>

        <button
          onClick={handleInstallClick}
          title="Install IRIS on your device"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800 cursor-pointer"
        >
          <RiDownload2Line className="w-3.5 h-3.5 text-zinc-400" />
          <span>Install App</span>
        </button>
      </div>

      <AndroidApkDownloadModal
        isOpen={showApkModal}
        onClose={() => setShowApkModal(false)}
      />

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

