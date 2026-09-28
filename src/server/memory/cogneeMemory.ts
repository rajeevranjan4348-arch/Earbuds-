/**
 * Cognee Memory Adapter
 *
 * Integrates the useful memory primitives from topoteretes/cognee without
 * importing its Python runtime or frontend. Iris remains the system of record
 * for its existing memory API; Cognee is an optional graph/vector memory
 * backend used when COGNEE_BASE_URL is configured.
 *
 * Source: https://github.com/topoteretes/cognee
 */

import { privacyAlign } from '../security/privacyAlign'

export interface CogneeMemoryConfig {
  baseUrl: string
  apiKey?: string
  dataset?: string
  timeoutMs?: number
}

export interface CogneeRecallOptions {
  sessionId?: string
  dataset?: string
  topK?: number
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function safeSessionId(userId: string): string {
  const sanitized = userId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return `iris-${sanitized || 'default'}`
}

export class CogneeMemoryAdapter {
  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly dataset: string
  private readonly timeoutMs: number

  constructor(config?: Partial<CogneeMemoryConfig>) {
    this.baseUrl = normalizeBaseUrl(config?.baseUrl || process.env.COGNEE_BASE_URL || '')
    this.apiKey = config?.apiKey || process.env.COGNEE_API_KEY || undefined
    this.dataset = config?.dataset || process.env.COGNEE_DATASET || 'iris_memory'
    this.timeoutMs = Math.max(1000, config?.timeoutMs || Number(process.env.COGNEE_TIMEOUT_MS || 12000))
  }

  public isConfigured(): boolean {
    return Boolean(this.baseUrl)
  }

  public getStatus() {
    return {
      configured: this.isConfigured(),
      dataset: this.dataset,
      baseUrlConfigured: Boolean(this.baseUrl),
      apiKeyConfigured: Boolean(this.apiKey)
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.baseUrl) throw new Error('Cognee is not configured: set COGNEE_BASE_URL')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const headers = new Headers(init.headers)
      headers.set('Content-Type', 'application/json')
      if (this.apiKey) headers.set('X-Api-Key', this.apiKey)

      const response = await fetch(this.baseUrl + path, {
        ...init,
        headers,
        signal: controller.signal
      })

      const text = await response.text()
      let body: any = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }

      if (!response.ok) {
        throw new Error(`Cognee ${response.status}: ${typeof body === 'string' ? body.slice(0, 300) : body?.error || body?.detail || 'request failed'}`)
      }

      return body as T
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Store a memory as a Cognee QA session entry.
   * Cognee then handles the graph/session persistence and later recall.
   */
  public async remember(
    userId: string,
    content: string,
    options: { namespace?: string; category?: string; tags?: string[] } = {}
  ): Promise<any> {
    const sanitized = privacyAlign.sanitize(content).redactedText
    const question = options.namespace
      ? `IRIS memory [${options.namespace}]`
      : 'IRIS durable memory'

    const answer = [
      sanitized,
      options.category ? `Category: ${options.category}` : '',
      options.tags?.length ? `Tags: ${options.tags.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    return this.request('/api/v1/remember/entry', {
      method: 'POST',
      body: JSON.stringify({
        entry: {
          type: 'qa',
          question,
          answer,
          context: ''
        },
        dataset_name: this.dataset,
        session_id: safeSessionId(userId)
      })
    })
  }

  /**
   * Retrieve relevant graph/session memory using Cognee's auto-routed recall.
   */
  public async recall(userId: string, query: string, options: CogneeRecallOptions = {}): Promise<any[]> {
    const result = await this.request<any[]>('/api/v1/recall', {
      method: 'POST',
      body: JSON.stringify({
        query: privacyAlign.sanitize(query).redactedText,
        datasets: [options.dataset || this.dataset],
        session_id: options.sessionId || safeSessionId(userId),
        top_k: Math.max(1, Math.min(50, options.topK || 5)),
        include_references: true,
        scope: 'auto'
      })
    })

    return Array.isArray(result) ? result : []
  }
}

export const cogneeMemory = new CogneeMemoryAdapter()
