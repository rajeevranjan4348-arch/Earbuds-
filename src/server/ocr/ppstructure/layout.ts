/**
 * PP-Structure Document Layout Analysis Engine
 * Corresponds to PaddleOCR ppstructure/layout/
 * Segments document images into semantic layout elements:
 * Titles, Headers, Paragraphs, Tables, Figures, Lists, Footers.
 */

import {
  DetectedTextBlock,
  DocumentElementType,
  StructuredDocumentElement
} from '../types'
import { polygonToRect } from '../ppocr/recognition'

export class DocumentLayoutEngine {
  /**
   * Analyzes spatial distribution and typography of OCR blocks to detect document structure
   */
  public analyzeLayout(
    blocks: DetectedTextBlock[],
    pageWidth: number,
    pageHeight: number
  ): StructuredDocumentElement[] {
    if (blocks.length === 0) return []

    const elements: StructuredDocumentElement[] = []
    const sorted = [...blocks].sort((a, b) => a.readingOrder - b.readingOrder)

    // Calculate median block height and width
    const heights = sorted.map((b) => (b.rect ? b.rect[3] : 20)).sort((a, b) => a - b)
    const medianHeight = heights[Math.floor(heights.length / 2)] || 20

    for (let i = 0; i < sorted.length; i++) {
      const block = sorted[i]
      const rect = block.rect || polygonToRect(block.box)
      const [, y, , height] = rect
      const relativeY = y / Math.max(1, pageHeight)

      let type: DocumentElementType = 'paragraph'
      let level: number | undefined

      // Top header detection (top 6% of page or page numbers)
      if (relativeY < 0.07 && (block.text.length < 40 || /^\d+$/.test(block.text.trim()))) {
        type = 'header'
      }
      // Bottom footer detection (bottom 7% of page)
      else if (relativeY > 0.92) {
        type = 'footer'
      }
      // Title detection (significantly taller text or all-caps header words)
      else if (height > medianHeight * 1.35 || this.isLikelyHeading(block.text)) {
        type = 'title'
        level = height > medianHeight * 1.8 ? 1 : 2
      }
      // List items
      else if (/^(\d+[.)]|[-•*])\s+/.test(block.text.trim())) {
        type = 'list'
      }
      // Key-Value forms (e.g., "Date: 2026-09-24" or "Total: $15.50")
      else if (/^[A-Za-z\s]{2,25}\s*:\s*.+$/.test(block.text.trim())) {
        type = 'key_value'
      }

      elements.push({
        id: `elem_${i + 1}`,
        type,
        text: block.text,
        confidence: block.confidence,
        box: block.box,
        level,
        metadata: {
          readingOrder: block.readingOrder,
          heightRatio: Number((height / medianHeight).toFixed(2))
        }
      })
    }

    return elements
  }

  private isLikelyHeading(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.length < 3 || trimmed.length > 70) return false
    // All capital letters without terminal punctuation
    if (trimmed === trimmed.toUpperCase() && !/[.!?]$/.test(trimmed) && /[A-Z]/.test(trimmed)) {
      return true
    }
    // Section headers like "Section 1.", "Chapter 3", "Introduction"
    if (/^(SECTION|CHAPTER|PART|ARTICLE|INDEX|SUMMARY|APPENDIX)\b/i.test(trimmed)) {
      return true
    }
    return false
  }
}

export const documentLayoutEngine = new DocumentLayoutEngine()
