/**
 * Google Sheets Workspace Provider
 * Supports reading spreadsheet data, calculating averages/sums, extracting tables
 */

import { WorkspaceProvider, WorkspaceProviderOptions } from './workspaceProvider'
import {
  WorkspaceServiceType,
  WorkspaceFileMetadata,
  WorkspaceExtractedContent,
  WorkspaceSearchResult
} from '../types'
import { workspaceDocumentParser } from '../parser'

export class GoogleSheetsProvider extends WorkspaceProvider {
  public readonly service: WorkspaceServiceType = 'sheets'

  public async search(
    query: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceSearchResult> {
    const cleanQuery = query.replace(/'/g, "\\'")
    const q = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and (name contains '${cleanQuery}' or fullText contains '${cleanQuery}')`
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=10&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`

    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Google Sheets search error: ${res.statusText}`)
    }

    const data = await res.json()
    const files: WorkspaceFileMetadata[] = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      service: 'sheets'
    }))

    return {
      service: 'sheets',
      files,
      totalMatches: files.length,
      disambiguationNeeded: files.length > 3,
      topMatch: files[0]
    }
  }

  public async getMetadata(
    spreadsheetId: string,
    options: WorkspaceProviderOptions = {}
  ): Promise<WorkspaceFileMetadata> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`
    const res = await this.fetchWithRetry(url, { method: 'GET', accessToken: options.accessToken })
    if (!res.ok) {
      throw new Error(`Failed to get Sheets metadata: ${res.statusText}`)
    }
    const sheet = await res.json()
    return {
      id: sheet.spreadsheetId,
      name: sheet.properties?.title || 'Untitled Spreadsheet',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      service: 'sheets'
    }
  }

  public async getContent(
    spreadsheetId: string,
    options: WorkspaceProviderOptions & { range?: string } = {}
  ): Promise<WorkspaceExtractedContent> {
    // 1. Fetch spreadsheet metadata to get sheet names
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`
    const metaRes = await this.fetchWithRetry(metaUrl, {
      method: 'GET',
      accessToken: options.accessToken
    })

    let title = 'Google Sheet'
    let firstSheetName = 'Sheet1'

    if (metaRes.ok) {
      const metaData = await metaRes.json()
      title = metaData.properties?.title || title
      firstSheetName = metaData.sheets?.[0]?.properties?.title || firstSheetName
    }

    const range = options.range || `${firstSheetName}!A1:Z100`
    const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    const valRes = await this.fetchWithRetry(valUrl, {
      method: 'GET',
      accessToken: options.accessToken
    })

    let rawText = ''
    let headers: string[] = []
    let rows: string[][] = []

    if (valRes.ok) {
      const valData = await valRes.json()
      const values: string[][] = valData.values || []
      if (values.length > 0) {
        headers = values[0]
        rows = values.slice(1)
        rawText = values.map((row) => row.join('\t')).join('\n')
      }
    } else {
      // Fallback to Drive CSV export
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=text/csv`
      const expRes = await this.fetchWithRetry(exportUrl, {
        method: 'GET',
        accessToken: options.accessToken
      })
      if (expRes.ok) {
        rawText = await expRes.text()
      }
    }

    const parsed = workspaceDocumentParser.parseDocument(
      rawText,
      spreadsheetId,
      title,
      'application/vnd.google-apps.spreadsheet',
      'sheets'
    )

    if (headers.length > 0) {
      parsed.tables = [
        {
          title,
          headers,
          rows
        }
      ]
    }

    return parsed
  }

  /**
   * Helper to compute numerical stats (e.g. average, sum, min, max) on numerical columns
   */
  public calculateStats(
    content: WorkspaceExtractedContent,
    columnName?: string
  ): {
    average: number
    sum: number
    count: number
    min: number
    max: number
    column: string
  } | null {
    if (!content.tables || content.tables.length === 0) return null
    const table = content.tables[0]
    if (!table.headers || table.headers.length === 0) return null

    let targetColIdx = 0
    if (columnName) {
      const foundIdx = table.headers.findIndex((h) =>
        h.toLowerCase().includes(columnName.toLowerCase())
      )
      if (foundIdx >= 0) targetColIdx = foundIdx
    } else {
      // Find first column containing numbers
      for (let c = 0; c < table.headers.length; c++) {
        const hasNum = table.rows.some((r) => !isNaN(parseFloat(r[c])))
        if (hasNum) {
          targetColIdx = c
          break
        }
      }
    }

    const colName = table.headers[targetColIdx] || `Column ${targetColIdx + 1}`
    const numbers: number[] = []

    table.rows.forEach((row) => {
      const val = parseFloat(row[targetColIdx])
      if (!isNaN(val)) {
        numbers.push(val)
      }
    })

    if (numbers.length === 0) return null

    const sum = numbers.reduce((a, b) => a + b, 0)
    const average = sum / numbers.length
    const min = Math.min(...numbers)
    const max = Math.max(...numbers)

    return {
      average: Math.round(average * 100) / 100,
      sum: Math.round(sum * 100) / 100,
      count: numbers.length,
      min,
      max,
      column: colName
    }
  }
}

export const googleSheetsProvider = new GoogleSheetsProvider()
