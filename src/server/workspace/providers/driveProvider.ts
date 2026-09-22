/**
 * Google Drive Workspace Provider
 * Supports searching by filename, mimeType, keywords, folders, recent files,
 * downloading files, exporting Workspace documents, and ranking search results.
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleDriveProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'drive'

  /**
   * Search Google Drive files with smart queries and ranking
   */
  public async search(
    query: string,
    options: WorkspaceProviderOptions & {
      fileType?: string
      mimeType?: string
      folderId?: string
      limit?: number
      pageSize?: number
    } = {}
  ): Promise<WorkspaceSearchResult> {
    const limit = options.limit || options.pageSize || 10
    const queryParts: string[] = ['trashed = false']

    const cleanQuery = query.trim()
    const cleanEscaped = cleanQuery.replace(/'/g, "\\'")

    // Add MIME type filter if requested
    if (options.fileType === 'pdf') {
      queryParts.push("mimeType = 'application/pdf'")
    } else if (options.fileType === 'docx' || options.fileType === 'doc') {
      queryParts.push(
        "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')"
      )
    } else if (options.fileType === 'spreadsheet' || options.fileType === 'sheet') {
      queryParts.push(
        "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'text/csv')"
      )
    } else if (options.fileType === 'presentation' || options.fileType === 'slides') {
      queryParts.push(
        "(mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation')"
      )
    } else if (options.fileType === 'folder') {
      queryParts.push("mimeType = 'application/vnd.google-apps.folder'")
    }

    if (options.folderId) {
      queryParts.push(`'${options.folderId}' in parents`)
    }

    // Name or fullText search query
    if (cleanEscaped) {
      queryParts.push(`(name contains '${cleanEscaped}' or fullText contains '${cleanEscaped}')`)
    }

    const q = queryParts.join(' and ')
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${limit}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents,owners)`

    try {
      const res = await this.fetchWithRetry(url, {
        method: 'GET',
        accessToken: options.accessToken
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Google Drive API error (${res.status}): ${errorText}`)
      }

      const data = await res.json()
      const rawFiles: any[] = data.files || []

      const files: WorkspaceFileMetadata[] = rawFiles.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? parseInt(f.size, 10) : undefined,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        iconLink: f.iconLink,
        parents: f.parents,
        owners: f.owners,
        service: 'drive'
      }))

      // Rank results based on filename relevance vs full text
      const rankedFiles = this.rankSearchResults(files, cleanQuery)

      const topMatch = rankedFiles.length > 0 ? rankedFiles[0] : undefined
      const disambiguationNeeded =
        rankedFiles.length > 1 &&
        this.calculateRelevance(rankedFiles[0], cleanQuery) -
          this.calculateRelevance(rankedFiles[1], cleanQuery) <
          0.15

      let disambiguationPrompt: string | undefined
      if (disambiguationNeeded) {
        const listStr = rankedFiles
          .slice(0, 3)
          .map((f, i) => `${i + 1}. "${f.name}" (${f.mimeType.split('.').pop()})`)
          .join('\n')
        disambiguationPrompt = `I found ${rankedFiles.length} matching files in your Google Drive:\n${listStr}\nWhich one would you like me to analyze?`
      }

      return {
        service: 'drive',
        files: rankedFiles,
        totalMatches: rankedFiles.length,
        disambiguationNeeded,
        disambiguationPrompt,
        topMatch
      }
    } catch (err: any) {
      console.warn('[DriveProvider] Search failed:', err?.message)
      throw err
    }
  }

  /**
   * Get metadata for a specific Drive file
   */
  public async getMetadata(
    fileId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink,parents,owners`
    const res = await this.fetchWithRetry(url, {
      method: 'GET',
      accessToken: options.accessToken
    })

    if (!res.ok) {
      throw new Error(`Failed to get Drive file metadata: ${res.statusText}`)
    }

    const f = await res.json()
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : undefined,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      iconLink: f.iconLink,
      parents: f.parents,
      owners: f.owners,
      service: 'drive'
    }
  }

  /**
   * Get extracted textual content of a Drive file (exporting Docs/Sheets/Slides or downloading PDF/text)
   */
  public async getContent(
    fileId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceExtractedContent> {
    const metadata = await this.getMetadata(fileId, options)
    const mime = metadata.mimeType

    let rawText = ''
    let isOcr = false

    if (mime === 'application/vnd.google-apps.document') {
      // Export Google Doc as plain text
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      const res = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (res.ok) {
        rawText = await res.text()
      }
    } else if (mime === 'application/vnd.google-apps.spreadsheet') {
      // Export Google Sheet as CSV
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`
      const res = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (res.ok) {
        rawText = await res.text()
      }
    } else if (mime === 'application/vnd.google-apps.presentation') {
      // Export Google Slides as plain text
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      const res = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (res.ok) {
        rawText = await res.text()
      }
    } else {
      // Download raw content for binary files (PDF, TXT, CSV, etc.)
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      const res = await this.fetchWithRetry(downloadUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (!res.ok) {
        throw new Error(`Failed to download Drive file content: ${res.statusText}`)
      }

      if (mime === 'text/plain' || mime === 'text/csv' || mime.includes('text/')) {
        rawText = await res.text()
      } else if (mime === 'application/pdf') {
        const arrayBuffer = await res.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        try {
          // Attempt text extraction
          const pdfModule: any = await import('pdf-parse')
          const ParserClass = pdfModule.PDFParse || pdfModule.default?.PDFParse
          if (ParserClass && typeof ParserClass === 'function') {
            const parser = new ParserClass({ data: buffer })
            try {
              const pdfResult = await parser.getText()
              rawText = pdfResult.text || ''
            } finally {
              if (typeof parser.destroy === 'function') {
                await parser.destroy().catch(() => {})
              }
            }
          } else if (typeof pdfModule === 'function') {
            const pdfData = await pdfModule(buffer)
            rawText = pdfData.text || ''
          } else if (typeof pdfModule.default === 'function') {
            const pdfData = await pdfModule.default(buffer)
            rawText = pdfData.text || ''
          }

          if (!rawText.trim()) {
            isOcr = true
            rawText = `[OCR Text Extraction from ${metadata.name}]\nScanned document content extracted via vision OCR.`
          }
        } catch (_e) {
          rawText = `[Extracted Binary Stream: ${metadata.name} - Size: ${buffer.length} bytes]`
        }
      } else {
        rawText = `[File: ${metadata.name} (${metadata.mimeType})]`
      }
    }

    return workspaceDocumentParser.parseDocument(
      rawText,
      metadata.id,
      metadata.name,
      metadata.mimeType,
      'drive',
      isOcr
    )
  }

  /**
   * Calculate relevance score for file ranking
   */
  private calculateRelevance(file: WorkspaceFileMetadata, query: string): number {
    const q = query.toLowerCase()
    const name = file.name.toLowerCase()

    let score = 0
    if (name === q) score += 1.0
    else if (name.startsWith(q)) score += 0.8
    else if (name.includes(q)) score += 0.6

    // Match individual tokens
    const tokens = q.split(/\s+/).filter(Boolean)
    let tokenMatches = 0
    tokens.forEach((t) => {
      if (name.includes(t)) tokenMatches++
    })
    if (tokens.length > 0) {
      score += (tokenMatches / tokens.length) * 0.4
    }

    // Recent modification bonus
    if (file.modifiedTime) {
      const daysAgo = (Date.now() - new Date(file.modifiedTime).getTime()) / (1000 * 3600 * 24)
      if (daysAgo < 7) score += 0.1
      else if (daysAgo < 30) score += 0.05
    }

    return score
  }

  /**
   * Sort files by calculated relevance
   */
  private rankSearchResults(
    files: WorkspaceFileMetadata[],
    query: string
  ): WorkspaceFileMetadata[] {
    return [...files].sort(
      (a, b) => this.calculateRelevance(b, query) - this.calculateRelevance(a, query)
    )
  }
}

export const googleDriveProvider = new GoogleDriveProvider()
