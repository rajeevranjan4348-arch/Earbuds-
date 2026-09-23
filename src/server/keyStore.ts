/**
 * IRIS Runtime Key Store
 *
 * The Settings UI can write API keys at runtime (Electron: encrypted OS vault,
 * Web: this module). Keys are mapped onto the canonical environment variables
 * the server engines already read, so every engine picks them up instantly —
 * no restart and no client-side exposure of secrets.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'

const KEY_FILE = resolve(process.cwd(), '.iris-keys.json')

export const RUNTIME_KEY_MAP: Record<string, string> = {
  geminiKey: 'GEMINI_API_KEY',
  nvidiaKey: 'NVIDIA_API_KEY',
  deepseekKey: 'DEEPSEEK_API_KEY',
  groqKey: 'GROQ_API_KEY',
  hfKey: 'HUGGINGFACE_API_KEY',
  tavilyKey: 'TAVILY_API_KEY',
  mem0Key: 'MEM0_API_KEY',
  imageKey: 'IMAGE_API_KEY',
  fluxKey: 'FLUX_API_KEY',
  searxngUrl: 'SEARXNG_URL',
  googleMapsKey: 'VITE_GOOGLE_MAPS_API_KEY',
  youtubeClientId: 'YOUTUBE_CLIENT_ID',
  youtubeClientSecret: 'YOUTUBE_CLIENT_SECRET',
  youtubeRefreshToken: 'YOUTUBE_REFRESH_TOKEN'
}

export interface RuntimeKeyPayload {
  geminiKey?: string
  nvidiaKey?: string
  deepseekKey?: string
  groqKey?: string
  hfKey?: string
  tavilyKey?: string
  mem0Key?: string
  [key: string]: string | undefined
}

function readPersisted(): RuntimeKeyPayload {
  try {
    if (!existsSync(KEY_FILE)) return {}
    return JSON.parse(readFileSync(KEY_FILE, 'utf-8')) as RuntimeKeyPayload
  } catch (_error) {
    return {}
  }
}

function persist(payload: RuntimeKeyPayload): void {
  try {
    writeFileSync(KEY_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 })
    try {
      chmodSync(KEY_FILE, 0o600)
    } catch (_error) {
      /* chmod unsupported (e.g. Windows) — ignore */
    }
  } catch (error) {
    console.error('[IRIS] Unable to persist runtime keys:', error)
  }
}

/**
 * Applies UI-provided keys onto `process.env` and persists them locally so the
 * values survive a server restart. Empty strings clear the override.
 */
export function applyRuntimeKeys(keys: RuntimeKeyPayload): RuntimeKeyPayload {
  const merged: RuntimeKeyPayload = { ...readPersisted() }

  for (const [field, value] of Object.entries(keys || {})) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) merged[field] = trimmed
    else delete merged[field]
  }

  for (const [field, envName] of Object.entries(RUNTIME_KEY_MAP)) {
    const value = merged[field]
    if (value) process.env[envName] = value
    else delete process.env[envName]
  }

  persist(merged)
  return merged
}

/** Loads keys persisted from a previous session into `process.env`. */
export function hydrateRuntimeKeys(): RuntimeKeyPayload {
  const persisted = readPersisted()
  for (const [field, envName] of Object.entries(RUNTIME_KEY_MAP)) {
    const value = persisted[field]
    if (value && !process.env[envName]) process.env[envName] = value
  }
  return persisted
}

/** Returns which providers are configured (never the key material itself). */
export function getRuntimeKeyStatus(): Record<string, boolean> {
  const persisted = readPersisted()
  const status: Record<string, boolean> = {}
  for (const [field, envName] of Object.entries(RUNTIME_KEY_MAP)) {
    status[field] = Boolean(persisted[field] || process.env[envName])
  }
  return status
}
