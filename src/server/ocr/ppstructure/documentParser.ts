/**
 * PP-Structure Document Parser & Key-Value Extraction Engine
 * Corresponds to PaddleOCR ppstructure/kie/ (Key Information Extraction)
 * Extracts structured form fields, key-value pairs, document metadata, and hierarchy.
 */

import {
  DetectedTable,
  DetectedTextBlock,
  KeyValuePair,
  OcrPageResult,
  StructuredDocumentElement
} from '../types'
import { documentLayoutEngine } from './layout'
import { tableRecognitionEngine } from './tableEngine'

export class DocumentParser {
  /**
   * Parses raw OCR blocks into a comprehensive structured document page
   */
  public parsePage(
    pageNumber: number,
    blocks: DetectedTextBlock[],
    pageWidth: number = 1000,
    pageHeight: number = 1400,
    options?: { enableTable?: boolean; enableStructure?: boolean }
  ): OcrPageResult {
    const sortedBlocks = [...blocks].sort((a, b) => a.readingOrder - b.readingOrder)
    const textLines = sortedBlocks.map((b) => b.text).filter(Boolean)
    const fullPageText = textLines.join('\n')

    const avgConfidence =
      sortedBlocks.length > 0
        ? Number(
            (
              sortedBlocks.reduce((acc, b) => acc + b.confidence, 0) / sortedBlocks.length
            ).toFixed(4)
          )
        : 1.0

    // 1. Structure / Layout Analysis
    const structure: StructuredDocumentElement[] =
      options?.enableStructure !== false
        ? documentLayoutEngine.analyzeLayout(sortedBlocks, pageWidth, pageHeight)
        : []

    // 2. Table Extraction
    const tables: DetectedTable[] =
      options?.enableTable !== false
        ? tableRecognitionEngine.extractTables(sortedBlocks, pageWidth, pageHeight)
        : []

    // 3. Key-Value Extraction
    const keyValues: KeyValuePair[] = this.extractKeyValuePairs(sortedBlocks)

    return {
      pageNumber,
      width: pageWidth,
      height: pageHeight,
      text: fullPageText,
      confidence: avgConfidence,
      blocks: sortedBlocks,
      tables,
      structure,
      keyValues,
      angle: 0
    }
  }

  /**
   * Extracts Key-Value pairs commonly present in invoices, forms, receipts, and specs
   */
  public extractKeyValuePairs(blocks: DetectedTextBlock[]): KeyValuePair[] {
    const kvs: KeyValuePair[] = []
    const kvRegex = /^([^:\n]{2,35}):\s*(.+)$/

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const match = block.text.trim().match(kvRegex)

      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        if (key && value) {
          kvs.push({
            key,
            value,
            confidence: block.confidence,
            keyBox: block.box,
            valueBox: block.box
          })
        }
      } else {
        // Check if key is in this block and value is in the next block horizontally aligned
        const cleanKey = block.text.trim().replace(/:$/, '')
        if (
          block.text.trim().endsWith(':') &&
          cleanKey.length >= 2 &&
          cleanKey.length <= 30 &&
          i + 1 < blocks.length
        ) {
          const nextBlock = blocks[i + 1]
          const yDiff = Math.abs(
            (block.rect ? block.rect[1] : block.box[0][1]) -
              (nextBlock.rect ? nextBlock.rect[1] : nextBlock.box[0][1])
          )
          if (yDiff < 25) {
            kvs.push({
              key: cleanKey,
              value: nextBlock.text.trim(),
              confidence: Number(((block.confidence + nextBlock.confidence) / 2).toFixed(4)),
              keyBox: block.box,
              valueBox: nextBlock.box
            })
            i++ // skip value block
          }
        }
      }
    }

    return kvs
  }
}

export const documentParser = new DocumentParser()
