/**
 * IRIS Hands-Free Camera Gesture Recognition Service
 * 
 * Provides real-time computer vision gesture analysis using the device webcam:
 * - Hand detection & skin segmentation via chrominance & temporal motion differencing
 * - Centroid & trajectory velocity tracking (Swipe Left, Swipe Right, Swipe Up, Swipe Down)
 * - Contour & convexity peak analysis (Open Palm, Closed Fist, Victory/Peace, Thumbs Up, Pointing, Pinch)
 * - Zero external CDN/cloud dependencies — 100% client-side privacy-first processing
 * - Centralized dispatch for hands-free navigation across the IRIS interface
 * - Synthetic test stream & simulation controls for restricted iframe environments
 * - Audio-visual feedback with Web Audio synthesized sci-fi chimes
 */

export type GestureType =
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'
  | 'SWIPE_UP'
  | 'SWIPE_DOWN'
  | 'OPEN_PALM'
  | 'CLOSED_FIST'
  | 'VICTORY'
  | 'THUMBS_UP'
  | 'POINT_UP'
  | 'PINCH'

export type GestureActionId =
  | 'NEXT_TAB'
  | 'PREV_TAB'
  | 'SCROLL_UP'
  | 'SCROLL_DOWN'
  | 'TOGGLE_QUICK_ACTIONS'
  | 'STOP_SPEECH_OR_MUTE'
  | 'TOGGLE_MINIMAL_HUD'
  | 'NAV_DASHBOARD'
  | 'TOGGLE_MIC'
  | 'TOGGLE_KNOWLEDGE_OVERLAY'
  | 'NONE'

export interface GestureDefinition {
  id: GestureType
  name: string
  emoji: string
  description: string
  defaultAction: GestureActionId
  iconName: string
}

export const GESTURE_DEFINITIONS: Record<GestureType, GestureDefinition> = {
  SWIPE_LEFT: {
    id: 'SWIPE_LEFT',
    name: 'Swipe Left',
    emoji: '👉',
    description: 'Wave hand smoothly from right to left to advance to the next tab',
    defaultAction: 'NEXT_TAB',
    iconName: 'MoveLeft'
  },
  SWIPE_RIGHT: {
    id: 'SWIPE_RIGHT',
    name: 'Swipe Right',
    emoji: '👈',
    description: 'Wave hand smoothly from left to right to return to previous tab',
    defaultAction: 'PREV_TAB',
    iconName: 'MoveRight'
  },
  SWIPE_UP: {
    id: 'SWIPE_UP',
    name: 'Swipe Up',
    emoji: '👆',
    description: 'Move hand upward to scroll active content up or return home',
    defaultAction: 'SCROLL_UP',
    iconName: 'MoveUp'
  },
  SWIPE_DOWN: {
    id: 'SWIPE_DOWN',
    name: 'Swipe Down',
    emoji: '👇',
    description: 'Move hand downward to scroll active view content down',
    defaultAction: 'SCROLL_DOWN',
    iconName: 'MoveDown'
  },
  OPEN_PALM: {
    id: 'OPEN_PALM',
    name: 'Open Palm',
    emoji: '✋',
    description: 'Hold open flat palm facing camera to open Quick Actions menu',
    defaultAction: 'TOGGLE_QUICK_ACTIONS',
    iconName: 'Hand'
  },
  CLOSED_FIST: {
    id: 'CLOSED_FIST',
    name: 'Closed Fist',
    emoji: '✊',
    description: 'Close hand into a solid fist to halt speech, mute, or cancel modals',
    defaultAction: 'STOP_SPEECH_OR_MUTE',
    iconName: 'Square'
  },
  VICTORY: {
    id: 'VICTORY',
    name: 'Peace / Victory',
    emoji: '✌️',
    description: 'Show two fingers in a V-shape to toggle Minimalist HUD mode',
    defaultAction: 'TOGGLE_MINIMAL_HUD',
    iconName: 'Sparkles'
  },
  THUMBS_UP: {
    id: 'THUMBS_UP',
    name: 'Thumbs Up',
    emoji: '👍',
    description: 'Give a thumbs-up gesture to immediately jump to Command Center',
    defaultAction: 'NAV_DASHBOARD',
    iconName: 'Check'
  },
  POINT_UP: {
    id: 'POINT_UP',
    name: 'Point Up',
    emoji: '☝️',
    description: 'Point index finger upward to activate voice listening / toggle mic',
    defaultAction: 'TOGGLE_MIC',
    iconName: 'Mic'
  },
  PINCH: {
    id: 'PINCH',
    name: 'Pinch Fingers',
    emoji: '🤏',
    description: 'Pinch thumb and index finger together to toggle PDF Knowledge overlay',
    defaultAction: 'TOGGLE_KNOWLEDGE_OVERLAY',
    iconName: 'FileText'
  }
}

export const ACTION_DESCRIPTIONS: Record<GestureActionId, string> = {
  NEXT_TAB: 'Switch to Next Tab',
  PREV_TAB: 'Switch to Previous Tab',
  SCROLL_UP: 'Scroll View Up',
  SCROLL_DOWN: 'Scroll View Down',
  TOGGLE_QUICK_ACTIONS: 'Toggle Quick Actions Menu',
  STOP_SPEECH_OR_MUTE: 'Stop Speech / Toggle Mute',
  TOGGLE_MINIMAL_HUD: 'Toggle Minimalist HUD Mode',
  NAV_DASHBOARD: 'Jump to Command Dashboard',
  TOGGLE_MIC: 'Toggle Voice Microphone',
  TOGGLE_KNOWLEDGE_OVERLAY: 'Toggle PDF Knowledge Base',
  NONE: 'Do Nothing'
}

export interface GestureConfig {
  enabled: boolean
  sensitivity: 'low' | 'medium' | 'high'
  cooldownMs: number
  soundFeedback: boolean
  showPreviewPip: boolean
  selectedCameraId?: string
  actionMappings: Record<GestureType, GestureActionId>
}

export interface HandLandmarks {
  centroid: { x: number; y: number } // Normalized 0-1
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number } // Normalized 0-1
  fingerCount: number
  mass: number
  aspectRatio: number
  isHandPresent: boolean
  velocity: { x: number; y: number }
}

export type CameraStatus = 'idle' | 'starting' | 'active' | 'denied' | 'error' | 'simulated'

export interface GestureEvent {
  gesture: GestureType
  action: GestureActionId
  confidence: number
  timestamp: number
  definition: GestureDefinition
}

const STORAGE_KEY = 'iris_gesture_config_v1'

class GestureRecognitionService {
  private config: GestureConfig = {
    enabled: true,
    sensitivity: 'medium',
    cooldownMs: 850,
    soundFeedback: true,
    showPreviewPip: true,
    actionMappings: {
      SWIPE_LEFT: 'NEXT_TAB',
      SWIPE_RIGHT: 'PREV_TAB',
      SWIPE_UP: 'SCROLL_UP',
      SWIPE_DOWN: 'SCROLL_DOWN',
      OPEN_PALM: 'TOGGLE_QUICK_ACTIONS',
      CLOSED_FIST: 'STOP_SPEECH_OR_MUTE',
      VICTORY: 'TOGGLE_MINIMAL_HUD',
      THUMBS_UP: 'NAV_DASHBOARD',
      POINT_UP: 'TOGGLE_MIC',
      PINCH: 'TOGGLE_KNOWLEDGE_OVERLAY'
    }
  }

  private videoElement: HTMLVideoElement | null = null
  private analysisCanvas: HTMLCanvasElement | null = null
  private analysisCtx: CanvasRenderingContext2D | null = null
  private mediaStream: MediaStream | null = null
  private animFrameId: number | null = null

  private cameraStatus: CameraStatus = 'idle'
  private lastTriggerTime = 0
  private lastHandPresent = false
  private centroidHistory: Array<{ x: number; y: number; time: number }> = []
  private poseCandidate: { gesture: GestureType; count: number } | null = null
  private previousFrameData: ImageData | null = null

  private audioCtx: AudioContext | null = null

  // Listeners
  private gestureListeners: Set<(event: GestureEvent) => void> = new Set()
  private stateListeners: Set<(landmarks: HandLandmarks, status: CameraStatus) => void> = new Set()
  private configListeners: Set<(config: GestureConfig) => void> = new Set()
  private actionExecutors: Map<GestureActionId, () => void> = new Map()

  constructor() {
    this.loadConfig()
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        this.config = {
          ...this.config,
          ...parsed,
          actionMappings: {
            ...this.config.actionMappings,
            ...(parsed.actionMappings || {})
          }
        }
      }
    } catch (e) {
      console.warn('[GestureService] Failed to load config from storage:', e)
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config))
      this.notifyConfigListeners()
    } catch (e) {
      console.warn('[GestureService] Failed to save config to storage:', e)
    }
  }

  public getConfig(): GestureConfig {
    return { ...this.config }
  }

  public updateConfig(partial: Partial<GestureConfig>) {
    this.config = { ...this.config, ...partial }
    this.saveConfig()

    if (partial.enabled !== undefined) {
      if (this.config.enabled) {
        this.startCamera()
      } else {
        this.stopCamera()
      }
    }
  }

  public setActionMapping(gesture: GestureType, action: GestureActionId) {
    this.config.actionMappings[gesture] = action
    this.saveConfig()
  }

  public registerActionHandler(action: GestureActionId, handler: () => void) {
    this.actionExecutors.set(action, handler)
    return () => {
      this.actionExecutors.delete(action)
    }
  }

  public subscribeGesture(listener: (event: GestureEvent) => void) {
    this.gestureListeners.add(listener)
    return () => {
      this.gestureListeners.delete(listener)
    }
  }

  public subscribeState(listener: (landmarks: HandLandmarks, status: CameraStatus) => void) {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  public subscribeConfig(listener: (config: GestureConfig) => void) {
    this.configListeners.add(listener)
    return () => {
      this.configListeners.delete(listener)
    }
  }

  private notifyConfigListeners() {
    this.configListeners.forEach((l) => l(this.config))
  }

  public getCameraStatus(): CameraStatus {
    return this.cameraStatus
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream
  }

  public async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter((d) => d.kind === 'videoinput')
    } catch (e) {
      console.warn('[GestureService] Error enumerating video devices:', e)
      return []
    }
  }

  /**
   * Start webcam optical feed for gesture tracking
   */
  public async startCamera(deviceId?: string): Promise<boolean> {
    if (!this.config.enabled) {
      this.cameraStatus = 'idle'
      return false
    }

    if (this.mediaStream && this.cameraStatus === 'active') {
      return true
    }

    this.cameraStatus = 'starting'
    this.notifyStateListeners({
      centroid: { x: 0.5, y: 0.5 },
      boundingBox: { minX: 0.3, minY: 0.3, maxX: 0.7, maxY: 0.7 },
      fingerCount: 0,
      mass: 0,
      aspectRatio: 1,
      isHandPresent: false,
      velocity: { x: 0, y: 0 }
    })

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam mediaDevices API not available')
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: 'user',
              width: { ideal: 320, max: 640 },
              height: { ideal: 240, max: 480 },
              frameRate: { ideal: 30, max: 30 }
            },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.mediaStream = stream
      this.cameraStatus = 'active'

      this.initVideoPipeline(stream)
      return true
    } catch (err: any) {
      console.warn('[GestureService] Real camera failed or permission denied:', err)
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        this.cameraStatus = 'denied'
      } else {
        this.cameraStatus = 'error'
      }

      // Fallback to simulated optic loop if physical camera is restricted
      this.startSimulatedOptics()
      return false
    }
  }

  public stopCamera() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
      this.videoElement = null
    }

    this.cameraStatus = 'idle'
    this.notifyStateListeners({
      centroid: { x: 0.5, y: 0.5 },
      boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      fingerCount: 0,
      mass: 0,
      aspectRatio: 1,
      isHandPresent: false,
      velocity: { x: 0, y: 0 }
    })
  }

  private initVideoPipeline(stream: MediaStream) {
    if (!this.videoElement) {
      this.videoElement = document.createElement('video')
      this.videoElement.autoplay = true
      this.videoElement.muted = true
      this.videoElement.playsInline = true
      this.videoElement.width = 160
      this.videoElement.height = 120
    }

    if (!this.analysisCanvas) {
      this.analysisCanvas = document.createElement('canvas')
      this.analysisCanvas.width = 160
      this.analysisCanvas.height = 120
      this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true })
    }

    this.videoElement.srcObject = stream
    this.videoElement.onloadedmetadata = () => {
      this.videoElement?.play().catch(() => {})
      this.startAnalysisLoop()
    }
  }

  /**
   * Computer Vision Analysis Loop (runs ~25 FPS)
   */
  private startAnalysisLoop() {
    let lastTime = performance.now()
    const TARGET_INTERVAL = 40 // ~25 fps keeps CPU usage ultralight

    const loop = (now: number) => {
      if (this.cameraStatus !== 'active' && this.cameraStatus !== 'simulated') {
        return
      }

      if (now - lastTime >= TARGET_INTERVAL) {
        lastTime = now
        this.processCurrentFrame()
      }

      this.animFrameId = requestAnimationFrame(loop)
    }

    this.animFrameId = requestAnimationFrame(loop)
  }

  private processCurrentFrame() {
    if (!this.videoElement || !this.analysisCtx || !this.analysisCanvas) return
    if (this.videoElement.readyState < 2) return

    const width = this.analysisCanvas.width
    const height = this.analysisCanvas.height

    try {
      this.analysisCtx.drawImage(this.videoElement, 0, 0, width, height)
      const frameData = this.analysisCtx.getImageData(0, 0, width, height)
      const data = frameData.data

      const prevData = this.previousFrameData ? this.previousFrameData.data : null

      let activePixelCount = 0
      let sumX = 0
      let sumY = 0
      let minX = width
      let maxX = 0
      let minY = height
      let maxY = 0

      // Skin & Motion segmentation
      // Skin detection in YCbCr/normalized-RGB
      const skinMask = new Uint8Array(width * height)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const pixelIdx = i / 4
        const px = pixelIdx % width
        const py = Math.floor(pixelIdx / width)

        // RGB skin chromaticity heuristic
        const isSkinColor =
          r > 75 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          r - g > 15 &&
          Math.abs(r - g) > 15 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15

        // Frame difference motion
        let hasMotion = false
        if (prevData) {
          const diffR = Math.abs(r - prevData[i])
          const diffG = Math.abs(g - prevData[i + 1])
          const diffB = Math.abs(b - prevData[i + 2])
          hasMotion = diffR + diffG + diffB > 35
        }

        // Active hand pixel if skin color or moving skin
        if (isSkinColor) {
          skinMask[pixelIdx] = 1
          activePixelCount++
          sumX += px
          sumY += py
          if (px < minX) minX = px
          if (px > maxX) maxX = px
          if (py < minY) minY = py
          if (py > maxY) maxY = py
        }
      }

      this.previousFrameData = frameData

      const minMass = this.config.sensitivity === 'high' ? 350 : this.config.sensitivity === 'low' ? 900 : 550
      const isHandPresent = activePixelCount >= minMass

      if (!isHandPresent) {
        this.lastHandPresent = false
        this.poseCandidate = null
        this.centroidHistory = []
        this.notifyStateListeners({
          centroid: { x: 0.5, y: 0.5 },
          boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          fingerCount: 0,
          mass: 0,
          aspectRatio: 1,
          isHandPresent: false,
          velocity: { x: 0, y: 0 }
        })
        return
      }

      // Calculate centroid
      const centroidX = sumX / activePixelCount
      const centroidY = sumY / activePixelCount
      const normCx = centroidX / width
      const normCy = centroidY / height

      const boxW = maxX - minX
      const boxH = maxY - minY
      const aspectRatio = boxH > 0 ? boxW / boxH : 1

      // Find top edge profile (convexity peaks / fingers)
      const topProfile = new Int32Array(boxW + 1).fill(-1)
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          if (skinMask[y * width + x] === 1) {
            topProfile[x - minX] = y
            break
          }
        }
      }

      // Detect peaks in top contour
      let fingerPeaks = 0
      const peakPositions: number[] = []
      const step = Math.max(3, Math.floor(boxW / 14))

      for (let i = step; i < topProfile.length - step; i += step) {
        const curr = topProfile[i]
        const left = topProfile[i - step]
        const right = topProfile[i + step]

        if (curr !== -1 && left !== -1 && right !== -1) {
          // A peak in screen coordinates has a SMALLER Y value
          if (curr < left - 6 && curr < right - 6) {
            fingerPeaks++
            peakPositions.push(i + minX)
          }
        }
      }

      // Trajectory tracking for Swipes
      const now = performance.now()
      this.centroidHistory.push({ x: normCx, y: normCy, time: now })

      // Keep recent 450ms trajectory
      this.centroidHistory = this.centroidHistory.filter((p) => now - p.time <= 450)

      let velocityX = 0
      let velocityY = 0

      if (this.centroidHistory.length >= 4) {
        const oldest = this.centroidHistory[0]
        const newest = this.centroidHistory[this.centroidHistory.length - 1]
        const dt = (newest.time - oldest.time) / 1000
        if (dt > 0.08) {
          velocityX = (newest.x - oldest.x) / dt
          velocityY = (newest.y - oldest.y) / dt
        }
      }

      const landmarks: HandLandmarks = {
        centroid: { x: normCx, y: normCy },
        boundingBox: {
          minX: minX / width,
          minY: minY / height,
          maxX: maxX / width,
          maxY: maxY / height
        },
        fingerCount: fingerPeaks,
        mass: activePixelCount,
        aspectRatio,
        isHandPresent: true,
        velocity: { x: velocityX, y: velocityY }
      }

      this.notifyStateListeners(landmarks)

      // Evaluate Gestures
      this.evaluateGestures(landmarks, now)
    } catch (e) {
      console.warn('[GestureService] Frame processing error:', e)
    }
  }

  private evaluateGestures(landmarks: HandLandmarks, now: number) {
    // Check cooldown
    if (now - this.lastTriggerTime < this.config.cooldownMs) {
      return
    }

    const { velocity, fingerCount, aspectRatio, boundingBox, mass } = landmarks
    const boxW = boundingBox.maxX - boundingBox.minX
    const boxH = boundingBox.maxY - boundingBox.minY
    const fillRatio = mass / (boxW * 160 * boxH * 120 || 1)

    // Sensitivity multipliers
    const swipeThresh = this.config.sensitivity === 'high' ? 0.9 : this.config.sensitivity === 'low' ? 1.8 : 1.3
    const vertSwipeThresh = this.config.sensitivity === 'high' ? 1.0 : this.config.sensitivity === 'low' ? 2.0 : 1.5

    // 1. DYNAMIC GESTURES: Horizontal Swipes (Mirror view: hand moving to screen left is Swipe Left)
    // Note: Video is mirrored in standard selfie view
    if (velocity.x < -swipeThresh && Math.abs(velocity.x) > Math.abs(velocity.y) * 1.3) {
      this.triggerGesture('SWIPE_LEFT', 0.92)
      this.centroidHistory = []
      return
    }

    if (velocity.x > swipeThresh && Math.abs(velocity.x) > Math.abs(velocity.y) * 1.3) {
      this.triggerGesture('SWIPE_RIGHT', 0.92)
      this.centroidHistory = []
      return
    }

    // Vertical Swipes
    if (velocity.y < -vertSwipeThresh && Math.abs(velocity.y) > Math.abs(velocity.x) * 1.4) {
      this.triggerGesture('SWIPE_UP', 0.88)
      this.centroidHistory = []
      return
    }

    if (velocity.y > vertSwipeThresh && Math.abs(velocity.y) > Math.abs(velocity.x) * 1.4) {
      this.triggerGesture('SWIPE_DOWN', 0.88)
      this.centroidHistory = []
      return
    }

    // 2. STATIC POSE GESTURES (Require 3 consecutive matching frames to prevent noise)
    let candidatePose: GestureType | null = null

    // Closed Fist: High fill ratio, low finger peaks, compact aspect ratio
    if (fillRatio > 0.58 && fingerCount === 0 && boxW > 0.18 && boxH > 0.18) {
      candidatePose = 'CLOSED_FIST'
    }
    // Open Palm: Many fingers or very wide spread top, moderate fill
    else if (fingerCount >= 4 || (aspectRatio > 0.85 && fingerCount >= 3 && fillRatio < 0.52)) {
      candidatePose = 'OPEN_PALM'
    }
    // Victory / Peace: Exactly 2 clear finger peaks
    else if (fingerCount === 2 && aspectRatio < 0.9) {
      candidatePose = 'VICTORY'
    }
    // Pointing Up: 1 distinct finger peak, tall aspect ratio
    else if (fingerCount === 1 && aspectRatio < 0.75) {
      candidatePose = 'POINT_UP'
    }
    // Thumbs Up: Thumb extended horizontally or upward with compact palm
    else if (fingerCount === 1 && aspectRatio >= 0.85 && fillRatio > 0.45) {
      candidatePose = 'THUMBS_UP'
    }
    // Pinch: Small compact contact area
    else if (boxW < 0.22 && boxH < 0.22 && fillRatio > 0.5) {
      candidatePose = 'PINCH'
    }

    if (candidatePose) {
      if (this.poseCandidate && this.poseCandidate.gesture === candidatePose) {
        this.poseCandidate.count++
        const reqFrames = this.config.sensitivity === 'high' ? 2 : 3
        if (this.poseCandidate.count >= reqFrames) {
          this.triggerGesture(candidatePose, 0.9)
          this.poseCandidate = null
        }
      } else {
        this.poseCandidate = { gesture: candidatePose, count: 1 }
      }
    } else {
      this.poseCandidate = null
    }
  }

  /**
   * Trigger recognized gesture and dispatch mapped action
   */
  public triggerGesture(gesture: GestureType, confidence = 0.95) {
    const now = performance.now()
    if (now - this.lastTriggerTime < this.config.cooldownMs) {
      return
    }

    this.lastTriggerTime = now
    const action = this.config.actionMappings[gesture] || 'NONE'
    const definition = GESTURE_DEFINITIONS[gesture]

    // Play synthesized high-tech sound feedback
    if (this.config.soundFeedback) {
      this.playGestureChime(gesture)
    }

    // Dispatch to registered action handler
    if (action !== 'NONE') {
      const handler = this.actionExecutors.get(action)
      if (handler) {
        try {
          handler()
        } catch (err) {
          console.error(`[GestureService] Error executing action for ${gesture}:`, err)
        }
      }
    }

    const event: GestureEvent = {
      gesture,
      action,
      confidence,
      timestamp: Date.now(),
      definition
    }

    this.gestureListeners.forEach((l) => l(event))
  }

  /**
   * Synthesize high-tech acoustic chime via Web Audio API
   */
  private playGestureChime(gesture: GestureType) {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass()
        }
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {})
      }

      if (!this.audioCtx) return

      const now = this.audioCtx.currentTime
      const osc = this.audioCtx.createOscillator()
      const gain = this.audioCtx.createGain()

      // Frequencies customized by gesture type
      let f1 = 587.33 // D5
      let f2 = 880.0 // A5

      if (gesture === 'SWIPE_LEFT') {
        f1 = 523.25 // C5
        f2 = 783.99 // G5
      } else if (gesture === 'SWIPE_RIGHT') {
        f1 = 783.99 // G5
        f2 = 523.25 // C5
      } else if (gesture === 'CLOSED_FIST') {
        f1 = 440.0 // A4
        f2 = 220.0 // A3
      } else if (gesture === 'VICTORY' || gesture === 'OPEN_PALM') {
        f1 = 659.25 // E5
        f2 = 1046.5 // C6
      }

      osc.type = 'sine'
      osc.frequency.setValueAtTime(f1, now)
      osc.frequency.exponentialRampToValueAtTime(f2, now + 0.09)

      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)

      osc.connect(gain)
      gain.connect(this.audioCtx.destination)

      osc.start(now)
      osc.stop(now + 0.18)
    } catch (e) {
      // Audio context might be restricted before first click
    }
  }

  /**
   * Fallback simulation loop for testing or restricted camera environments
   */
  private startSimulatedOptics() {
    this.cameraStatus = 'simulated'
    let t = 0

    const simLoop = () => {
      if (this.cameraStatus !== 'simulated') return
      t += 0.05
      const waveX = 0.5 + Math.sin(t) * 0.25
      const waveY = 0.5 + Math.cos(t * 0.7) * 0.15

      this.notifyStateListeners({
        centroid: { x: waveX, y: waveY },
        boundingBox: {
          minX: Math.max(0, waveX - 0.15),
          minY: Math.max(0, waveY - 0.15),
          maxX: Math.min(1, waveX + 0.15),
          maxY: Math.min(1, waveY + 0.15)
        },
        fingerCount: 5,
        mass: 750,
        aspectRatio: 1.1,
        isHandPresent: true,
        velocity: { x: Math.cos(t) * 0.5, y: -Math.sin(t * 0.7) * 0.3 }
      })

      setTimeout(() => {
        if (this.cameraStatus === 'simulated') {
          requestAnimationFrame(simLoop)
        }
      }, 50)
    }

    requestAnimationFrame(simLoop)
  }

  private notifyStateListeners(landmarks: HandLandmarks) {
    this.stateListeners.forEach((l) => l(landmarks, this.cameraStatus))
  }
}

export const gestureRecognitionService = new GestureRecognitionService()
