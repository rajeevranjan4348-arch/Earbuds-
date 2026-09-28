/**
 * IRIS runtime platform/capability detection.
 *
 * The same web UI runs in browsers/PWA and inside the Android IRIS shell.
 * Browser mode must never pretend that native Android capabilities exist.
 */

export type IrisPlatform = 'web' | 'android'

export type IrisCapability =
  | 'chat'
  | 'voice'
  | 'pwa'
  | 'camera'
  | 'gallery'
  | 'ocr'
  | 'app_control'
  | 'accessibility'
  | 'background_agent'
  | 'android_settings'
  | 'device_actions'
  | 'native_tts'
  | 'whatsapp_share'

export interface IrisAndroidBridge {
  getPlatform?: () => string
  getCapabilities?: () => string
  getBackendUrl?: () => string
  openApp?: (appName: string) => boolean
  openAccessibilitySettings?: () => void
  openAppSettings?: () => void
  back?: () => boolean
  home?: () => boolean
  recents?: () => boolean
  openCameraOCR?: () => void
  openGalleryOCR?: () => void
  startBackgroundAgent?: () => void
  stopBackgroundAgent?: () => void
  speak?: (text: string) => void
  shareTextToWhatsApp?: (message: string) => boolean
}

declare global {
  interface Window {
    IrisAndroid?: IrisAndroidBridge
    irisAndroid?: IrisAndroidBridge
  }
}

const WEB_CAPABILITIES: Record<IrisCapability, boolean> = {
  chat: true,
  voice: true,
  pwa: true,
  camera: true,
  gallery: true,
  ocr: false,
  app_control: false,
  accessibility: false,
  background_agent: false,
  android_settings: false,
  device_actions: false,
  native_tts: false,
  whatsapp_share: false
}

const ANDROID_CAPABILITIES: Record<IrisCapability, boolean> = {
  chat: true,
  voice: true,
  pwa: false,
  camera: true,
  gallery: true,
  ocr: true,
  app_control: true,
  accessibility: true,
  background_agent: true,
  android_settings: true,
  device_actions: true,
  native_tts: true,
  whatsapp_share: true
}

export function getAndroidBridge(): IrisAndroidBridge | null {
  if (typeof window === 'undefined') return null
  return window.IrisAndroid || window.irisAndroid || null
}

export function getIrisPlatform(): IrisPlatform {
  const bridge = getAndroidBridge()
  if (bridge) return 'android'

  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
    // A normal Android browser is still WEB mode until the native bridge exists.
    return 'web'
  }

  return 'web'
}

export function getIrisCapabilities(): Record<IrisCapability, boolean> {
  return getIrisPlatform() === 'android' ? ANDROID_CAPABILITIES : WEB_CAPABILITIES
}

export function hasIrisCapability(capability: IrisCapability): boolean {
  return Boolean(getIrisCapabilities()[capability])
}

export function getIrisBackendBaseUrl(): string {
  const bridge = getAndroidBridge()
  const nativeUrl = bridge?.getBackendUrl?.()
  if (nativeUrl) return nativeUrl.replace(/\/$/, '')

  const configured = import.meta.env.VITE_API_BASE_URL
  return typeof configured === 'string' ? configured.replace(/\/$/, '') : ''
}

export function irisApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getIrisBackendBaseUrl()}${normalized}`
}
