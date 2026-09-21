/**
 * Scalable Document Knowledge / RAG Types & Interfaces
 */

export type DocumentProcessingStatus = 'queued' | 'processing' | 'indexed' | 'failed'

export interface DocumentMetadata {
  documentId: string
  userId: string
  filename: string
  title: string
  pageCount: number
  fileSize: number
  contentType: string
  contentHash: string
  status: DocumentProcessingStatus
  errorReason?: string
  uploadTimestamp: number
  processedTimestamp?: number
  chunkCount: number
  summary?: string
  storagePath?: string
}

export interface ExtractedPage {
  pageNumber: number
  text: string
  section?: string
  hasImages?: boolean
  isOcr?: boolean
}

export interface DocumentChunk {
  id: string
  documentId: string
  userId: string
  filename: string
  title: string
  pageNumber: number
  section?: string
  text: string
  chunkIndex: number
  tokenCount?: number
  contentHash: string
  embedding?: number[]
}

export interface SearchFilter {
  userId?: string
  documentId?: string
  documentIds?: string[]
  filename?: string
  pageNumber?: number
  section?: string
}

export interface SearchResult {
  chunk: DocumentChunk
  score: number
  semanticScore?: number
  keywordScore?: number
  document?: DocumentMetadata
}

export interface RAGCitation {
  documentId: string
  filename: string
  pageNumber: number
  section?: string
  snippet: string
  formattedCitation: string // e.g. "[Document: annual_report.pdf, Page: 23]"
}

export interface RAGAnswerResponse {
  answer: string
  citations: RAGCitation[]
  relevantChunks: DocumentChunk[]
  query: string
  confidence: number
  hasDocuments: boolean
  sourceDocumentCount: number
  searchedDocumentIds: string[]
}

export interface BatchImportFile {
  filename: string
  buffer: Buffer
  contentType?: string
  size?: number
  title?: string
}

export interface BatchImportResult {
  batchId: string
  totalFiles: number
  queuedCount: number
  skippedCount: number
  documents: DocumentMetadata[]
}

export interface IngestionProgress {
  total: number
  queued: number
  processing: number
  indexed: number
  failed: number
  percentComplete: number
  activeFiles: Array<{
    documentId: string
    filename: string
    status: DocumentProcessingStatus
    progressPercent?: number
  }>
}
