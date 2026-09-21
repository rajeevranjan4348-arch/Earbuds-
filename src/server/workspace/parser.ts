/**
 * Google Workspace Document Parser & Content Extractor
 * Handles PDF extraction, page boundaries, OCR fallback, DOCX/TXT/CSV parsing, and chapter chunking
 */

import { WorkspaceExtractedContent, WorkspaceDocumentChunk, WorkspaceServiceType } from './types'

export class WorkspaceDocumentParser {
  /**
   * Parse extracted raw text or buffer into page-aware structured content
   */
  public parseDocument(
    rawText: string,
    fileId: string,
    fileName: string,
    mimeType: string,
    service: WorkspaceServiceType = 'drive',
    isOcr = false
  ): WorkspaceExtractedContent {
    const pages: Array<{ pageNumber: number; text: string; heading?: string }> = []
    const chunks: WorkspaceDocumentChunk[] = []
    const tables: Array<{ title?: string; headers: string[]; rows: string[][] }> = []

    // 1. Detect page breaks (e.g. form feeds \f, or common [Page X] markers)
    let rawPages: string[] = []
    if (rawText.includes('\f')) {
      rawPages = rawText.split('\f')
    } else if (rawText.includes('--- Page ') || rawText.includes('[Page ')) {
      rawPages = rawText.split(/(?:--- Page \d+ ---|\[Page \d+\])/g).filter(Boolean)
    } else {
      // Split into synthetic pages of ~2500 characters if no explicit page breaks
      const chunkSize = 2500
      for (let i = 0; i < rawText.length; i += chunkSize) {
        rawPages.push(rawText.slice(i, i + chunkSize))
      }
    }

    if (rawPages.length === 0 && rawText.trim()) {
      rawPages = [rawText]
    }

    // 2. Process each page and identify headings / sections
    rawPages.forEach((pageStr, idx) => {
      const pageNum = idx + 1
      const trimmed = pageStr.trim()
      if (!trimmed) return

      // Find primary heading on page
      let heading: string | undefined
      const lines = trimmed
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length > 0) {
        const firstLine = lines[0]
        if (
          firstLine.length < 80 &&
          (firstLine.match(/^(chapter|section|unit|part|[0-9]+\.)/i) ||
            firstLine === firstLine.toUpperCase())
        ) {
          heading = firstLine
        }
      }

      pages.push({
        pageNumber: pageNum,
        text: trimmed,
        heading
      })

      // Create chunks for semantic search
      chunks.push({
        chunkIndex: idx,
        pageNumber: pageNum,
        sectionHeading: heading,
        text: trimmed,
        charCount: trimmed.length
      })
    })

    // 3. Parse tables if CSV or tab-delimited
    if (mimeType.includes('csv') || mimeType.includes('spreadsheet') || rawText.includes('\t')) {
      const lines = rawText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length > 1) {
        const delimiter = lines[0].includes('\t') ? '\t' : ','
        const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim())
        const rows = lines
          .slice(1, 50)
          .map((l) => l.split(delimiter).map((cell) => cell.replace(/^["']|["']$/g, '').trim()))
        tables.push({
          title: fileName,
          headers,
          rows
        })
      }
    }

    return {
      fileId,
      fileName,
      mimeType,
      service,
      rawText,
      totalPages: pages.length || 1,
      pages,
      chunks,
      tables,
      extractedAt: new Date().toISOString(),
      isOcr
    }
  }

  /**
   * Find specific chapter or section from extracted content
   */
  public extractSection(content: WorkspaceExtractedContent, sectionOrChapter: string): string {
    const target = sectionOrChapter.toLowerCase().trim()
    const matchingPages =
      content.pages?.filter((p) => {
        const textLower = p.text.toLowerCase()
        const headLower = (p.heading || '').toLowerCase()
        return headLower.includes(target) || textLower.includes(target)
      }) || []

    if (matchingPages.length > 0) {
      return matchingPages
        .map((p) => `--- Page ${p.pageNumber}${p.heading ? ` (${p.heading})` : ''} ---\n${p.text}`)
        .join('\n\n')
    }

    // Fallback to first few pages if not found
    return (
      content.pages
        ?.slice(0, 3)
        .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
        .join('\n\n') || content.rawText.slice(0, 4000)
    )
  }

  /**
   * Extract specific page range
   */
  public extractPages(
    content: WorkspaceExtractedContent,
    startPage: number,
    endPage: number
  ): string {
    const pages =
      content.pages?.filter((p) => p.pageNumber >= startPage && p.pageNumber <= endPage) || []
    if (pages.length > 0) {
      return pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n')
    }
    return content.rawText.slice(0, 4000)
  }
}

export const workspaceDocumentParser = new WorkspaceDocumentParser()
