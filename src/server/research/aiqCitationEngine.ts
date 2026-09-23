/**
 * AI-Q Citation-Backed Answer Engine
 *
 * Annotates model responses with verified research sources, scientific literature,
 * document excerpts, and workspace assets discovered during agent execution.
 */

export interface DiscoveredResearchSource {
  id?: string
  title: string
  url: string
  snippet?: string
  domain?: string
  sourceType: 'web' | 'scientific' | 'document' | 'workspace' | 'deepseek'
  confidenceScore?: number
  section?: string
  pageNumber?: number
}

export interface AIQCitation {
  index: number
  id: string
  title: string
  url: string
  domain: string
  snippet: string
  sourceType: 'web' | 'scientific' | 'document' | 'workspace' | 'deepseek'
  confidenceScore: number
}

export interface AIQAnnotatedResponse {
  rawText: string
  annotatedText: string
  citations: AIQCitation[]
  sourcesCount: number
  hasCitations: boolean
}

export class AIQCitationEngine {
  /**
   * Builds the AI-Q Grounding directive to inject into system prompts
   */
  public buildGroundingInstruction(sources: DiscoveredResearchSource[]): string {
    if (!sources || sources.length === 0) return ''

    const citationsText = sources
      .map((s, idx) => {
        const num = idx + 1
        const domainStr = s.domain ? ` [${s.domain}]` : ''
        return `[Source ${num}]: "${s.title}"${domainStr}\nURL: ${s.url}\nExcerpt: ${s.snippet || 'Referenced evidence.'}`
      })
      .join('\n\n')

    return `
[AI-Q CITATION-BACKED KNOWLEDGE BASE]:
${citationsText}

AI-Q Grounding & Citation Directives:
1. Ground your reasoning in the verified sources provided above.
2. When asserting facts, data, or empirical findings discovered from these sources, cite them inline using standard bracket notations like [1], [2] or direct Markdown links [Source Name](URL).
3. Ensure every factual claim has clear provenance to its corresponding research source.
`
  }

  /**
   * Annotates model response text with verified hyperlinks to discovered research sources
   */
  public annotateResponse(
    responseText: string,
    discoveredSources: DiscoveredResearchSource[]
  ): AIQAnnotatedResponse {
    if (!discoveredSources || discoveredSources.length === 0) {
      return {
        rawText: responseText,
        annotatedText: responseText,
        citations: [],
        sourcesCount: 0,
        hasCitations: false
      }
    }

    // Deduplicate sources by URL
    const uniqueMap = new Map<string, DiscoveredResearchSource>()
    for (const src of discoveredSources) {
      if (src.url && !uniqueMap.has(src.url)) {
        uniqueMap.set(src.url, src)
      }
    }

    const uniqueSources = Array.from(uniqueMap.values())
    const citations: AIQCitation[] = uniqueSources.map((src, idx) => {
      let domain = src.domain || ''
      if (!domain && src.url) {
        try {
          domain = new URL(src.url).hostname.replace(/^www\./, '')
        } catch (_e) {
          domain = src.sourceType
        }
      }

      return {
        index: idx + 1,
        id: src.id || `aiq_src_${idx + 1}`,
        title: src.title || `Research Source ${idx + 1}`,
        url: src.url,
        domain: domain || 'web',
        snippet: (src.snippet || '').slice(0, 240),
        sourceType: src.sourceType,
        confidenceScore: src.confidenceScore || 0.95
      }
    })

    let annotatedText = responseText

    // Check if the response text already has bracketed source indicators like [1], [Source 1], etc.
    let replacedCount = 0
    citations.forEach((c) => {
      // Regex for [1], [Source 1], [src 1]
      const numPattern = new RegExp(`\\[(?:Source\\s*)?${c.index}\\]`, 'gi')
      if (numPattern.test(annotatedText)) {
        annotatedText = annotatedText.replace(
          numPattern,
          `[[${c.index}: ${c.title}](${c.url})]`
        )
        replacedCount++
      }
    })

    // If citations weren't inline-cited or only partially cited, append an AI-Q Research Citations footer
    const citationFooterExists =
      annotatedText.includes('AI-Q Verified Research Sources') ||
      annotatedText.includes('References:') ||
      annotatedText.includes('Sources:')

    if (!citationFooterExists && citations.length > 0) {
      const citationList = citations
        .map(
          (c) =>
            `- [${c.index}] [${c.title}](${c.url}) — *${c.domain}*${c.snippet ? `: ${c.snippet.slice(0, 100)}...` : ''}`
        )
        .join('\n')

      annotatedText = `${annotatedText.trim()}\n\n---\n**AI-Q Verified Research Sources:**\n${citationList}`
    }

    return {
      rawText: responseText,
      annotatedText,
      citations,
      sourcesCount: citations.length,
      hasCitations: citations.length > 0
    }
  }
}

export const aiqCitationEngine = new AIQCitationEngine()
