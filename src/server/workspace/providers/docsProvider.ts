/**
 * Google Docs Workspace Provider
 * Supports reading document structures, headings, body text, and paragraphs
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleDocsProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'docs'

  public async search(
    query: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceSearchResult> {
    // Forward search to Drive with Google Docs MIME filter
    const cleanQuery = query.replace(/'/g, "\\'")
    const q = `mimeType = 'application/vnd.google-apps.document' and trashed = false and (name contains '${cleanQuery}' or fullText contains '${cleanQuery}')`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`

    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Google Docs search error: ${res.statusText}`)
    }

    const data = await res.json()
    const files: WorkspaceFileMetadata[] = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      service: 'docs'
    }))

    return {
      service: 'docs',
      files,
      totalMatches: files.length,
      disambiguationNeeded: files.length > 3,
      topMatch: files[0]
    }
  }

  public async getMetadata(
    documentId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://docs.googleapis.com/v1/documents/${documentId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Docs metadata: ${res.statusText}`)
    }
    const doc = await res.json()
    return {
      id: doc.documentId,
      name: doc.title || 'Untitled Document',
      mimeType: 'application/vnd.google-apps.document',
      service: 'docs'
    }
  }

  public async getContent(
    documentId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceExtractedContent> {
    const url = `https://docs.googleapis.com/v1/documents/${documentId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      // Fallback to Drive export text
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${documentId}/export?mimeType=text/plain`
      const expRes = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (!expRes.ok) throw new Error(`Failed to get document content: ${expRes.statusText}`)
      const rawText = await expRes.text()
      return workspaceDocumentParser.parseDocument(
        rawText,
        documentId,
        'Google Doc',
        'application/vnd.google-apps.document',
        'docs'
      )
    }

    const doc = await res.json()
    const title = doc.title || 'Google Doc'
    const fullTextParts: string[] = []

    // Traverse body structural elements
    if (doc.body?.content) {
      doc.body.content.forEach((elem: any) => {
        if (elem.paragraph?.elements) {
          elem.paragraph.elements.forEach((pElem: any) => {
            if (pElem.textRun?.content) {
              fullTextParts.push(pElem.textRun.content)
            }
          })
        }
      })
    }

    const rawText = fullTextParts.join('') || `[Document: ${title}]`
    return workspaceDocumentParser.parseDocument(
      rawText,
      documentId,
      title,
      'application/vnd.google-apps.document',
      'docs'
    )
  }
}

export const googleDocsProvider = new GoogleDocsProvider()
