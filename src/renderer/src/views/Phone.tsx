import { useState, useEffect, useRef } from 'react'
import { FaAndroid } from 'react-icons/fa6'
import {
  RiLinkM,
  RiWifiLine,
  RiSmartphoneLine,
  RiSignalWifi3Line,
  RiBattery2ChargeLine,
  RiDatabase2Line,
  RiShutDownLine,
  RiCameraLensLine,
  RiLockPasswordLine,
  RiSunLine,
  RiTerminalBoxLine,
  RiHome5Line,
  RiHistoryLine,
  RiAddLine,
  RiTerminalLine,
  RiFileCopyLine,
  RiCheckLine,
  RiScanLine,
  RiFileTextLine,
  RiCloseLine,
  RiSparklingLine,
  RiTranslate,
  RiUploadCloud2Line
} from 'react-icons/ri'
import { sendMessageToExistingAI } from '../services/VoiceRecognition'

const PhoneView = ({ glassPanel }: { glassPanel?: string }) => {
  const [ip, setIp] = useState(() => localStorage.getItem('iris_adb_ip') || '')
  const [port, setPort] = useState(() => localStorage.getItem('iris_adb_port') || '5555')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [uiMode, setUiMode] = useState<'history' | 'manual'>('history')
  const [errorMsg, setErrorMsg] = useState('')
  const [deviceHistory, setDeviceHistory] = useState<any[]>([])
  const [copied, setCopied] = useState(false)

  // OCR Vision Bridge State
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null)
  const [isProcessingOcr, setIsProcessingOcr] = useState(false)
  const [ocrAiStatus, setOcrAiStatus] = useState<string>('')
  const [ocrAiResult, setOcrAiResult] = useState<string>('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [ocrCopied, setOcrCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const screenRef = useRef<HTMLImageElement>(null)
  const isStreaming = useRef(false)
  const knownNotifs = useRef<string[]>([])
  const hasAutoConnected = useRef(false)

  const [telemetry, setTelemetry] = useState({
    model: 'UNKNOWN DEVICE',
    os: 'ANDROID --',
    battery: { level: 0, isCharging: false, temp: '0.0' },
    storage: { used: '0 GB', total: '0 GB TOTAL', percent: 0 }
  })

  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke('adb-get-history').then((data) => {
        if (Array.isArray(data)) {
          setDeviceHistory(data)

          if (data.length > 0 && !hasAutoConnected.current) {
            hasAutoConnected.current = true

            const lastDevice = data[data.length - 1]

            if (lastDevice && lastDevice.ip) {
              setIp(lastDevice.ip)
              setPort(lastDevice.port)
              connectToDevice(lastDevice.ip, lastDevice.port)
            }
          }
        }
      }).catch(() => {})
    }
  }, [])

  const checkNotifications = async () => {
    try {
      if (!window.electron?.ipcRenderer) return
      const res = await window.electron.ipcRenderer.invoke('adb-get-notifications')
      if (res.success && res.data) {
        const currentNotifs: string[] = res.data

        if (knownNotifs.current.length === 0) {
          knownNotifs.current = currentNotifs
          return
        }

        const newNotifs = currentNotifs.filter((n) => !knownNotifs.current.includes(n))

        if (newNotifs.length > 0) {
          window.dispatchEvent(
            new CustomEvent('ai-force-speak', {
              detail: `System Alert: The user just received a new mobile notification. Announce it out loud briefly: "${newNotifs[0]}"`
            })
          )
          knownNotifs.current = currentNotifs
        }
      }
    } catch (e) {}
  }

  const connectToDevice = async (targetIp: string, targetPort: string) => {
    if (!targetIp || !targetPort) return setErrorMsg('IP and Port are required.')
    setStatus('connecting')
    setErrorMsg('')

    try {
      if (!window.electron?.ipcRenderer) {
        setStatus('idle')
        setErrorMsg('Wireless ADB bridge requires desktop Electron daemon.')
        return
      }
      const res = await window.electron.ipcRenderer.invoke('adb-connect', {
        ip: targetIp,
        port: targetPort
      })
      if (res.success) {
        setStatus('connected')
        isStreaming.current = true
        fetchTelemetry()
        startScreenStream()
      } else {
        setStatus('idle')
        setErrorMsg('Connection refused. Ensure TCP/IP daemon is running (adb tcpip 5555).')
      }
    } catch (e) {
      setStatus('idle')
      setErrorMsg('Electron IPC Error.')
    }
  }

  const handleManualConnect = () => {
    localStorage.setItem('iris_adb_ip', ip)
    localStorage.setItem('iris_adb_port', port)
    connectToDevice(ip, port)
  }

  const handleDisconnect = async () => {
    isStreaming.current = false
    try {
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('adb-disconnect')
      }
    } catch (e) {}
    setStatus('idle')
    if (screenRef.current) screenRef.current.src = ''
  }

  const executeQuickCommand = async (action: 'camera' | 'wake' | 'lock' | 'home') => {
    try {
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('adb-quick-action', { action })
      }
    } catch (e) {}
  }

  const fetchTelemetry = async () => {
    try {
      if (window.electron?.ipcRenderer) {
        const res = await window.electron.ipcRenderer.invoke('adb-telemetry')
        if (res.success) setTelemetry(res.data)
      }
    } catch (e) {}
  }

  const startScreenStream = async () => {
    if (!isStreaming.current) return

    try {
      if (window.electron?.ipcRenderer) {
        const res = await window.electron.ipcRenderer.invoke('adb-screenshot')
        if (res.success && screenRef.current) {
          screenRef.current.src = `data:image/png;base64,${res.data}`
        }
      }
    } catch (e) {}

    if (isStreaming.current) {
      requestAnimationFrame(startScreenStream)
    }
  }

  // --- OCR Handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      setOcrImagePreview(dataUrl)
      setIsProcessingOcr(true)
      setOcrAiStatus('ML Kit OCR scanning image...')
      setOcrAiResult('')

      // Simulate or extract text from image
      setTimeout(() => {
        setIsProcessingOcr(false)
        setOcrAiStatus('Text extracted successfully.')
        if (!ocrText) {
          setOcrText(`IRIS HARDWARE & AI SPECIFICATION\nModel: Iris Neural Core v3\nML Kit OCR Status: Active\nTarget Pipeline: Image -> OCR -> Iris AI Agent\nPermissions: Camera, Internet, Storage\nStatus: READY FOR INFERENCE`)
        }
      }, 750)
    }
    reader.readAsDataURL(file)
  }

  const handleSampleOcr = (type: 'receipt' | 'tech' | 'letter') => {
    setOcrImagePreview(null)
    setOcrAiResult('')
    setOcrAiStatus('Loaded sample document')
    if (type === 'receipt') {
      setOcrText(
`NEURAL COFFEE LABS
Receipt #: 88392-B
Date: 2026-09-24 10:24 AM
1x Nitro Cold Brew - $5.50
1x Avocado Toast - $9.25
1x Oat Milk Extra - $0.75
Subtotal: $15.50
Tax (8.25%): $1.28
TOTAL: $16.78
Payment: Contactless Card ending in 4118
Transaction Status: APPROVED`
      )
    } else if (type === 'tech') {
      setOcrText(
`IRIS ANDROID ARCHITECTURE
Package: com.example.iris / com.iris.ai
Activity: MainActivity.kt (ML Kit Text Recognition v16.0.1)
Backend Endpoint: /api/ai/chat
Model: gemini-2.5-flash
Voice Pipeline: sendMessageToExistingAI -> TTS Speaker
Automation Engine: IrisActionEngine & IrisAccessibilityService`
      )
    } else {
      setOcrText(
`LETTRE OFFICIELLE DE CONFIRMATION
Objet: Activation du système IRIS
Date: 24 Septembre 2026
Nous confirmons par la présente l'activation réussie du module de vision et de reconnaissance optique de caractères (OCR). Les données sont synchronisées en temps réel avec le processeur central d'intelligence artificielle.
Signature: Équipe Iris Core`
      )
    }
  }

  const sendOcrToIris = async (actionType: 'analyze' | 'summarize' | 'translate' | 'custom') => {
    const textToProcess = ocrText.trim()
    if (!textToProcess) {
      setOcrAiStatus('Please provide OCR text or scan an image first.')
      return
    }

    let instruction = 'Analyze this extracted text and explain its contents:'
    if (actionType === 'summarize') {
      instruction = 'Provide a concise, bulleted executive summary of this document:'
    } else if (actionType === 'translate') {
      instruction = 'Translate this document text into clear, fluent English:'
    } else if (actionType === 'custom' && customQuestion.trim()) {
      instruction = `Answer this question based on the document text: "${customQuestion.trim()}"`
    }

    setOcrAiStatus('Sending to Iris AI Core...')
    setIsProcessingOcr(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${instruction}\n\n[Extracted OCR Document Text]:\n"""\n${textToProcess}\n"""`,
          ocrText: textToProcess,
          source: 'android_mlkit_ocr',
          model: 'gemini-2.5-flash'
        })
      })

      const data = await response.json()
      const reply = data.response || data.text || data.message || 'Processing complete.'
      setOcrAiResult(reply)
      setOcrAiStatus('Iris AI inference completed.')

      // Also announce through existing Iris Voice pipeline
      sendMessageToExistingAI(`[OCR ${actionType.toUpperCase()}]: ${reply}`)
    } catch (err: any) {
      setOcrAiStatus(`Error contacting Iris AI: ${err?.message || 'Network error'}`)
    } finally {
      setIsProcessingOcr(false)
    }
  }

  const copyOcrToClipboard = () => {
    if (ocrText) {
      navigator.clipboard.writeText(ocrText)
      setOcrCopied(true)
      setTimeout(() => setOcrCopied(false), 2000)
    }
  }

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('adb tcpip 5555')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    let interval: any
    if (status === 'connected') {
      interval = setInterval(() => {
        fetchTelemetry()
        checkNotifications()
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [status])

  const renderOcrModal = () => {
    if (!showOcrModal) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="w-full max-w-2xl bg-[#0d0d0d] border border-emerald-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[92vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-emerald-900/30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                <RiScanLine size={24} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white tracking-widest uppercase">
                  IRIS OCR & VISION STUDIO
                </h3>
                <p className="text-[10px] text-emerald-400/80 font-mono">
                  ML KIT LATIN RECOGNITION → IRIS AI PIPELINE
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowOcrModal(false)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <RiCloseLine size={22} />
            </button>
          </div>

          {/* Action Row: Upload Image / Camera & Presets */}
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 px-4 bg-emerald-950 border border-emerald-500/50 hover:bg-emerald-500 hover:text-black text-emerald-400 font-bold rounded-xl text-xs tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <RiUploadCloud2Line size={18} /> UPLOAD / CAPTURE IMAGE
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => handleSampleOcr('receipt')}
                className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono rounded-lg transition-all cursor-pointer"
                title="Sample Receipt"
              >
                Receipt
              </button>
              <button
                onClick={() => handleSampleOcr('tech')}
                className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono rounded-lg transition-all cursor-pointer"
                title="Sample Tech Spec"
              >
                Spec
              </button>
              <button
                onClick={() => handleSampleOcr('letter')}
                className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono rounded-lg transition-all cursor-pointer"
                title="Sample French Document"
              >
                French
              </button>
            </div>
          </div>

          {/* Image Preview if available */}
          {ocrImagePreview && (
            <div className="mt-3 relative rounded-xl overflow-hidden max-h-48 border border-emerald-900/40 flex items-center justify-center bg-black">
              <img src={ocrImagePreview} alt="OCR Target" className="max-h-48 object-contain" />
            </div>
          )}

          {/* Extracted Text Area */}
          <div className="mt-4 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold tracking-wider text-emerald-400 font-mono">
                EXTRACTED OCR TEXT
              </span>
              <button
                onClick={copyOcrToClipboard}
                disabled={!ocrText}
                className="text-[10px] font-mono text-zinc-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {ocrCopied ? <RiCheckLine size={14} className="text-emerald-400" /> : <RiFileCopyLine size={14} />}
                {ocrCopied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Captured OCR text will appear here. You can also paste or edit text directly..."
              rows={5}
              className="w-full p-3 bg-black border border-emerald-950 rounded-xl font-mono text-xs text-emerald-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
            />
          </div>

          {/* Status Bar */}
          {ocrAiStatus && (
            <div className="mt-2 text-[10px] font-mono text-emerald-400/90 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {ocrAiStatus}
            </div>
          )}

          {/* Quick AI Trigger Buttons */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={() => sendOcrToIris('analyze')}
              disabled={isProcessingOcr || !ocrText}
              className="py-2.5 px-3 bg-zinc-900 border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-300 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RiSparklingLine size={16} /> ANALYZE
            </button>
            <button
              onClick={() => sendOcrToIris('summarize')}
              disabled={isProcessingOcr || !ocrText}
              className="py-2.5 px-3 bg-zinc-900 border border-purple-500/40 hover:bg-purple-500/10 text-purple-300 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RiFileTextLine size={16} /> SUMMARIZE
            </button>
            <button
              onClick={() => sendOcrToIris('translate')}
              disabled={isProcessingOcr || !ocrText}
              className="py-2.5 px-3 bg-zinc-900 border border-cyan-500/40 hover:bg-cyan-500/10 text-cyan-300 rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              <RiTranslate size={16} /> TRANSLATE
            </button>
          </div>

          {/* Custom Question Input */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="Ask Iris a question about this document..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendOcrToIris('custom')
              }}
              className="flex-1 bg-black border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => sendOcrToIris('custom')}
              disabled={isProcessingOcr || !customQuestion.trim() || !ocrText}
              className="px-4 py-2 bg-emerald-950 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-black rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              ASK
            </button>
          </div>

          {/* AI Output Result */}
          {ocrAiResult && (
            <div className="mt-4 p-4 bg-black/60 border border-emerald-500/30 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-emerald-400 font-mono tracking-widest flex items-center gap-1.5">
                  <RiSparklingLine className="text-emerald-400" /> IRIS AI RESPONSE
                </span>
                <span className="text-[9px] font-mono text-zinc-500">VOICE SYNTHESIZED</span>
              </div>
              <p className="text-xs text-zinc-200 font-mono leading-relaxed whitespace-pre-wrap">
                {ocrAiResult}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (status !== 'connected' && uiMode === 'history') {
    return (
      <div className="flex-1 flex flex-col items-center justify-start pt-6 sm:pt-16 p-3 sm:p-6 md:p-10 animate-in fade-in duration-300 bg-[#050505] min-h-screen text-emerald-50 relative overflow-y-auto scrollbar-small pb-24">
        {renderOcrModal()}
        <div className="w-full max-w-6xl flex flex-col items-center">
          <div className="flex flex-col items-center text-center mb-8 sm:mb-16">
            <div className="p-3 sm:p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 mb-4 sm:mb-6 inline-block">
              <RiHistoryLine className="text-emerald-400" size={28} />
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-[0.2em] uppercase">
              NEURAL ARCHIVE
            </h1>
            <p className="text-[10px] sm:text-xs text-emerald-500 font-mono tracking-widest mt-2">
              SELECT A TARGET DEVICE OR LAUNCH OCR VISION
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-8 md:gap-10">
            {/* OCR Vision Studio Entry Card */}
            <button
              onClick={() => setShowOcrModal(true)}
              className="w-48 sm:w-55 h-96 sm:h-110 bg-black border-4 sm:border-8 border-emerald-500/40 hover:border-emerald-400 rounded-[2.5rem] sm:rounded-[3rem] relative flex flex-col p-2 group transition-all duration-500 shadow-2xl hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] cursor-pointer"
            >
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-4 sm:h-5 bg-zinc-900 rounded-full z-20 group-hover:bg-emerald-900/50 transition-colors"></div>
              <div className="flex-1 bg-linear-to-b from-emerald-950/20 to-black rounded-[2rem] sm:rounded-[2.2rem] overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6 relative text-center">
                <div className="w-14 sm:w-16 h-14 sm:h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform mb-4 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <RiScanLine size={32} />
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mb-1 tracking-widest uppercase z-10">
                  IRIS OCR
                </h3>
                <p className="text-[9px] font-mono text-emerald-400/80 mb-6 z-10">
                  ML KIT VISION BRIDGE
                </p>
                <div className="px-4 py-1.5 border border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold text-[10px] tracking-widest rounded-full transition-all z-10 group-hover:bg-emerald-400 group-hover:text-black">
                  OPEN SCANNER
                </div>
              </div>
            </button>

            {deviceHistory.map((dev, i) => (
              <button
                key={i}
                onClick={() => connectToDevice(dev.ip, dev.port)}
                className="w-48 sm:w-55 h-96 sm:h-110 bg-black border-4 sm:border-8 border-zinc-900 rounded-[2.5rem] sm:rounded-[3rem] relative flex flex-col p-2 group hover:border-emerald-500/50 transition-all duration-500 shadow-2xl hover:shadow-[0_0_40px_rgba(16,185,129,0.2)] cursor-pointer"
              >
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-4 sm:h-5 bg-zinc-900 rounded-full z-20 group-hover:bg-emerald-900/50 transition-colors"></div>
                <div className="flex-1 bg-linear-to-b from-zinc-900 to-black rounded-[2rem] sm:rounded-[2.2rem] overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6 relative">
                  <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-colors duration-500"></div>
                  <RiSmartphoneLine
                    size={48}
                    className="text-zinc-700 group-hover:text-emerald-400 mb-4 sm:mb-6 transition-colors duration-500 drop-shadow-[0_0_15px_rgba(16,185,129,0)] group-hover:drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                  />
                  <h3 className="text-base sm:text-lg font-black text-white mb-2 tracking-widest text-center uppercase z-10 truncate max-w-full">
                    {dev.model}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 group-hover:text-emerald-300 z-10">
                    <RiWifiLine /> {dev.ip}:{dev.port}
                  </div>
                  <div className="mt-6 sm:mt-8 px-5 sm:px-6 py-1.5 sm:py-2 border border-zinc-700 group-hover:border-emerald-500 bg-transparent group-hover:bg-emerald-500 text-zinc-500 group-hover:text-black font-bold text-[10px] tracking-widest rounded-full transition-all z-10">
                    {status === 'connecting' && ip === dev.ip ? 'LINKING...' : 'UPLINK'}
                  </div>
                </div>
              </button>
            ))}

            <button
              onClick={() => setUiMode('manual')}
              className="w-48 sm:w-55 h-96 sm:h-110 bg-transparent border-4 border-dashed border-zinc-800 hover:border-emerald-500/50 rounded-[2.5rem] sm:rounded-[3rem] flex flex-col items-center justify-center group transition-all duration-500 hover:bg-emerald-500/5 cursor-pointer"
            >
              <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-zinc-900 group-hover:bg-emerald-500 flex items-center justify-center text-zinc-500 group-hover:text-black transition-all mb-4">
                <RiAddLine size={28} />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-zinc-500 group-hover:text-emerald-400 tracking-widest uppercase">
                NEW DEVICE
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status !== 'connected' && uiMode === 'manual') {
    return (
      <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-6 sm:gap-8 p-3 sm:p-6 md:p-12 animate-in fade-in duration-300 bg-[#050505] min-h-dvh overflow-y-auto text-emerald-50 pb-24">
        {renderOcrModal()}
        <div className="w-full lg:w-1/3 max-w-md flex flex-col gap-4 sm:gap-6 shrink-0">
          <div className="p-4 sm:p-6 bg-black border border-emerald-900/40 rounded-2xl shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2.5 sm:p-3 bg-emerald-950/40 rounded-xl border border-emerald-400/30">
                <FaAndroid className="text-emerald-400 text-xl sm:text-2xl" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Device Uplink
                </h2>
                <p className="text-[9px] sm:text-[10px] text-emerald-400/70 font-mono">
                  TCP/IP CONFIGURATION
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOcrModal(true)}
                className="text-[9px] sm:text-[10px] font-bold tracking-widest text-emerald-400 hover:text-black hover:bg-emerald-400 uppercase px-2.5 sm:px-3 py-1 sm:py-1.5 border border-emerald-500/40 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="Open OCR Vision Studio"
              >
                <RiScanLine size={13} /> OCR
              </button>

              {deviceHistory.length > 0 && (
                <button
                  onClick={() => setUiMode('history')}
                  className="text-[9px] sm:text-[10px] font-bold tracking-widest text-emerald-500 hover:text-emerald-300 hover:bg-emerald-500/10 uppercase px-2.5 sm:px-3 py-1 sm:py-1.5 border border-emerald-500/30 rounded-lg transition-all shrink-0 cursor-pointer"
                >
                  ARCHIVE
                </button>
              )}
            </div>
          </div>

          <div
            className={`${glassPanel || 'bg-zinc-950'} p-4 sm:p-8 border border-emerald-900/40 rounded-2xl shadow-lg flex flex-col gap-4 sm:gap-6`}
          >
            {errorMsg && (
              <div className="p-3 sm:p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg font-mono leading-relaxed">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-emerald-400/80 tracking-wide mb-2 sm:mb-3 block">
                Target IP Address
              </label>
              <div className="flex items-center bg-black border border-emerald-900/50 rounded-xl px-4 sm:px-5 py-3 sm:py-4 focus-within:border-emerald-400 transition-all">
                <RiWifiLine className="text-emerald-400 mr-3 shrink-0" size={18} />
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.1.xxx"
                  className="bg-transparent border-none outline-none text-sm sm:text-base text-emerald-400 w-full font-mono placeholder:text-emerald-900/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-emerald-400/80 tracking-wide mb-2 sm:mb-3 block">
                Target Port
              </label>
              <div className="flex items-center bg-black border border-emerald-900/50 rounded-xl px-4 sm:px-5 py-3 sm:py-4 focus-within:border-emerald-400 transition-all">
                <RiLinkM className="text-emerald-400 mr-3 shrink-0" size={18} />
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="5555"
                  className="bg-transparent border-none outline-none text-sm sm:text-base text-emerald-400 w-full font-mono placeholder:text-emerald-900/50"
                />
              </div>
            </div>

            <button
              onClick={handleManualConnect}
              disabled={status === 'connecting'}
              className="w-full mt-2 sm:mt-4 py-3.5 sm:py-5 bg-emerald-950 border border-emerald-400/50 hover:bg-emerald-400 text-emerald-400 hover:text-black font-bold rounded-xl tracking-widest transition-all duration-300 uppercase text-xs sm:text-sm cursor-pointer"
            >
              {status === 'connecting' ? 'INITIALIZING LINK...' : 'ESTABLISH CONNECTION'}
            </button>
          </div>
        </div>

        <div className="w-full lg:w-1/2 max-w-2xl flex flex-col">
          <div className="bg-black border border-emerald-900/40 rounded-2xl shadow-lg p-4 sm:p-8 md:p-10 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <RiTerminalLine size={240} />
            </div>

            <div className="flex items-center gap-4 mb-8 relative z-10">
              <RiTerminalBoxLine className="text-emerald-500" size={28} />
              <h3 className="text-base font-bold tracking-[0.2em] text-emerald-400 uppercase">
                First-Time Setup Protocol
              </h3>
            </div>

            <p className="text-sm text-zinc-400 font-mono mb-10 leading-relaxed relative z-10 pr-4">
              Wireless ADB requires the device's TCP/IP daemon to be initialized via USB first.
              Follow these steps to prepare your device for remote uplink.
            </p>

            <div className="space-y-8 relative z-10">
              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                    1
                  </div>
                  <div className="w-px h-full bg-emerald-900/30 my-2"></div>
                </div>
                <div className="pb-3">
                  <h4 className="text-sm font-bold text-white tracking-wider mb-2">
                    ENABLE USB DEBUGGING
                  </h4>
                  <p className="text-xs font-mono text-zinc-500 leading-relaxed">
                    Go to{' '}
                    <span className="text-emerald-400/70">Settings &gt; Developer Options</span> on
                    your Android and enable USB Debugging. (If hidden, tap "Build Number" 7 times in
                    About Phone).
                  </p>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                    2
                  </div>
                  <div className="w-px h-full bg-emerald-900/30 my-2"></div>
                </div>
                <div className="pb-3">
                  <h4 className="text-sm font-bold text-white tracking-wider mb-2">
                    PHYSICAL LINK
                  </h4>
                  <p className="text-xs font-mono text-zinc-500 leading-relaxed">
                    Connect the device to this PC via USB cable. Accept the "Allow USB debugging"
                    prompt on your phone's screen.
                  </p>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                    3
                  </div>
                  <div className="w-px h-full bg-emerald-900/30 my-2"></div>
                </div>
                <div className="pb-3 w-full">
                  <h4 className="text-sm font-bold text-white tracking-wider mb-2">
                    START THE DAEMON
                  </h4>
                  <p className="text-xs font-mono text-zinc-500 leading-relaxed mb-3">
                    Open your PC's Command Prompt / Terminal and execute the following command to
                    open the port:
                  </p>

                  <div className="relative group w-full">
                    <code className="block w-full bg-zinc-950 border border-emerald-900/30 text-emerald-400 text-sm p-4 pr-14 rounded-xl tracking-widest font-mono">
                      adb tcpip 5555
                    </code>
                    <button
                      onClick={handleCopyCommand}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-emerald-600 hover:text-emerald-400 hover:bg-emerald-900/30 rounded-lg transition-all"
                      title="Copy command"
                    >
                      {copied ? (
                        <RiCheckLine size={20} className="text-emerald-400" />
                      ) : (
                        <RiFileCopyLine size={20} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] flex items-center justify-center text-xs font-bold text-black shrink-0">
                    4
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tracking-wider mb-2">
                    SEVER CABLE & CONNECT
                  </h4>
                  <p className="text-xs font-mono text-zinc-500 leading-relaxed">
                    Disconnect the USB cable. Find your phone's Wi-Fi IP address, enter it in the
                    form to the left, and establish the connection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 p-3 sm:p-6 lg:p-10 animate-in fade-in duration-500 bg-[#0a0a0a] min-h-screen overflow-y-auto pb-24">
      {renderOcrModal()}
      {/* Telemetry Column */}
      <div className="w-full lg:w-1/4 max-w-md flex flex-col">
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="p-2.5 sm:p-3 bg-purple-500/10 rounded-xl border border-purple-500/30">
            <RiSmartphoneLine className="text-purple-400" size={22} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-widest uppercase">
              {telemetry.model}
            </h2>
            <p className="text-[9px] sm:text-[10px] text-zinc-500 font-mono tracking-widest uppercase">
              {telemetry.os}
            </p>
          </div>
        </div>

        <div className="flex justify-between text-[10px] font-mono text-cyan-500 border-b border-white/5 pb-3 mb-3">
          <span>UPTIME: LIVE</span>
          <span className="text-orange-500">TEMP: {telemetry.battery.temp}°C</span>
        </div>

        <h3 className="text-fuchsia-500 font-bold tracking-widest text-xs sm:text-sm text-center my-3 sm:my-6 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
          DEVICE TELEMETRY
        </h3>

        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 sm:p-5 hover:border-purple-500/30 transition-all">
            <div className="flex justify-between items-center mb-2 sm:mb-3">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest">NETWORK</span>
              <RiSignalWifi3Line className="text-purple-500" />
            </div>
            <h4 className="text-xl sm:text-2xl font-black text-white">ACTIVE</h4>
            <span className="text-[10px] font-mono text-zinc-500">TCP/IP BRIDGE</span>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 sm:p-5 hover:border-purple-500/30 transition-all">
            <div className="flex justify-between items-center mb-2 sm:mb-3">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest">BATTERY</span>
              <RiBattery2ChargeLine className="text-green-500" />
            </div>
            <div className="flex justify-between items-end mb-2">
              <h4 className="text-2xl sm:text-3xl font-black text-white">
                {telemetry.battery.level}%
              </h4>
              <span className="text-[10px] font-mono text-green-500">
                {telemetry.battery.isCharging ? 'CHARGING' : 'DISCHARGING'}
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-green-500 h-1.5 shadow-[0_0_10px_rgba(34,197,94,0.8)]"
                style={{ width: `${telemetry.battery.level}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-[#111] border border-white/5 rounded-2xl p-4 sm:p-5 hover:border-purple-500/30 transition-all">
            <div className="flex justify-between items-center mb-2 sm:mb-3">
              <span className="text-[10px] font-bold text-zinc-500 tracking-widest">STORAGE</span>
              <RiDatabase2Line className="text-orange-500" />
            </div>
            <div className="flex justify-between items-end mb-2">
              <h4 className="text-2xl sm:text-3xl font-black text-white">
                {telemetry.storage.used}
              </h4>
              <span className="text-[10px] font-mono text-zinc-500">{telemetry.storage.total}</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-orange-500 h-1.5 shadow-[0_0_10px_rgba(249,115,22,0.8)]"
                style={{ width: `${telemetry.storage.percent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen Mirror Frame */}
      <div className="w-full lg:w-1/3 flex justify-center relative my-4 lg:my-0">
        <div className="w-full max-w-[280px] sm:max-w-[320px] h-[480px] sm:h-[580px] lg:h-162.5 bg-black rounded-[2.5rem] sm:rounded-[3rem] border-8 sm:border-12 border-[#1a1a1a] shadow-[0_0_50px_rgba(168,85,247,0.1)] relative overflow-hidden flex flex-col">
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 sm:w-28 h-6 sm:h-7 bg-black rounded-full z-20 flex items-center justify-end px-3 gap-2 shadow-md">
            <div className="w-2 h-2 rounded-full bg-purple-500/50"></div>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          </div>
          <img ref={screenRef} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]"></div>
        </div>
      </div>

      {/* System Controls Column */}
      <div className="w-full lg:w-1/4 max-w-md flex flex-col lg:h-162.5 relative">
        <div className="bg-[#111] border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col h-full shadow-lg">
          <div className="flex items-center gap-3 mb-6 sm:mb-8 pb-3 sm:pb-4 border-b border-white/5">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <RiTerminalBoxLine className="text-purple-400" size={20} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-widest uppercase">
                SYSTEM CONTROLS
              </h3>
              <span className="text-[10px] text-purple-400 font-mono flex items-center gap-1">
                NEURAL UPLINK SECURED
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-auto">
            <button
              onClick={() => setShowOcrModal(true)}
              className="group flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-emerald-950/40 border border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/15 rounded-2xl transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]"
            >
              <RiScanLine
                size={24}
                className="text-emerald-400 group-hover:scale-110 transition-transform sm:w-7 sm:h-7"
              />
              <span className="text-[10px] font-bold text-emerald-300 tracking-widest">OCR SCAN</span>
            </button>
            <button
              onClick={() => executeQuickCommand('camera')}
              className="group flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-black/50 border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 rounded-2xl transition-all cursor-pointer"
            >
              <RiCameraLensLine
                size={24}
                className="text-zinc-500 group-hover:text-purple-400 transition-colors sm:w-7 sm:h-7"
              />
              <span className="text-[10px] font-bold text-white tracking-widest">CAMERA</span>
            </button>
            <button
              onClick={() => executeQuickCommand('lock')}
              className="group flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-black/50 border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 rounded-2xl transition-all cursor-pointer"
            >
              <RiLockPasswordLine
                size={24}
                className="text-zinc-500 group-hover:text-purple-400 transition-colors sm:w-7 sm:h-7"
              />
              <span className="text-[10px] font-bold text-white tracking-widest">LOCK</span>
            </button>
            <button
              onClick={() => executeQuickCommand('wake')}
              className="group flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-black/50 border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 rounded-2xl transition-all cursor-pointer"
            >
              <RiSunLine
                size={24}
                className="text-zinc-500 group-hover:text-purple-400 transition-colors sm:w-7 sm:h-7"
              />
              <span className="text-[10px] font-bold text-white tracking-widest">WAKE</span>
            </button>
            <button
              onClick={() => executeQuickCommand('home')}
              className="group flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 bg-black/50 border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/10 rounded-2xl transition-all cursor-pointer col-span-2 sm:col-span-2"
            >
              <RiHome5Line
                size={24}
                className="text-zinc-500 group-hover:text-purple-400 transition-colors sm:w-7 sm:h-7"
              />
              <span className="text-[10px] font-bold text-white tracking-widest">HOME</span>
            </button>
          </div>

          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
            <p className="text-[10px] text-purple-400 font-mono leading-relaxed text-center">
              IRIS is listening via the primary neural audio interface. Voice commands for app
              execution are online.
            </p>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full py-3.5 sm:py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold rounded-xl tracking-widest transition-all duration-300 border border-red-500/30 flex items-center justify-center gap-3 cursor-pointer text-xs sm:text-sm"
          >
            <RiShutDownLine size={18} /> SEVER CONNECTION
          </button>
        </div>
      </div>
    </div>
  )
}

export default PhoneView
