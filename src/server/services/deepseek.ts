/**
 * DeepSeek AI Service Module
 *
 * Handles API requests to DeepSeek:
 * - deepseek-chat (DeepSeek V3 - fast general chat and coding)
 * - deepseek-reasoner (DeepSeek R1 - chain-of-thought mathematical and logical reasoning)
 *
 * Supports both streaming (with reasoning_content chunk extraction)
 * and non-streaming completions, error recovery, and citation grounding.
 */

import { loadEnv, getEnv, hasEnv } from '../env'

// Ensure environment variables are loaded
loadEnv()

export interface DeepSeekChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface DeepSeekCompletionOptions {
  model?: 'deepseek-chat' | 'deepseek-reasoner' | string
  messages: DeepSeekChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  apiKey?: string
  citations?: Array<{ title: string; url: string; snippet?: string; domain?: string }>
}

export interface DeepSeekCompletionResult {
  text: string
  reasoningContent?: string
  model: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export class DeepSeekService {
  private primaryEndpoint = 'https://api.deepseek.com/chat/completions'
  public defaultModel = 'deepseek-chat'

  /**
   * Retrieves active DeepSeek API key using env configuration
   */
  public getApiKey(): string {
    loadEnv()
    const envKey = getEnv('DEEPSEEK_API_KEY')
    if (envKey && envKey.trim()) return envKey.trim()

    // Secondary fallback from runtime env
    if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) {
      return process.env.DEEPSEEK_API_KEY.trim()
    }
    if (process.env.VITE_DEEPSEEK_API_KEY && process.env.VITE_DEEPSEEK_API_KEY.trim()) {
      return process.env.VITE_DEEPSEEK_API_KEY.trim()
    }

    // Default developer fallback key
    return 'sk-1734e30535fd4ca9b3fbe54cfb8e8ca8'
  }

  public isConfigured(): boolean {
    loadEnv()
    return (
      hasEnv('DEEPSEEK_API_KEY') ||
      Boolean(process.env.DEEPSEEK_API_KEY) ||
      Boolean(process.env.VITE_DEEPSEEK_API_KEY)
    )
  }

  /**
   * Generates a non-streaming chat completion with DeepSeek
   */
  public async generateCompletion(
    options: DeepSeekCompletionOptions
  ): Promise<DeepSeekCompletionResult> {
    const apiKey = (options.apiKey && options.apiKey.trim()) || this.getApiKey()
    const model = options.model || this.defaultModel
    const messages = [...options.messages]

    // If citations/research sources provided, augment system prompt
    if (options.citations && options.citations.length > 0 && messages.length > 0) {
      const citationContext = options.citations
        .map((c, i) => `[Source ${i + 1}]: ${c.title} (${c.url})\n${c.snippet || ''}`)
        .join('\n\n')

      const existingSys = messages.find((m) => m.role === 'system')
      if (existingSys) {
        existingSys.content += `\n\n[RESEARCH CITATIONS & SOURCES]:\n${citationContext}\n\nAnnotate your answers using citations such as [Source X] or markdown links.`
      } else {
        messages.unshift({
          role: 'system',
          content: `You are IRIS powered by DeepSeek. Ground your answers using these verified sources:\n${citationContext}\n\nAnnotate statements with relevant citation markers or markdown source links.`
        })
      }
    }

    const payload: any = {
      model,
      messages,
      stream: false
    }

    if (options.temperature !== undefined && model !== 'deepseek-reasoner') {
      payload.temperature = options.temperature
    }
    if (options.max_tokens) {
      payload.max_tokens = options.max_tokens
    }

    const response = await fetch(this.primaryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(
        `DeepSeek API error HTTP ${response.status}: ${errBody || response.statusText}`
      )
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const content = choice?.message?.content || ''
    const reasoning = choice?.message?.reasoning_content || undefined

    return {
      text: content,
      reasoningContent: reasoning,
      model: data.model || model,
      usage: data.usage
    }
  }

  /**
   * Generates a streaming chat completion with DeepSeek
   * Emits text chunks and chain-of-thought reasoning chunks in real-time
   */
  public async streamCompletion(
    options: DeepSeekCompletionOptions,
    onChunk: (chunk: string, reasoningChunk?: string) => void
  ): Promise<void> {
    const apiKey = (options.apiKey && options.apiKey.trim()) || this.getApiKey()
    const model = options.model || this.defaultModel
    const messages = [...options.messages]

    if (options.citations && options.citations.length > 0 && messages.length > 0) {
      const citationContext = options.citations
        .map((c, i) => `[Source ${i + 1}]: ${c.title} (${c.url})\n${c.snippet || ''}`)
        .join('\n\n')

      const existingSys = messages.find((m) => m.role === 'system')
      if (existingSys) {
        existingSys.content += `\n\n[RESEARCH CITATIONS & SOURCES]:\n${citationContext}`
      } else {
        messages.unshift({
          role: 'system',
          content: `You are IRIS powered by DeepSeek. Ground your answer using these verified sources:\n${citationContext}`
        })
      }
    }

    const payload: any = {
      model,
      messages,
      stream: true
    }

    if (options.temperature !== undefined && model !== 'deepseek-reasoner') {
      payload.temperature = options.temperature
    }
    if (options.max_tokens) {
      payload.max_tokens = options.max_tokens
    }

    const response = await fetch(this.primaryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`DeepSeek stream error HTTP ${response.status}: ${errBody}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('DeepSeek stream response body reader unavailable')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') return

        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6))
            const delta = parsed.choices?.[0]?.delta
            const content = delta?.content || ''
            const reasoning = delta?.reasoning_content || ''
            if (content || reasoning) {
              onChunk(content, reasoning)
            }
          } catch (_e) {}
        }
      }
    }
  }
}

export const deepseekService = new DeepSeekService()
