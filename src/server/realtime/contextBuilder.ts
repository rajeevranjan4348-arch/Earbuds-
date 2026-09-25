/**
 * ContextBuilder
 * Synthesizes user query, conversation history, user memories, tool results, and source metadata
 * into clean, token-compressed, structured context for the AI model.
 */

import { SourceMetadata } from './types'
import { externalContentBoundary } from './externalContentBoundary'

export interface ContextBuilderInput {
  userQuery: string
  conversationHistory?: Array<{ role: string; content?: string; text?: string }>
  memories?: string[]
  toolResults?: Array<{ toolName: string; result: any; sources?: SourceMetadata[] }>
  sources?: SourceMetadata[]
}

export interface BuiltContext {
  formattedContextPrompt: string
  sourceCitations: Array<{ title: string; url: string; source: string; publishedAt?: string }>
  memoryUsed: string[]
  totalSourcesCount: number
}

export class ContextBuilder {
  /**
   * Synthesizes and compresses context into a clean prompt format
   */
  public build(input: ContextBuilderInput): BuiltContext {
    const now = new Date()
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    const formattedTime = now.toLocaleTimeString('en-US')

    let contextStr = `[REAL-TIME ENVIRONMENT TELEMETRY]\n`
    contextStr += `- Current Date: ${formattedDate}\n`
    contextStr += `- Current Time: ${formattedTime}\n`
    contextStr += `- Current ISO Timestamp: ${now.toISOString()}\n\n`

    // 1. User Memories
    const memoryUsed: string[] = []
    if (input.memories && input.memories.length > 0) {
      contextStr += `[RELEVANT USER LONG-TERM MEMORY]:\n`
      for (const mem of input.memories) {
        contextStr += `- ${mem}\n`
        memoryUsed.push(mem)
      }
      contextStr += `\n`
    }

    // 2. Aggregate & Deduplicate Sources
    const aggregatedSources: SourceMetadata[] = []
    const seenUrls = new Set<string>()

    if (input.sources) {
      for (const s of input.sources) {
        if (s.url && !seenUrls.has(s.url)) {
          seenUrls.add(s.url)
          aggregatedSources.push(s)
        }
      }
    }

    if (input.toolResults) {
      for (const tr of input.toolResults) {
        if (tr.sources) {
          for (const s of tr.sources) {
            if (s.url && !seenUrls.has(s.url)) {
              seenUrls.add(s.url)
              aggregatedSources.push(s)
            }
          }
        }
      }
    }

    // 3. Render Tool Execution Results safely via ExternalContentBoundary
    if (input.toolResults && input.toolResults.length > 0) {
      contextStr += `[RETRIEVED REAL-TIME TOOL DATA]:\n`
      for (const tr of input.toolResults) {
        const jsonStr = JSON.stringify(tr.result, null, 2)
        const bounded = externalContentBoundary.sanitize(jsonStr, tr.toolName)
        contextStr += `--- TOOL RESULT: ${tr.toolName} ---\n${bounded.sanitizedContent}\n\n`
      }
    }

    // 4. Render Retrieved External Web Sources
    const sourceCitations: Array<{ title: string; url: string; source: string; publishedAt?: string }> = []

    if (aggregatedSources.length > 0) {
      contextStr += `[VERIFIED REAL-TIME EXTERNAL SOURCES]:\n`
      for (let i = 0; i < aggregatedSources.length; i++) {
        const s = aggregatedSources[i]
        sourceCitations.push({
          title: s.title,
          url: s.url,
          source: s.source,
          publishedAt: s.publishedAt
        })

        const snippetBounded = externalContentBoundary.sanitize(
          s.content ? s.content.substring(0, 1500) : s.snippet,
          `${s.source} (${s.title})`
        )

        contextStr += `[Source ${i + 1}]: ${s.title}\n`
        contextStr += `- URL: ${s.url}\n`
        contextStr += `- Domain: ${s.source}\n`
        contextStr += `- Published: ${s.publishedAt || 'N/A'}\n`
        contextStr += `- Freshness: ${s.freshness}\n`
        contextStr += `- Snippet/Content:\n${snippetBounded.sanitizedContent}\n\n`
      }
    }

    return {
      formattedContextPrompt: contextStr.trim(),
      sourceCitations,
      memoryUsed,
      totalSourcesCount: aggregatedSources.length
    }
  }
}

export const contextBuilder = new ContextBuilder()
