/**
 * PDF Text & Metadata Extraction Engine with OCR Fallback
 *
 * Accurately parses PDF documents, preserves page numbers, handles multi-column layouts,
 * detects headings/sections, filters boilerplate headers/footers, and applies Gemini AI OCR
 * for scanned documents.
 */

import crypto from 'crypto'
import { ExtractedPage } from './types'
import { GoogleGenAI } from '@google/genai'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
}

export interface ExtractionResult {
  title: string
  pageCount: number
  pages: ExtractedPage[]
  contentHash: string
  fullText: string
}

export class PDFExtractor {
  /**
   * Compute SHA-256 content hash for duplicate detection
   */
  public static computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }

  /**
   * Extract text, structure, sections, and pages from a PDF buffer
   */
  public static async extractPDFText(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    const contentHash = this.computeHash(buffer)
    const pages: ExtractedPage[] = []

    try {
      let rawText = ''
      let numPages = 1
      let rawPagesList: Array<{ text: string; pageNumber: number }> = []

      // 1. Attempt parsing using pdf-parse (supporting both v2 PDFParse class and v1 functional exports)
      try {
        const pdfModule: any = await import('pdf-parse')
        const ParserClass = pdfModule.PDFParse || pdfModule.default?.PDFParse
        
        if (ParserClass && typeof ParserClass === 'function') {
          const parser = new ParserClass({ data: buffer })
          try {
            const pdfResult = await parser.getText()
            rawText = pdfResult.text || ''
            numPages = pdfResult.total || (pdfResult.pages ? pdfResult.pages.length : 1)
            if (pdfResult.pages && Array.isArray(pdfResult.pages)) {
              rawPagesList = pdfResult.pages.map((p: any, idx: number) => ({
                text: p.text || '',
                pageNumber: p.num || idx + 1
              }))
            }
          } finally {
            if (typeof parser.destroy === 'function') {
              await parser.destroy().catch(() => {})
            }
          }
        } else if (typeof pdfModule === 'function') {
          const pdfData = await pdfModule(buffer)
          rawText = pdfData.text || ''
          numPages = pdfData.numpages || 1
        } else if (typeof pdfModule.default === 'function') {
          const pdfData = await pdfModule.default(buffer)
          rawText = pdfData.text || ''
          numPages = pdfData.numpages || 1
        }
      } catch (parseErr: any) {
        console.warn(`[PDFExtractor] Direct parser note for ${filename}:`, parseErr?.message)
      }

      let currentSection = 'Introduction'
      let totalExtractedLength = 0

      if (rawPagesList.length > 0) {
        for (const rawPage of rawPagesList) {
          const cleanedText = this.cleanPageText(rawPage.text, rawPage.pageNumber, filename)
          const detectedSection = this.detectSectionHeader(cleanedText) || currentSection
          if (detectedSection) currentSection = detectedSection

          totalExtractedLength += cleanedText.length
          pages.push({
            pageNumber: rawPage.pageNumber,
            text: cleanedText,
            section: currentSection,
            isOcr: false
          })
        }
      } else if (rawText.trim().length > 0) {
        const rawPageSplits = rawText.split(/\n(?=Page\s+\d+|--\s*\d+\s+of\s+\d+\s*--|[\f])/i)
        const count = Math.max(numPages, rawPageSplits.length)
        for (let i = 1; i <= count; i++) {
          let pageText = rawPageSplits[i - 1] || ''
          if (!pageText.trim() && count === 1) {
            pageText = rawText
          }
          const cleanedText = this.cleanPageText(pageText, i, filename)
          const detectedSection = this.detectSectionHeader(cleanedText) || currentSection
          if (detectedSection) currentSection = detectedSection

          totalExtractedLength += cleanedText.length
          pages.push({
            pageNumber: i,
            text: cleanedText,
            section: currentSection,
            isOcr: false
          })
        }
      }

      // Check if document is scanned (empty or average < 35 characters per page)
      const avgCharsPerPage = totalExtractedLength / Math.max(1, pages.length || numPages)
      if ((avgCharsPerPage < 35 || pages.length === 0) && buffer.length > 100) {
        console.log(
          `[PDFExtractor] Low text density (${avgCharsPerPage.toFixed(1)} c/p) in ${filename}. Invoking Gemini OCR...`
        )
        const ocrPages = await this.performGeminiOCR(buffer, filename, numPages)
        if (ocrPages && ocrPages.length > 0) {
          return {
            title: this.deriveDocumentTitle(filename, ocrPages),
            pageCount: ocrPages.length,
            pages: ocrPages,
            contentHash,
            fullText: ocrPages.map((p) => p.text).join('\n\n')
          }
        }
      }

      if (pages.length === 0) {
        throw new Error('No readable text parsed from PDF')
      }

      const title = this.deriveDocumentTitle(filename, pages)
      const fullText = pages.map((p) => p.text).join('\n\n')

      return {
        title,
        pageCount: pages.length,
        pages,
        contentHash,
        fullText
      }
    } catch (err: any) {
      console.warn(`[PDFExtractor] Standard PDF parse fallback for ${filename}:`, err?.message)
      // Fallback directly to Gemini OCR
      const ocrPages = await this.performGeminiOCR(buffer, filename, 1)
      if (ocrPages && ocrPages.length > 0) {
        return {
          title: this.deriveDocumentTitle(filename, ocrPages),
          pageCount: ocrPages.length,
          pages: ocrPages,
          contentHash,
          fullText: ocrPages.map((p) => p.text).join('\n\n')
        }
      }
      throw new Error(
        `Failed to extract text from PDF ${filename}: ${err?.message || 'Corrupted or unreadable format'}`
      )
    }
  }

  /**
   * Gemini Multimodal Vision & Document OCR for scanned or image-based PDFs
   */
  private static async performGeminiOCR(
    buffer: Buffer,
    filename: string,
    estimatedPages: number
  ): Promise<ExtractedPage[] | null> {
    const gemini = getGemini()
    if (!gemini) return null

    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.5-pro'
    ]

    const base64Data = buffer.toString('base64')
    const prompt = `You are a high-accuracy document OCR extraction system. 
Extract all readable text from this PDF file "${filename}".
Format your output with clear page markers so pages can be separated accurately:
--- PAGE 1 ---
[Page 1 content with headers and section titles preserved]
--- PAGE 2 ---
[Page 2 content]
Preserve tables, lists, and headings. Remove arbitrary scanner artifacts.`

    for (const modelCandidate of candidateModels) {
      try {
        const response = await gemini.models.generateContent({
          model: modelCandidate,
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            },
            prompt
          ]
        })

        const ocrText = response.text || ''
        if (!ocrText.trim()) continue

        const pageRegex = /---\s*PAGE\s*(\d+)\s*---/i
        const parts = ocrText.split(pageRegex)
        const pages: ExtractedPage[] = []

        if (parts.length > 1) {
          for (let i = 1; i < parts.length; i += 2) {
            const pageNum = parseInt(parts[i], 10) || Math.floor(i / 2) + 1
            const text = (parts[i + 1] || '').trim()
            pages.push({
              pageNumber: pageNum,
              text,
              section: this.detectSectionHeader(text) || `Page ${pageNum}`,
              isOcr: true
            })
          }
        } else {
          pages.push({
            pageNumber: 1,
            text: ocrText.trim(),
            section: 'Main Content',
            isOcr: true
          })
        }

        return pages
      } catch (ocrErr: any) {
        console.warn(`[PDFExtractor] Gemini OCR attempt with ${modelCandidate} failed:`, ocrErr?.message)
      }
    }
    return null
  }

  /**
   * Clean noise, repeated headers/footers, and page numbers
   */
  private static cleanPageText(rawText: string, pageNum: number, filename: string): string {
    const lines = rawText.split('\n')
    const cleanedLines: string[] = []

    const baseName = filename.replace(/\.pdf$/i, '').toLowerCase()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Ignore standard standalone page numbering (e.g., "- 4 -", "Page 4 of 20", "4")
      if (/^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i.test(trimmed)) continue
      if (/^[-–—]\s*\d+\s*[-–—]$/.test(trimmed)) continue

      // Ignore trivial single-line matching filename header
      if (trimmed.toLowerCase() === baseName) continue

      cleanedLines.push(trimmed)
    }

    // Join lines with normalized spacing (reconnect hyphenated linebreaks)
    return cleanedLines
      .join('\n')
      .replace(/(\w+)-\n(\w+)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .trim()
  }

  /**
   * Detect headings or section titles
   */
  private static detectSectionHeader(text: string): string | null {
    const lines = text.split('\n')
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim()
      // Markdown heading
      if (/^#{1,3}\s+(.+)$/.test(trimmed)) {
        return trimmed.replace(/^#{1,3}\s+/, '')
      }
      // Numbered section e.g. "1.2 Executive Summary" or "Section 3: Methods"
      if (
        /^(?:section\s+\d+|chapter\s+\d+|\d+\.\d+|\d+\.)\s*[:\-–]?\s*([A-Z].{3,60})$/i.test(trimmed)
      ) {
        return trimmed
      }
      // All-caps short line (3-50 chars)
      if (
        /^[A-Z0-9\s,\-–:]{4,45}$/.test(trimmed) &&
        !trimmed.includes('http') &&
        trimmed.split(' ').length <= 6
      ) {
        return trimmed
      }
    }
    return null
  }

  /**
   * Derive user-friendly document title from first page or filename
   */
  private static deriveDocumentTitle(filename: string, pages: ExtractedPage[]): string {
    const cleanFilename = filename
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    if (pages.length > 0 && pages[0].text) {
      const firstLines = pages[0].text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      for (const line of firstLines.slice(0, 3)) {
        if (
          line.length >= 5 &&
          line.length <= 90 &&
          !line.startsWith('http') &&
          !line.includes('@')
        ) {
          return line
        }
      }
    }

    return cleanFilename
  }
}
