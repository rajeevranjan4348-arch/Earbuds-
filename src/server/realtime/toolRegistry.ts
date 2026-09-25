/**
 * Centralized RealTimeTools Registry
 * Registers webSearch, browserOpen, browserRead, newsSearch, youtubeSearch, githubSearch, weather, maps, time, calculator, publicApi, appLauncher.
 */

import { ToolExecutionLog } from './types'
import { defaultSearchProvider } from './providers/searchProvider'
import { defaultBrowserProvider } from './providers/browserProvider'
import { defaultNewsProvider } from './providers/newsProvider'
import { defaultYouTubeProvider } from './providers/youtubeProvider'
import { defaultGitHubProvider } from './providers/githubProvider'
import { defaultWeatherProvider } from './providers/weatherProvider'
import { defaultMapsProvider } from './providers/mapsProvider'
import { defaultTimeProvider } from './providers/timeProvider'
import { worldProvider } from './providers/worldProvider'
import { realTimeCacheManager } from './cacheManager'

export interface RealTimeToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  permissionLevel: 'public' | 'standard' | 'sensitive' | 'admin'
  timeoutMs: number
  retryPolicy: { maxRetries: number; backoffMs: number }
  execute: (args: Record<string, any>, context?: { requestId?: string }) => Promise<any>
}

export class RealTimeToolRegistry {
  private tools = new Map<string, RealTimeToolDefinition>()
  private diagnosticsLog: ToolExecutionLog[] = []

  constructor() {
    this.registerTools()
  }

  private registerTools() {
    // 1. webSearch
    this.tools.set('webSearch', {
      name: 'webSearch',
      description: 'Executes real-time web search across multiple sources with freshness metadata.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'The search query.' },
          recency: { type: 'STRING', enum: ['24h', '7d', '30d', 'any'], description: 'Recency filter.' }
        },
        required: ['query']
      },
      permissionLevel: 'public',
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      execute: async (args) => {
        const cacheKey = `search_${args.query}_${args.recency || 'any'}`
        const cached = realTimeCacheManager.get(cacheKey)
        if (cached) return cached.data

        const results = await defaultSearchProvider.searchWeb(args.query, { recency: args.recency })
        realTimeCacheManager.set(cacheKey, results, 'LIVE', 'searchProvider')
        return results
      }
    })

    // 2. browserOpen
    this.tools.set('browserOpen', {
      name: 'browserOpen',
      description: 'Navigates to and extracts full content from a target URL with SSRF protection.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'The URL to open and extract.' }
        },
        required: ['url']
      },
      permissionLevel: 'standard',
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 1, backoffMs: 1500 },
      execute: async (args) => {
        const cacheKey = `browser_${args.url}`
        const cached = realTimeCacheManager.get(cacheKey)
        if (cached) return cached.data

        const pageData = await defaultBrowserProvider.fetchPage(args.url)
        realTimeCacheManager.set(cacheKey, pageData, 'LIVE', 'browserProvider')
        return pageData
      }
    })

    // 3. browserRead
    this.tools.set('browserRead', {
      name: 'browserRead',
      description: 'Reads specific text sections or summary from a webpage URL.',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: { type: 'STRING', description: 'The URL to read.' }
        },
        required: ['url']
      },
      permissionLevel: 'standard',
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      execute: async (args) => defaultBrowserProvider.readPageSection(args.url)
    })

    // 4. newsSearch
    this.tools.set('newsSearch', {
      name: 'newsSearch',
      description: 'Retrieves current news articles from reputable news providers.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'News query or topic.' }
        },
        required: ['query']
      },
      permissionLevel: 'public',
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      execute: async (args) => defaultNewsProvider.searchNews(args.query)
    })

    // 5. youtubeSearch
    this.tools.set('youtubeSearch', {
      name: 'youtubeSearch',
      description: 'Searches real-time YouTube videos, creators, or trending content.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Search term for YouTube videos.' }
        },
        required: ['query']
      },
      permissionLevel: 'public',
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      execute: async (args) => defaultYouTubeProvider.searchVideos(args.query)
    })

    // 6. githubSearch
    this.tools.set('githubSearch', {
      name: 'githubSearch',
      description: 'Searches GitHub repositories, latest releases, READMEs, and updates.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Repository name or tech query.' },
          repoOwner: { type: 'STRING', description: 'Optional repo owner.' },
          repoName: { type: 'STRING', description: 'Optional repo name.' }
        },
        required: ['query']
      },
      permissionLevel: 'public',
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      execute: async (args) => {
        if (args.repoOwner && args.repoName) {
          return defaultGitHubProvider.getRepoDetails(args.repoOwner, args.repoName)
        }
        return defaultGitHubProvider.searchRepos(args.query)
      }
    })

    // 7. weather
    this.tools.set('weather', {
      name: 'weather',
      description: 'Retrieves live weather, temperature, humidity, wind, and forecast for any city or location.',
      parameters: {
        type: 'OBJECT',
        properties: {
          location: { type: 'STRING', description: 'City or region name.' }
        },
        required: ['location']
      },
      permissionLevel: 'public',
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 2, backoffMs: 800 },
      execute: async (args) => defaultWeatherProvider.getWeather(args.location)
    })

    // 8. maps
    this.tools.set('maps', {
      name: 'maps',
      description: 'Retrieves live places, directions, distance, and local spatial coordinates.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING', description: 'Place or destination.' },
          action: { type: 'STRING', enum: ['search', 'directions'], description: 'Map action.' }
        },
        required: ['query']
      },
      permissionLevel: 'standard',
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      execute: async (args) => {
        if (args.action === 'directions') {
          return defaultMapsProvider.getDirections('Current Location', args.query)
        }
        return defaultMapsProvider.searchPlace(args.query)
      }
    })

    // 9. time
    this.tools.set('time', {
      name: 'time',
      description: 'Returns real-time local clock time, timezone, date, and UTC offset.',
      parameters: {
        type: 'OBJECT',
        properties: {
          location: { type: 'STRING', description: 'City or timezone.' }
        },
        required: []
      },
      permissionLevel: 'public',
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      execute: async (args) => defaultTimeProvider.getTime(args.location)
    })

    // 10. calculator
    this.tools.set('calculator', {
      name: 'calculator',
      description: 'Performs precise mathematical calculations.',
      parameters: {
        type: 'OBJECT',
        properties: {
          expression: { type: 'STRING', description: 'Math expression to evaluate.' }
        },
        required: ['expression']
      },
      permissionLevel: 'public',
      timeoutMs: 2000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      execute: async (args) => {
        try {
          const sanitized = args.expression.replace(/[^0-9+\-*/().\s]/g, '')
          // Safe arithmetic evaluation
          const result = Function(`"use strict"; return (${sanitized})`)()
          return { expression: args.expression, result }
        } catch (_e) {
          return { expression: args.expression, error: 'Invalid mathematical expression.' }
        }
      }
    })

    // 11. currencyConverter
    this.tools.set('currencyConverter', {
      name: 'currencyConverter',
      description: 'Converts real-time world currencies using live exchange rates.',
      parameters: {
        type: 'OBJECT',
        properties: {
          amount: { type: 'NUMBER', description: 'Monetary amount to convert.' },
          from: { type: 'STRING', description: 'Source currency code (e.g. USD, EUR, INR, JPY).' },
          to: { type: 'STRING', description: 'Target currency code (e.g. EUR, USD, GBP, JPY).' }
        },
        required: ['amount', 'from', 'to']
      },
      permissionLevel: 'public',
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 2, backoffMs: 500 },
      execute: async (args) => worldProvider.convertCurrency(args.amount || 1, args.from || 'USD', args.to || 'EUR')
    })

    // 12. worldClock
    this.tools.set('worldClock', {
      name: 'worldClock',
      description: 'Returns real-time world clock, local time, date, and UTC offset for any global city or country.',
      parameters: {
        type: 'OBJECT',
        properties: {
          location: { type: 'STRING', description: 'Target city or country name.' }
        },
        required: ['location']
      },
      permissionLevel: 'public',
      timeoutMs: 3000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      execute: async (args) => worldProvider.getWorldTime(args.location)
    })

    // 13. worldNews
    this.tools.set('worldNews', {
      name: 'worldNews',
      description: 'Retrieves international breaking world news and global event updates.',
      parameters: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING', description: 'Optional specific world news topic or region.' }
        },
        required: []
      },
      permissionLevel: 'public',
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      execute: async (args) => worldProvider.getWorldNews(args.topic || 'world news')
    })

    // 14. countryDetails
    this.tools.set('countryDetails', {
      name: 'countryDetails',
      description: 'Retrieves live country statistics: capital, population, region, languages, currencies, timezones.',
      parameters: {
        type: 'OBJECT',
        properties: {
          country: { type: 'STRING', description: 'Country name.' }
        },
        required: ['country']
      },
      permissionLevel: 'public',
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      execute: async (args) => worldProvider.getCountryDetails(args.country)
    })
  }

  public getTool(name: string): RealTimeToolDefinition | undefined {
    return this.tools.get(name)
  }

  public getAllTools(): RealTimeToolDefinition[] {
    return Array.from(this.tools.values())
  }

  public async executeTool(
    toolName: string,
    args: Record<string, any>,
    requestId = `req_${Date.now()}`
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { success: false, error: `Tool '${toolName}' not registered.` }
    }

    const startTime = Date.now()
    let retryCount = 0

    while (retryCount <= tool.retryPolicy.maxRetries) {
      try {
        const result = await Promise.race([
          tool.execute(args, { requestId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`TOOL_TIMEOUT: ${toolName} exceeded ${tool.timeoutMs}ms`)), tool.timeoutMs)
          )
        ])

        const durationMs = Date.now() - startTime
        this.diagnosticsLog.push({
          requestId,
          toolName,
          startTime,
          endTime: Date.now(),
          durationMs,
          success: true,
          sourceCount: Array.isArray(result) ? result.length : 1,
          cacheHit: false,
          retryCount
        })

        return { success: true, result }
      } catch (err: any) {
        retryCount++
        if (retryCount > tool.retryPolicy.maxRetries) {
          const durationMs = Date.now() - startTime
          this.diagnosticsLog.push({
            requestId,
            toolName,
            startTime,
            endTime: Date.now(),
            durationMs,
            success: false,
            error: err?.message,
            sourceCount: 0,
            cacheHit: false,
            retryCount
          })
          return { success: false, error: err?.message || 'Tool execution error' }
        }
        await new Promise((r) => setTimeout(r, tool.retryPolicy.backoffMs))
      }
    }

    return { success: false, error: 'Execution failed after max retries.' }
  }

  public getDiagnosticsLogs(): ToolExecutionLog[] {
    return [...this.diagnosticsLog]
  }
}

export const realTimeToolRegistry = new RealTimeToolRegistry()
