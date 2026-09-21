/**
 * Asynchronous Background PDF Ingestion Queue & Worker Engine
 *
 * Efficiently processes 200+ PDF documents in batch with controlled concurrency,
 * progress tracking, error recording, and automatic retry capabilities.
 */

import { EventEmitter } from 'events'
import crypto from 'crypto'
import { BatchImportFile, BatchImportResult, DocumentMetadata, IngestionProgress } from './types'
import { PDFExtractor } from './pdfExtractor'
import { DocumentChunker } from './chunker'
import { EmbeddingsEngine } from './embeddings'
import { vectorStore } from './vectorStore'

interface QueueTask {
  documentId: string
  userId: string
  filename: string
  buffer: Buffer
  fileSize: number
  contentType: string
  retryCount: number
}

export class IngestionQueue extends EventEmitter {
  private static instance: IngestionQueue
  private queue: QueueTask[] = []
  private activeWorkers = 0
  private maxConcurrency = 3
  private isProcessing = false
  private failedTasks = new Map<string, QueueTask>()

  private constructor() {
    super()
  }

  public static getInstance(): IngestionQueue {
    if (!IngestionQueue.instance) {
      IngestionQueue.instance = new IngestionQueue()
    }
    return IngestionQueue.instance
  }

  /**
   * Enqueue a batch of 200+ PDF files
   */
  public enqueueBatch(files: BatchImportFile[], userId: string): BatchImportResult {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const documents: DocumentMetadata[] = []
    let queuedCount = 0
    let skippedCount = 0

    for (const file of files) {
      const buffer = file.buffer
      const contentHash = PDFExtractor.computeHash(buffer)

      // 1. Duplicate check: Skip re-indexing if content hash already exists
      const existing = vectorStore.findDocumentByHash(contentHash)
      if (existing && existing.status === 'indexed') {
        documents.push(existing)
        skippedCount++
        continue
      }

      const documentId =
        existing?.documentId || `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      const metadata: DocumentMetadata = {
        documentId,
        userId: userId || 'usr_primary',
        filename: file.filename,
        title: file.title || file.filename.replace(/\.pdf$/i, ''),
        pageCount: 0,
        fileSize: file.size || buffer.length,
        contentType: file.contentType || 'application/pdf',
        contentHash,
        status: 'queued',
        uploadTimestamp: Date.now(),
        chunkCount: 0
      }

      vectorStore.upsertDocument(metadata)
      documents.push(metadata)

      this.queue.push({
        documentId,
        userId: metadata.userId,
        filename: file.filename,
        buffer,
        fileSize: metadata.fileSize,
        contentType: metadata.contentType,
        retryCount: 0
      })
      queuedCount++
    }

    this.processNext()
    this.emitProgress()

    return {
      batchId,
      totalFiles: files.length,
      queuedCount,
      skippedCount,
      documents
    }
  }

  /**
   * Retry an individual failed document
   */
  public retryDocument(docId: string, buffer?: Buffer): boolean {
    const doc = vectorStore.getDocument(docId)
    if (!doc) return false

    doc.status = 'queued'
    doc.errorReason = undefined
    vectorStore.upsertDocument(doc)

    let taskBuffer = buffer
    if (!taskBuffer) {
      const cached = this.failedTasks.get(docId)
      taskBuffer = cached?.buffer
    }

    if (!taskBuffer) {
      doc.status = 'failed'
      doc.errorReason = 'Missing original file buffer for retry. Please re-upload.'
      vectorStore.upsertDocument(doc)
      return false
    }

    this.queue.push({
      documentId: doc.documentId,
      userId: doc.userId,
      filename: doc.filename,
      buffer: taskBuffer,
      fileSize: doc.fileSize,
      contentType: doc.contentType,
      retryCount: (this.failedTasks.get(docId)?.retryCount || 0) + 1
    })

    this.failedTasks.delete(docId)
    this.processNext()
    this.emitProgress()
    return true
  }

  /**
   * Worker loop with concurrency limit
   */
  private async processNext() {
    if (this.queue.length === 0 || this.activeWorkers >= this.maxConcurrency) {
      return
    }

    this.activeWorkers++
    const task = this.queue.shift()!

    try {
      await this.processSingleTask(task)
    } catch (err: any) {
      console.error(`[IngestionQueue] Unhandled task error for ${task.filename}:`, err)
    } finally {
      this.activeWorkers--
      this.processNext()
      this.emitProgress()
    }
  }

  /**
   * Process single PDF document through Extraction -> Cleaning -> Chunking -> Embedding -> Vector Store
   */
  private async processSingleTask(task: QueueTask) {
    const doc = vectorStore.getDocument(task.documentId)
    if (!doc) return

    try {
      doc.status = 'processing'
      vectorStore.upsertDocument(doc)
      this.emitProgress()

      // 1. Text & Section Extraction (with OCR fallback for scanned PDFs)
      const extractResult = await PDFExtractor.extractPDFText(task.buffer, task.filename)

      doc.title = extractResult.title || doc.title
      doc.pageCount = extractResult.pageCount

      // 2. Semantic Chunking
      const chunks = DocumentChunker.chunkDocument(extractResult.pages, doc)
      doc.chunkCount = chunks.length

      if (chunks.length === 0) {
        throw new Error('No readable text or content could be extracted from document.')
      }

      // 3. Dense Embeddings Generation
      const chunkTexts = chunks.map((c) => c.text)
      const embeddings = await EmbeddingsEngine.generateBatchEmbeddings(
        chunkTexts,
        'RETRIEVAL_DOCUMENT'
      )

      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i]
      }

      // 4. Index in Vector Store
      vectorStore.upsertChunks(chunks)

      // 5. Mark as Indexed
      doc.status = 'indexed'
      doc.processedTimestamp = Date.now()
      doc.errorReason = undefined
      vectorStore.upsertDocument(doc)
      this.failedTasks.delete(task.documentId)
    } catch (err: any) {
      console.error(`[IngestionQueue] Processing failed for ${task.filename}:`, err?.message)
      doc.status = 'failed'
      doc.errorReason = err?.message || 'Processing failed'
      vectorStore.upsertDocument(doc)
      this.failedTasks.set(task.documentId, task)
    }
  }

  /**
   * Calculate current overall progress
   */
  public getProgress(userId?: string): IngestionProgress {
    const allDocs = vectorStore.getAllDocuments(userId)
    const total = allDocs.length
    let queued = 0
    let processing = 0
    let indexed = 0
    let failed = 0

    for (const d of allDocs) {
      if (d.status === 'queued') queued++
      else if (d.status === 'processing') processing++
      else if (d.status === 'indexed') indexed++
      else if (d.status === 'failed') failed++
    }

    const completed = indexed + failed
    const percent = total > 0 ? Math.round((completed / total) * 100) : 100

    const activeFiles = allDocs
      .filter((d) => d.status === 'processing' || d.status === 'queued')
      .slice(0, 10)
      .map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        status: d.status
      }))

    return {
      total,
      queued,
      processing,
      indexed,
      failed,
      percentComplete: percent,
      activeFiles
    }
  }

  private emitProgress() {
    this.emit('progress', this.getProgress())
  }
}

export const ingestionQueue = IngestionQueue.getInstance()
