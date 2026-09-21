/**
 * Google Calendar Workspace Provider
 * Supports searching calendar events, agendas, meetings
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleCalendarProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'calendar'

  public async search(
    query: string,
    options: WorkspaceProviderOptions & { timeMin?: string; timeMax?: string } = {}
  ): Promise<WorkspaceSearchResult> {
    const timeMin = options.timeMin || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(query)}&timeMin=${timeMin}&maxResults=10&orderBy=startTime&singleEvents=true`

    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Calendar search error: ${res.statusText}`)
    }

    const data = await res.json()
    const items: any[] = data.items || []

    const files: WorkspaceFileMetadata[] = items.map((e) => ({
      id: e.id,
      name: e.summary || 'Calendar Event',
      mimeType: 'application/calendar-event',
      modifiedTime: e.start?.dateTime || e.start?.date,
      webViewLink: e.htmlLink,
      service: 'calendar'
    }))

    return {
      service: 'calendar',
      files,
      totalMatches: files.length,
      disambiguationNeeded: false,
      topMatch: files[0]
    }
  }

  public async getMetadata(
    eventId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Calendar event metadata: ${res.statusText}`)
    }
    const e = await res.json()
    return {
      id: e.id,
      name: e.summary || 'Calendar Event',
      mimeType: 'application/calendar-event',
      service: 'calendar'
    }
  }

  public async getContent(
    eventId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceExtractedContent> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Calendar event content: ${res.statusText}`)
    }

    const e = await res.json()
    const summary = e.summary || 'Calendar Event'
    const start = e.start?.dateTime || e.start?.date || 'Unspecified'
    const end = e.end?.dateTime || e.end?.date || 'Unspecified'
    const location =
      e.location || (e.hangoutLink ? `Meet: ${e.hangoutLink}` : 'No location specified')
    const description = e.description || ''
    const attendees = (e.attendees || []).map((a: any) => a.displayName || a.email).join(', ')

    const rawText = `Event: ${summary}\nStart: ${start}\nEnd: ${end}\nLocation: ${location}\nAttendees: ${attendees || 'None'}\n\nDescription:\n${description}`
    return workspaceDocumentParser.parseDocument(
      rawText,
      eventId,
      summary,
      'application/calendar-event',
      'calendar'
    )
  }
}

export const googleCalendarProvider = new GoogleCalendarProvider()
