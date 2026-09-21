/**
 * Google Gmail Workspace Provider
 * Supports searching emails, reading message contents, snippets, threads
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleGmailProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'gmail'

  public async search(
    query: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceSearchResult> {
    const cleanQuery = query.trim()
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(cleanQuery)}&maxResults=10`

    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Gmail search error: ${res.statusText}`)
    }

    const data = await res.json()
    const rawMessages: any[] = data.messages || []

    const files: WorkspaceFileMetadata[] = await Promise.all(
      rawMessages.slice(0, 5).map(async (m) => {
        try {
          const detailRes = await this.fetchWithRetry(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { method: 'GET', accessToken: options.accessToken }
          )
          if (!detailRes.ok) return null
          const d = await detailRes.json()
          const headers = d.payload?.headers || []
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject'
          const date = headers.find((h: any) => h.name === 'Date')?.value || ''
          return {
            id: d.id,
            name: subject,
            mimeType: 'message/rfc822',
            modifiedTime: date,
            webViewLink: `https://mail.google.com/mail/u/0/#inbox/${d.id}`,
            service: 'gmail' as WorkspaceServiceType
          }
        } catch {
          return null
        }
      })
    ).then((items) => items.filter(Boolean) as WorkspaceFileMetadata[])

    return {
      service: 'gmail',
      files,
      totalMatches: files.length,
      disambiguationNeeded: files.length > 2,
      topMatch: files[0]
    }
  }

  public async getMetadata(
    messageId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Gmail message metadata: ${res.statusText}`)
    }
    const d = await res.json()
    const headers = d.payload?.headers || []
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Email Message'
    return {
      id: d.id,
      name: subject,
      mimeType: 'message/rfc822',
      service: 'gmail'
    }
  }

  public async getContent(
    messageId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceExtractedContent> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Gmail message body: ${res.statusText}`)
    }

    const d = await res.json()
    const headers = d.payload?.headers || []
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Email'
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown'
    const date = headers.find((h: any) => h.name === 'Date')?.value || ''
    const snippet = d.snippet || ''

    let bodyText = snippet
    if (d.payload?.parts) {
      const textPart = d.payload.parts.find((p: any) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      }
    }

    const rawText = `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${bodyText}`
    return workspaceDocumentParser.parseDocument(
      rawText,
      messageId,
      subject,
      'message/rfc822',
      'gmail'
    )
  }
}

export const googleGmailProvider = new GoogleGmailProvider()
