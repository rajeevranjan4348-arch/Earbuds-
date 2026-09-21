/**
 * Google Workspace Intelligence & Data Agent - Type Definitions
 */

export type WorkspaceServiceType =
  'drive' | 'docs' | 'sheets' | 'slides' | 'gmail' | 'calendar' | 'tasks' | 'chat'

export type WorkspaceActionType =
  | 'search'
  | 'list'
  | 'open'
  | 'read'
  | 'summarize'
  | 'analyze'
  | 'compare'
  | 'extract'
  | 'calculate'
  | 'explain'
  | 'find'
  | 'retrieve'
  | 'export'
  | 'create'
  | 'update'
  | 'delete'

export type WorkspaceFileType =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'sheet'
  | 'spreadsheet'
  | 'slides'
  | 'presentation'
  | 'txt'
  | 'csv'
  | 'image'
  | 'folder'
  | 'all'

export interface WorkspaceIntent {
  service: WorkspaceServiceType
  action: WorkspaceActionType
  query: string
  fileType?: WorkspaceFileType
  operation?: string
  chapterOrSection?: string
  pageNumber?: number
  targetFilename?: string
  secondaryFilename?: string
  dateRange?: { start?: string; end?: string }
  isDestructive?: boolean
  confidence: number
  rawPrompt: string
}

export interface WorkspaceFileMetadata {
  id: string
  name: string
  mimeType: string
  size?: number
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  iconLink?: string
  parents?: string[]
  owners?: Array<{ displayName?: string; emailAddress?: string }>
  exportLinks?: Record<string, string>
  service: WorkspaceServiceType
}

export interface WorkspaceDocumentChunk {
  chunkIndex: number
  pageNumber?: number
  sectionHeading?: string
  text: string
  charCount: number
}

export interface WorkspaceExtractedContent {
  fileId: string
  fileName: string
  mimeType: string
  service: WorkspaceServiceType
  rawText: string
  totalPages?: number
  pages?: Array<{ pageNumber: number; text: string; heading?: string }>
  chunks?: WorkspaceDocumentChunk[]
  tables?: Array<{ title?: string; headers: string[]; rows: string[][] }>
  metadata?: Record<string, any>
  extractedAt: string
  isOcr?: boolean
}

export interface WorkspaceSearchResult {
  service: WorkspaceServiceType
  files: WorkspaceFileMetadata[]
  totalMatches: number
  disambiguationNeeded: boolean
  disambiguationPrompt?: string
  topMatch?: WorkspaceFileMetadata
}

export interface WorkspaceCitation {
  fileName: string
  source: string
  service: WorkspaceServiceType
  pageNumber?: number
  sectionHeading?: string
  fileId?: string
  link?: string
}

export interface WorkspaceAnalysisResult {
  success: boolean
  intent: WorkspaceIntent
  primaryFile?: WorkspaceFileMetadata
  secondaryFile?: WorkspaceFileMetadata
  extractedContent?: WorkspaceExtractedContent
  answer: string
  citations: WorkspaceCitation[]
  requiresConfirmation?: boolean
  confirmationMessage?: string
  diagnosticNotes?: string[]
  error?: string
}

export interface WorkspaceTaskContext {
  userId: string
  activeFileId?: string
  activeFileName?: string
  activeService?: WorkspaceServiceType
  lastRetrievedContent?: WorkspaceExtractedContent
  recentFiles: WorkspaceFileMetadata[]
  lastQuery?: string
  lastTimestamp: number
}
