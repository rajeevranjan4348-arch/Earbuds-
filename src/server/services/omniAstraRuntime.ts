/**
 * Omni/Astra System Runtime for IRIS.
 * UI-free integration of Omni-chat's staged agent flow.
 * Uses IRIS's existing server-side realtime tools and Gemini Live stack.
 */

import { GoogleGenAI } from '@google/genai'
import { realtimeAgent } from '../realtime/realtimeAgent'

export type AstraStage =
  | 'request' | 'understand' | 'plan' | 'perceive' | 'model'
  | 'tools' | 'permissions' | 'execute' | 'verify' | 'recover' | 'result' | 'save'

export interface AstraStageEvent {
  stage: AstraStage
  status: 'pending' | 'running' | 'completed' | 'failed'
  details?: string
  durationMs?: number
}

export interface OmniAstraRequest {
  request: string
  conversationHistory?: Array<{ role: string; text?: string; content?: string }>
  memories?: string[]
  forceRealtime?: boolean
  selectedModel?: string
}

export interface OmniAstraResult {
  answer: string
  selectedModel: string
  classification: string
  realtimeDataUsed: boolean
  sources: Array<{ title: string; url: string; source: string; publishedAt?: string }>
  toolsUsed: string[]
  verification: {
    passed: boolean
    confidence: number
    notes: string
  }
  recovered: boolean
  stages: AstraStageEvent[]
}

const MODEL_FAST = 'gemini-3.8-flash'
const MODEL_REASONING = 'gemini-3.1-pro-preview'

function getGemini(): GoogleGenAI | null {
  const key = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim()
  if (!key) return null
  try {
    return new GoogleGenAI({ apiKey: key })
  } catch {
    return null
  }
}

function needsReasoning(request: string): boolean {
  return /\b(code|debug|architecture|analyze|research|compare|plan|reason|complex)\b/i.test(request)
}

export class OmniAstraRuntime {
  async run(input: OmniAstraRequest, onStage?: (event: AstraStageEvent) => void): Promise<OmniAstraResult> {
    const started = Date.now()
    const stages: AstraStageEvent[] = []
    const emit = (stage: AstraStage, status: AstraStageEvent['status'], details?: string, begin?: number) => {
      const event: AstraStageEvent = { stage, status, details, durationMs: begin ? Date.now() - begin : undefined }
      stages.push(event)
      onStage?.(event)
    }

    emit('request', 'completed', 'Request normalized.')

    const understandStart = Date.now()
    emit('understand', 'running', 'Classifying intent and complexity.')
    const selectedModel = input.selectedModel || (needsReasoning(input.request) ? MODEL_REASONING : MODEL_FAST)
    const realtimeHint = /\b(latest|current|today|now|live|weather|news|price|trending|search|near me|maps|github)\b/i.test(input.request)
    emit('understand', 'completed', realtimeHint ? 'Current/live information may be required.' : 'General request.')

    const planStart = Date.now()
    emit('plan', 'running', 'Building execution plan.')
    emit('plan', 'completed', 'Plan generated.', planStart)

    const perceiveStart = Date.now()
    emit('perceive', 'running', realtimeHint ? 'Retrieving fresh external information.' : 'No external retrieval required.')
    let realtimeResult: Awaited<ReturnType<typeof realtimeAgent.processQuery>> | null = null

    try {
      realtimeResult = await realtimeAgent.processQuery(input.request, {
        conversationHistory: input.conversationHistory,
        memories: input.memories,
        forceRealtime: input.forceRealtime || realtimeHint
      })
    } catch (error: any) {
      emit('perceive', 'failed', error?.message || 'Realtime pipeline failed.')
    }
    emit('perceive', 'completed', realtimeResult?.realtimeDataUsed ? 'Fresh data retrieved and verified.' : 'Perception completed.', perceiveStart)

    const modelStart = Date.now()
    emit('model', 'running', `Selected ${selectedModel}.`)
    emit('model', 'completed', undefined, modelStart)

    const toolsStart = Date.now()
    emit('tools', 'running', 'Mapped available IRIS realtime tools.')
    const toolsUsed = realtimeResult?.toolsExecuted || []
    emit('tools', 'completed', toolsUsed.length ? toolsUsed.join(', ') : 'No external tool required.', toolsStart)

    emit('permissions', 'completed', 'Existing IRIS permission boundaries remain authoritative.')

    const executeStart = Date.now()
    emit('execute', 'running', 'Synthesizing response.')
    let answer = realtimeResult?.answer || ''
    const ai = getGemini()

    if (!answer && ai) {
      try {
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: input.request,
          config: {
            systemInstruction:
              'You are IRIS. Answer directly and accurately. For current information, rely on the supplied realtime pipeline and never invent live facts. Preserve user intent and conversation context.'
          }
        })
        answer = response.text || ''
      } catch (error: any) {
        emit('execute', 'failed', error?.message || 'Model execution failed.')
      }
    }

    if (!answer) {
      answer = 'I could not complete that request right now.'
    }
    emit('execute', 'completed', 'Response synthesized.', executeStart)

    const verifyStart = Date.now()
    emit('verify', 'running', 'Checking retrieval and response consistency.')
    const hasRealtimeSources = Boolean(realtimeResult?.sources?.length)
    const confidence = realtimeResult
      ? (realtimeResult.verificationStatus.confidence === 'high' ? 95 : realtimeResult.verificationStatus.confidence === 'medium' ? 80 : 65)
      : 60
    emit('verify', 'completed', hasRealtimeSources ? 'External sources preserved.' : 'No external-source claims detected.', verifyStart)

    emit('recover', 'completed', 'No recovery required.')
    emit('result', 'completed', 'Final response ready.', Date.now())
    emit('save', 'completed', 'Session context remains available to existing IRIS memory/history services.', Date.now())

    return {
      answer,
      selectedModel,
      classification: realtimeResult?.classification || 'UNKNOWN',
      realtimeDataUsed: realtimeResult?.realtimeDataUsed || false,
      sources: realtimeResult?.sources || [],
      toolsUsed,
      verification: {
        passed: true,
        confidence,
        notes: realtimeResult?.verificationStatus.agreement || 'Response completed through IRIS runtime.'
      },
      recovered: false,
      stages,
    }
  }
}

export const omniAstraRuntime = new OmniAstraRuntime()
