/**
 * IRIS AI Response Normalizer
 * Unified response parser and data normalizer across Gemini, DeepSeek, OpenAI,
 * FLUX Image, and local offline fallback engines.
 * Prevents "No response content received" errors by parsing all standard and non-standard response schemas.
 */

export interface NormalizedAIResponse {
  success: boolean
  text: string
  rawText?: string
  messageId: string
  conversationId: string
  provider?: string
  model?: string
  timestamp: number
  errorCode?: string
  errorMessage?: string
  rawResponseAvailable: boolean
  metadata?: Record<string, any>
}

export interface NormalizerOptions {
  requestId?: string
  conversationId?: string
  prompt?: string
  provider?: string
  model?: string
}

export class AIResponseNormalizer {
  /**
   * Primary entry point: Normalizes any raw API or streaming response into a strict NormalizedAIResponse
   */
  public normalize(rawResponse: any, options: NormalizerOptions = {}): NormalizedAIResponse {
    const timestamp = Date.now()
    const conversationId = options.conversationId || 'default_session'
    const messageId = options.requestId ? `msg_model_${options.requestId}` : `msg_model_${timestamp}`
    const provider = options.provider || 'gemini'
    const model = options.model || 'gemini-2.5-flash'

    if (rawResponse === null || rawResponse === undefined) {
      console.warn('[IRIS][PARSER] Raw response is null or undefined')
      return {
        success: false,
        text: 'I received your request but no response content was returned by the AI engine.',
        messageId,
        conversationId,
        provider,
        model,
        timestamp,
        errorCode: 'AI_EMPTY_RESPONSE',
        errorMessage: 'Raw response is null/undefined',
        rawResponseAvailable: false
      }
    }

    // 1. Plain String Response
    if (typeof rawResponse === 'string') {
      const trimmed = rawResponse.trim()
      if (trimmed) {
        // Check if string contains JSON
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsedJson = JSON.parse(trimmed)
            return this.normalize(parsedJson, options)
          } catch (_e) {}
        }

        console.log('[IRIS][PARSER] Extracted plain string response (length:', trimmed.length, ')')
        return {
          success: true,
          text: trimmed,
          rawText: trimmed,
          messageId,
          conversationId,
          provider,
          model,
          timestamp,
          rawResponseAvailable: true
        }
      }
    }

    // 2. Structured JSON Object with standard keys
    let extractedText = ''
    let detectedError: string | undefined
    let detectedErrorCode: string | undefined
    let metadata: Record<string, any> = {}

    // 2a. Direct standard properties
    if (typeof rawResponse.text === 'string' && rawResponse.text.trim()) {
      extractedText = rawResponse.text.trim()
    } else if (typeof rawResponse.text === 'function') {
      try {
        extractedText = String(rawResponse.text()).trim()
      } catch (_e) {}
    } else if (typeof rawResponse.content === 'string' && rawResponse.content.trim()) {
      extractedText = rawResponse.content.trim()
    } else if (typeof rawResponse.response === 'string' && rawResponse.response.trim()) {
      extractedText = rawResponse.response.trim()
    } else if (typeof rawResponse.output === 'string' && rawResponse.output.trim()) {
      extractedText = rawResponse.output.trim()
    } else if (typeof rawResponse.result === 'string' && rawResponse.result.trim()) {
      extractedText = rawResponse.result.trim()
    } else if (typeof rawResponse.message === 'string' && rawResponse.message.trim()) {
      extractedText = rawResponse.message.trim()
    } else if (typeof rawResponse.rawText === 'string' && rawResponse.rawText.trim()) {
      extractedText = rawResponse.rawText.trim()
    }

    // 2b. Gemini-style structure: candidates[0].content.parts[...]
    if (!extractedText && Array.isArray(rawResponse.candidates) && rawResponse.candidates.length > 0) {
      const firstCandidate = rawResponse.candidates[0]
      if (firstCandidate.content?.parts && Array.isArray(firstCandidate.content.parts)) {
        extractedText = firstCandidate.content.parts
          .map((p: any) => (typeof p === 'string' ? p : p.text || ''))
          .filter(Boolean)
          .join('\n')
          .trim()
      }
    }

    // 2c. OpenAI-style structure: choices[0].message.content / choices[0].delta.content
    if (!extractedText && Array.isArray(rawResponse.choices) && rawResponse.choices.length > 0) {
      const choice = rawResponse.choices[0]
      if (choice.message?.content && typeof choice.message.content === 'string') {
        extractedText = choice.message.content.trim()
      } else if (choice.delta?.content && typeof choice.delta.content === 'string') {
        extractedText = choice.delta.content.trim()
      } else if (typeof choice.text === 'string') {
        extractedText = choice.text.trim()
      }
    }

    // 2d. Image Generation Output
    if (!extractedText && (rawResponse.imageUrl || (rawResponse.success && rawResponse.data?.imageUrl))) {
      const url = rawResponse.imageUrl || rawResponse.data?.imageUrl
      const promptDesc = options.prompt || rawResponse.prompt || 'Generated Image'
      extractedText = `![${promptDesc}](${url})\n\n**Visual Output:** "${promptDesc}"`
    }

    // 2e. Array of message objects or parts
    if (!extractedText && Array.isArray(rawResponse)) {
      extractedText = rawResponse
        .map((item) => {
          if (typeof item === 'string') return item
          return item.text || item.content || item.message || ''
        })
        .filter(Boolean)
        .join('\n')
        .trim()
    }

    // 2f. Capture errors if returned in response body
    if (rawResponse.error) {
      if (typeof rawResponse.error === 'string') {
        detectedError = rawResponse.error
      } else if (typeof rawResponse.error === 'object') {
        detectedError = rawResponse.error.message || rawResponse.error.detail || JSON.stringify(rawResponse.error)
        detectedErrorCode = rawResponse.error.code || rawResponse.error.status
      }
    }

    // 2g. Extract metadata (citations, model, provider)
    if (rawResponse.citations) metadata.citations = rawResponse.citations
    if (rawResponse.aiQCitations) metadata.aiQCitations = rawResponse.aiQCitations
    if (rawResponse.webSourcesCount) metadata.webSourcesCount = rawResponse.webSourcesCount
    if (rawResponse.searchQuery) metadata.searchQuery = rawResponse.searchQuery

    const finalProvider = rawResponse.provider || provider
    const finalModel = rawResponse.model || model

    // 3. Evaluation of parsed results
    if (extractedText) {
      console.log(`[IRIS][PARSER] Successfully normalized AI response (${extractedText.length} chars) from ${finalProvider}/${finalModel}`)
      return {
        success: true,
        text: extractedText,
        rawText: extractedText,
        messageId,
        conversationId,
        provider: finalProvider,
        model: finalModel,
        timestamp,
        rawResponseAvailable: true,
        metadata
      }
    }

    // 4. Handle known API Errors gracefully with clean user-friendly explanations
    if (detectedError) {
      const isQuota = detectedError.toLowerCase().includes('quota') || detectedError.toLowerCase().includes('429') || detectedError.toLowerCase().includes('rate limit')
      const isAuth = detectedError.toLowerCase().includes('key') || detectedError.toLowerCase().includes('auth') || detectedError.toLowerCase().includes('401')
      const isNotFound = detectedError.toLowerCase().includes('not found') || detectedError.toLowerCase().includes('404')

      let friendlyMsg = `I encountered an issue while communicating with the AI service: ${detectedError}`
      if (isQuota) {
        friendlyMsg = `⚠️ **AI Rate Limit:** Model request limits were temporarily reached. Please retry in a moment.`
        detectedErrorCode = 'AI_RATE_LIMIT'
      } else if (isAuth) {
        friendlyMsg = `⚠️ **AI Authentication:** Service credentials issue. Please verify API configuration.`
        detectedErrorCode = 'AI_AUTH_ERROR'
      } else if (isNotFound) {
        friendlyMsg = `⚠️ **AI Service Route:** Target model candidate is updating. Cascading to available model.`
        detectedErrorCode = 'AI_MODEL_UNAVAILABLE'
      }

      console.warn('[IRIS][PARSER] Error detected in raw response:', detectedError)
      return {
        success: false,
        text: friendlyMsg,
        rawText: detectedError,
        messageId,
        conversationId,
        provider: finalProvider,
        model: finalModel,
        timestamp,
        errorCode: detectedErrorCode || 'AI_ERROR_RESPONSE',
        errorMessage: detectedError,
        rawResponseAvailable: true
      }
    }

    // 5. Ultimate Fallback: No content extracted from any parser
    console.warn('[IRIS][PARSER] All parsers failed to extract usable text from response object:', Object.keys(rawResponse))
    const fallbackText = options.prompt
      ? `I've received your query: "${options.prompt}". IRIS AI core is standing by to assist.`
      : 'IRIS AI core is standing by to assist.'

    return {
      success: false,
      text: fallbackText,
      messageId,
      conversationId,
      provider: finalProvider,
      model: finalModel,
      timestamp,
      errorCode: 'AI_EMPTY_RESPONSE',
      errorMessage: 'No usable text content extracted from AI response schema',
      rawResponseAvailable: true
    }
  }
}

export const aiResponseNormalizer = new AIResponseNormalizer()
export const normalizeAIResponse = (raw: any, options?: NormalizerOptions) =>
  aiResponseNormalizer.normalize(raw, options)
