/**
 * Claude Context - Codebase Understanding & Indexing Engine
 * Type definitions for code chunks, symbols, project metadata, and search queries.
 */

export interface CodeChunk {
  id: string
  filePath: string
  startLine: number
  endLine: number
  content: string
  type: 'function' | 'class' | 'interface' | 'method' | 'block' | 'import' | 'module'
  symbolName?: string
  parentSymbol?: string
  imports?: string[]
  exports?: string[]
  language: string
  hash: string
  embedding?: number[]
}

export interface SymbolDef {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'method'
  filePath: string
  line: number
  signature: string
  docstring?: string
}

export interface ProjectMetadata {
  projectId: string
  userId: string
  name: string
  rootPath: string
  sourceType: 'local' | 'github'
  githubUrl?: string
  fileCount: number
  chunkCount: number
  symbolCount: number
  lastIndexedAt: string
  fileHashes: Record<string, string> // relative path -> sha256
  indexingStatus: 'idle' | 'indexing' | 'ready' | 'failed'
  errorMessage?: string
}

export interface SearchResult {
  chunkId: string
  filePath: string
  startLine: number
  endLine: number
  snippet: string
  score: number
  matchType: 'semantic' | 'bm25' | 'symbol' | 'hybrid'
  symbolName?: string
  language?: string
}

export interface FileContextResult {
  filePath: string
  totalLines: number
  content: string
  symbols: SymbolDef[]
  imports: string[]
  relatedFiles: string[]
}

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  language?: string
  children?: TreeNode[]
}

export interface ProjectStructure {
  projectId: string
  rootName: string
  tree: TreeNode[]
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number>
    topDirectories: string[]
  }
}

export interface SearchCodebaseOptions {
  limit?: number
  language?: string
  filePattern?: string
  semanticWeight?: number // 0.0 to 1.0 (default 0.5)
}
