import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiCamera3Line,
  RiCameraSwitchLine,
  RiVideoLine,
  RiStopCircleLine,
  RiRecordCircleLine,
  RiCloseLine,
  RiFlashlightLine,
  RiDownloadLine,
  RiShareForwardLine,
  RiFileTextLine,
  RiMagicLine,
  RiCheckLine,
  RiRefreshLine,
  RiEyeLine,
  RiGridLine
} from 'react-icons/ri'
import { ocrService, OcrScanResponse } from '../../services/ocrService'
import { soundEffects } from '../../services/soundEffectsService'

interface CameraPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  onShareToChat?: (file: { name: string; url: string; type: string; textSnippet?: string }) => void
}

export const CameraPreviewModal: React.FC<CameraPreviewModalProps> = ({
  isOpen,
  onClose,
  onShareToChat
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt')
  const [isLoadingCamera, setIsLoadingCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Capture States
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // OCR & Gemini Vision Analysis States
  const [ocrResult, setOcrResult] = useState<OcrScanResponse | null>(null)
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [visionAnalysis, setVisionAnalysis] = useState<string | null>(null)
  const [isAnalyzingVision, setIsAnalyzingVision] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'ocr' | 'analysis'>('preview')
  const [showGrid, setShowGrid] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((prev) => (prev === msg ? null : prev)), 3500)
  }

  // Enumerate cameras
  const fetchCameraDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = allDevices.filter((d) => d.kind === 'videoinput')
        setDevices(videoInputs)
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId)
        }
      }
    } catch (err) {
      console.warn('[CameraPreview] Error enumerating video devices:', err)
    }
  }, [selectedDeviceId])

  // Start Camera Stream
  const startCamera = useCallback(async (deviceId?: string) => {
    setIsLoadingCamera(true)
    setCameraError(null)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      setPermissionStatus('granted')

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      await fetchCameraDevices()
    } catch (err: any) {
      console.error('[CameraPreview] Camera access error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied')
        setCameraError('Camera access permission was denied. Please allow camera access in browser settings.')
      } else {
        setCameraError(err.message || 'Failed to initialize camera video stream.')
      }
    } finally {
      setIsLoadingCamera(false)
    }
  }, [fetchCameraDevices])

  // Stop Camera Stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    setIsRecording(false)
    setRecordingTime(0)
  }, [])

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera(selectedDeviceId)
    } else {
      stopCamera()
      setCapturedPhoto(null)
      setCapturedVideoUrl(null)
      setOcrResult(null)
      setVisionAnalysis(null)
      setActiveTab('preview')
    }
    return () => {
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera, selectedDeviceId])

  // Take Snapshot Photo
  const capturePhoto = () => {
    if (!videoRef.current) return
    soundEffects.play('pop')

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      setCapturedPhoto(dataUrl)
      setCapturedVideoUrl(null)
      showNotification('Photo captured! Choose OCR Scan or AI Analysis.')
    }
  }

  // Start Video Clip Recording
  const startRecording = () => {
    if (!streamRef.current) return
    recordedChunksRef.current = []

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4'

      const recorder = new MediaRecorder(streamRef.current, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType })
        const videoUrl = URL.createObjectURL(blob)
        setCapturedVideoUrl(videoUrl)
        setCapturedPhoto(null)
        showNotification('Video clip recorded successfully!')
      }

      recorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      soundEffects.play('activate')

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (err: any) {
      console.error('[CameraPreview] Recording error:', err)
      showNotification('Failed to start recording: ' + err.message)
    }
  }

  // Stop Video Clip Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
      soundEffects.play('toggle')
    }
  }

  // Run OCR Scan on Captured Photo
  const runOcrScan = async () => {
    const targetImage = capturedPhoto
    if (!targetImage) {
      showNotification('Capture a photo first before running OCR.')
      return
    }

    setIsScanningOcr(true)
    setActiveTab('ocr')
    soundEffects.play('activate')

    try {
      const result = await ocrService.scan(targetImage, {
        language: 'en',
        enableTable: true,
        enableStructure: true
      })
      setOcrResult(result)
      if (result.success && result.fullText) {
        showNotification('OCR Scan complete: Text extracted.')
      } else {
        showNotification(result.error || 'OCR completed. No readable text found.')
      }
    } catch (err: any) {
      console.error('[CameraPreview] OCR Scan error:', err)
      showNotification('OCR Scan failed: ' + err.message)
    } finally {
      setIsScanningOcr(false)
    }
  }

  // Run Gemini Vision AI Analysis
  const runVisionAnalysis = async () => {
    const targetImage = capturedPhoto
    if (!targetImage) {
      showNotification('Capture a photo first to analyze with Gemini Vision.')
      return
    }

    setIsAnalyzingVision(true)
    setActiveTab('analysis')
    soundEffects.play('activate')

    try {
      const prompt =
        'Examine this camera snapshot in high detail. Describe the scene or document, transcribe all text or numbers accurately, identify objects, and provide key insights.'

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          attachments: [
            {
              name: 'camera_capture.jpg',
              url: targetImage,
              type: 'image'
            }
          ]
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini Vision analysis returned status ${response.status}`)
      }

      const data = await response.json()
      const text = data.text || data.response || data.content || 'Analysis complete.'
      setVisionAnalysis(text)
      showNotification('Gemini Vision analysis complete!')
    } catch (err: any) {
      console.error('[CameraPreview] Gemini Vision error:', err)
      setVisionAnalysis(`Error during AI Vision analysis: ${err.message}`)
      showNotification('AI Vision analysis failed.')
    } finally {
      setIsAnalyzingVision(false)
    }
  }

  // Share to Chat
  const handleShareToChat = () => {
    const mediaUrl = capturedPhoto || capturedVideoUrl
    if (!mediaUrl) return

    const isVid = Boolean(capturedVideoUrl)
    const filePayload = {
      name: isVid ? `camera_video_${Date.now()}.webm` : `camera_photo_${Date.now()}.jpg`,
      url: mediaUrl,
      type: isVid ? 'video' : 'image',
      textSnippet: ocrResult?.fullText || visionAnalysis || undefined
    }

    if (onShareToChat) {
      onShareToChat(filePayload)
    } else {
      window.dispatchEvent(
        new CustomEvent('iris:share-to-chat', {
          detail: {
            files: [filePayload]
          }
        })
      )
    }

    showNotification('Shared camera capture to Chat!')
    onClose()
  }

  // Save to Gallery
  const handleSaveToGallery = async () => {
    const mediaUrl = capturedPhoto || capturedVideoUrl
    if (!mediaUrl) return

    const isVid = Boolean(capturedVideoUrl)
    const filename = isVid ? `camera_rec_${Date.now()}.webm` : `camera_snap_${Date.now()}.jpg`

    try {
      if ((window as any).electron?.ipcRenderer) {
        await (window as any).electron.ipcRenderer.invoke('save-gallery-image', {
          filename,
          displayName: filename,
          url: mediaUrl,
          type: isVid ? 'video' : 'image',
          mimeType: isVid ? 'video/webm' : 'image/jpeg',
          size: 1024 * 100,
          contentSnippet: ocrResult?.fullText || visionAnalysis || '',
          path: `/gallery/${filename}`
        })
        showNotification('Saved capture to Media Vault!')
      } else {
        const a = document.createElement('a')
        a.href = mediaUrl
        a.download = filename
        a.click()
        showNotification('Downloaded media capture!')
      }
    } catch (e: any) {
      showNotification('Error saving: ' + e.message)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-6 select-none animate-in fade-in duration-300">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl bg-zinc-950 border border-emerald-500/40 rounded-3xl shadow-[0_0_50px_rgba(0,255,65,0.15)] flex flex-col overflow-hidden max-h-[92vh]"
        >
          {/* Toast Notification Banner */}
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-emerald-500/60 text-emerald-300 px-4 py-2 rounded-2xl shadow-xl text-xs font-mono flex items-center gap-2 backdrop-blur-md">
              <RiCheckLine className="text-emerald-400" size={14} />
              <span>{toast}</span>
            </div>
          )}

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <RiCamera3Line size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wider uppercase flex items-center gap-2">
                  Optical Perception & OCR Scanner
                  {isRecording && (
                    <span className="flex items-center gap-1.5 text-[10px] text-red-400 font-mono px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/30">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      REC {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono">
                  Hardware Camera Preview • Snapshot • Video Clip • PaddleOCR • Gemini Vision
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Device Selector */}
              {devices.length > 1 && (
                <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-xl border border-white/10 text-xs text-zinc-300 font-mono">
                  <RiCameraSwitchLine size={14} className="text-emerald-400" />
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value)
                      startCamera(e.target.value)
                    }}
                    className="bg-transparent text-xs text-zinc-200 outline-none cursor-pointer max-w-[140px] truncate"
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId} className="bg-zinc-900 text-white">
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Grid Toggle */}
              <button
                onClick={() => setShowGrid((prev) => !prev)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  showGrid
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                }`}
                title="Toggle HUD Alignment Grid"
              >
                <RiGridLine size={16} />
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 border border-white/10 transition-colors cursor-pointer"
              >
                <RiCloseLine size={18} />
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 px-5 py-2 border-b border-white/5 bg-black/40 text-xs font-mono">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                  : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <RiEyeLine size={14} />
              <span>Camera Stream</span>
            </button>

            <button
              onClick={() => {
                if (capturedPhoto) setActiveTab('ocr')
                else showNotification('Capture photo first.')
              }}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'ocr'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                  : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <RiFileTextLine size={14} />
              <span>OCR Pipeline {ocrResult && '✓'}</span>
            </button>

            <button
              onClick={() => {
                if (capturedPhoto) setActiveTab('analysis')
                else showNotification('Capture photo first.')
              }}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'analysis'
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-bold'
                  : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              <RiMagicLine size={14} />
              <span>Gemini Vision AI {visionAnalysis && '✓'}</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 min-h-0 bg-zinc-950/90">
            {/* Permission / Hardware Error Notice */}
            {cameraError && (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-2xl text-xs text-red-300 flex items-center justify-between">
                <span>{cameraError}</span>
                <button
                  onClick={() => startCamera(selectedDeviceId)}
                  className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer"
                >
                  <RiRefreshLine size={12} /> Retry Permission
                </button>
              </div>
            )}

            {/* TAB 1: Live Preview / Captured Media */}
            {activeTab === 'preview' && (
              <div className="relative flex-1 min-h-[360px] bg-black rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center group shadow-2xl">
                {/* Live Video Feed */}
                {!capturedPhoto && !capturedVideoUrl && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain transform -scale-x-100"
                  />
                )}

                {/* Captured Photo View */}
                {capturedPhoto && (
                  <div className="relative w-full h-full flex items-center justify-center bg-black/90">
                    <img src={capturedPhoto} alt="Captured" className="max-h-[420px] object-contain rounded-xl shadow-2xl" />
                    <div className="absolute top-3 left-3 bg-black/80 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-[10px] text-emerald-300 font-mono">
                      SNAPSHOT PHOTO READY
                    </div>
                  </div>
                )}

                {/* Captured Video View */}
                {capturedVideoUrl && (
                  <div className="relative w-full h-full flex items-center justify-center bg-black/90">
                    <video src={capturedVideoUrl} controls autoPlay className="max-h-[420px] object-contain rounded-xl shadow-2xl" />
                    <div className="absolute top-3 left-3 bg-black/80 px-2.5 py-1 rounded-lg border border-purple-500/40 text-[10px] text-purple-300 font-mono">
                      RECORDED CLIP READY
                    </div>
                  </div>
                )}

                {/* HUD Alignment Grid & Reticle Overlay */}
                {showGrid && !capturedPhoto && !capturedVideoUrl && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                    <div className="grid grid-cols-3 grid-rows-3 h-full w-full border border-emerald-500/20 rounded-xl">
                      <div className="border-r border-b border-emerald-500/10" />
                      <div className="border-r border-b border-emerald-500/10" />
                      <div className="border-b border-emerald-500/10" />
                      <div className="border-r border-b border-emerald-500/10" />
                      <div className="border-r border-b border-emerald-500/10 flex items-center justify-center">
                        <div className="w-12 h-12 border border-emerald-400/40 rounded-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                        </div>
                      </div>
                      <div className="border-b border-emerald-500/10" />
                      <div className="border-r border-emerald-500/10" />
                      <div className="border-r border-emerald-500/10" />
                      <div />
                    </div>
                  </div>
                )}

                {isLoadingCamera && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-emerald-400 font-mono text-xs">
                    <RiRefreshLine size={24} className="animate-spin" />
                    <span>Engaging Camera Lens Hardware...</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: OCR Scanning Pipeline Results */}
            {activeTab === 'ocr' && (
              <div className="flex-1 min-h-[360px] bg-zinc-900/60 rounded-2xl border border-white/10 p-4 flex flex-col gap-3 font-mono">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs text-emerald-400 font-bold">PaddleOCR PP-OCRv4 Engine</span>
                  <button
                    onClick={runOcrScan}
                    disabled={isScanningOcr}
                    className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RiRefreshLine size={12} className={isScanningOcr ? 'animate-spin' : ''} />
                    <span>{isScanningOcr ? 'Scanning Document...' : 'Re-scan OCR'}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-black/50 p-3 rounded-xl border border-white/5 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {isScanningOcr ? (
                    <div className="flex flex-col items-center justify-center h-48 text-emerald-400 gap-3">
                      <RiRefreshLine size={24} className="animate-spin" />
                      <span>Extracting text blocks and reading layout with PaddleOCR...</span>
                    </div>
                  ) : ocrResult?.fullText ? (
                    ocrResult.fullText
                  ) : (
                    <div className="text-zinc-500 italic text-center p-8">
                      Click "Scan OCR" below to run on-device text detection and structure extraction.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Gemini Vision AI Analysis */}
            {activeTab === 'analysis' && (
              <div className="flex-1 min-h-[360px] bg-zinc-900/60 rounded-2xl border border-cyan-500/30 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs text-cyan-400 font-mono font-bold">Gemini Vision AI Pipeline</span>
                  <button
                    onClick={runVisionAnalysis}
                    disabled={isAnalyzingVision}
                    className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RiMagicLine size={12} className={isAnalyzingVision ? 'animate-spin' : ''} />
                    <span>{isAnalyzingVision ? 'Analyzing Scene...' : 'Run Vision AI Analysis'}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-black/50 p-4 rounded-xl border border-white/5 text-xs text-zinc-200 leading-relaxed font-sans">
                  {isAnalyzingVision ? (
                    <div className="flex flex-col items-center justify-center h-48 text-cyan-400 gap-3 font-mono">
                      <RiMagicLine size={24} className="animate-spin" />
                      <span>Sending camera frame to Gemini Multimodal Backend for analysis...</span>
                    </div>
                  ) : visionAnalysis ? (
                    <div className="whitespace-pre-wrap">{visionAnalysis}</div>
                  ) : (
                    <div className="text-zinc-500 italic text-center p-8 font-mono">
                      Click "Run Vision AI Analysis" to parse objects, scenery, text, or equations.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modal Action Controls Bar */}
          <div className="px-5 py-3 border-t border-white/10 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3">
            {/* Left Controls: Retake / Reset */}
            <div className="flex items-center gap-2">
              {(capturedPhoto || capturedVideoUrl) && (
                <button
                  onClick={() => {
                    setCapturedPhoto(null)
                    setCapturedVideoUrl(null)
                    setOcrResult(null)
                    setVisionAnalysis(null)
                    setActiveTab('preview')
                  }}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RiRefreshLine size={14} />
                  <span>Retake</span>
                </button>
              )}
            </div>

            {/* Center Controls: Main Capture / Recording Triggers */}
            <div className="flex items-center gap-3">
              {!capturedPhoto && !capturedVideoUrl && (
                <>
                  {/* Photo Snap Button */}
                  <button
                    onClick={capturePhoto}
                    disabled={isRecording || isLoadingCamera}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(0,255,65,0.3)] transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <RiCamera3Line size={16} />
                    <span>Capture Photo</span>
                  </button>

                  {/* Video Record Toggle */}
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isLoadingCamera}
                    className={`px-4 py-2.5 font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer active:scale-95 ${
                      isRecording
                        ? 'bg-red-500 hover:bg-red-400 text-white animate-pulse'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'
                    }`}
                  >
                    {isRecording ? <RiStopCircleLine size={16} /> : <RiRecordCircleLine size={16} />}
                    <span>{isRecording ? 'Stop Recording' : 'Record Clip'}</span>
                  </button>
                </>
              )}

              {capturedPhoto && (
                <>
                  <button
                    onClick={runOcrScan}
                    disabled={isScanningOcr}
                    className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-mono font-bold flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <RiFileTextLine size={15} />
                    <span>Scan OCR</span>
                  </button>

                  <button
                    onClick={runVisionAnalysis}
                    disabled={isAnalyzingVision}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-mono font-bold flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <RiMagicLine size={15} />
                    <span>Gemini AI Vision</span>
                  </button>
                </>
              )}
            </div>

            {/* Right Controls: Share / Save */}
            <div className="flex items-center gap-2">
              {(capturedPhoto || capturedVideoUrl) && (
                <>
                  <button
                    onClick={handleSaveToGallery}
                    className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Save to IRIS Media Vault"
                  >
                    <RiDownloadLine size={14} />
                    <span>Save to Vault</span>
                  </button>

                  <button
                    onClick={handleShareToChat}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <RiShareForwardLine size={15} />
                    <span>Share to Chat</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
export default CameraPreviewModal
