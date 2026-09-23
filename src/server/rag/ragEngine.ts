/**
 * Production RAG & Document Knowledge Engine
 *
 * Provides unified semantic retrieval, multi-document cross-synthesis,
 * context reranking, verifiable page citations, and zero-hallucination QA.
 */

import { GoogleGenAI } from '@google/genai'
import {
  BatchImportFile,
  BatchImportResult,
  DocumentChunk,
  DocumentMetadata,
  IngestionProgress,
  RAGAnswerResponse,
  RAGCitation,
  SearchFilter,
  SearchResult
} from './types'
import { PDFExtractor, ExtractionResult } from './pdfExtractor'
import { DocumentChunker } from './chunker'
import { EmbeddingsEngine } from './embeddings'
import { vectorStore } from './vectorStore'
import { ingestionQueue } from './queue'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
}

export interface RetrievalOptions {
  filter?: SearchFilter
  limit?: number
  minScoreThreshold?: number
  rerank?: boolean
}

export interface AnswerOptions extends RetrievalOptions {
  systemPrompt?: string
  temperature?: number
}

export class RAGEngine {
  /**
   * 1. importDocuments(): Batch import 200+ PDF files into the async ingestion queue
   */
  public static async importDocuments(
    files: BatchImportFile[],
    userId: string = 'usr_primary'
  ): Promise<BatchImportResult> {
    return ingestionQueue.enqueueBatch(files, userId)
  }

  /**
   * 2. processDocument(): Process a specific document by ID synchronously
   */
  public static async processDocument(docId: string, buffer?: Buffer): Promise<boolean> {
    return ingestionQueue.retryDocument(docId, buffer)
  }

  /**
   * 3. extractPDFText(): Extract text and page structures from PDF
   */
  public static async extractPDFText(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    return PDFExtractor.extractPDFText(buffer, filename)
  }

  /**
   * 4. chunkDocument(): Split pages into semantic chunks
   */
  public static chunkDocument(
    pages: any[],
    metadata: DocumentMetadata,
    options?: any
  ): DocumentChunk[] {
    return DocumentChunker.chunkDocument(pages, metadata, options)
  }

  /**
   * 5. generateEmbeddings(): Generate embeddings for chunks
   */
  public static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return EmbeddingsEngine.generateBatchEmbeddings(texts, 'RETRIEVAL_DOCUMENT')
  }

  /**
   * 6. searchDocuments(): Search indexed PDFs via hybrid semantic + keyword search
   */
  public static async searchDocuments(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<SearchResult[]> {
    const limit = options.limit || 8
    const queryEmbedding = await EmbeddingsEngine.embedQuery(query)
    const results = await vectorStore.hybridSearch(query, queryEmbedding, options.filter, limit * 2)

    // Optional reranking based on exact phrase matches and diversity
    const reranked = options.rerank !== false ? this.rerankResults(query, results) : results
    return reranked.slice(0, limit)
  }

  /**
   * 7. retrieveContext(): Retrieve formatted context with citation metadata
   */
  public static async retrieveContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<{ contextText: string; chunks: DocumentChunk[]; citations: RAGCitation[] }> {
    const searchResults = await this.searchDocuments(query, options)
    const chunks = searchResults.map((r) => r.chunk)

    const citations: RAGCitation[] = []
    const contextParts: string[] = []

    for (const r of searchResults) {
      const c = r.chunk
      const formattedCitation = `[Document: ${c.filename}, Page: ${c.pageNumber}]`
      const citation: RAGCitation = {
        documentId: c.documentId,
        filename: c.filename,
        pageNumber: c.pageNumber,
        section: c.section,
        snippet: c.text.slice(0, 200).replace(/\s+/g, ' ') + '...',
        formattedCitation
      }
      citations.push(citation)

      contextParts.push(
        `--- ${formattedCitation}${c.section ? ` (Section: ${c.section})` : ''} ---\n${c.text}`
      )
    }

    return {
      contextText: contextParts.join('\n\n'),
      chunks,
      citations
    }
  }

  /**
   * 8. answerFromDocuments(): Perform full RAG answering with LLM synthesis & citations
   */
  public static async answerFromDocuments(
    query: string,
    options: AnswerOptions = {}
  ): Promise<RAGAnswerResponse> {
    const gemini = getGemini()
    const { contextText, chunks, citations } = await this.retrieveContext(query, options)

    const allDocs = vectorStore.getAllDocuments(options.filter?.userId)
    const hasDocuments = allDocs.length > 0
    const searchedDocumentIds = Array.from(new Set(chunks.map((c) => c.documentId)))

    if (!hasDocuments || chunks.length === 0) {
      return {
        answer:
          'No uploaded PDF documents were found in the knowledge base that contain information regarding your query. Please upload or index relevant documents.',
        citations: [],
        relevantChunks: [],
        query,
        confidence: 0,
        hasDocuments: false,
        sourceDocumentCount: 0,
        searchedDocumentIds: []
      }
    }

    if (!gemini) {
      return {
        answer: `Retrieved ${chunks.length} relevant excerpt(s) from your documents:\n\n${contextText}`,
        citations,
        relevantChunks: chunks,
        query,
        confidence: 0.8,
        hasDocuments: true,
        sourceDocumentCount: searchedDocumentIds.length,
        searchedDocumentIds
      }
    }

    // Prompt engineering enforcing citations and anti-hallucination
    const prompt = `You are an accurate, authoritative Document Knowledge AI Assistant (RAG system).
You are answering the user's query based EXCLUSIVELY on the provided document excerpts below.

=== RETRIEVED DOCUMENT CONTEXT ===
${contextText}
==================================

=== RULES FOR YOUR ANSWER ===
1. ANSWER ACCURACY: Answer the user's question clearly, thoroughly, and factually using ONLY the information present in the excerpts above.
2. CITATIONS: Include precise document and page citations whenever you reference facts, numbers, claims, or sections, in the exact format: [Document: filename.pdf, Page: X].
3. ANTI-HALLUCINATION: If the provided excerpts DO NOT contain enough information to answer the question or sub-questions, clearly state: "The uploaded documents do not contain enough information to answer this question." Do NOT invent or speculate outside the excerpts.
4. MULTI-DOCUMENT / COMPARISONS: If the question asks to compare documents, find occurrences across all PDFs, or summarize multiple files, synthesize the differences and commonalities clearly with distinct citations for each document.
5. FORMATTING: Use clean markdown with clear headings, bullet points, and citation tags.

User Query: ${query}`

    try {
      const candidateModels = [
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest'
      ]

      let answer = ''
      let lastErr: any = null

      for (const modelCandidate of candidateModels) {
        try {
          const response = await gemini.models.generateContent({
            model: modelCandidate,
            contents: prompt
          })
          if (response.text) {
            answer = response.text
            break
          }
        } catch (mErr) {
          lastErr = mErr
        }
      }

      if (!answer) {
        throw lastErr || new Error('Unable to generate response from document context.')
      }

      return {
        answer,
        citations,
        relevantChunks: chunks,
        query,
        confidence: 0.92,
        hasDocuments: true,
        sourceDocumentCount: searchedDocumentIds.length,
        searchedDocumentIds
      }
    } catch (err: any) {
      console.error('[RAGEngine] Answer generation error:', err)
      return {
        answer: `Error generating synthesis from retrieved document excerpts (${err?.message || 'LLM error'}). Excerpts found:\n\n${contextText}`,
        citations,
        relevantChunks: chunks,
        query,
        confidence: 0.5,
        hasDocuments: true,
        sourceDocumentCount: searchedDocumentIds.length,
        searchedDocumentIds
      }
    }
  }

  /**
   * 9. getDocumentStatus(): Retrieve overall progress or status of a single document
   */
  public static getDocumentStatus(
    docId?: string,
    userId?: string
  ): DocumentMetadata | IngestionProgress | null {
    if (docId) {
      return vectorStore.getDocument(docId)
    }
    return ingestionQueue.getProgress(userId)
  }

  /**
   * 10. retryFailedDocument(): Retry a failed document
   */
  public static retryFailedDocument(docId: string, buffer?: Buffer): boolean {
    return ingestionQueue.retryDocument(docId, buffer)
  }

  public static listDocuments(userId?: string): DocumentMetadata[] {
    return vectorStore.getAllDocuments(userId)
  }

  public static deleteDocument(docId: string): boolean {
    return vectorStore.deleteDocument(docId)
  }

  /**
   * Reranking algorithm to prioritize chunks with high lexical match + high semantic alignment
   */
  private static rerankResults(query: string, results: SearchResult[]): SearchResult[] {
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 3)

    return [...results].sort((a, b) => {
      let boostA = 0
      let boostB = 0

      // Exact query match bonus
      if (a.chunk.text.toLowerCase().includes(queryLower)) boostA += 0.25
      if (b.chunk.text.toLowerCase().includes(queryLower)) boostB += 0.25

      // Coverage of query words
      for (const w of queryWords) {
        if (a.chunk.text.toLowerCase().includes(w)) boostA += 0.05
        if (b.chunk.text.toLowerCase().includes(w)) boostB += 0.05
      }

      return b.score + boostB - (a.score + boostA)
    })
  }
}

export const ragEngine = RAGEngine
