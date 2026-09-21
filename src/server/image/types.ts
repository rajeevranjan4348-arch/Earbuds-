/**
 * FLUX Image Generation Types (Repository 20: black-forest-labs/flux)
 */

export type FluxModel = 'flux' | 'flux-schnell' | 'flux-dev' | 'flux-pro' | 'gemini-imagen'

export interface FluxGenerationOptions {
  prompt: string
  negativePrompt?: string
  model?: FluxModel
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:2'
  width?: number
  height?: number
  seed?: number
  steps?: number
  safetyCheck?: boolean
}

export interface FluxGenerationResult {
  success: boolean
  imageUrl: string
  model: string
  prompt: string
  revisedPrompt?: string
  width: number
  height: number
  seed: number
  executionTimeMs: number
  error?: string
}
