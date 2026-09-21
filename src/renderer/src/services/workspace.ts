/**
 * Google Workspace Real Integration Client
 * Directly invokes 1P Google Workspace APIs using OAuth 2.0 access token
 */

export interface WorkspaceItem {
  id: string
  service: string
  title: string
  subtitle?: string
  date?: string
  link?: string
  extra?: any
}

export class GoogleWorkspaceService {
  private token: string

  constructor(token: string) {
    this.token = token
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    }
  }

  private async parseError(serviceName: string, res: Response): Promise<Error> {
    let errorDetail = ''
    try {
      const errJson = await res.json()
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message
      }
    } catch (_e) {
      // not json
    }
    if (!errorDetail) {
      if (res.status === 401) {
        errorDetail = 'Access token expired or unauthorized. Please re-authenticate with Google.'
      } else if (res.status === 403) {
        errorDetail = 'Access denied. Additional Google Workspace permissions or scopes required.'
      } else if (res.statusText) {
        errorDetail = res.statusText
      } else {
        errorDetail = `Request failed with HTTP status ${res.status}`
      }
    }
    return new Error(`${serviceName}: ${errorDetail}`)
  }

  // 1. Google Drive
  async listDriveFiles(): Promise<WorkspaceItem[]> {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/files?pageSize=15&fields=files(id,name,mimeType,modifiedTime,webViewLink,iconLink)',
      { headers: this.headers() }
    )
    if (!res.ok) throw await this.parseError('Drive error', res)
    const data = await res.json()
    return (data.files || []).map((f: any) => ({
      id: f.id,
      service: 'drive',
      title: f.name,
      subtitle: f.mimeType?.replace('application/vnd.google-apps.', ''),
      date: f.modifiedTime,
      link: f.webViewLink,
      extra: f
    }))
  }

  // 2. Google Sheets
  async createSpreadsheet(title: string): Promise<any> {
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        properties: { title: title || 'IRIS Telemetry Log' }
      })
    })
    if (!res.ok) throw await this.parseError('Sheets error', res)
    return await res.json()
  }

  // 3. Gmail
  async listGmailMessages(): Promise<WorkspaceItem[]> {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8',
      { headers: this.headers() }
    )
    if (!listRes.ok) throw await this.parseError('Gmail error', listRes)
    const listData = await listRes.json()
    if (!listData.messages || listData.messages.length === 0) return []

    // Fetch details for top messages
    const details = await Promise.all(
      listData.messages.slice(0, 5).map(async (m: { id: string }) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: this.headers() }
          )
          if (!detailRes.ok) return null
          const d = await detailRes.json()
          const headers = d.payload?.headers || []
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject'
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender'
          const date = headers.find((h: any) => h.name === 'Date')?.value || ''
          return {
            id: d.id,
            service: 'gmail',
            title: subject,
            subtitle: from,
            date,
            snippet: d.snippet,
            link: `https://mail.google.com/mail/u/0/#inbox/${d.id}`
          }
        } catch {
          return null
        }
      })
    )
    return details.filter(Boolean) as WorkspaceItem[]
  }

  // 4. Google Calendar
  async listCalendarEvents(): Promise<WorkspaceItem[]> {
    const now = new Date().toISOString()
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${now}`,
      { headers: this.headers() }
    )
    if (!res.ok) throw await this.parseError('Calendar error', res)
    const data = await res.json()
    return (data.items || []).map((e: any) => ({
      id: e.id,
      service: 'calendar',
      title: e.summary || 'Scheduled Session',
      subtitle: e.location || (e.hangoutLink ? 'Google Meet Video' : 'Online'),
      date: e.start?.dateTime || e.start?.date,
      link: e.htmlLink,
      extra: e
    }))
  }

  async createCalendarEvent(summary: string, startIso: string, endIso: string): Promise<any> {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        summary,
        start: { dateTime: startIso },
        end: { dateTime: endIso }
      })
    })
    if (!res.ok) throw await this.parseError('Create event error', res)
    return await res.json()
  }

  // 5. Google Docs
  async createDocument(title: string): Promise<any> {
    const res = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ title })
    })
    if (!res.ok) throw await this.parseError('Docs error', res)
    return await res.json()
  }

  // 6. Google Slides
  async createPresentation(title: string): Promise<any> {
    const res = await fetch('https://slides.googleapis.com/v1/presentations', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ title })
    })
    if (!res.ok) throw await this.parseError('Slides error', res)
    return await res.json()
  }

  // 7. Google Tasks
  async listTasks(): Promise<WorkspaceItem[]> {
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: this.headers()
    })
    if (!listsRes.ok) throw await this.parseError('Tasks lists error', listsRes)
    const listsData = await listsRes.json()
    const defaultList = listsData.items?.[0]
    if (!defaultList) return []

    const tasksRes = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${defaultList.id}/tasks?maxResults=15`,
      { headers: this.headers() }
    )
    if (!tasksRes.ok) throw await this.parseError('Tasks error', tasksRes)
    const tasksData = await tasksRes.json()
    return (tasksData.items || []).map((t: any) => ({
      id: t.id,
      service: 'tasks',
      title: t.title,
      subtitle: t.status === 'completed' ? 'Completed' : 'Pending',
      date: t.due || t.updated,
      extra: t
    }))
  }

  async createTask(title: string): Promise<any> {
    const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: this.headers()
    })
    const listsData = await listsRes.json()
    const listId = listsData.items?.[0]?.id || '@default'

    const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ title, status: 'needsAction' })
    })
    if (!res.ok) throw await this.parseError('Create task error', res)
    return await res.json()
  }

  // 8. Google Chat Spaces
  async listChatSpaces(): Promise<WorkspaceItem[]> {
    try {
      const res = await fetch('https://chat.googleapis.com/v1/spaces', {
        headers: this.headers()
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.spaces || []).map((s: any) => ({
        id: s.name,
        service: 'chat',
        title: s.displayName || 'Google Chat Space',
        subtitle: s.spaceType || 'Chat Channel',
        link: s.spaceUri
      }))
    } catch {
      return []
    }
  }

  // 9. Google Forms
  async createForm(title: string): Promise<any> {
    const res = await fetch('https://forms.googleapis.com/v1/forms', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        info: { title: title || 'IRIS System Feedback Form' }
      })
    })
    if (!res.ok) throw await this.parseError('Forms error', res)
    return await res.json()
  }

  // 10. Google Meet
  async createMeetSpace(): Promise<any> {
    const res = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({})
    })
    if (!res.ok) throw await this.parseError('Meet error', res)
    return await res.json()
  }

  // 11. Google Contacts / People
  async listContacts(): Promise<WorkspaceItem[]> {
    const res = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=15',
      { headers: this.headers() }
    )
    if (!res.ok) throw await this.parseError('Contacts error', res)
    const data = await res.json()
    return (data.connections || []).map((c: any) => {
      const name = c.names?.[0]?.displayName || 'Unnamed Contact'
      const email = c.emailAddresses?.[0]?.value || ''
      const phone = c.phoneNumbers?.[0]?.value || ''
      return {
        id: c.resourceName || Math.random().toString(),
        service: 'contacts',
        title: name,
        subtitle: [email, phone].filter(Boolean).join(' • ') || 'No contact details'
      }
    })
  }

  // 12. Google Classroom
  async listClassroomCourses(): Promise<WorkspaceItem[]> {
    const res = await fetch('https://classroom.googleapis.com/v1/courses?pageSize=15', {
      headers: this.headers()
    })
    if (!res.ok) throw await this.parseError('Classroom error', res)
    const data = await res.json()
    return (data.courses || []).map((c: any) => ({
      id: c.id,
      service: 'classroom',
      title: c.name,
      subtitle: c.section ? `Section: ${c.section}` : c.room || 'Course Room',
      link: c.alternateLink
    }))
  }
}
