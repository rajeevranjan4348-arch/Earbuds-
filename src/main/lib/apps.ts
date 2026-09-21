/**
 * IRIS Application Launcher (main process)
 *
 * Resolves a human app name ("Spotify", "Visual Studio Code") to a native
 * launch command per platform. Used by the Apps panel and by voice commands
 * such as "Open Spotify".
 */

import { exec } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { shell } from 'electron'

import { fetchInstalledApps } from './system'

const execAsync = promisify(exec)

export interface LaunchResult {
  success: boolean
  app?: string
  error?: string
  message?: string
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Finds the best matching installed application for a spoken/typed name. */
export async function resolveApp(name: string): Promise<{ name: string; id: string } | null> {
  if (!name) return null
  const apps = (await fetchInstalledApps()) as Array<{ name: string; id: string }>
  if (!apps.length) return null

  const target = normalize(name)
  return (
    apps.find((app) => normalize(app.name) === target) ||
    apps.find((app) => normalize(app.name).includes(target)) ||
    apps.find((app) => target.includes(normalize(app.name))) ||
    null
  )
}

/** Reads the `Exec=` line of a Linux .desktop entry. */
function readDesktopExec(desktopId: string): string | null {
  const candidates = [
    join('/usr/share/applications', desktopId),
    join('/usr/local/share/applications', desktopId),
    join(process.env.HOME || '', '.local/share/applications', desktopId)
  ]

  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const contents = readFileSync(file, 'utf-8')
      const execLine = contents.split('\n').find((line) => line.startsWith('Exec='))
      if (!execLine) continue
      return execLine
        .slice(5)
        .replace(/%[fFuUdDnNickvm]/g, '')
        .trim()
    } catch (_error) {
      /* unreadable entry — try the next candidate */
    }
  }
  return null
}

function listLinuxDesktopFiles(): string[] {
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    join(process.env.HOME || '', '.local/share/applications')
  ]
  const files: string[] = []
  for (const dir of dirs) {
    try {
      if (existsSync(dir)) files.push(...readdirSync(dir).filter((f) => f.endsWith('.desktop')))
    } catch (_error) {
      /* ignore unreadable directories */
    }
  }
  return files
}

export async function openApp(name: string): Promise<LaunchResult> {
  if (!name) return { success: false, error: 'No application name provided' }

  const platform = process.platform
  const resolved = await resolveApp(name)
  const displayName = resolved?.name || name

  try {
    if (platform === 'darwin') {
      await execAsync(`open -a "${displayName}"`)
      return { success: true, app: displayName, message: `Launched ${displayName}` }
    }

    if (platform === 'win32') {
      if (resolved?.id && existsSync(resolved.id)) {
        const opened = await shell.openPath(resolved.id)
        if (!opened) return { success: true, app: displayName, message: `Launched ${displayName}` }
      }
      await execAsync(
        `powershell -NoProfile -Command "Start-Process '${displayName.replace(/'/g, "''")}'"`
      )
      return { success: true, app: displayName, message: `Launched ${displayName}` }
    }

    // Linux / other: prefer the .desktop entry, fall back to a bare binary.
    if (resolved?.id?.endsWith('.desktop')) {
      const execLine = readDesktopExec(resolved.id)
      if (execLine) {
        await execAsync(execLine)
        return { success: true, app: displayName, message: `Launched ${displayName}` }
      }
      await execAsync(`gtk-launch ${resolved.id}`)
      return { success: true, app: displayName, message: `Launched ${displayName}` }
    }

    const target = normalize(name)
    const fallback = listLinuxDesktopFiles().find((file) =>
      normalize(file.replace('.desktop', '')).includes(target)
    )
    if (fallback) {
      const execLine = readDesktopExec(fallback)
      if (execLine) {
        await execAsync(execLine)
        return { success: true, app: displayName, message: `Launched ${displayName}` }
      }
    }

    await execAsync(name)
    return { success: true, app: displayName, message: `Launched ${displayName}` }
  } catch (error) {
    return {
      success: false,
      app: displayName,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function closeApp(name: string): Promise<LaunchResult> {
  if (!name) return { success: false, error: 'No application name provided' }

  const isWindows = process.platform === 'win32'
  const command = isWindows
    ? `powershell -NoProfile -Command "Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Stop-Process -Force"`
    : `pkill -f "${name.replace(/"/g, '\\"')}"`

  try {
    await execAsync(command)
    return { success: true, app: name, message: `Terminated ${name}` }
  } catch (error) {
    return {
      success: false,
      app: name,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
