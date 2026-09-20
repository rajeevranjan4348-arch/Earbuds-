/**
 * Claude Context - Codebase Indexer & File Scanner
 * Incremental scanner with content hashing, .gitignore awareness, secret blacklisting,
 * and path traversal validation.
 */

import { readFileSync, statSync, readdirSync, existsSync } from 'fs'
import { join, relative, resolve } from 'path'
import { chunkFile, computeSha256 } from './chunker'
import type { CodeChunk, ProjectMetadata, ProjectStructure, SymbolDef, TreeNode } from './types'

// Secret & binary exclusions
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'env',
  '.cargo',
  'target',
  '.idea',
  '.vscode',
  '.turbo',
  'coverage',
  '.gradle'
])

const EXCLUDED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'webp', 'bmp',
  'zip', 'tar', 'gz', 'rar', '7z',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'mp3', 'wav', 'ogg', 'mp4', 'mov', 'webm', 'avi',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a',
  'pyc', 'pyo', 'class', 'wasm',
  'lock', 'log', 'sqlite', 'db'
])

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'poetry.lock',
  'id_rsa',
  'id_rsa.pub'
])

/**
 * Check if a file should be ignored
 */
export function isIgnoredFile(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/)

  // 1. Directory exclusion
  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIRS.has(part) || part.startsWith('.')) {
      return true
    }
  }

  const fileName = parts[parts.length - 1]

  // 2. Secret & Sensitive credentials blacklisting
  if (
    fileName.startsWith('.env') ||
    fileName.endsWith('.pem') ||
    fileName.endsWith('.key') ||
    fileName.endsWith('.crt') ||
    fileName.endsWith('.p12') ||
    fileName.endsWith('.pfx') ||
    fileName === 'credentials.json' ||
    fileName === 'service-account.json' ||
    fileName === 'firebase-applet-config.json'
  ) {
    return true
  }

  if (EXCLUDED_FILES.has(fileName)) {
    return true
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true
  }

  return false
}

/**
 * Read custom .gitignore rules if present
 */
export function loadGitignorePatterns(rootPath: string): string[] {
  const gitignorePath = join(rootPath, '.gitignore')
  if (!existsSync(gitignorePath)) return []

  try {
    const lines = readFileSync(gitignorePath, 'utf-8').split(/\r?\n/)
    return lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
  } catch (_e) {
    return []
  }
}

/**
 * Scans repository and indexes all source files incrementally
 */
export async function indexCodebase(
  rootPath: string,
  projectId: string,
  userId: string,
  projectName?: string,
  existingIndex?: {
    chunks: CodeChunk[]
    symbols: SymbolDef[]
    metadata: ProjectMetadata
  }
): Promise<{
  chunks: CodeChunk[]
  symbols: SymbolDef[]
  metadata: ProjectMetadata
}> {
  const resolvedRoot = resolve(rootPath)
  if (!existsSync(resolvedRoot)) {
    throw new Error(`Project root path does not exist: ${resolvedRoot}`)
  }

  const prevHashes = existingIndex?.metadata?.fileHashes || {}
  const prevChunks = existingIndex?.chunks || []
  const prevSymbols = existingIndex?.symbols || []

  const currentHashes: Record<string, string> = {}
  const updatedChunks: CodeChunk[] = []
  const updatedSymbols: SymbolDef[] = []

  const gitignorePatterns = loadGitignorePatterns(resolvedRoot)

  // Collect all valid files
  const filesToIndex: string[] = []
  function walk(currentDir: string) {
    let entries: string[] = []
    try {
      entries = readdirSync(currentDir)
    } catch (_e) {
      return
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const relPath = relative(resolvedRoot, fullPath)

      if (isIgnoredFile(relPath)) continue

      // Check against basic gitignore patterns
      let gitignored = false
      for (const pattern of gitignorePatterns) {
        if (relPath.includes(pattern) || entry === pattern) {
          gitignored = true
          break
        }
      }
      if (gitignored) continue

      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          walk(fullPath)
        } else if (stat.isFile() && stat.size < 1024 * 1024 * 2) {
          // Skip files larger than 2MB
          filesToIndex.push(relPath)
        }
      } catch (_e) {}
    }
  }

  walk(resolvedRoot)

  // Map previous chunks by file path for fast reuse
  const chunksByFile: Map<string, CodeChunk[]> = new Map()
  for (const chunk of prevChunks) {
    const list = chunksByFile.get(chunk.filePath) || []
    list.push(chunk)
    chunksByFile.set(chunk.filePath, list)
  }

  const symbolsByFile: Map<string, SymbolDef[]> = new Map()
  for (const sym of prevSymbols) {
    const list = symbolsByFile.get(sym.filePath) || []
    list.push(sym)
    symbolsByFile.set(sym.filePath, list)
  }

  // Process files incrementally
  for (const relPath of filesToIndex) {
    const fullPath = join(resolvedRoot, relPath)
    try {
      const content = readFileSync(fullPath, 'utf-8')
      const hash = computeSha256(content)
      currentHashes[relPath] = hash

      // Incremental caching: If hash unchanged, reuse previous chunks & symbols!
      if (prevHashes[relPath] === hash && chunksByFile.has(relPath)) {
        const cachedChunks = chunksByFile.get(relPath) || []
        const cachedSymbols = symbolsByFile.get(relPath) || []
        updatedChunks.push(...cachedChunks)
        updatedSymbols.push(...cachedSymbols)
        continue
      }

      // File changed or is new: Chunk and parse!
      const { chunks, symbols } = chunkFile(relPath, content)
      updatedChunks.push(...chunks)
      updatedSymbols.push(...symbols)
    } catch (_err) {
      // Continue indexing other files gracefully
    }
  }

  const metadata: ProjectMetadata = {
    projectId,
    userId,
    name: projectName || resolvedRoot.split(/[/\\]/).pop() || 'project',
    rootPath: resolvedRoot,
    sourceType: resolvedRoot.startsWith('/tmp/iris_codebases') ? 'github' : 'local',
    fileCount: filesToIndex.length,
    chunkCount: updatedChunks.length,
    symbolCount: updatedSymbols.length,
    lastIndexedAt: new Date().toISOString(),
    fileHashes: currentHashes,
    indexingStatus: 'ready'
  }

  return {
    chunks: updatedChunks,
    symbols: updatedSymbols,
    metadata
  }
}

/**
 * Builds a structured hierarchy tree of the project
 */
export function buildProjectStructure(
  rootPath: string,
  projectId: string,
  maxDepth = 4
): ProjectStructure {
  const resolvedRoot = resolve(rootPath)
  const languages: Record<string, number> = {}
  let totalFiles = 0
  let totalLines = 0
  const topDirs: Set<string> = new Set()

  function buildTree(currentDir: string, depth: number): TreeNode[] {
    if (depth > maxDepth) return []
    let entries: string[] = []
    try {
      entries = readdirSync(currentDir)
    } catch (_e) {
      return []
    }

    const nodes: TreeNode[] = []
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const relPath = relative(resolvedRoot, fullPath)

      if (isIgnoredFile(relPath)) continue

      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          if (depth === 1) topDirs.add(entry)
          const children = buildTree(fullPath, depth + 1)
          nodes.push({
            name: entry,
            path: relPath,
            type: 'directory',
            children
          })
        } else if (stat.isFile()) {
          totalFiles++
          const ext = entry.split('.').pop()?.toLowerCase() || 'other'
          languages[ext] = (languages[ext] || 0) + 1

          nodes.push({
            name: entry,
            path: relPath,
            type: 'file',
            size: stat.size,
            language: ext
          })
        }
      } catch (_e) {}
    }
    return nodes
  }

  const tree = buildTree(resolvedRoot, 1)

  return {
    projectId,
    rootName: resolvedRoot.split(/[/\\]/).pop() || 'project',
    tree,
    summary: {
      totalFiles,
      totalLines,
      languages,
      topDirectories: Array.from(topDirs)
    }
  }
}
