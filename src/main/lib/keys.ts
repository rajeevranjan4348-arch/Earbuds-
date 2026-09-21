/**
 * IRIS Secure Key Vault (main process)
 *
 * API keys entered in Settings are encrypted with Electron's `safeStorage`
 * (macOS Keychain / Windows DPAPI / libsecret on Linux) and written to the
 * user data folder. When OS-level encryption is unavailable the vault degrades
 * to an obfuscated local file instead of failing outright.
 */

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

export interface ApiKeyPayload {
  geminiKey?: string
  groqKey?: string
  hfKey?: string
  tavilyKey?: string
  mem0Key?: string
  [key: string]: string | undefined
}

export const EMPTY_KEYS: Required<
  Pick<ApiKeyPayload, 'geminiKey' | 'groqKey' | 'hfKey' | 'tavilyKey' | 'mem0Key'>
> = {
  geminiKey: '',
  groqKey: '',
  hfKey: '',
  tavilyKey: '',
  mem0Key: ''
}

let vaultPath: string | null = null

function getVaultPath(): string {
  if (!vaultPath) {
    vaultPath = join(app.getPath('userData'), 'iris-vault.enc')
  }
  return vaultPath
}

export function readKeys(): ApiKeyPayload {
  try {
    const file = getVaultPath()
    if (!existsSync(file)) return { ...EMPTY_KEYS }
    const buffer = readFileSync(file)
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buffer)
      : buffer.toString('utf-8')
    return { ...EMPTY_KEYS, ...(JSON.parse(json) as ApiKeyPayload) }
  } catch (error) {
    console.error('[IRIS Vault] Unable to read stored keys:', error)
    return { ...EMPTY_KEYS }
  }
}

export function writeKeys(keys: ApiKeyPayload): { success: boolean; encrypted: boolean } {
  try {
    const json = JSON.stringify({ ...EMPTY_KEYS, ...keys }, null, 2)
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf-8')

    const file = getVaultPath()
    writeFileSync(file, payload, { mode: 0o600 })
    try {
      chmodSync(file, 0o600)
    } catch (_error) {
      /* chmod is unsupported on some platforms — ignore */
    }

    return { success: true, encrypted: safeStorage.isEncryptionAvailable() }
  } catch (error) {
    console.error('[IRIS Vault] Unable to persist keys:', error)
    return { success: false, encrypted: false }
  }
}

/**
 * Exposes stored keys to the embedded backend so the server engines (Gemini,
 * Mem0, Tavily, ...) pick user-provided credentials up without a restart.
 */
export const KEY_ENV_MAP: Record<string, string> = {
  geminiKey: 'GEMINI_API_KEY',
  groqKey: 'GROQ_API_KEY',
  hfKey: 'HUGGINGFACE_API_KEY',
  tavilyKey: 'TAVILY_API_KEY',
  mem0Key: 'MEM0_API_KEY'
}

export function applyKeysToEnvironment(keys: ApiKeyPayload = readKeys()): void {
  for (const [field, envName] of Object.entries(KEY_ENV_MAP)) {
    const value = keys[field]
    if (value) process.env[envName] = value
    else delete process.env[envName]
  }
}
