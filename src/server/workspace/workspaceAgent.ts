/**
 * Google Workspace Intelligence & Data Agent
 * Orchestrates multi-step reasoning, search, retrieval, parsing, citations, and analysis
 */

import { GoogleGenAI } from '@google/genai'
import {
  WorkspaceIntent,
  WorkspaceAnalysisResult,
  WorkspaceSearchResult,
  WorkspaceExtractedContent,
  WorkspaceCitation,
  WorkspaceFileMetadata,
  WorkspaceServiceType
} from './types'
import { workspaceIntentRouter } from './intentRouter'
import { workspaceContextMemory } from './contextMemory'
import { workspaceDocumentParser } from './parser'
import { googleDriveProvider } from './providers/driveProvider'
import { googleDocsProvider } from './providers/docsProvider'
import { googleSheetsProvider } from './providers/sheetsProvider'
import { googleSlidesProvider } from './providers/slidesProvider'
import { googleGmailProvider } from './providers/gmailProvider'
import { googleCalendarProvider } from './providers/calendarProvider'

let genAIInstance: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (!genAIInstance && process.env.GEMINI_API_KEY) {
    genAIInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return genAIInstance
}

export class WorkspaceAgent {
  /**
   * Main entry point for processing a user Workspace query
   */
  public async execute(
    prompt: string,
    options: {
      userId?: string
      accessToken?: string
      confirmed?: boolean
    } = {}
  ): Promise<WorkspaceAnalysisResult> {
    const userId = options.userId || 'usr_primary'
    const activeCtx = workspaceContextMemory.getActiveFile(userId)

    // 1. Parse natural language intent
    const intent = workspaceIntentRouter.parse(prompt, activeCtx)
    workspaceContextMemory.recordQuery(userId, prompt)

    // 2. Check for destructive action requiring confirmation
    if (intent.isDestructive && !options.confirmed) {
      const targetName = intent.targetFilename || 'the specified item'
      return {
        success: false,
        intent,
        answer: `⚠️ **Confirmation Required**: This action will modify or delete "${targetName}" in your Google Workspace. Please confirm if you want to proceed.`,
        citations: [],
        requiresConfirmation: true,
        confirmationMessage: `Are you sure you want to execute "${intent.action}" on "${targetName}"?`
      }
    }

    // 3. Multi-step Chained Workflow: File Comparison
    if (intent.action === 'compare' && intent.secondaryFilename) {
      return this.handleFileComparison(intent, options)
    }

    // 4. Conversational follow-up on active document
    const isFollowUp =
      (intent.chapterOrSection ||
        intent.pageNumber ||
        intent.action === 'summarize' ||
        intent.action === 'analyze' ||
        intent.action === 'calculate' ||
        intent.action === 'explain') &&
      activeCtx.content &&
      (!intent.query ||
        intent.query.length < 5 ||
        intent.rawPrompt.toLowerCase().includes('chapter') ||
        intent.rawPrompt.toLowerCase().includes('from that') ||
        intent.rawPrompt.toLowerCase().includes('it'))

    if (isFollowUp && activeCtx.content) {
      return this.analyzeExistingContent(activeCtx.content, intent)
    }

    // 5. Normal Search & Retrieve Workflow
    return this.handleSearchAndAnalyze(intent, options)
  }

  /**
   * Search and analyze workflow
   */
  private async handleSearchAndAnalyze(
    intent: WorkspaceIntent,
    options: { userId?: string; accessToken?: string }
  ): Promise<WorkspaceAnalysisResult> {
    const userId = options.userId || 'usr_primary'
    const provider = this.getProvider(intent.service)

    let searchResult: WorkspaceSearchResult
    try {
      searchResult = await provider.search(intent.query || intent.targetFilename || '', {
        accessToken: options.accessToken,
        fileType: intent.fileType
      })
    } catch (err: any) {
      return {
        success: false,
        intent,
        answer: `Could not search Google Workspace: ${err?.message || 'Authentication error or service unavailable.'}`,
        citations: [],
        diagnosticNotes: [
          'Ensure your Google account is connected with valid permissions.',
          'Verify that you have authorized Google Drive access.'
        ],
        error: err?.message
      }
    }

    // No files found -> provide helpful search diagnostics
    if (searchResult.files.length === 0) {
      return {
        success: false,
        intent,
        answer: `I couldn't find any matching files for "${intent.query}" in your connected Google ${intent.service.toUpperCase()}.`,
        citations: [],
        diagnosticNotes: [
          `Searched query: "${intent.query}" in Google ${intent.service}`,
          intent.fileType
            ? `Filtered by file type: ${intent.fileType}`
            : 'No file type filter applied',
          'Tip: Check if the file is in a shared drive or trash.',
          'Tip: Try searching by a specific keyword or part of the title.'
        ]
      }
    }

    // Multiple files matched similarly -> ask for disambiguation
    if (searchResult.disambiguationNeeded && searchResult.disambiguationPrompt) {
      return {
        success: true,
        intent,
        answer: searchResult.disambiguationPrompt,
        citations: searchResult.files.slice(0, 3).map((f) => ({
          fileName: f.name,
          source: `Google ${intent.service.toUpperCase()}`,
          service: intent.service,
          fileId: f.id,
          link: f.webViewLink
        }))
      }
    }

    // Single clear match -> Retrieve, Parse, and Analyze
    const primaryFile = searchResult.topMatch || searchResult.files[0]

    let content: WorkspaceExtractedContent
    try {
      content = await provider.getContent(primaryFile.id, { accessToken: options.accessToken })
    } catch (err: any) {
      return {
        success: false,
        intent,
        primaryFile,
        answer: `I found "${primaryFile.name}", but your current Google permissions don't allow reading its content.`,
        citations: [
          {
            fileName: primaryFile.name,
            source: `Google ${intent.service.toUpperCase()}`,
            service: intent.service,
            fileId: primaryFile.id,
            link: primaryFile.webViewLink
          }
        ],
        error: err?.message
      }
    }

    // Store in conversational task context memory
    workspaceContextMemory.setActiveFile(userId, primaryFile, content)

    // Analyze content with AI reasoning layer
    return this.analyzeExistingContent(content, intent, primaryFile)
  }

  /**
   * Handle document comparison workflow
   */
  private async handleFileComparison(
    intent: WorkspaceIntent,
    options: { userId?: string; accessToken?: string }
  ): Promise<WorkspaceAnalysisResult> {
    const provider = this.getProvider(intent.service)

    try {
      const search1 = await provider.search(intent.targetFilename || '', {
        accessToken: options.accessToken
      })
      const search2 = await provider.search(intent.secondaryFilename || '', {
        accessToken: options.accessToken
      })

      if (search1.files.length === 0 || search2.files.length === 0) {
        return {
          success: false,
          intent,
          answer: `Could not find both files to compare. Found: "${search1.files[0]?.name || 'none'}" and "${search2.files[0]?.name || 'none'}".`,
          citations: []
        }
      }

      const file1 = search1.files[0]
      const file2 = search2.files[0]

      const content1 = await provider.getContent(file1.id, { accessToken: options.accessToken })
      const content2 = await provider.getContent(file2.id, { accessToken: options.accessToken })

      const text1Excerpt = content1.rawText.slice(0, 3000)
      const text2Excerpt = content2.rawText.slice(0, 3000)

      const ai = getGemini()
      let answer = ''

      if (ai) {
        const prompt = `Compare the following two documents from Google Workspace:\n\n=== Document 1: "${file1.name}" ===\n${text1Excerpt}\n\n=== Document 2: "${file2.name}" ===\n${text2Excerpt}\n\nProvide a structured comparison highlighting key differences, additions, updates, or changes.`
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt
        })
        answer = response.text || 'Comparison generated.'
      } else {
        answer = `### Comparison: "${file1.name}" vs "${file2.name}"\n\n- **Document 1**: ${file1.name} (${content1.totalPages || 1} pages, ${content1.rawText.length} characters)\n- **Document 2**: ${file2.name} (${content2.totalPages || 1} pages, ${content2.rawText.length} characters)\n\nBoth files have been retrieved and verified from Google Drive.`
      }

      const citations: WorkspaceCitation[] = [
        { fileName: file1.name, source: 'Google Drive', service: 'drive', fileId: file1.id },
        { fileName: file2.name, source: 'Google Drive', service: 'drive', fileId: file2.id }
      ]

      return {
        success: true,
        intent,
        primaryFile: file1,
        secondaryFile: file2,
        answer,
        citations
      }
    } catch (err: any) {
      return {
        success: false,
        intent,
        answer: `Error comparing files: ${err?.message}`,
        citations: []
      }
    }
  }

  /**
   * Analyze extracted document content using targeted section retrieval & Gemini reasoning
   */
  private async analyzeExistingContent(
    content: WorkspaceExtractedContent,
    intent: WorkspaceIntent,
    fileMeta?: WorkspaceFileMetadata
  ): Promise<WorkspaceAnalysisResult> {
    const citations: WorkspaceCitation[] = []

    // 1. Calculate stats if it's a spreadsheet operation (e.g. calculate average marks)
    if (intent.service === 'sheets' || intent.action === 'calculate') {
      const stats = googleSheetsProvider.calculateStats(content)
      if (stats) {
        const statAnswer = `### Spreadsheet Analysis: "${content.fileName}"\n\n- **Target Column**: ${stats.column}\n- **Calculated Average**: **${stats.average}**\n- **Sum**: ${stats.sum}\n- **Total Entries**: ${stats.count}\n- **Range**: ${stats.min} – ${stats.max}`
        citations.push({
          fileName: content.fileName,
          source: 'Google Sheets',
          service: 'sheets',
          fileId: content.fileId
        })
        return {
          success: true,
          intent,
          primaryFile: fileMeta,
          extractedContent: content,
          answer: statAnswer,
          citations
        }
      }
    }

    // 2. Targeted section extraction (e.g., Chapter 3, Pages 12-15)
    let targetedText = content.rawText
    let citationPage: number | undefined

    if (intent.chapterOrSection) {
      targetedText = workspaceDocumentParser.extractSection(content, intent.chapterOrSection)
      const matchingPage = content.pages?.find(
        (p) =>
          (p.heading || '').toLowerCase().includes(intent.chapterOrSection!.toLowerCase()) ||
          p.text.toLowerCase().includes(intent.chapterOrSection!.toLowerCase())
      )
      if (matchingPage) citationPage = matchingPage.pageNumber
    } else if (intent.pageNumber) {
      targetedText = workspaceDocumentParser.extractPages(
        content,
        intent.pageNumber,
        intent.pageNumber
      )
      citationPage = intent.pageNumber
    } else if (content.rawText.length > 5000) {
      // Chunking for large documents: select first 3 pages
      targetedText =
        content.pages
          ?.slice(0, 3)
          .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
          .join('\n\n') || content.rawText.slice(0, 5000)
    }

    citations.push({
      fileName: content.fileName,
      source: `Google ${content.service.toUpperCase()}`,
      service: content.service,
      pageNumber: citationPage,
      sectionHeading: intent.chapterOrSection,
      fileId: content.fileId
    })

    const ai = getGemini()
    let answer = ''

    if (ai) {
      const systemPrompt = `You are a Google Workspace Intelligence & Data Agent.
Analyze the following extracted content from "${content.fileName}" (${content.service}).
User Intent: ${intent.rawPrompt}
Specific Chapter/Section: ${intent.chapterOrSection || 'Entire Document'}

Guidelines:
1. Ground your answer strictly on the provided document text.
2. Structure your response clearly with headings, bullet points, and key takeaways.
3. If the user asked to explain questions or identify difficult concepts, categorize them clearly.
4. Include exact page/section provenance: "Based on "${content.fileName}"${citationPage ? `, Page ${citationPage}` : ''}..."`

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `[DOCUMENT EXCERPT - ${content.fileName}]:\n${targetedText}\n\n[USER PROMPT]:\n${intent.rawPrompt}`,
        config: {
          systemInstruction: systemPrompt
        }
      })
      answer = response.text || `Processed "${content.fileName}".`
    } else {
      answer = `Based on **"${content.fileName}"** (Pages 1–${content.totalPages || 1}):\n\n${targetedText.slice(0, 800)}...`
    }

    return {
      success: true,
      intent,
      primaryFile: fileMeta,
      extractedContent: content,
      answer,
      citations
    }
  }

  private getProvider(service: WorkspaceServiceType) {
    switch (service) {
      case 'drive':
        return googleDriveProvider
      case 'docs':
        return googleDocsProvider
      case 'sheets':
        return googleSheetsProvider
      case 'slides':
        return googleSlidesProvider
      case 'gmail':
        return googleGmailProvider
      case 'calendar':
        return googleCalendarProvider
      default:
        return googleDriveProvider
    }
  }
}

export const workspaceAgent = new WorkspaceAgent()
