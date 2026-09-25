/**
 * IRIS Local Data Store (main process)
 *
 * Persistent, per-user storage for the desktop app: notes, gallery media and
 * ADB pairing history. Everything lives under `app.getPath('userData')` so the
 * data survives updates and never touches the renderer's sandboxed storage.
 *
 * The renderer reaches this store exclusively through IPC channels
 * (`get-notes`, `save-note`, `get-gallery`, ...) — mirroring the browser shim.
 */

import { app, shell } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, extname, join } from 'node:path'

export interface NoteRecord {
  filename: string
  title: string
  content: string
  createdAt: string
}

export interface GalleryRecord {
  filename: string
  displayName: string
  path: string
  url: string
  createdAt: string
}

export interface AdbDeviceRecord {
  ip: string
  port: string
  lastConnected: string
}

let dataRoot: string | null = null

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Root folder for all IRIS user data (created on first access). */
export function getDataRoot(): string {
  if (!dataRoot) {
    dataRoot = ensureDir(join(app.getPath('userData'), 'iris-data'))
    ensureDir(getGalleryDir())
  }
  return dataRoot
}

export function getGalleryDir(): string {
  return ensureDir(join(getDataRoot(), 'gallery'))
}

const NOTES_FILE = () => join(getDataRoot(), 'notes.json')
const GALLERY_FILE = () => join(getDataRoot(), 'gallery.json')
const ADB_FILE = () => join(getDataRoot(), 'adb-history.json')

function readCollection<T>(file: string): T[] {
  try {
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch (error) {
    console.error(`[IRIS Store] Corrupt collection ${file}:`, error)
    return []
  }
}

function writeCollection<T>(file: string, items: T[]): T[] {
  try {
    writeFileSync(file, JSON.stringify(items, null, 2))
  } catch (error) {
    console.error(`[IRIS Store] Failed to write ${file}:`, error)
  }
  return items
}

/* ------------------------------------------------------------------ notes */

const DEFAULT_NOTES: NoteRecord[] = [
  {
    filename: 'iris-architecture.md',
    title: 'IRIS Neural Core Architecture',
    content:
      '# IRIS Neural Operating Layer\n\n' +
      '- **Voice Core**: Gemini Live streaming with real-time transcription.\n' +
      '- **Telemetry**: CPU, memory, thermal and network sampling from the host OS.\n' +
      '- **Optics**: Camera and screen capture routed into the multimodal agents.\n' +
      '- **Vault**: API keys encrypted with the operating system keychain.\n',
    createdAt: new Date().toISOString()
  }
]

export function listNotes(): NoteRecord[] {
  const notes = readCollection<NoteRecord>(NOTES_FILE())
  if (notes.length === 0 && !existsSync(NOTES_FILE())) {
    return writeCollection(NOTES_FILE(), DEFAULT_NOTES)
  }
  return notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function saveNote(
  payload: Partial<NoteRecord> & { originalFilename?: string }
): NoteRecord[] {
  const notes = listNotes()
  const title = (payload.title || 'Untitled Note').trim()
  const content = payload.content || ''
  const originalFilename = payload.filename || payload.originalFilename
  const filename =
    originalFilename ||
    `${
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'note'
    }-${Date.now()}.md`

  const index = notes.findIndex((note) => note.filename === filename)
  if (index >= 0) {
    notes[index] = { ...notes[index], title, content }
  } else {
    notes.unshift({ filename, title, content, createdAt: new Date().toISOString() })
  }

  return writeCollection(NOTES_FILE(), notes)
}

export function deleteNote(filename: string): { success: boolean } {
  const notes = listNotes().filter((note) => note.filename !== filename)
  writeCollection(NOTES_FILE(), notes)
  return { success: true }
}

/* ---------------------------------------------------------------- gallery */

export interface GalleryRecord {
  filename: string
  displayName: string
  path: string
  url: string
  createdAt: string
  type?: 'image' | 'video' | 'audio' | 'document' | 'file'
  fileType?: string
  mimeType?: string
  size?: number
  contentSnippet?: string
}

export function listGallery(): GalleryRecord[] {
  const items = readCollection<GalleryRecord>(GALLERY_FILE())
  // Drop records whose file disappeared (user cleaned the folder manually).
  const alive = items.filter((item) => item.path && existsSync(item.path))
  if (alive.length !== items.length) writeCollection(GALLERY_FILE(), alive)
  return alive.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export interface SaveGalleryPayload {
  filename?: string
  displayName?: string
  /** Data URL (base64) or http(s) URL or raw data. */
  url?: string
  /** Raw base64 payload without the data URL prefix. */
  data?: string
  type?: 'image' | 'video' | 'audio' | 'document' | 'file'
  fileType?: string
  mimeType?: string
  size?: number
  contentSnippet?: string
}

function writeBase64(target: string, base64: string): string {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  writeFileSync(target, Buffer.from(clean, 'base64'))
  return target
}

export async function saveGalleryItem(payload: SaveGalleryPayload): Promise<GalleryRecord> {
  const galleryDir = getGalleryDir()
  const timestamp = Date.now()
  let extension = ''
  if (payload.filename && payload.filename.includes('.')) {
    extension = extname(payload.filename)
  } else if (payload.url?.startsWith('data:')) {
    const mimeMatch = payload.url.match(/^data:([^;]+);/)
    if (mimeMatch) {
      const mime = mimeMatch[1]
      if (mime.includes('png')) extension = '.png'
      else if (mime.includes('gif')) extension = '.gif'
      else if (mime.includes('webp')) extension = '.webp'
      else if (mime.includes('mp4')) extension = '.mp4'
      else if (mime.includes('webm')) extension = '.webm'
      else if (mime.includes('mp3')) extension = '.mp3'
      else if (mime.includes('wav')) extension = '.wav'
      else if (mime.includes('pdf')) extension = '.pdf'
      else extension = '.bin'
    }
  } else {
    extension = '.jpg'
  }

  const filename = payload.filename || `iris-file-${timestamp}${extension}`
  const target = join(galleryDir, filename)

  const url = payload.url || ''
  if (url.startsWith('data:')) {
    writeBase64(target, url)
  } else if (payload.data) {
    writeBase64(target, payload.data)
  } else if (url.startsWith('http')) {
    try {
      const response = await fetch(url)
      const buffer = Buffer.from(await response.arrayBuffer())
      writeFileSync(target, buffer)
    } catch (error) {
      console.warn('[IRIS Store] Remote file download failed:', error)
      const record: GalleryRecord = {
        filename,
        displayName: payload.displayName || payload.filename || `IRIS File ${new Date(timestamp).toLocaleString()}`,
        path: '',
        url,
        type: payload.type,
        fileType: payload.fileType,
        mimeType: payload.mimeType,
        size: payload.size,
        contentSnippet: payload.contentSnippet,
        createdAt: new Date(timestamp).toISOString()
      }
      const items = [record, ...listGallery()]
      writeCollection(GALLERY_FILE(), items)
      return record
    }
  } else {
    writeFileSync(target, Buffer.from(''))
  }

  const record: GalleryRecord = {
    filename,
    displayName: payload.displayName || payload.filename || `IRIS File ${new Date(timestamp).toLocaleTimeString()}`,
    path: target,
    // Custom protocol handler streams local media/files into the renderer.
    url: `iris-media://gallery/${encodeURIComponent(filename)}`,
    type: payload.type,
    fileType: payload.fileType,
    mimeType: payload.mimeType,
    size: payload.size,
    contentSnippet: payload.contentSnippet,
    createdAt: new Date(timestamp).toISOString()
  }

  const items = [record, ...listGallery()]
  writeCollection(GALLERY_FILE(), items)
  return record
}

export function clearGallery(): { success: boolean } {
  const items = listGallery()
  for (const item of items) {
    if (item.path && existsSync(item.path)) {
      try {
        rmSync(item.path, { force: true })
      } catch (error) {
        console.warn('[IRIS Store] Failed to delete media file:', error)
      }
    }
  }
  writeCollection(GALLERY_FILE(), [])
  return { success: true }
}

export function deleteGalleryItem(filename: string): { success: boolean } {
  const items = listGallery()
  const target = items.find((item) => item.filename === filename)
  if (target && target.path && existsSync(target.path)) {
    try {
      rmSync(target.path, { force: true })
    } catch (error) {
      console.warn('[IRIS Store] Failed to delete media file:', error)
    }
  }
  writeCollection(
    GALLERY_FILE(),
    items.filter((item) => item.filename !== filename)
  )
  return { success: true }
}

/** Resolves a gallery filename to an absolute path (used by the protocol host). */
export function resolveGalleryFile(filename: string): string | null {
  const target = join(getGalleryDir(), basename(filename))
  return existsSync(target) && statSync(target).isFile() ? target : null
}

/** Reveals a media file in the OS file manager. */
export function revealInFileManager(filePath: string): { success: boolean } {
  if (!filePath || !existsSync(filePath)) return { success: false }
  shell.showItemInFolder(filePath)
  return { success: true }
}

/** Copies a media file to a user-chosen destination. */
export function exportMediaFile(sourcePath: string): { success: boolean; savedTo?: string } {
  if (!sourcePath || !existsSync(sourcePath)) return { success: false }
  const target = join(app.getPath('downloads'), basename(sourcePath))
  try {
    copyFileSync(sourcePath, target)
    return { success: true, savedTo: target }
  } catch (error) {
    console.error('[IRIS Store] Export failed:', error)
    return { success: false }
  }
}

export { extname }

/* ------------------------------------------------------------- adb history */

export function listAdbHistory(): AdbDeviceRecord[] {
  return readCollection<AdbDeviceRecord>(ADB_FILE())
}

export function rememberAdbDevice(ip: string, port: string): AdbDeviceRecord[] {
  const history = listAdbHistory().filter((item) => !(item.ip === ip && item.port === port))
  history.push({ ip, port, lastConnected: new Date().toISOString() })
  const trimmed = history.slice(-10)
  writeCollection(ADB_FILE(), trimmed)
  return trimmed
}
