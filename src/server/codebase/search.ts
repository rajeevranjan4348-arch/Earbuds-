/**
 * Claude Context - Hybrid Code Search Engine (BM25 + Dense Semantic + Symbol Graph)
 * Combines lexical BM25 token relevance, symbol resolution, and semantic embeddings
 * to retrieve the minimum useful context with high precision.
 */

import type { CodeChunk, SearchCodebaseOptions, SearchResult, SymbolDef } from './types'

/**
 * Tokenizes code and query string into normalized subwords
 * Handles camelCase, snake_case, dot.notation, and code punctuation
 */
export function tokenizeCode(text: string): string[] {
  const words = text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .replace(/[._\-/\\#:]/g, ' ') // split snake/kebab/dots
    .toLowerCase()
    .split(/[^a-zA-Z0-9$]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))

  return words
}

const STOP_WORDS = new Set([
  'the',
  'is',
  'at',
  'which',
  'on',
  'a',
  'an',
  'and',
  'or',
  'in',
  'with',
  'to',
  'for',
  'of',
  'by'
])

/**
 * BM25 Inverted Index & Scoring over CodeChunks
 */
export class BM25Engine {
  private docLengths: number[] = []
  private avgDocLength: number = 0
  private docFrequencies: Map<string, number> = new Map()
  private chunkTokens: string[][] = []
  private k1: number = 1.2
  private b: number = 0.75

  constructor(private chunks: CodeChunk[]) {
    this.buildIndex()
  }

  private buildIndex() {
    let totalLen = 0
    this.chunks.forEach((chunk) => {
      // Index content + file path + symbol name
      const text = `${chunk.filePath} ${chunk.symbolName || ''} ${chunk.content}`
      const tokens = tokenizeCode(text)
      this.chunkTokens.push(tokens)
      this.docLengths.push(tokens.length)
      totalLen += tokens.length

      const uniqueTokens = new Set(tokens)
      uniqueTokens.forEach((t) => {
        this.docFrequencies.set(t, (this.docFrequencies.get(t) || 0) + 1)
      })
    })
    this.avgDocLength = this.chunks.length > 0 ? totalLen / this.chunks.length : 1
  }

  public scoreQuery(query: string): number[] {
    const qTokens = tokenizeCode(query)
    const nDocs = this.chunks.length
    if (nDocs === 0 || qTokens.length === 0) return new Array(nDocs).fill(0)

    const scores = new Array(nDocs).fill(0)

    qTokens.forEach((term) => {
      const df = this.docFrequencies.get(term) || 0
      if (df === 0) return

      // Standard Lucene IDF
      const idf = Math.log(1 + (nDocs - df + 0.5) / (df + 0.5))

      for (let i = 0; i < nDocs; i++) {
        const docTokens = this.chunkTokens[i]
        const tf = docTokens.filter((t) => t === term).length
        if (tf === 0) continue

        const docLen = this.docLengths[i]
        const termScore =
          idf *
          ((tf * (this.k1 + 1)) /
            (tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength))))
        scores[i] += termScore
      }
    })

    return scores
  }
}

/**
 * Computes cosine similarity between two vector embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}

/**
 * Fast character/subword n-gram vector for zero-dependency semantic similarity
 */
export function computeSubwordVector(text: string, dim = 128): number[] {
  const vec = new Array(dim).fill(0)
  const norm = text.toLowerCase().slice(0, 1000)
  for (let i = 0; i < norm.length - 2; i++) {
    const gram = norm.charCodeAt(i) * 31 + norm.charCodeAt(i + 1) * 7 + norm.charCodeAt(i + 2)
    const idx = Math.abs(gram) % dim
    vec[idx] += 1
  }
  // Normalize
  let sumSq = 0
  for (let i = 0; i < dim; i++) sumSq += vec[i] * vec[i]
  const len = Math.sqrt(sumSq) || 1
  return vec.map((v) => v / len)
}

/**
 * Executes hybrid code search combining BM25, symbol matching, and semantic similarity
 */
export function searchCodebase(
  chunks: CodeChunk[],
  symbols: SymbolDef[],
  query: string,
  options: SearchCodebaseOptions = {}
): SearchResult[] {
  const limit = options.limit || 8
  if (!chunks || chunks.length === 0 || !query.trim()) return []

  const bm25Engine = new BM25Engine(chunks)
  const bm25Scores = bm25Engine.scoreQuery(query)

  const qTokens = tokenizeCode(query)
  const qVec = computeSubwordVector(query)

  // Pre-index symbols for exact boost
  const symbolMap = new Map<string, SymbolDef>()
  symbols.forEach((s) => {
    symbolMap.set(s.name.toLowerCase(), s)
  })

  const results: SearchResult[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // Language filter if requested
    if (options.language && chunk.language !== options.language) {
      continue
    }

    // File path filter if requested
    if (options.filePattern && !chunk.filePath.includes(options.filePattern)) {
      continue
    }

    const bm25 = bm25Scores[i]

    // Semantic vector similarity
    const chunkVec = chunk.embedding || computeSubwordVector(chunk.content)
    const semanticSim = cosineSimilarity(qVec, chunkVec)

    // Symbol match bonus
    let symbolBonus = 0
    if (chunk.symbolName) {
      const symLower = chunk.symbolName.toLowerCase()
      if (qTokens.includes(symLower) || query.toLowerCase().includes(symLower)) {
        symbolBonus = 2.5
      }
    }

    // File path relevance bonus
    let pathBonus = 0
    const pathLower = chunk.filePath.toLowerCase()
    qTokens.forEach((t) => {
      if (pathLower.includes(t)) {
        pathBonus += 0.5
      }
    })

    // Hybrid combined score
    const combinedScore = bm25 * 0.5 + semanticSim * 1.5 + symbolBonus + pathBonus

    if (combinedScore > 0.05 || bm25 > 0.1 || symbolBonus > 0) {
      results.push({
        chunkId: chunk.id,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        snippet: chunk.content,
        score: Number(combinedScore.toFixed(4)),
        matchType: symbolBonus > 0 ? 'symbol' : bm25 > 1.0 ? 'hybrid' : 'semantic',
        symbolName: chunk.symbolName,
        language: chunk.language
      })
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  // Deduplicate overlapping spans within the same file
  const filtered: SearchResult[] = []
  for (const res of results) {
    const overlap = filtered.find(
      (f) =>
        f.filePath === res.filePath &&
        Math.abs(f.startLine - res.startLine) < 15 &&
        Math.abs(f.endLine - res.endLine) < 15
    )
    if (!overlap) {
      filtered.push(res)
    }
    if (filtered.length >= limit) break
  }

  return filtered
}

/**
 * Finds all symbol definitions matching a symbol name
 */
export function findSymbolInIndex(symbols: SymbolDef[], name: string): SymbolDef[] {
  const norm = name.toLowerCase().trim()
  return symbols.filter((s) => {
    const sNorm = s.name.toLowerCase()
    return sNorm === norm || sNorm.endsWith(norm) || sNorm.includes(norm)
  })
}

/**
 * Finds all references/usages of a symbol across chunks
 */
export function findReferencesInIndex(
  chunks: CodeChunk[],
  symbolName: string,
  limit = 10
): SearchResult[] {
  const query = symbolName.trim()
  const regex = new RegExp(`\\b${query}\\b`, 'g')

  const matches: SearchResult[] = []
  for (const chunk of chunks) {
    if (chunk.symbolName === query && chunk.type !== 'block') {
      // This is the definition itself, lower priority or handle separately
      continue
    }
    const count = (chunk.content.match(regex) || []).length
    if (count > 0) {
      matches.push({
        chunkId: chunk.id,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        snippet: chunk.content,
        score: count,
        matchType: 'symbol',
        symbolName: chunk.symbolName,
        language: chunk.language
      })
    }
    if (matches.length >= limit) break
  }

  matches.sort((a, b) => b.score - a.score)
  return matches
}
