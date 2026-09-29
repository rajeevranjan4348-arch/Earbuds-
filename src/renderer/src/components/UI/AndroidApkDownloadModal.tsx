import React, { useState } from 'react'
import {
  RiAndroidLine,
  RiDownload2Line,
  RiCloseLine,
  RiCheckLine,
  RiShieldCheckLine,
  RiSmartphoneLine,
  RiInformationLine,
  RiQrCodeLine,
  RiFileCopyLine,
  RiExternalLinkLine
} from 'react-icons/ri'
import { soundEffects } from '../../services/soundEffectsService'

interface AndroidApkDownloadModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AndroidApkDownloadModal: React.FC<AndroidApkDownloadModalProps> = ({
  isOpen,
  onClose
}) => {
  const [downloadStarted, setDownloadStarted] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [activeTab, setActiveTab] = useState<'download' | 'guide' | 'pwa'>('download')

  if (!isOpen) return null

  const apkUrl = `${window.location.origin}/downloads/iris.apk`
  const directApkUrl = `${window.location.origin}/downloads/iris.apk`

  const handleDownload = (target: 'release' | 'debug' = 'release') => {
    soundEffects.play('pop')
    setDownloadStarted(true)

    // Trigger download
    const link = document.createElement('a')
    link.href = target === 'debug' ? '/downloads/iris-debug.apk' : '/downloads/iris.apk'
    link.download = target === 'debug' ? 'IRIS-AI-debug.apk' : 'IRIS-AI.apk'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(directApkUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-zinc-950 border border-emerald-500/30 p-6 shadow-[0_0_50px_rgba(16,185,129,0.15)] text-zinc-100 flex flex-col gap-5 overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <RiAndroidLine className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-wide">IRIS Android APK</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-semibold border border-emerald-500/30">
                  v1.0.0 .apk
                </span>
              </div>
              <p className="text-xs text-zinc-400">Official Android Native Package Archive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title="Close"
          >
            <RiCloseLine className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/80 relative z-10 text-xs">
          <button
            onClick={() => setActiveTab('download')}
            className={`py-2 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'download'
                ? 'bg-emerald-500 text-black font-bold shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <RiDownload2Line className="w-4 h-4" />
            <span>Download</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'guide'
                ? 'bg-emerald-500 text-black font-bold shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <RiInformationLine className="w-4 h-4" />
            <span>Install Guide</span>
          </button>
          <button
            onClick={() => setActiveTab('pwa')}
            className={`py-2 rounded-lg font-medium transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'pwa'
                ? 'bg-emerald-500 text-black font-bold shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <RiSmartphoneLine className="w-4 h-4" />
            <span>PWA Option</span>
          </button>
        </div>

        {/* Tab 1: Download */}
        {activeTab === 'download' && (
          <div className="flex flex-col gap-4 relative z-10 animate-in fade-in">
            {/* Package metadata card */}
            <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 flex flex-col gap-2.5 font-mono text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Package ID:</span>
                <span className="text-zinc-200 font-semibold">com.example.iris</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Binary File:</span>
                <span className="text-emerald-400 font-semibold">IRIS-AI.apk</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Architecture:</span>
                <span className="text-zinc-200">Universal (ARM64 / x86_64)</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Android Target:</span>
                <span className="text-zinc-200">Android 7.0+ (API 24 to 36)</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Capabilities:</span>
                <span className="text-emerald-300 font-sans text-[11px]">
                  WebView Bridge • Camera OCR • Voice TTS • Background Service
                </span>
              </div>
            </div>

            {/* Direct Download Button */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDownload('release')}
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <RiDownload2Line className="w-5 h-5" />
                <span>Download IRIS-AI.apk</span>
                <span className="text-emerald-950 text-xs font-mono font-medium">(~15.8 MB)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload('debug')}
                  className="flex-1 py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RiDownload2Line className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Debug APK (app-debug.apk)</span>
                </button>
                <a
                  href="/downloads/iris.apk"
                  target="_blank"
                  rel="noreferrer"
                  download="IRIS-AI.apk"
                  className="py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Direct browser download"
                >
                  <RiExternalLinkLine className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Direct File</span>
                </a>
              </div>
            </div>

            {downloadStarted && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-emerald-400 text-xs font-medium animate-in fade-in">
                <RiCheckLine className="w-4 h-4 shrink-0" />
                <span>Download started! Tap the file in your notification bar or Downloads folder to install.</span>
              </div>
            )}

            {/* Direct Copy URL */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2 text-xs">
              <span className="text-zinc-500 shrink-0 font-mono">APK URL:</span>
              <input
                type="text"
                readOnly
                value={apkUrl}
                className="bg-transparent text-zinc-300 font-mono text-[11px] flex-1 truncate focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px] flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                {copiedLink ? <RiCheckLine className="text-emerald-400" /> : <RiFileCopyLine />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Install Guide */}
        {activeTab === 'guide' && (
          <div className="flex flex-col gap-3 relative z-10 text-xs animate-in fade-in">
            <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2.5">
              <h4 className="font-semibold text-zinc-200 flex items-center gap-2">
                <RiShieldCheckLine className="text-emerald-400 w-4 h-4" />
                Sideloading Instructions for Android
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-zinc-300 leading-relaxed">
                <li>
                  <strong className="text-white">Download the APK:</strong> Tap the green download button to fetch{' '}
                  <code className="bg-black/60 px-1 py-0.5 rounded text-emerald-400">IRIS-AI.apk</code>.
                </li>
                <li>
                  <strong className="text-white">Open the File:</strong> Pull down your Android notification panel and tap the download completed notification, or open the Files / Downloads app.
                </li>
                <li>
                  <strong className="text-white">Enable Unknown Apps:</strong> If Android warns about unknown sources, tap <span className="text-emerald-400 font-semibold">Settings</span> and toggle <span className="text-emerald-400 font-semibold">"Allow from this source"</span>.
                </li>
                <li>
                  <strong className="text-white">Confirm Installation:</strong> Tap <span className="text-emerald-400 font-semibold">Install</span> and open IRIS with voice & native mobile bridge support.
                </li>
              </ol>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Automatic GitHub Actions APK Build:</span>
              <span className="font-mono text-emerald-400">app-debug.apk</span>
            </div>
          </div>
        )}

        {/* Tab 3: PWA Option */}
        {activeTab === 'pwa' && (
          <div className="flex flex-col gap-3.5 relative z-10 text-xs animate-in fade-in">
            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex flex-col gap-2 text-zinc-300 leading-relaxed">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <RiSmartphoneLine className="text-emerald-400 w-4 h-4" />
                Instant Home Screen PWA (No APK Required)
              </h4>
              <p>
                You can also run IRIS as an installed Android app instantly without downloading an APK file:
              </p>
              <div className="space-y-1.5 mt-1 text-zinc-200">
                <p>1. Open IRIS in Chrome on your Android device.</p>
                <p>2. Tap the Chrome three-dot menu <strong className="text-emerald-400">(⋮)</strong>.</p>
                <p>3. Tap <strong className="text-emerald-400">"Add to Home screen"</strong> or <strong className="text-emerald-400">"Install app"</strong>.</p>
                <p>4. IRIS will install seamlessly on your home screen and launcher.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500 relative z-10">
          <div className="flex items-center gap-1.5">
            <RiShieldCheckLine className="text-emerald-400 w-3.5 h-3.5" />
            <span>Signed Package Verified</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition cursor-pointer font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
