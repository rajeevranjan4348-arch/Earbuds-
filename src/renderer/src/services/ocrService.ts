/**
 * PaddleOCR Client Service
 * Connects the frontend UI and existing upload pipelines to the PaddleOCR backend API.
 */

export interface OcrScanResponse {
  success: boolean
  engine?: string
  version?: string
  fullText?: string
  confidence?: number
  pageCount?: number
  pages?: Array<{
    pageNumber: number
    width: number
    height: number
    text: string
    confidence: number
    blocks: Array<{
      id: string
      text: string
      confidence: number
      box: [[number, number], [number, number], [number, number], [number, number]]
      rect?: [number, number, number, number]
      readingOrder: number
    }>
    tables: Array<{
      id: string
      rows: number
      cols: number
      html: string
      markdown: string
      confidence: number
      box: [[number, number], [number, number], [number, number], [number, number]]
    }>
    keyValues: Array<{
      key: string
      value: string
      confidence: number
    }>
  }>
  tables?: any[]
  keyValues?: any[]
  documentStructure?: any[]
  processingTimeMs?: number
  error?: string
}

export class OcrService {
  /**
   * Scans an image or PDF document using PaddleOCR PP-OCRv4
   */
  public async scan(
    fileOrData: File | string,
    options?: { language?: string; enableTable?: boolean; enableStructure?: boolean }
  ): Promise<OcrScanResponse> {
    try {
      const dataUrl =
        typeof fileOrData === 'string' ? fileOrData : await this.fileToDataUrl(fileOrData)

      const response = await fetch('/api/ocr/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataUrl,
          language: options?.language || 'en',
          enableTable: options?.enableTable ?? true,
          enableStructure: options?.enableStructure ?? true
        })
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.error || `OCR request failed with status ${response.status}`)
      }

      return await response.json()
    } catch (err: any) {
      console.error('[OcrService] Scan error:', err)
      return {
        success: false,
        error: err?.message || 'Failed to scan document'
      }
    }
  }

  /**
   * Parses document into structured key-values and semantic layout
   */
  public async parseDocument(fileOrData: File | string): Promise<OcrScanResponse> {
    try {
      const dataUrl =
        typeof fileOrData === 'string' ? fileOrData : await this.fileToDataUrl(fileOrData)

      const response = await fetch('/api/ocr/parse-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: dataUrl })
      })

      return await response.json()
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to parse document structure'
      }
    }
  }

  /**
   * Dedicated table recognition
   */
  public async extractTables(fileOrData: File | string): Promise<any> {
    try {
      const dataUrl =
        typeof fileOrData === 'string' ? fileOrData : await this.fileToDataUrl(fileOrData)

      const response = await fetch('/api/ocr/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableImage: dataUrl })
      })

      return await response.json()
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to extract tables'
      }
    }
  }

  /**
   * Retrieves engine status and model information
   */
  public async getStatus(): Promise<any> {
    try {
      const res = await fetch('/api/ocr/status')
      return await res.json()
    } catch (err: any) {
      return { success: false, error: err?.message }
    }
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
}

export const ocrService = new OcrService()
