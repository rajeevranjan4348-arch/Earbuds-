/**
 * PaddleOCR & PP-Structure Type Definitions
 * Complete type system covering text detection, recognition, angle classification,
 * document layout analysis, table recognition, and multi-page document parsing.
 */

export type Point = [number, number]
export type BoundingBox = [Point, Point, Point, Point] // 4 vertices: [topLeft, topRight, bottomRight, bottomLeft]
export type RectBox = [number, number, number, number] // [x, y, width, height]

export type SupportedLanguage =
  | 'en'
  | 'ch'
  | 'latin'
  | 'devanagari'
  | 'japan'
  | 'korean'
  | 'french'
  | 'german'
  | 'multilingual'

export type DocumentElementType =
  | 'header'
  | 'title'
  | 'paragraph'
  | 'table'
  | 'figure'
  | 'list'
  | 'footer'
  | 'key_value'
  | 'equation'
  | 'stamp'

export interface DetectedTextBlock {
  id: string
  text: string
  confidence: number // 0.0 - 1.0
  box: BoundingBox
  rect?: RectBox
  angle?: number // 0, 90, 180, 270
  readingOrder: number
  language?: string
}

export interface TableCell {
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  text: string
  confidence: number
  box?: BoundingBox
  isHeader?: boolean
}

export interface DetectedTable {
  id: string
  rows: number
  cols: number
  html: string
  markdown: string
  cells: TableCell[]
  confidence: number
  box: BoundingBox
  caption?: string
}

export interface StructuredDocumentElement {
  id: string
  type: DocumentElementType
  text: string
  confidence: number
  box: BoundingBox
  level?: number // for headers/titles (1 = h1, 2 = h2, etc.)
  children?: StructuredDocumentElement[]
  metadata?: Record<string, any>
}

export interface KeyValuePair {
  key: string
  value: string
  confidence: number
  keyBox?: BoundingBox
  valueBox?: BoundingBox
}

export interface OcrPageResult {
  pageNumber: number
  width: number
  height: number
  text: string
  confidence: number
  blocks: DetectedTextBlock[]
  tables: DetectedTable[]
  structure: StructuredDocumentElement[]
  keyValues: KeyValuePair[]
  angle: number
}

export interface OcrDocumentResult {
  engine: 'PaddleOCR-PP-OCRv4' | 'PaddleOCR-PP-Structure'
  version: string
  device: 'cpu' | 'gpu'
  language: SupportedLanguage
  pageCount: number
  pages: OcrPageResult[]
  fullText: string
  confidence: number
  tables: DetectedTable[]
  keyValues: KeyValuePair[]
  documentStructure: StructuredDocumentElement[]
  processingTimeMs: number
  warnings?: string[]
  metadata?: {
    originalFilename?: string
    mimeType?: string
    fileSizeBytes?: number
  }
}

export interface PaddleOcrConfig {
  language: SupportedLanguage
  useGpu: boolean
  enableTable: boolean
  enableStructure: boolean
  enableAngleCls: boolean
  dropScore: number // minimum confidence score to keep, default 0.5
  detDbThresh: number // DBNet binarization threshold, default 0.3
  detDbBoxThresh: number // DBNet box score threshold, default 0.6
  detDbUnclipRatio: number // DBNet polygon unclip ratio, default 1.5
  maxSideLen: number // Maximum side length for detection image resizing, default 960
  recImageShape: [number, number, number] // [channels, height, width], default [3, 48, 320]
  pdfPages?: number // Maximum number of pages to process from PDF
}

export interface PaddleEngineStatus {
  initialized: boolean
  engine: string
  version: string
  device: 'cpu' | 'gpu'
  supportedLanguages: SupportedLanguage[]
  activeLanguage: SupportedLanguage
  modelLoaded: boolean
  models: {
    det: string
    rec: string
    cls: string
    table: string
    layout: string
  }
  uptimeSeconds: number
  totalInferences: number
  averageLatencyMs: number
}
