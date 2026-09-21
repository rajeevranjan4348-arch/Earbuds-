/**
 * Scalable Vector Store & Hybrid Search Index
 *
 * Manages document metadata, chunk vector embeddings, duplicate content detection,
 * disk-backed persistent storage, and hybrid search (Dense Vector + BM25 Keyword Search).
 */

import fs from 'fs'
import path from 'path'
import { DocumentChunk, DocumentMetadata, SearchFilter, SearchResult } from './types'
import { EmbeddingsEngine } from './embeddings'

export class VectorStore {
  private static instance: VectorStore
  private storageDir: string
  private documentsFile: string
  private chunksFile: string

  private documents = new Map<string, DocumentMetadata>()
  private chunks = new Map<string, DocumentChunk>()
  private hashToDocId = new Map<string, string>() // contentHash -> documentId
  private isLoaded = false

  private constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'rag_store')
    this.documentsFile = path.join(this.storageDir, 'documents.json')
    this.chunksFile = path.join(this.storageDir, 'chunks.json')
    this.initStorage()
  }

  public static getInstance(): VectorStore {
    if (!VectorStore.instance) {
      VectorStore.instance = new VectorStore()
    }
    return VectorStore.instance
  }

  private initStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
      this.loadFromDisk()
    } catch (e) {
      console.warn('[VectorStore] Storage init notice:', e)
    }
  }

  private loadFromDisk() {
    if (this.isLoaded) return
    try {
      if (fs.existsSync(this.documentsFile)) {
        const rawDocs = fs.readFileSync(this.documentsFile, 'utf8')
        const parsedDocs: DocumentMetadata[] = JSON.parse(rawDocs)
        if (Array.isArray(parsedDocs)) {
          for (const doc of parsedDocs) {
            this.documents.set(doc.documentId, doc)
            if (doc.contentHash) {
              this.hashToDocId.set(doc.contentHash, doc.documentId)
            }
          }
        }
      }

      if (fs.existsSync(this.chunksFile)) {
        const rawChunks = fs.readFileSync(this.chunksFile, 'utf8')
        const parsedChunks: DocumentChunk[] = JSON.parse(rawChunks)
        if (Array.isArray(parsedChunks)) {
          for (const chunk of parsedChunks) {
            this.chunks.set(chunk.id, chunk)
          }
        }
      }
      this.isLoaded = true
    } catch (err) {
      console.warn('[VectorStore] Load from disk error:', err)
      this.isLoaded = true
    }
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
      const docsArray = Array.from(this.documents.values())
      const chunksArray = Array.from(this.chunks.values())

      fs.writeFileSync(this.documentsFile, JSON.stringify(docsArray, null, 2), 'utf8')
      fs.writeFileSync(this.chunksFile, JSON.stringify(chunksArray, null, 2), 'utf8')
    } catch (err) {
      console.error('[VectorStore] Save to disk error:', err)
    }
  }

  /**
   * Check if a document with identical content hash already exists
   */
  public findDocumentByHash(contentHash: string): DocumentMetadata | null {
    const docId = this.hashToDocId.get(contentHash)
    if (docId && this.documents.has(docId)) {
      return this.documents.get(docId)!
    }
    return null
  }

  public getDocument(docId: string): DocumentMetadata | null {
    return this.documents.get(docId) || null
  }

  public getAllDocuments(userId?: string): DocumentMetadata[] {
    const docs = Array.from(this.documents.values())
    if (userId) {
      return docs.filter((d) => d.userId === userId)
    }
    return docs
  }

  public getChunksByDocument(docId: string): DocumentChunk[] {
    return Array.from(this.chunks.values()).filter((c) => c.documentId === docId)
  }

  public upsertDocument(metadata: DocumentMetadata) {
    this.documents.set(metadata.documentId, metadata)
    if (metadata.contentHash) {
      this.hashToDocId.set(metadata.contentHash, metadata.documentId)
    }
    this.saveToDisk()
  }

  public upsertChunks(newChunks: DocumentChunk[]) {
    for (const chunk of newChunks) {
      this.chunks.set(chunk.id, chunk)
    }
    this.saveToDisk()
  }

  public deleteDocument(docId: string): boolean {
    const doc = this.documents.get(docId)
    if (!doc) return false

    if (doc.contentHash) {
      this.hashToDocId.delete(doc.contentHash)
    }
    this.documents.delete(docId)

    // Remove all associated chunks
    for (const [chunkId, chunk] of this.chunks.entries()) {
      if (chunk.documentId === docId) {
        this.chunks.delete(chunkId)
      }
    }

    this.saveToDisk()
    return true
  }

  /**
   * Hybrid Vector + Keyword Search with Metadata Filtering
   */
  public async hybridSearch(
    query: string,
    queryEmbedding: number[],
    filter?: SearchFilter,
    limit: number = 8
  ): Promise<SearchResult[]> {
    const allChunks = Array.from(this.chunks.values())
    const queryTokens = this.tokenize(query)

    // 1. Filter chunks by metadata
    const filteredChunks = allChunks.filter((chunk) => {
      if (filter?.userId && chunk.userId !== filter.userId) return false
      if (filter?.documentId && chunk.documentId !== filter.documentId) return false
      if (
        filter?.documentIds &&
        filter.documentIds.length > 0 &&
        !filter.documentIds.includes(chunk.documentId)
      ) {
        return false
      }
      if (filter?.filename && chunk.filename.toLowerCase() !== filter.filename.toLowerCase())
        return false
      if (filter?.pageNumber && chunk.pageNumber !== filter.pageNumber) return false
      if (
        filter?.section &&
        chunk.section &&
        !chunk.section.toLowerCase().includes(filter.section.toLowerCase())
      ) {
        return false
      }
      return true
    })

    if (filteredChunks.length === 0) return []

    // 2. Score chunks via Semantic Vector Similarity & Keyword Matching
    const scoredChunks: SearchResult[] = []

    for (const chunk of filteredChunks) {
      let semanticScore = 0
      if (chunk.embedding && queryEmbedding && queryEmbedding.length > 0) {
        semanticScore = EmbeddingsEngine.cosineSimilarity(queryEmbedding, chunk.embedding)
      }

      // Keyword BM25 / TF scoring
      const keywordScore = this.computeKeywordScore(queryTokens, chunk.text)

      // Hybrid combination (70% Semantic + 30% Keyword)
      const combinedScore = semanticScore * 0.7 + keywordScore * 0.3

      const docMeta = this.documents.get(chunk.documentId)

      scoredChunks.push({
        chunk,
        score: combinedScore,
        semanticScore,
        keywordScore,
        document: docMeta
      })
    }

    // 3. Sort by relevance and take top N
    scoredChunks.sort((a, b) => b.score - a.score)
    return scoredChunks.slice(0, limit)
  }

  /**
   * Pure keyword search
   */
  public keywordSearch(query: string, filter?: SearchFilter, limit: number = 8): SearchResult[] {
    const queryTokens = this.tokenize(query)
    const allChunks = Array.from(this.chunks.values())

    const filtered = allChunks.filter((chunk) => {
      if (filter?.userId && chunk.userId !== filter.userId) return false
      if (filter?.documentId && chunk.documentId !== filter.documentId) return false
      if (
        filter?.documentIds &&
        filter.documentIds.length > 0 &&
        !filter.documentIds.includes(chunk.documentId)
      ) {
        return false
      }
      return true
    })

    const results: SearchResult[] = []
    for (const chunk of filtered) {
      const kwScore = this.computeKeywordScore(queryTokens, chunk.text)
      if (kwScore > 0.05) {
        results.push({
          chunk,
          score: kwScore,
          keywordScore: kwScore,
          document: this.documents.get(chunk.documentId)
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || []
  }

  private computeKeywordScore(queryTokens: string[], chunkText: string): number {
    if (queryTokens.length === 0) return 0
    const lowerText = chunkText.toLowerCase()
    let matches = 0

    for (const token of queryTokens) {
      if (lowerText.includes(token)) {
        matches += 1
        // Exact whole-word bonus
        const regex = new RegExp(`\\b${token}\\b`, 'i')
        if (regex.test(lowerText)) {
          matches += 0.5
        }
      }
    }

    return Math.min(matches / (queryTokens.length * 1.5), 1.0)
  }
}

export const vectorStore = VectorStore.getInstance()
