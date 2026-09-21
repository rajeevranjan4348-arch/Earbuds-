/**
 * MCP & Agent Search Tools Definition
 * Exposes standardized tool specifications and executors for agent loops and Gemini function calling.
 */

import { searchOrchestrator } from './orchestrator'
import type { SearchCategory, TimeRange } from './types'

export const searchToolDefinitions = [
  {
    name: 'web_search',
    description:
      'Performs a real-time web search for current events, latest news, technical documentation, or factual questions across metasearch engines.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query or keywords to look up.'
        },
        category: {
          type: 'STRING',
          description: 'Optional category: general, news, science, or it.',
          enum: ['general', 'news', 'science', 'it']
        },
        time_range: {
          type: 'STRING',
          description: 'Optional time range filter: day, week, month, or year.',
          enum: ['day', 'week', 'month', 'year']
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of search results to return (default: 5).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'open_url',
    description:
      'Fetches, extracts, and reads the clean text and markdown content of any specific webpage URL, stripping ads, styles, and scripts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'The full HTTP/HTTPS URL of the webpage to browse and extract.'
        },
        max_chars: {
          type: 'INTEGER',
          description: 'Maximum character length of content to extract (default: 3500).'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'deep_research',
    description:
      'Executes multi-query deep research on a topic, executing subqueries, aggregating web sources, and synthesizing comprehensive findings with citations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: {
          type: 'STRING',
          description: 'The complex subject, topic, or technical question to thoroughly research.'
        },
        depth: {
          type: 'STRING',
          description: 'Depth of research: standard (2 queries) or deep (3 queries).',
          enum: ['standard', 'deep']
        }
      },
      required: ['topic']
    }
  }
]

export async function executeSearchTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'web_search': {
      const response = await searchOrchestrator.search(args.query, {
        category: args.category as SearchCategory,
        timeRange: args.time_range as TimeRange,
        limit: args.limit || 5,
        extractContent: true
      })
      return response
    }
    case 'open_url': {
      const page = await searchOrchestrator.browseUrl(args.url, args.max_chars || 3500)
      return page
    }
    case 'deep_research': {
      const synthesis = await searchOrchestrator.research(args.topic, {
        depth: args.depth || 'standard'
      })
      return synthesis
    }
    default:
      throw new Error(`Unknown search tool: ${name}`)
  }
}
