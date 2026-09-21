/**
 * IRIS ADB Bridge (main process)
 *
 * Talks to the Android Debug Bridge on the host so the Phone panel and mobile
 * voice commands work against a real device over Wi-Fi (`adb tcpip 5555`).
 *
 * Every call degrades gracefully: if `adb` is missing or no device is paired the
 * bridge returns `{ success: false, error }` instead of crashing the app.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { app } from 'electron'

import { listAdbHistory, rememberAdbDevice } from './store'

const execFileAsync = promisify(execFile)

export interface AdbResult<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface DeviceTelemetry {
  model: string
  os: string
  uptime: string
  battery: { level: number; isCharging: boolean; temp: string }
  storage: { used: string; total: string; percent: number }
}

interface AdbState {
  device: string | null
  adbPath: string | null
}

const state: AdbState = { device: null, adbPath: null }

/**
 * Locates the adb binary: explicit override → bundled resources → PATH.
 */
export function resolveAdbPath(): string | null {
  if (state.adbPath && existsSync(state.adbPath)) return state.adbPath

  const override = process.env.IRIS_ADB_PATH
  if (override && existsSync(override)) {
    state.adbPath = override
    return override
  }

  const bundled = join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    'resources',
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb'
  )
  if (existsSync(bundled)) {
    state.adbPath = bundled
    return bundled
  }

  state.adbPath = process.platform === 'win32' ? 'adb.exe' : 'adb'
  return state.adbPath
}

async function runAdb(args: string[], timeoutMs = 15_000): Promise<string> {
  const binary = resolveAdbPath()
  if (!binary) throw new Error('ADB binary not found')

  const { stdout } = await execFileAsync(binary, args, {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  })
  return (stdout || '').toString()
}

async function runShell(command: string, timeoutMs = 15_000): Promise<string> {
  if (!state.device) throw new Error('No Android device connected')
  return runAdb(['-s', state.device, 'shell', command], timeoutMs)
}

function ok<T>(data: T, message?: string): AdbResult<T> {
  return { success: true, data, message }
}

function fail(error: unknown): AdbResult {
  return { success: false, error: error instanceof Error ? error.message : String(error) }
}

export function getConnectedDevice(): string | null {
  return state.device
}

export function getAdbHistory(): AdbDeviceRecord[] {
  return listAdbHistory()
}

type AdbDeviceRecord = { ip: string; port: string; lastConnected: string }

export async function connectDevice(
  ip: string,
  port = '5555'
): Promise<AdbResult<{ device: string }>> {
  if (!ip) return { success: false, error: 'IP address is required' }

  try {
    await runAdb(['connect', `${ip}:${port}`], 20_000)
    const devices = await runAdb(['devices'])
    if (!devices.includes(ip)) {
      return {
        success: false,
        error: `Device ${ip}:${port} refused the connection. Enable wireless debugging or run "adb tcpip ${port}" once over USB.`
      }
    }

    state.device = `${ip}:${port}`
    rememberAdbDevice(ip, port)
    return ok({ device: state.device }, `Connected to ${state.device}`)
  } catch (error) {
    return fail(error)
  }
}

export async function disconnectDevice(): Promise<AdbResult<null>> {
  try {
    if (state.device) {
      await runAdb(['disconnect', state.device]).catch(() => undefined)
    }
    state.device = null
    return ok(null, 'Disconnected')
  } catch (error) {
    state.device = null
    return fail(error)
  }
}

export async function getTelemetry(): Promise<AdbResult<DeviceTelemetry>> {
  try {
    const [model, os, batteryRaw, storageRaw, uptimeRaw] = await Promise.all([
      runShell('getprop ro.product.model').catch(() => ''),
      runShell('getprop ro.build.version.release').catch(() => ''),
      runShell('dumpsys battery').catch(() => ''),
      runShell('df /sdcard').catch(() => ''),
      runShell('cat /proc/uptime').catch(() => '')
    ])

    const level = Number((batteryRaw.match(/level:\s*(\d+)/) || [])[1] || 0)
    const isCharging = /powered:\s*true|status:\s*2|AC powered:\s*true|USB powered:\s*true/.test(
      batteryRaw
    )
    const temp = (batteryRaw.match(/temperature:\s*(\d+)/) || [])[1] || '0'
    const tempC = temp ? (Number(temp) / 10).toFixed(1) : '0.0'

    const storageMatch = storageRaw.split('\n')[1]?.trim().split(/\s+/)
    const totalKb = Number(storageMatch?.[1] || 0)
    const usedKb = Number(storageMatch?.[2] || 0)
    const toGb = (kb: number) => (kb / 1024 / 1024).toFixed(1)

    const uptimeSeconds = Number((uptimeRaw || '').split(' ')[0] || 0)
    const hours = Math.floor(uptimeSeconds / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)

    return ok<DeviceTelemetry>({
      model: model.trim() || 'Android Device',
      os: `Android ${os.trim() || '--'}`,
      uptime: `${hours}h ${minutes}m`,
      battery: { level, isCharging, temp: tempC },
      storage: {
        used: `${toGb(usedKb)} GB`,
        total: `${toGb(totalKb)} GB TOTAL`,
        percent: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0
      }
    })
  } catch (error) {
    return fail(error)
  }
}

export async function getNotifications(): Promise<AdbResult<string[]>> {
  try {
    const raw = await runShell('dumpsys notification --noredact')
    const titles = [...raw.matchAll(/android\.title=([^\n]+)/g)]
      .map((match) => match[1].trim())
      .filter(Boolean)
    const texts = [...raw.matchAll(/android\.text=([^\n]+)/g)]
      .map((match) => match[1].trim())
      .filter(Boolean)

    const notifications = titles
      .slice(0, 15)
      .map((title, index) => (texts[index] ? `${title}: ${texts[index]}` : title))

    return ok(notifications)
  } catch (error) {
    return fail(error)
  }
}

export async function captureScreen(): Promise<AdbResult<{ image: string }>> {
  try {
    if (!state.device) throw new Error('No Android device connected')
    const binary = resolveAdbPath()
    if (!binary) throw new Error('ADB binary not found')

    const { stdout } = await execFileAsync(
      binary,
      ['-s', state.device, 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', timeout: 20_000, maxBuffer: 32 * 1024 * 1024 }
    )

    const buffer = Buffer.from(stdout as unknown as Buffer).toString('base64')
    if (!buffer) throw new Error('Empty screen capture')

    return ok({ image: `data:image/png;base64,${buffer}` })
  } catch (error) {
    return fail(error)
  }
}

export async function listPackages(): Promise<AdbResult<string[]>> {
  try {
    const raw = await runShell('pm list packages')
    const packages = [...raw.matchAll(/package:(\S+)/g)].map((match) => match[1])
    return ok(packages)
  } catch (error) {
    return fail(error)
  }
}

export async function launchApp(
  packageName: string,
  activityName?: string
): Promise<AdbResult<{ packageName: string }>> {
  if (!packageName) return { success: false, error: 'packageName is required' }

  try {
    if (activityName) {
      await runShell(`am start -n ${packageName}/${activityName}`)
    } else {
      await runShell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
    }
    return ok({ packageName }, `Launched ${packageName}`)
  } catch (error) {
    return fail(error)
  }
}

const QUICK_ACTIONS: Record<string, string> = {
  camera: 'am start -a android.media.action.IMAGE_CAPTURE',
  wake: 'input keyevent 224',
  lock: 'input keyevent 26',
  home: 'input keyevent 3',
  back: 'input keyevent 4',
  recents: 'input keyevent 187',
  reboot: 'reboot'
}

export async function quickAction(action: string): Promise<AdbResult<{ action: string }>> {
  const command = QUICK_ACTIONS[action]
  if (!command) return { success: false, error: `Unknown quick action: ${action}` }

  try {
    await runShell(command)
    return ok({ action }, `Dispatched ${action}`)
  } catch (error) {
    return fail(error)
  }
}

/**
 * Accessibility bridge: taps, swipes, text entry and key events are forwarded
 * to the device when the IRIS accessibility service itself is unavailable.
 */
export async function dispatchAccessibility(
  action: string,
  params: Record<string, any> = {}
): Promise<AdbResult<any>> {
  try {
    switch (action) {
      case 'tap':
        return ok(await runShell(`input tap ${params.x} ${params.y}`))
      case 'long_press':
        return ok(
          await runShell(
            `input swipe ${params.x} ${params.y} ${params.x} ${params.y} ${params.duration || 800}`
          )
        )
      case 'swipe':
      case 'scroll':
        return ok(
          await runShell(
            `input swipe ${params.x1 ?? params.x} ${params.y1 ?? params.y} ${params.x2} ${params.y2} ${params.duration || 400}`
          )
        )
      case 'type_text':
        return ok(await runShell(`input text "${String(params.text || '').replace(/"/g, '\\"')}"`))
      case 'press_back':
        return ok(await runShell('input keyevent 4'))
      case 'press_home':
        return ok(await runShell('input keyevent 3'))
      case 'press_recents':
        return ok(await runShell('input keyevent 187'))
      case 'press_enter':
        return ok(await runShell('input keyevent 66'))
      default:
        return { success: false, error: `Unsupported accessibility action: ${action}` }
    }
  } catch (error) {
    return fail(error)
  }
}

export async function checkAccessibility(): Promise<
  AdbResult<{ granted: boolean; status: string }>
> {
  try {
    if (!state.device) {
      return { success: false, error: 'No Android device connected' }
    }
    const services = await runShell('settings get secure enabled_accessibility_services')
    const granted = /iris/i.test(services)
    return ok({ granted, status: granted ? 'READY' : 'SERVICE_NOT_ENABLED' })
  } catch (error) {
    return fail(error)
  }
}

/** Attempts to reconnect to the last paired device on boot. */
export async function autoReconnect(): Promise<void> {
  const history = listAdbHistory()
  const last = history[history.length - 1]
  if (!last) return
  try {
    await connectDevice(last.ip, last.port)
  } catch (_error) {
    /* offline device — the UI stays in the disconnected state */
  }
}
