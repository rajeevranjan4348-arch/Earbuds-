/**
 * Client-Side RAG & PDF Document Knowledge Service
 *
 * Provides clean frontend interfaces for batch importing 200+ PDFs,
 * tracking ingestion status, executing hybrid semantic search, and
 * querying document knowledge with verified page citations.
 */

export interface DocumentMetadata {
  documentId: string
  userId: string
  filename: string
  title: string
  pageCount: number
  fileSize: number
  contentType: string
  contentHash: string
  status: 'queued' | 'processing' | 'indexed' | 'failed'
  errorReason?: string
  uploadTimestamp: number
  processedTimestamp?: number
  chunkCount: number
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
    status: string
    progressPercent?: number
  }>
}

export interface RAGCitation {
  documentId: string
  filename: string
  pageNumber: number
  section?: string
  snippet: string
  formattedCitation: string
}

export interface RAGAnswerResponse {
  answer: string
  citations: RAGCitation[]
  relevantChunks: any[]
  query: string
  confidence: number
  hasDocuments: boolean
  sourceDocumentCount: number
  searchedDocumentIds: string[]
}

class RAGClientService {
  /**
   * Batch import multiple PDF files (200+ files supported)
   */
  public async importDocuments(
    files: File[],
    userId: string = 'usr_primary'
  ): Promise<{
    success: boolean
    totalFiles: number
    queuedCount: number
    skippedCount: number
    message?: string
  }> {
    const filePayloads = await Promise.all(
      files.map(async (file) => {
        const base64 = await this.fileToBase64(file)
        return {
          filename: file.name,
          contentBase64: base64,
          contentType: file.type || 'application/pdf',
          size: file.size
        }
      })
    )

    const response = await fetch('/api/rag/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: filePayloads, userId })
    })

    return response.json()
  }

  /**
   * Get overall ingestion progress & queue status
   */
  public async getProgress(userId: string = 'usr_primary'): Promise<IngestionProgress | null> {
    try {
      const response = await fetch(`/api/rag/status?userId=${encodeURIComponent(userId)}`)
      const data = await response.json()
      return data.success ? data.progress : null
    } catch {
      return null
    }
  }

  /**
   * List all indexed documents
   */
  public async listDocuments(userId?: string): Promise<DocumentMetadata[]> {
    try {
      const url = userId
        ? `/api/rag/documents?userId=${encodeURIComponent(userId)}`
        : '/api/rag/documents'
      const response = await fetch(url)
      const data = await response.json()
      return data.success ? data.documents : []
    } catch {
      return []
    }
  }

  /**
   * Perform hybrid semantic search across documents
   */
  public async searchDocuments(
    query: string,
    filter?: { filename?: string; section?: string; userId?: string },
    limit: number = 8
  ): Promise<any[]> {
    const response = await fetch('/api/rag/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filter, limit })
    })
    const data = await response.json()
    return data.success ? data.results : []
  }

  /**
   * Ask a question against the document knowledge base
   */
  public async askDocuments(
    question: string,
    filter?: { filename?: string; userId?: string },
    limit: number = 8
  ): Promise<RAGAnswerResponse> {
    const response = await fetch('/api/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, filter, limit })
    })
    return response.json()
  }

  /**
   * Retry a failed document
   */
  public async retryDocument(documentId: string): Promise<boolean> {
    const response = await fetch('/api/rag/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId })
    })
    const data = await response.json()
    return data.success
  }

  /**
   * Get detailed chunks and metadata for a specific document
   */
  public async getDocumentDetails(documentId: string): Promise<{
    success: boolean
    document?: DocumentMetadata
    chunkCount?: number
    chunks?: any[]
    error?: string
  }> {
    try {
      const response = await fetch(`/api/rag/documents/${encodeURIComponent(documentId)}`)
      return await response.json()
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to retrieve document details' }
    }
  }

  /**
   * Delete a document and its vectors
   */
  public async deleteDocument(documentId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/rag/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      return data.success
    } catch {
      return false
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}

export const ragService = new RAGClientService()
