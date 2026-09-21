/**
 * Google Slides Workspace Provider
 * Supports reading presentations, slides, and speaker text
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleSlidesProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'slides'

  public async search(
    query: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceSearchResult> {
    const cleanQuery = query.replace(/'/g, "\\'")
    const q = `mimeType = 'application/vnd.google-apps.presentation' and trashed = false and (name contains '${cleanQuery}' or fullText contains '${cleanQuery}')`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`

    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Google Slides search error: ${res.statusText}`)
    }

    const data = await res.json()
    const files: WorkspaceFileMetadata[] = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      service: 'slides'
    }))

    return {
      service: 'slides',
      files,
      totalMatches: files.length,
      disambiguationNeeded: files.length > 3,
      topMatch: files[0]
    }
  }

  public async getMetadata(
    presentationId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Slides metadata: ${res.statusText}`)
    }
    const pres = await res.json()
    return {
      id: pres.presentationId,
      name: pres.title || 'Untitled Presentation',
      mimeType: 'application/vnd.google-apps.presentation',
      service: 'slides'
    }
  }

  public async getContent(
    presentationId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceExtractedContent> {
    const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })

    let title = 'Google Presentation'
    const slideTexts: string[] = []

    if (res.ok) {
      const pres = await res.json()
      title = pres.title || title

      const slides = pres.slides || []
      slides.forEach((slide: any, idx: number) => {
        const slideNum = idx + 1
        const parts: string[] = []

        if (slide.pageElements) {
          slide.pageElements.forEach((pe: any) => {
            if (pe.shape?.text?.textElements) {
              pe.shape.text.textElements.forEach((te: any) => {
                if (te.textRun?.content) {
                  parts.push(te.textRun.content.trim())
                }
              })
            }
          })
        }

        const slideBody = parts.filter(Boolean).join(' ')
        slideTexts.push(`--- Slide ${slideNum} ---\n${slideBody || '[Empty Slide]'}`)
      })
    } else {
      // Fallback to Drive export
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${presentationId}/export?mimeType=text/plain`
      const expRes = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (expRes.ok) {
        const raw = await expRes.text()
        return workspaceDocumentParser.parseDocument(
          raw,
          presentationId,
          title,
          'application/vnd.google-apps.presentation',
          'slides'
        )
      }
    }

    const fullRaw = slideTexts.join('\n\n')
    return workspaceDocumentParser.parseDocument(
      fullRaw,
      presentationId,
      title,
      'application/vnd.google-apps.presentation',
      'slides'
    )
  }
}

export const googleSlidesProvider = new GoogleSlidesProvider()
