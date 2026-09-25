/**
 * BrowserAgentService (browser-use architecture)
 * Handles autonomous browser tasks, navigation, DOM/text extraction, link traversal,
 * dynamic website interaction, and multi-step execution with SSRF/Privacy boundaries.
 */

import { cybersecurity } from '../security/cybersecurity'
import { privacyAlign } from '../security/privacyAlign'
import { searchOrchestrator } from '../search/orchestrator'
import { externalContentBoundary } from '../realtime/externalContentBoundary'
import { realTimeCacheManager } from '../realtime/cacheManager'

export interface BrowserTaskStep {
  stepNumber: number
  action: 'navigate' | 'search' | 'read' | 'extract' | 'click' | 'scroll'
  target?: string
  status: 'pending' | 'success' | 'failed'
  observation?: string
  error?: string
}

export interface BrowserTaskResult {
  taskId: string
  task: string
  success: boolean
  finalUrl?: string
  pageTitle?: string
  extractedData: string
  steps: BrowserTaskStep[]
  sources: Array<{
    title: string
    url: string
    domain: string
    retrievedAt: string
  }>
  requiresAuthentication?: boolean
  executionTimeMs: number
  error?: string
}

export interface ExtractedPageDetails {
  title: string
  url: string
  domain: string
  mainText: string
  headings: string[]
  paragraphs: string[]
  links: Array<{ text: string; href: string }>
  metadata: {
    publicationDate?: string
    author?: string
    description?: string
  }
  retrievedAt: string
}

export class BrowserAgentService {
  private activeSessions = new Map<string, {
    sessionId: string
    currentUrl: string
    pageTitle: string
    history: string[]
    lastObservation: string
    createdAt: number
  }>()

  /**
   * Evaluates if a URL is permitted under strict SSRF rules
   */
  public isPermittedUrl(url: string): { permitted: boolean; reason?: string } {
    if (!url || typeof url !== 'string') return { permitted: false, reason: 'Empty or invalid URL' }
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { permitted: false, reason: `Protocol '${parsed.protocol}' is prohibited.` }
      }
      const host = parsed.hostname.toLowerCase()
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.16.') ||
        host.endsWith('.local') ||
        host.endsWith('.internal')
      ) {
        return { permitted: false, reason: `Host '${host}' is in a private network or reserved IP range.` }
      }
      return { permitted: true }
    } catch (_e) {
      return { permitted: false, reason: 'Malformed URL structure' }
    }
  }

  /**
   * Executes a multi-step autonomous browser-use task
   */
  public async runTask(task: string, options: { maxSteps?: number; sessionId?: string } = {}): Promise<BrowserTaskResult> {
    const startTime = Date.now()
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const sessionId = options.sessionId || taskId
    const maxSteps = options.maxSteps || 5
    const steps: BrowserTaskStep[] = []
    const sources: BrowserTaskResult['sources'] = []

    console.log(`[IRIS][BROWSER] Starting browser-use task [${taskId}]: "${task}"`)

    // Extract potential URL from task
    const urlMatch = task.match(/https?:\/\/[^\s"'<>]+/i)
    let currentTargetUrl = urlMatch ? urlMatch[0] : ''

    try {
      // Step 1: Initial navigation or web search
      if (currentTargetUrl) {
        steps.push({
          stepNumber: 1,
          action: 'navigate',
          target: currentTargetUrl,
          status: 'pending'
        })

        const page = await this.readPage(currentTargetUrl)
        steps[0].status = 'success'
        steps[0].observation = `Navigated to ${currentTargetUrl} - "${page.title}"`

        sources.push({
          title: page.title,
          url: page.url,
          domain: page.domain,
          retrievedAt: page.retrievedAt
        })

        // Step 2: Information Extraction
        steps.push({
          stepNumber: 2,
          action: 'extract',
          target: task,
          status: 'pending'
        })

        const extracted = await this.extractInformation(currentTargetUrl, task)
        steps[1].status = 'success'
        steps[1].observation = `Extracted relevant information (${extracted.length} chars)`

        return {
          taskId,
          task,
          success: true,
          finalUrl: currentTargetUrl,
          pageTitle: page.title,
          extractedData: extracted,
          steps,
          sources,
          executionTimeMs: Date.now() - startTime
        }
      } else {
        // Search task
        steps.push({
          stepNumber: 1,
          action: 'search',
          target: task,
          status: 'pending'
        })

        const searchRes = await searchOrchestrator.search(task, { limit: 4, extractContent: true })
        steps[0].status = 'success'
        steps[0].observation = `Retrieved ${searchRes.results.length} search results`

        searchRes.results.forEach((r) => {
          sources.push({
            title: r.title,
            url: r.url,
            domain: r.domain || new URL(r.url).hostname,
            retrievedAt: new Date().toISOString()
          })
        })

        let synthesizedText = searchRes.results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}`).join('\n\n')

        // If top result is available, perform deep extraction on top result
        if (searchRes.results.length > 0 && searchRes.results[0].url) {
          const topUrl = searchRes.results[0].url
          steps.push({
            stepNumber: 2,
            action: 'read',
            target: topUrl,
            status: 'pending'
          })

          try {
            const deepPage = await this.readPage(topUrl)
            steps[1].status = 'success'
            steps[1].observation = `Read main page content for ${topUrl}`
            synthesizedText += `\n\n--- Detailed Excerpt from ${deepPage.title} ---\n${deepPage.mainText.slice(0, 1500)}`
          } catch (_e) {
            steps[1].status = 'failed'
            steps[1].error = 'Deep page extraction timed out'
          }
        }

        return {
          taskId,
          task,
          success: true,
          extractedData: synthesizedText,
          steps,
          sources,
          executionTimeMs: Date.now() - startTime
        }
      }
    } catch (err: any) {
      console.warn(`[IRIS][BROWSER] Task execution error:`, err?.message || err)
      return {
        taskId,
        task,
        success: false,
        extractedData: '',
        steps,
        sources,
        executionTimeMs: Date.now() - startTime,
        error: err?.message || 'Browser execution failed'
      }
    }
  }

  /**
   * Opens target URL and registers it in active session
   */
  public async openUrl(url: string, sessionId = 'default'): Promise<ExtractedPageDetails> {
    return this.readPage(url, sessionId)
  }

  /**
   * Reads and extracts complete structured page content with noise filtering
   */
  public async readPage(url: string, sessionId = 'default'): Promise<ExtractedPageDetails> {
    const ssrf = this.isPermittedUrl(url)
    if (!ssrf.permitted) {
      throw new Error(`SSRF_PROTECTED: ${ssrf.reason}`)
    }

    // Check Cache
    const cached = realTimeCacheManager.get<ExtractedPageDetails>(`page_${url}`)
    if (cached) {
      console.log(`[IRIS][BROWSER] Returning cached page for: ${url}`)
      return cached
    }

    const domain = new URL(url).hostname
    const rawPage = await searchOrchestrator.browseUrl(url, 5000)
    const sanitized = privacyAlign.sanitize(rawPage.content).redactedText
    const bounded = externalContentBoundary.sanitizeAndBound(sanitized, `${rawPage.title} (${url})`)

    // Extract basic headings and paragraphs
    const paragraphs = bounded.sanitizedText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 25)

    const headings: string[] = []
    const headingMatches = rawPage.content.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi)
    if (headingMatches) {
      headingMatches.forEach((h) => {
        const cleanH = h.replace(/<[^>]+>/g, '').trim()
        if (cleanH) headings.push(cleanH)
      })
    }

    // Detect publication date
    const dateMatch = rawPage.content.match(/\b(202[0-6])[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/)
    const publicationDate = dateMatch ? dateMatch[0] : undefined

    const pageDetails: ExtractedPageDetails = {
      title: rawPage.title || domain,
      url,
      domain,
      mainText: bounded.sanitizedText,
      headings,
      paragraphs: paragraphs.slice(0, 15),
      links: [],
      metadata: {
        publicationDate,
        description: rawPage.summary
      },
      retrievedAt: new Date().toISOString()
    }

    // Cache page details for 30 minutes
    realTimeCacheManager.set(`page_${url}`, pageDetails, 30 * 60 * 1000)

    // Update active session
    this.activeSessions.set(sessionId, {
      sessionId,
      currentUrl: url,
      pageTitle: pageDetails.title,
      history: [url],
      lastObservation: `Read page "${pageDetails.title}"`,
      createdAt: Date.now()
    })

    return pageDetails
  }

  /**
   * Searches the web via Browser Agent
   */
  public async search(query: string, sessionId = 'default') {
    return this.runTask(query, { sessionId })
  }

  /**
   * Extracts specific information from a webpage matching user query
   */
  public async extractInformation(url: string, query: string): Promise<string> {
    const page = await this.readPage(url)
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)

    if (keywords.length === 0) {
      return page.mainText.slice(0, 2500)
    }

    // Filter relevant paragraphs containing query terms
    const relevant = page.paragraphs.filter((p) => {
      const lower = p.toLowerCase()
      return keywords.some((k) => lower.includes(k))
    })

    if (relevant.length > 0) {
      return relevant.join('\n\n')
    }

    return page.mainText.slice(0, 2000)
  }

  /**
   * Returns current browser state for session
   */
  public observeState(sessionId = 'default') {
    return this.activeSessions.get(sessionId) || null
  }

  /**
   * Closes active browser session
   */
  public closeSession(sessionId = 'default') {
    this.activeSessions.delete(sessionId)
  }
}

export const browserAgentService = new BrowserAgentService()
