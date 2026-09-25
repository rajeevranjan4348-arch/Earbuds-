/**
 * PDF & Multi-Page Document Processor for PaddleOCR Engine
 * Handles digital PDF text layer extraction, multi-page chunking,
 * and page-by-page bounding box & structure synthesis.
 */

import pdfParse from 'pdf-parse'
import { DetectedTextBlock, OcrPageResult } from './types'
import { assembleTextBlocks } from './ppocr/recognition'
import { documentParser } from './ppstructure/documentParser'

export class PdfProcessor {
  /**
   * Checks whether the given buffer represents a PDF document
   */
  public isPdf(buffer: Buffer): boolean {
    if (buffer.length < 5) return false
    // Check for PDF magic numbers '%PDF-'
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46
  }

  /**
   * Processes a PDF document through the PaddleOCR document understanding pipeline
   */
  public async processPdf(
    buffer: Buffer,
    options?: {
      maxPages?: number
      language?: string
      enableTable?: boolean
      enableStructure?: boolean
    }
  ): Promise<OcrPageResult[]> {
    const pagesResult: OcrPageResult[] = []

    try {
      const data = await pdfParse(buffer, {
        max: options?.maxPages || 20
      })

      const numPages = data.numpages || 1
      const rawText = data.text || ''

      // Split text by standard PDF form feed (\f) or page breaks
      let pageChunks = rawText.split(/\f|\n--- Page \d+ ---\n/)
      if (pageChunks.length === 1 && numPages > 1) {
        // Fallback split evenly by lines
        const lines = rawText.split('\n')
        const linesPerPage = Math.max(1, Math.ceil(lines.length / numPages))
        pageChunks = []
        for (let p = 0; p < numPages; p++) {
          pageChunks.push(lines.slice(p * linesPerPage, (p + 1) * linesPerPage).join('\n'))
        }
      }

      const totalPagesToProcess = Math.min(pageChunks.length, options?.maxPages || 20)

      for (let pIdx = 0; pIdx < totalPagesToProcess; pIdx++) {
        const pageText = pageChunks[pIdx] || ''
        const lines = pageText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)

        const simulatedBlocks: Array<{
          box: [[number, number], [number, number], [number, number], [number, number]]
          text: string
          confidence: number
        }> = []

        const pageWidth = 800
        const pageHeight = 1100
        const lineHeight = Math.max(18, Math.min(32, Math.floor(pageHeight / (lines.length + 5))))

        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          const line = lines[lIdx]
          const topY = 60 + lIdx * lineHeight
          const bottomY = topY + lineHeight - 4
          const leftX = 50
          const approxCharWidth = 8
          const rightX = Math.min(pageWidth - 50, leftX + line.length * approxCharWidth)

          simulatedBlocks.push({
            box: [
              [leftX, topY],
              [rightX, topY],
              [rightX, bottomY],
              [leftX, bottomY]
            ],
            text: line,
            confidence: 0.96
          })
        }

        const blocks: DetectedTextBlock[] = assembleTextBlocks(
          simulatedBlocks,
          options?.language || 'en'
        )

        const parsedPage = documentParser.parsePage(
          pIdx + 1,
          blocks,
          pageWidth,
          pageHeight,
          options
        )

        pagesResult.push(parsedPage)
      }
    } catch (err: any) {
      console.warn('[PdfProcessor] Error reading digital text from PDF:', err?.message)
    }

    return pagesResult
  }
}

export const pdfProcessor = new PdfProcessor()
