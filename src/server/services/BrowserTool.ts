/**
 * BrowserTool Utility
 * Enables controlled, secure web page fetching and content extraction,
 * enforcing SSRF security boundaries and sanitizing output via ExternalContentBoundary.
 */

import { externalContentBoundary, SanitizedBoundaryOutput } from './ExternalContentBoundary'
import { browserUseAgent } from '../browser/browserAgent'

export interface FetchedWebPageResult {
  url: string
  title: string
  content: string
  boundedContent: SanitizedBoundaryOutput
  publishedDate?: string
  success: boolean
  error?: string
}

export class BrowserTool {
  /**
   * SSRF Protection: Blocks private IPs, localhost, and non-HTTP protocols
   */
  public isUrlPermitted(targetUrl: string): boolean {
    if (!targetUrl) return false
    try {
      const parsed = new URL(targetUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false
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
        return false
      }

      return true
    } catch (_e) {
      return false
    }
  }

  /**
   * Fetches target webpage and extracts sanitized content
   */
  public async fetchAndExtract(url: string): Promise<FetchedWebPageResult> {
    if (!this.isUrlPermitted(url)) {
      return {
        url,
        title: 'Access Denied',
        content: '',
        boundedContent: externalContentBoundary.sanitizeAndBound('', url),
        success: false,
        error: `SSRF_PROTECTION_BLOCKED: Access to URL '${url}' is prohibited.`
      }
    }

    try {
      const agentRes = await browserUseAgent.executeAction({
        type: 'navigate',
        url
      })

      const rawText = agentRes.content || agentRes.text || ''
      const title = agentRes.title || 'Web Document'
      const bounded = externalContentBoundary.sanitizeAndBound(rawText, `${title} (${url})`)

      return {
        url,
        title,
        content: bounded.sanitizedText,
        boundedContent: bounded,
        publishedDate: this.detectPublicationDate(rawText) || new Date().toISOString(),
        success: true
      }
    } catch (err: any) {
      return {
        url,
        title: 'Fetch Error',
        content: '',
        boundedContent: externalContentBoundary.sanitizeAndBound('', url),
        success: false,
        error: err?.message || 'Error executing web page fetch.'
      }
    }
  }

  private detectPublicationDate(text: string): string | null {
    const match = text.match(/\b(202[0-6])[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/)
    return match ? match[0] : null
  }
}

export const browserTool = new BrowserTool()
