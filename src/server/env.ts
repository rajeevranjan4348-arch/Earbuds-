/**
 * IRIS Environment Loader
 *
 * Dependency-free `.env` loader used by both the Vite dev middleware and the
 * standalone production server so that secrets never need to be hard coded and
 * never leak into the client bundle (values stay in `process.env`).
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENV_LINE =
  /^\s*(?:export\s+)?([\w.-]+)\s*(?:=|:)\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|(.*?))?\s*(?:#.*)?$/

function unescape(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
}

function parseEnv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  let buffer: { key: string; value: string } | null = null

  const flush = () => {
    if (buffer) parsed[buffer.key] = buffer.value.trim()
    buffer = null
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(ENV_LINE)
    if (!match) continue

    const key = match[1]
    const quoted = match[2] ?? match[3] ?? match[4]
    const plain = match[5]

    if (quoted !== undefined) {
      flush()
      // Multi-line aware: a trailing backslash continues the value.
      if (quoted.endsWith('\\')) {
        buffer = { key, value: unescape(quoted.slice(0, -1)) }
      } else {
        parsed[key] = unescape(quoted)
      }
      continue
    }

    const value = (plain ?? '').replace(/\s+#.*$/, '')
    if (buffer) {
      buffer.value += value.endsWith('\\') ? value.slice(0, -1) : value
      if (!value.endsWith('\\')) flush()
    } else {
      parsed[key] = unescape(value)
    }
  }

  flush()
  return parsed
}

let loaded = false

/**
 * Loads `.env` (then `.env.local`) into `process.env` without overriding values
 * that already exist in the real environment. Safe to call multiple times.
 */
export function loadEnv(cwd: string = process.cwd()): void {
  if (loaded) return
  loaded = true

  const files = ['.env', '.env.local']
  for (const file of files) {
    const target = resolve(cwd, file)
    if (!existsSync(target)) continue
    try {
      const values = parseEnv(readFileSync(target, 'utf-8'))
      for (const [key, value] of Object.entries(values)) {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    } catch (error) {
      console.error(`[IRIS] Failed to read ${file}:`, error)
    }
  }
}

export function getEnv(key: string, fallback = ''): string {
  return process.env[key] || fallback
}

export function hasEnv(key: string): boolean {
  return Boolean(process.env[key])
}
