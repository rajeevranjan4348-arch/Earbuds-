/**
 * ResponseStreamManager - Streaming AI Response Handler with Abort & Cancellation
 * Handles chunk processing, token buffering, markdown cleanup for voice,
 * and immediate cancellation on interrupt.
 */

export interface StreamHandlers {
  onChunk: (chunk: string, accumulated: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
  onAbort?: () => void
}

export class ResponseStreamManager {
  private activeController: AbortController | null = null
  private isStreaming = false
  private accumulatedText = ''

  public startStream(): AbortSignal {
    this.abortCurrentStream()
    this.activeController = new AbortController()
    this.isStreaming = true
    this.accumulatedText = ''
    return this.activeController.signal
  }

  public appendChunk(chunk: string, handlers: StreamHandlers) {
    if (!this.isStreaming) return
    this.accumulatedText += chunk
    handlers.onChunk(chunk, this.accumulatedText)
  }

  public completeStream(handlers: StreamHandlers) {
    if (!this.isStreaming) return
    this.isStreaming = false
    const final = this.accumulatedText
    handlers.onComplete(final)
    this.activeController = null
  }

  public abortCurrentStream(handlers?: StreamHandlers) {
    if (this.activeController) {
      try {
        this.activeController.abort()
      } catch (_e) {}
      this.activeController = null
    }
    if (this.isStreaming) {
      this.isStreaming = false
      handlers?.onAbort?.()
    }
  }

  public getIsStreaming(): boolean {
    return this.isStreaming
  }

  public getAccumulatedText(): string {
    return this.accumulatedText
  }

  /**
   * Sanitizes text for voice synthesis (removes code fences, emojis, markdown headers)
   */
  public cleanTextForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' [Code snippet omitted for speech] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[*_~#]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

export const responseStreamManager = new ResponseStreamManager()
