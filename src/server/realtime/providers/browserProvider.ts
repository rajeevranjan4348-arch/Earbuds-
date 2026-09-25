/**
 * BrowserProvider Implementation
 * Implements BrowserTool abstraction with SSRF protection, title & publication date extraction.
 */

import { BrowserProvider, WebPageData } from '../types'
import { browserUseAgent } from '../../browser/browserAgent'

export class DefaultBrowserProvider implements BrowserProvider {
  public name = 'DefaultBrowserProvider'

  /**
   * SSRF Security Boundary: Blocks internal/private networks
   */
  public isUrlAllowed(urlStr: string): boolean {
    if (!urlStr) return false
    try {
      const parsed = new URL(urlStr)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false
      }

      const host = parsed.hostname.toLowerCase()

      // Block local/private IPs and localhost
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

  public async fetchPage(urlStr: string): Promise<WebPageData> {
    if (!this.isUrlAllowed(urlStr)) {
      throw new Error(`SSRF_PROTECTION: Access to target URL '${urlStr}' is restricted or invalid.`)
    }

    try {
      const agentRes = await browserUseAgent.executeAction({
        type: 'navigate',
        url: urlStr
      })

      const rawContent = agentRes.content || agentRes.text || ''
      const title = agentRes.title || this.extractTitleFromContent(rawContent) || 'Web Document'

      return {
        url: urlStr,
        title,
        content: rawContent.substring(0, 12000), // Max 12k chars for token efficiency
        publicationDate: this.detectPublicationDate(rawContent) || new Date().toISOString()
      }
    } catch (err: any) {
      console.warn(`[BrowserProvider] Fetch page warning for ${urlStr}:`, err)
      return {
        url: urlStr,
        title: 'Document (Read Error)',
        content: `Could not retrieve full content: ${err?.message || 'Network error'}`,
        publicationDate: new Date().toISOString()
      }
    }
  }

  public async readPageSection(urlStr: string, _selector?: string): Promise<string> {
    const page = await this.fetchPage(urlStr)
    return page.content.substring(0, 4000)
  }

  private extractTitleFromContent(text: string): string {
    const match = text.match(/#\s+(.+)/)
    if (match) return match[1].trim()
    return 'Extracted Web Article'
  }

  private detectPublicationDate(text: string): string | null {
    const dateMatch = text.match(/\b(202[0-6])[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/)
    if (dateMatch) return dateMatch[0]
    return null
  }
}

export const defaultBrowserProvider = new DefaultBrowserProvider()
