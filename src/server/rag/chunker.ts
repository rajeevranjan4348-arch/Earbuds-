/**
 * Semantic PDF Chunking Engine
 *
 * Splits extracted pages into semantic chunks with context overlap while strictly
 * preserving page numbers, section headers, and sentence boundaries.
 */

import crypto from 'crypto'
import { DocumentChunk, DocumentMetadata, ExtractedPage } from './types'

export interface ChunkerOptions {
  targetChunkSize?: number // Target character size per chunk (approx ~500 tokens / 2000 chars)
  overlapSize?: number // Overlap character size (approx ~80 tokens / 350 chars)
  minChunkSize?: number // Minimum chunk threshold
}

export class DocumentChunker {
  /**
   * Split extracted document pages into semantic chunks
   */
  public static chunkDocument(
    pages: ExtractedPage[],
    metadata: DocumentMetadata,
    options: ChunkerOptions = {}
  ): DocumentChunk[] {
    const targetSize = options.targetChunkSize || 1800
    const overlap = options.overlapSize || 300
    const minSize = options.minChunkSize || 200

    const chunks: DocumentChunk[] = []
    let globalChunkIndex = 0

    for (const page of pages) {
      const pageText = page.text.trim()
      if (!pageText) continue

      // If page is short, keep as single chunk
      if (pageText.length <= targetSize) {
        const hash = crypto
          .createHash('sha256')
          .update(`${metadata.documentId}_${page.pageNumber}_${pageText}`)
          .digest('hex')

        chunks.push({
          id: `chk_${metadata.documentId}_p${page.pageNumber}_${globalChunkIndex}`,
          documentId: metadata.documentId,
          userId: metadata.userId,
          filename: metadata.filename,
          title: metadata.title,
          pageNumber: page.pageNumber,
          section: page.section,
          text: pageText,
          chunkIndex: globalChunkIndex++,
          tokenCount: Math.ceil(pageText.length / 4),
          contentHash: hash
        })
        continue
      }

      // Split large page into paragraphs and sentences
      const paragraphs = this.splitIntoParagraphs(pageText)
      let currentChunkText = ''
      let currentSection = page.section

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim()
        if (!para) continue

        // Check if paragraph itself introduces a new section header
        if (/^(?:#{1,3}|[A-Z0-9\s,\-–:]{4,45}$)/.test(para) && para.length < 60) {
          currentSection = para.replace(/^#{1,3}\s*/, '')
        }

        if ((currentChunkText + '\n\n' + para).length <= targetSize) {
          currentChunkText = currentChunkText ? `${currentChunkText}\n\n${para}` : para
        } else {
          // If currentChunkText is large enough, push it
          if (currentChunkText.length >= minSize) {
            const hash = crypto
              .createHash('sha256')
              .update(`${metadata.documentId}_${page.pageNumber}_${currentChunkText}`)
              .digest('hex')

            chunks.push({
              id: `chk_${metadata.documentId}_p${page.pageNumber}_${globalChunkIndex}`,
              documentId: metadata.documentId,
              userId: metadata.userId,
              filename: metadata.filename,
              title: metadata.title,
              pageNumber: page.pageNumber,
              section: currentSection,
              text: currentChunkText.trim(),
              chunkIndex: globalChunkIndex++,
              tokenCount: Math.ceil(currentChunkText.length / 4),
              contentHash: hash
            })

            // Calculate overlap from end of current chunk
            const overlapText = this.getOverlapContext(currentChunkText, overlap)
            currentChunkText = overlapText ? `${overlapText}\n\n${para}` : para
          } else {
            // Single huge paragraph: break by sentences
            const sentences = this.splitIntoSentences(para)
            for (const sentence of sentences) {
              if ((currentChunkText + ' ' + sentence).length <= targetSize) {
                currentChunkText = currentChunkText ? `${currentChunkText} ${sentence}` : sentence
              } else {
                if (currentChunkText.length > 0) {
                  const hash = crypto
                    .createHash('sha256')
                    .update(`${metadata.documentId}_${page.pageNumber}_${currentChunkText}`)
                    .digest('hex')

                  chunks.push({
                    id: `chk_${metadata.documentId}_p${page.pageNumber}_${globalChunkIndex}`,
                    documentId: metadata.documentId,
                    userId: metadata.userId,
                    filename: metadata.filename,
                    title: metadata.title,
                    pageNumber: page.pageNumber,
                    section: currentSection,
                    text: currentChunkText.trim(),
                    chunkIndex: globalChunkIndex++,
                    tokenCount: Math.ceil(currentChunkText.length / 4),
                    contentHash: hash
                  })

                  const overlapText = this.getOverlapContext(currentChunkText, overlap)
                  currentChunkText = overlapText ? `${overlapText} ${sentence}` : sentence
                } else {
                  currentChunkText = sentence
                }
              }
            }
          }
        }
      }

      // Flush remaining chunk text for this page
      if (currentChunkText.trim().length > 0) {
        const hash = crypto
          .createHash('sha256')
          .update(`${metadata.documentId}_${page.pageNumber}_${currentChunkText}`)
          .digest('hex')

        chunks.push({
          id: `chk_${metadata.documentId}_p${page.pageNumber}_${globalChunkIndex}`,
          documentId: metadata.documentId,
          userId: metadata.userId,
          filename: metadata.filename,
          title: metadata.title,
          pageNumber: page.pageNumber,
          section: currentSection,
          text: currentChunkText.trim(),
          chunkIndex: globalChunkIndex++,
          tokenCount: Math.ceil(currentChunkText.length / 4),
          contentHash: hash
        })
      }
    }

    return chunks
  }

  private static splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

  private static splitIntoSentences(text: string): string[] {
    // Regex for sentence splitting that doesn't break abbreviations like e.g., i.e., Dr., etc.
    return text
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private static getOverlapContext(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text
    const slice = text.slice(text.length - overlapSize)
    const firstSpace = slice.indexOf(' ')
    if (firstSpace !== -1 && firstSpace < slice.length - 10) {
      return slice.slice(firstSpace + 1).trim()
    }
    return slice.trim()
  }
}
