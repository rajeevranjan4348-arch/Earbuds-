/**
 * Google Workspace Natural Language Intent Router
 * Parses user prompts into structured Workspace actions, services, targets, and operations
 */

import {
  WorkspaceIntent,
  WorkspaceServiceType,
  WorkspaceActionType,
  WorkspaceFileType
} from './types'

export class WorkspaceIntentRouter {
  /**
   * Parse user prompt into structured Workspace intent
   */
  public parse(
    prompt: string,
    activeContext?: { activeFileName?: string; activeFileId?: string }
  ): WorkspaceIntent {
    const raw = prompt.trim()
    const lower = raw.toLowerCase()

    // 1. Identify Service
    let service: WorkspaceServiceType = 'drive'
    if (
      lower.includes('.pdf') ||
      lower.includes('pdf') ||
      lower.includes('drive') ||
      lower.includes('homework')
    ) {
      service = 'drive'
    } else if (
      lower.includes('sheet') ||
      lower.includes('spreadsheet') ||
      lower.includes('excel') ||
      lower.includes('marks') ||
      lower.includes('csv') ||
      lower.includes('calculate average')
    ) {
      service = 'sheets'
    } else if (
      lower.includes('google doc') ||
      lower.includes('my docs') ||
      lower.includes('docs for') ||
      lower.includes('document')
    ) {
      service = 'docs'
    } else if (
      lower.includes('slide') ||
      lower.includes('presentation') ||
      lower.includes('powerpoint') ||
      lower.includes('deck') ||
      lower.includes('pptx')
    ) {
      service = 'slides'
    } else if (
      lower.includes('gmail') ||
      lower.includes('email') ||
      lower.includes('mail') ||
      lower.includes('inbox') ||
      lower.includes('messages from')
    ) {
      service = 'gmail'
    } else if (
      lower.includes('calendar') ||
      lower.includes('schedule') ||
      lower.includes('event') ||
      lower.includes('meeting') ||
      lower.includes('agenda')
    ) {
      service = 'calendar'
    } else if (lower.includes('task') || lower.includes('todo') || lower.includes('to-do')) {
      service = 'tasks'
    } else {
      service = 'drive'
    }

    // 2. Identify Action
    let action: WorkspaceActionType = 'search'
    let isDestructive = false

    if (lower.includes('delete') || lower.includes('trash') || lower.includes('remove')) {
      action = 'delete'
      isDestructive = true
    } else if (
      lower.includes('update') ||
      lower.includes('edit') ||
      lower.includes('modify') ||
      lower.includes('rename') ||
      lower.includes('move')
    ) {
      action = 'update'
      isDestructive = true
    } else if (
      lower.includes('create') ||
      lower.includes('make a new') ||
      lower.includes('send email') ||
      lower.includes('compose')
    ) {
      action = 'create'
      isDestructive = lower.includes('send email')
    } else if (
      lower.includes('compare') ||
      lower.includes('difference between') ||
      lower.includes('versus') ||
      lower.includes('vs')
    ) {
      action = 'compare'
    } else if (
      lower.includes('summarize') ||
      lower.includes('summary') ||
      lower.includes('overview') ||
      lower.includes('tldr')
    ) {
      action = 'summarize'
    } else if (
      lower.includes('analyze') ||
      lower.includes('break down') ||
      lower.includes('review') ||
      lower.includes('inspect')
    ) {
      action = 'analyze'
    } else if (
      lower.includes('calculate') ||
      lower.includes('average') ||
      lower.includes('compute') ||
      lower.includes('sum') ||
      lower.includes('total')
    ) {
      action = 'calculate'
    } else if (
      lower.includes('explain') ||
      lower.includes('tell me about') ||
      lower.includes('what are the questions') ||
      lower.includes('questions are difficult')
    ) {
      action = 'explain'
    } else if (
      lower.includes('extract') ||
      lower.includes('pull out') ||
      lower.includes('find chapter') ||
      lower.includes('get chapter')
    ) {
      action = 'extract'
    } else if (
      lower.includes('open') ||
      lower.includes('read') ||
      lower.includes('show me content') ||
      lower.includes('view')
    ) {
      action = 'read'
    } else if (lower.includes('list') || lower.includes('show all') || lower.includes('browse')) {
      action = 'list'
    } else if (lower.includes('export') || lower.includes('download')) {
      action = 'export'
    } else {
      action = 'search'
    }

    // 3. Identify File Type
    let fileType: WorkspaceFileType | undefined
    if (lower.includes('.pdf') || lower.includes('pdf')) {
      fileType = 'pdf'
    } else if (
      lower.includes('.docx') ||
      lower.includes('.doc') ||
      lower.includes('word') ||
      lower.includes('google doc')
    ) {
      fileType = 'docx'
    } else if (
      lower.includes('.xlsx') ||
      lower.includes('.csv') ||
      lower.includes('sheet') ||
      lower.includes('spreadsheet')
    ) {
      fileType = 'spreadsheet'
    } else if (
      lower.includes('slide') ||
      lower.includes('presentation') ||
      lower.includes('.pptx')
    ) {
      fileType = 'presentation'
    } else if (lower.includes('folder')) {
      fileType = 'folder'
    }

    // 4. Extract Chapter or Section target
    let chapterOrSection: string | undefined
    const chapterMatch = lower.match(
      /\b(?:chapter|ch|section|part|unit)\s*([0-9]+[a-z]?|[ivxlcdm]+)\b/i
    )
    if (chapterMatch) {
      chapterOrSection = `Chapter ${chapterMatch[1]}`
    }

    // 5. Extract Page Number target
    let pageNumber: number | undefined
    const pageMatch = lower.match(/(?:page|pg|pages)\s*([0-9]+)/i)
    if (pageMatch) {
      pageNumber = parseInt(pageMatch[1], 10)
    }

    // 6. Clean Search Query & Target Filename
    let targetFilename: string | undefined
    let query = raw

    // Check conversational context: "analyze chapter 3", "summarize it", "what questions are in it"
    const hasConversationalPronoun =
      lower.includes(' it') ||
      lower.includes(' that') ||
      lower.includes(' the file') ||
      lower.includes(' this document') ||
      lower.includes(' from that') ||
      lower.startsWith('summarize chapter') ||
      lower.startsWith('analyze chapter') ||
      lower.startsWith('explain chapter')

    if (hasConversationalPronoun && activeContext?.activeFileName) {
      targetFilename = activeContext.activeFileName
    }

    // Extract potential quoted file name e.g. "Maths_Homework.pdf"
    const quoteMatch = raw.match(/["']([^"']+)["']/)
    if (quoteMatch) {
      targetFilename = quoteMatch[1]
      query = quoteMatch[1]
    } else {
      // Clean query of noise words
      const cleaned = raw
        .replace(
          /^(find|search|open|check|look for|look through|retrieve|analyze|summarize|calculate|explain|tell me about|what is in)\s+/i,
          ''
        )
        .replace(
          /\s+(in my drive|on drive|in drive|from drive|in docs|in sheets|in gmail|in calendar)\s*$/i,
          ''
        )
        .replace(
          /\s+(and analyze it|and summarize it|and explain it|and calculate the average|and tell me which questions are difficult)\s*$/i,
          ''
        )
        .trim()

      query = cleaned || raw
    }

    // Secondary filename for comparisons
    let secondaryFilename: string | undefined
    if (action === 'compare') {
      const compareMatch = raw.match(
        /compare\s+(?:my\s+)?(.+?)\s+(?:with|and|to|against)\s+(?:my\s+)?(.+)/i
      )
      if (compareMatch) {
        targetFilename = compareMatch[1].trim()
        secondaryFilename = compareMatch[2].trim()
      }
    }

    return {
      service,
      action,
      query,
      fileType,
      operation: action,
      chapterOrSection,
      pageNumber,
      targetFilename,
      secondaryFilename,
      isDestructive,
      confidence: 0.95,
      rawPrompt: raw
    }
  }
}

export const workspaceIntentRouter = new WorkspaceIntentRouter()
