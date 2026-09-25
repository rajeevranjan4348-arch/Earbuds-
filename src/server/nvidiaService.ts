/**
 * NVIDIA & DeepSeek Chat Engine
 *
 * Implements high-throughput completions and streaming using NVIDIA Integrate API
 * and DeepSeek API keys provided for IRIS.
 */

export interface NvidiaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

export interface NvidiaCompletionOptions {
  model?: string
  messages: NvidiaChatMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  reasoning_effort?: 'low' | 'medium' | 'high' | 'max'
  imageUrl?: string
}

export class NvidiaChatService {
  private primaryEndpoint = 'https://integrate.api.nvidia.com/v1/chat/completions'
  private primaryModel = 'moonshotai/kimi-k3'
  private fallbackModels = [
    'deepseek-ai/deepseek-r1',
    'meta/llama-3.1-70b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct'
  ]

  getApiKey(): string {
    return (
      process.env.NVIDIA_API_KEY ||
      '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'
    )
  }

  getDeepseekApiKey(): string {
    return process.env.DEEPSEEK_API_KEY || 'sk-1734e30535fd4ca9b3fbe54cfb8e8ca8'
  }

  /**
   * Generates a non-streaming chat completion from NVIDIA / Kimi-k3
   */
  async generateCompletion(options: NvidiaCompletionOptions): Promise<{
    text: string
    model: string
    usage?: any
  }> {
    const apiKey = this.getApiKey()
    const targetModel = options.model || this.primaryModel

    let messages = [...options.messages]

    // If an image URL is attached, format the last user message as multimodal vision
    if (options.imageUrl && messages.length > 0) {
      const lastIndex = messages.length - 1
      const lastMsg = messages[lastIndex]
      if (lastMsg.role === 'user') {
        const textContent =
          typeof lastMsg.content === 'string'
            ? lastMsg.content
            : Array.isArray(lastMsg.content)
              ? lastMsg.content.find((c) => c.type === 'text')?.text || ''
              : ''
        messages[lastIndex] = {
          role: 'user',
          content: [
            { type: 'text', text: textContent || 'Analyze this image.' },
            { type: 'image_url', image_url: { url: options.imageUrl } }
          ]
        }
      }
    }

    const payload = {
      model: targetModel,
      messages,
      max_tokens: options.max_tokens || 16384,
      seed: 0,
      stream: false,
      temperature: options.temperature ?? 1,
      reasoning_effort: options.reasoning_effort || 'max'
    }

    const response = await fetch(this.primaryEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`NVIDIA API HTTP ${response.status}: ${errText.slice(0, 300)}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content || ''
    return {
      text: content.trim(),
      model: data?.model || targetModel,
      usage: data?.usage
    }
  }

  /**
   * Streams completion tokens via Server-Sent Events (SSE)
   */
  async streamCompletion(
    options: NvidiaCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const apiKey = this.getApiKey()
    const targetModel = options.model || this.primaryModel

    let messages = [...options.messages]

    if (options.imageUrl && messages.length > 0) {
      const lastIndex = messages.length - 1
      const lastMsg = messages[lastIndex]
      if (lastMsg.role === 'user') {
        const textContent =
          typeof lastMsg.content === 'string'
            ? lastMsg.content
            : Array.isArray(lastMsg.content)
              ? lastMsg.content.find((c) => c.type === 'text')?.text || ''
              : ''
        messages[lastIndex] = {
          role: 'user',
          content: [
            { type: 'text', text: textContent || 'Analyze this image.' },
            { type: 'image_url', image_url: { url: options.imageUrl } }
          ]
        }
      }
    }

    const payload = {
      model: targetModel,
      messages,
      max_tokens: options.max_tokens || 16384,
      seed: 0,
      stream: true,
      temperature: options.temperature ?? 1,
      reasoning_effort: options.reasoning_effort || 'max'
    }

    const response = await fetch(this.primaryEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`NVIDIA stream API error HTTP ${response.status}: ${errText.slice(0, 300)}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('NVIDIA stream reader unavailable')
    }

    const decoder = new TextDecoder('utf-8')
    let accumulated = ''
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
        if (trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6))
            const delta = parsed?.choices?.[0]?.delta?.content || ''
            if (delta) {
              accumulated += delta
              onChunk(delta)
            }
          } catch (_e) {
            // Ignore parse errors on partial frames
          }
        }
      }
    }

    return accumulated.trim()
  }
}

export const nvidiaChatService = new NvidiaChatService()
