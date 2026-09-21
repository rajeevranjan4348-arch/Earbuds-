/**
 * PDF compatibility layer
 *
 * The imported codebase was written against the legacy `pdf-parse` v1 callable
 * API (`pdfParse(buffer, options)`). The installed v2 release exposes a
 * `PDFParse` class instead, which broke PDF ingestion with
 * "pdfParse is not a function" at runtime.
 *
 * This adapter keeps a single, ESM-safe call site so the rest of the engine
 * (RAG ingestion, Drive import) keeps working with either shape.
 */

import { PDFParse } from 'pdf-parse'

export interface PdfPageText {
  num: number
  text: string
}

export interface PdfTextExtraction {
  text: string
  numpages: number
  pages: PdfPageText[]
  info?: Record<string, any>
}

function toUint8Array(data: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(Buffer.from(data as any))
}

/**
 * Extracts the full document text plus per-page segments from a PDF buffer.
 * Never throws: callers fall back to OCR / plain-text handling on failure.
 */
export async function extractPdfText(
  data: Buffer | Uint8Array,
  options: { withInfo?: boolean } = {}
): Promise<PdfTextExtraction> {
  const parser = new PDFParse({ data: toUint8Array(data) })

  try {
    const result = await parser.getText()
    const pages: PdfPageText[] = (result?.pages || [])
      .map((page) => ({ num: page?.num ?? 0, text: page?.text ?? '' }))
      .filter((page) => page.num > 0)

    const numpages = result?.total || pages.length || 1
    const text = result?.text || pages.map((page) => page.text).join('\n\n')

    let info: Record<string, any> | undefined
    if (options.withInfo) {
      try {
        const meta = await parser.getInfo()
        info = (meta || {}) as unknown as Record<string, any>
      } catch (_error) {
        info = undefined
      }
    }

    return { text, numpages, pages, info }
  } finally {
    try {
      await parser.destroy()
    } catch (_error) {
      /* destroy is best-effort */
    }
  }
}
