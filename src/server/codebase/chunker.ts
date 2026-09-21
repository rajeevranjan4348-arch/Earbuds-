/**
 * Claude Context - AST-Aware & Semantic Code Chunker
 * Analyzes source code files across languages, extracting logical units
 * (functions, classes, interfaces, imports, methods) with line boundaries and signatures.
 */

import { createHash } from 'crypto'
import type { CodeChunk, SymbolDef } from './types'

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'py':
    case 'pyw':
      return 'python'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    case 'java':
      return 'java'
    case 'c':
    case 'h':
      return 'c'
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return 'cpp'
    case 'json':
      return 'json'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell'
    case 'sql':
      return 'sql'
    case 'html':
      return 'html'
    case 'css':
    case 'scss':
    case 'less':
      return 'css'
    default:
      return 'text'
  }
}

export function computeSha256(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

export interface ChunkResult {
  chunks: CodeChunk[]
  symbols: SymbolDef[]
  imports: string[]
}

export function chunkFile(filePath: string, content: string): ChunkResult {
  const language = detectLanguage(filePath)
  const lines = content.split(/\r?\n/)
  const totalLines = lines.length

  const chunks: CodeChunk[] = []
  const symbols: SymbolDef[] = []
  const imports: string[] = []

  // Extract all import declarations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (
      line.startsWith('import ') ||
      line.startsWith('from ') ||
      line.startsWith('require(') ||
      line.startsWith('use ')
    ) {
      imports.push(lines[i].trim())
    }
  }

  // 1. Specialized parsing based on language
  if (language === 'typescript' || language === 'javascript') {
    parseJsTsFile(filePath, lines, language, chunks, symbols)
  } else if (language === 'python') {
    parsePythonFile(filePath, lines, language, chunks, symbols)
  } else if (language === 'go') {
    parseGoFile(filePath, lines, language, chunks, symbols)
  } else if (language === 'rust') {
    parseRustFile(filePath, lines, language, chunks, symbols)
  }

  // 2. Fallback / Window chunking if no structural chunks found or for gaps
  if (chunks.length === 0) {
    const windowSize = 60
    const step = 45
    for (let start = 0; start < totalLines; start += step) {
      const end = Math.min(start + windowSize, totalLines)
      const slice = lines.slice(start, end).join('\n')
      if (slice.trim().length > 0) {
        chunks.push({
          id: `${filePath}#L${start + 1}-L${end}`,
          filePath,
          startLine: start + 1,
          endLine: end,
          content: slice,
          type: 'block',
          language,
          hash: computeSha256(slice)
        })
      }
      if (end >= totalLines) break
    }
  }

  return { chunks, symbols, imports }
}

/**
 * JS/TS structural block parser using regex & brace matching
 */
function parseJsTsFile(
  filePath: string,
  lines: string[],
  language: string,
  chunks: CodeChunk[],
  symbols: SymbolDef[]
) {
  const funcRegex =
    /^(?:export\s+)?(?:async\s+)?(?:function\*?\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*function)/
  const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/
  const interfaceRegex = /^(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/
  const typeRegex = /^(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/

  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // Match Classes
    const classMatch = trimmed.match(classRegex)
    if (classMatch) {
      const name = classMatch[1]
      const { endLine, blockContent } = extractBraceBlock(lines, i)
      symbols.push({
        name,
        kind: 'class',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#class:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'class',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }

    // Match Interfaces
    const interfaceMatch = trimmed.match(interfaceRegex)
    if (interfaceMatch) {
      const name = interfaceMatch[1]
      const { endLine, blockContent } = extractBraceBlock(lines, i)
      symbols.push({
        name,
        kind: 'interface',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#interface:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'interface',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }

    // Match Types
    const typeMatch = trimmed.match(typeRegex)
    if (typeMatch) {
      const name = typeMatch[1]
      let end = i
      while (end < lines.length && !lines[end].includes(';') && end - i < 20) {
        end++
      }
      const endLine = Math.min(end + 1, lines.length)
      const blockContent = lines.slice(i, endLine).join('\n')
      symbols.push({
        name,
        kind: 'type',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#type:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'interface',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }

    // Match Functions
    const funcMatch = trimmed.match(funcRegex)
    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3]
      const { endLine, blockContent } = extractBraceBlock(lines, i)
      symbols.push({
        name,
        kind: 'function',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#func:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'function',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }

    i++
  }
}

/**
 * Python indentation-based block parser
 */
function parsePythonFile(
  filePath: string,
  lines: string[],
  language: string,
  chunks: CodeChunk[],
  symbols: SymbolDef[]
) {
  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    if (
      trimmed.startsWith('def ') ||
      trimmed.startsWith('async def ') ||
      trimmed.startsWith('class ')
    ) {
      const isClass = trimmed.startsWith('class ')
      const nameMatch = trimmed.match(/(?:def|class)\s+([a-zA-Z0-9_]+)/)
      const name = nameMatch ? nameMatch[1] : `block_${i + 1}`

      // Get initial indentation
      const baseIndent = rawLine.search(/\S/)
      let end = i + 1
      while (end < lines.length) {
        const nextLine = lines[end]
        if (nextLine.trim().length > 0) {
          const nextIndent = nextLine.search(/\S/)
          if (nextIndent <= baseIndent) {
            break
          }
        }
        end++
      }

      const blockContent = lines.slice(i, end).join('\n')
      symbols.push({
        name,
        kind: isClass ? 'class' : 'function',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#${isClass ? 'class' : 'func'}:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine: end,
        content: blockContent,
        type: isClass ? 'class' : 'function',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = end
      continue
    }
    i++
  }
}

/**
 * Go language parser
 */
function parseGoFile(
  filePath: string,
  lines: string[],
  language: string,
  chunks: CodeChunk[],
  symbols: SymbolDef[]
) {
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('func ')) {
      const nameMatch = trimmed.match(/func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)/)
      const name = nameMatch ? nameMatch[1] : `func_${i + 1}`
      const { endLine, blockContent } = extractBraceBlock(lines, i)
      symbols.push({
        name,
        kind: 'function',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#func:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'function',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }
    i++
  }
}

/**
 * Rust language parser
 */
function parseRustFile(
  filePath: string,
  lines: string[],
  language: string,
  chunks: CodeChunk[],
  symbols: SymbolDef[]
) {
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (
      trimmed.startsWith('fn ') ||
      trimmed.startsWith('pub fn ') ||
      trimmed.startsWith('struct ') ||
      trimmed.startsWith('pub struct ') ||
      trimmed.startsWith('impl ')
    ) {
      const match = trimmed.match(/(?:fn|struct|impl|trait)\s+([a-zA-Z0-9_]+)/)
      const name = match ? match[1] : `rust_${i + 1}`
      const { endLine, blockContent } = extractBraceBlock(lines, i)
      symbols.push({
        name,
        kind: trimmed.includes('struct') ? 'class' : 'function',
        filePath,
        line: i + 1,
        signature: trimmed
      })
      chunks.push({
        id: `${filePath}#rust:${name}:L${i + 1}`,
        filePath,
        startLine: i + 1,
        endLine,
        content: blockContent,
        type: 'function',
        symbolName: name,
        language,
        hash: computeSha256(blockContent)
      })
      i = endLine
      continue
    }
    i++
  }
}

/**
 * Helper to match balanced curly braces across lines
 */
function extractBraceBlock(
  lines: string[],
  startIdx: number
): { endLine: number; blockContent: string } {
  let openBraces = 0
  let foundFirst = false
  let end = startIdx

  for (let idx = startIdx; idx < lines.length; idx++) {
    const line = lines[idx]
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const ch = line[charIdx]
      if (ch === '{') {
        openBraces++
        foundFirst = true
      } else if (ch === '}') {
        openBraces--
      }
    }
    end = idx
    if (foundFirst && openBraces <= 0) {
      break
    }
    // Cap single function extraction to 400 lines
    if (idx - startIdx > 400) {
      break
    }
  }

  const endLine = end + 1
  const blockContent = lines.slice(startIdx, endLine).join('\n')
  return { endLine, blockContent }
}
