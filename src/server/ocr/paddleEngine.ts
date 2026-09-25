/**
 * Unified PaddleOCR & PP-Structure Engine
 * Complete OCR & document understanding engine exposing text detection,
 * recognition, direction classification, table recognition, PDF processing,
 * and structured JSON normalization.
 */

import {
  DetectedTable,
  KeyValuePair,
  OcrDocumentResult,
  OcrPageResult,
  PaddleEngineStatus,
  PaddleOcrConfig,
  StructuredDocumentElement
} from './types'
import { modelManager } from './modelManager'
import { pdfProcessor } from './pdfProcessor'

export class PaddleOcrEngine {
  private startTime = Date.now()

  /**
   * Primary OCR inference entry point for Images and PDFs.
   * Accepts Buffer or base64 string (with or without data URI prefix).
   */
  public async ocr(
    input: Buffer | string,
    options?: Partial<PaddleOcrConfig>
  ): Promise<OcrDocumentResult> {
    const startMs = Date.now()
    const { buffer, mimeType } = this.normalizeInput(input)
    const config = { ...modelManager.getConfig(), ...options }

    let pages: OcrPageResult[] = []

    // 1. Check if input is a PDF document
    if (mimeType === 'application/pdf' || pdfProcessor.isPdf(buffer)) {
      pages = await pdfProcessor.processPdf(buffer, {
        maxPages: config.pdfPages || 20,
        language: config.language,
        enableTable: config.enableTable,
        enableStructure: config.enableStructure
      })

      // If PDF digital text was empty, perform visual OCR
      if (pages.length === 0 || (pages.length === 1 && pages[0].text.trim().length === 0)) {
        const visualPage = await modelManager.executeOcrInference(
          buffer,
          'application/pdf',
          config
        )
        pages = [visualPage]
      }
    } else {
      // 2. Image OCR inference (JPEG, PNG, WEBP, TIFF, BMP)
      const visualPage = await modelManager.executeOcrInference(buffer, mimeType, config)
      pages = [visualPage]
    }

    // Aggregate results across all pages
    const fullText = pages.map((p) => p.text).join('\n\n')
    const allTables: DetectedTable[] = pages.flatMap((p) => p.tables)
    const allKeyValues: KeyValuePair[] = pages.flatMap((p) => p.keyValues)
    const allStructure: StructuredDocumentElement[] = pages.flatMap((p) => p.structure)

    const totalConfidence =
      pages.length > 0
        ? pages.reduce((acc, p) => acc + p.confidence, 0) / pages.length
        : 1.0

    const processingTimeMs = Date.now() - startMs

    return {
      engine: config.enableStructure ? 'PaddleOCR-PP-Structure' : 'PaddleOCR-PP-OCRv4',
      version: 'PP-OCRv4.2',
      device: config.useGpu ? 'gpu' : 'cpu',
      language: config.language,
      pageCount: pages.length,
      pages,
      fullText,
      confidence: Number(totalConfidence.toFixed(4)),
      tables: allTables,
      keyValues: allKeyValues,
      documentStructure: allStructure,
      processingTimeMs,
      metadata: {
        fileSizeBytes: buffer.length,
        mimeType
      }
    }
  }

  /**
   * Document-understanding pipeline with deep key-value extraction and layout hierarchy
   */
  public async parseDocument(
    input: Buffer | string,
    options?: Partial<PaddleOcrConfig>
  ): Promise<OcrDocumentResult> {
    return this.ocr(input, {
      ...options,
      enableTable: true,
      enableStructure: true
    })
  }

  /**
   * Dedicated table recognition and HTML/Markdown reconstruction
   */
  public async recognizeTable(
    input: Buffer | string,
    options?: Partial<PaddleOcrConfig>
  ): Promise<DetectedTable[]> {
    const result = await this.ocr(input, {
      ...options,
      enableTable: true
    })
    return result.tables
  }

  /**
   * Returns current operational status, models, and metrics
   */
  public getStatus(): PaddleEngineStatus {
    const config = modelManager.getConfig()
    return {
      initialized: true,
      engine: 'PaddleOCR-PP-OCRv4',
      version: '4.2.0',
      device: config.useGpu ? 'gpu' : 'cpu',
      supportedLanguages: [
        'en',
        'ch',
        'latin',
        'devanagari',
        'japan',
        'korean',
        'french',
        'german',
        'multilingual'
      ],
      activeLanguage: config.language,
      modelLoaded: true,
      models: {
        det: 'ch_PP-OCRv4_det_infer',
        rec: config.language === 'ch' ? 'ch_PP-OCRv4_rec_infer' : 'en_PP-OCRv4_rec_infer',
        cls: 'ch_ppocr_mobile_v2.0_cls_infer',
        table: 'ch_ppstructure_mobile_v2.0_SLANet_infer',
        layout: 'picodet_lcnet_x1_0_layout_infer'
      },
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      totalInferences: modelManager.getTotalInferences(),
      averageLatencyMs: modelManager.getAverageLatency()
    }
  }

  /**
   * Updates runtime configuration
   */
  public updateConfig(newConfig: Partial<PaddleOcrConfig>): PaddleOcrConfig {
    return modelManager.updateConfig(newConfig)
  }

  /**
   * Normalizes incoming input (Base64 string or Buffer)
   */
  private normalizeInput(input: Buffer | string): { buffer: Buffer; mimeType: string } {
    if (Buffer.isBuffer(input)) {
      // Guess mime type from buffer header
      let mimeType = 'image/jpeg'
      if (pdfProcessor.isPdf(input)) {
        mimeType = 'application/pdf'
      } else if (input.length > 8 && input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4e && input[3] === 0x47) {
        mimeType = 'image/png'
      } else if (input.length > 12 && input.subarray(8, 12).toString() === 'WEBP') {
        mimeType = 'image/webp'
      }
      return { buffer: input, mimeType }
    }

    if (typeof input === 'string') {
      const trimmed = input.trim()

      // Check if data URI: data:image/png;base64,....
      const match = trimmed.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        const mimeType = match[1]
        const base64Data = match[2]
        return {
          buffer: Buffer.from(base64Data, 'base64'),
          mimeType
        }
      }

      // Check if pure base64
      try {
        const buffer = Buffer.from(trimmed, 'base64')
        let mimeType = 'image/jpeg'
        if (pdfProcessor.isPdf(buffer)) {
          mimeType = 'application/pdf'
        }
        return { buffer, mimeType }
      } catch (_e) {
        // Assume UTF-8 string buffer
        return { buffer: Buffer.from(trimmed, 'utf-8'), mimeType: 'text/plain' }
      }
    }

    throw new Error('Unsupported input format for OCR: expected Buffer or base64 string')
  }
}

export const paddleOcrEngine = new PaddleOcrEngine()
