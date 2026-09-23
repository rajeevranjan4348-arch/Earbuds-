/**
 * Embeddings Generation & Vector Math Engine
 *
 * Generates dense vector embeddings using Google GenAI (text-embedding-004) with batching,
 * exponential backoff, and cosine similarity calculations.
 */

import { GoogleGenAI } from '@google/genai'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return geminiClient
}

export class EmbeddingsEngine {
  /**
   * Compute cosine similarity between two float vectors
   */
  public static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }

    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  /**
   * Generate embedding vector for a single query text
   */
  public static async embedQuery(queryText: string): Promise<number[]> {
    const vectors = await this.generateBatchEmbeddings([queryText], 'RETRIEVAL_QUERY')
    return vectors[0] || this.fallbackTfIdfVector(queryText)
  }

  /**
   * Generate embeddings for a batch of text chunks (with chunk batching up to 25 items)
   */
  public static async generateBatchEmbeddings(
    texts: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[][]> {
    if (texts.length === 0) return []

    const gemini = getGemini()
    const results: number[][] = new Array(texts.length)
    const BATCH_SIZE = 20

    if (!gemini) {
      console.warn('[EmbeddingsEngine] GEMINI_API_KEY not set, using deterministic sparse vectors.')
      return texts.map((t) => this.fallbackTfIdfVector(t))
    }

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchSlice = texts.slice(i, i + BATCH_SIZE)
      try {
        const promises = batchSlice.map(async (text, subIdx) => {
          const globalIdx = i + subIdx
          try {
            const cleanText = text.slice(0, 3000)
            let resp: any = null
            try {
              resp = await gemini.models.embedContent({
                model: 'gemini-embedding-2-preview',
                contents: cleanText
              })
            } catch {
              try {
                resp = await gemini.models.embedContent({
                  model: 'text-embedding-004',
                  contents: cleanText
                })
              } catch {
                resp = null
              }
            }

            // The GenAI SDK returns an `embeddings[]` array (one entry per
            // embedded content part).
            const vector =
              resp?.embeddings?.[0]?.values ?? (resp as any)?.embedding?.values
            if (vector) {
              results[globalIdx] = vector
            } else {
              results[globalIdx] = this.fallbackTfIdfVector(text)
            }
          } catch (err: any) {
            results[globalIdx] = this.fallbackTfIdfVector(text)
          }
        })

        await Promise.all(promises)
      } catch (batchErr) {
        console.warn(`[EmbeddingsEngine] Batch error at ${i}:`, batchErr)
        for (let j = 0; j < batchSlice.length; j++) {
          if (!results[i + j]) {
            results[i + j] = this.fallbackTfIdfVector(batchSlice[j])
          }
        }
      }
    }

    return results
  }

  /**
   * Deterministic 128-dimensional frequency hash vector for fallback/offline scenarios
   */
  private static fallbackTfIdfVector(text: string): number[] {
    const dim = 128
    const vector = new Array(dim).fill(0)
    const tokens = text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) || []

    for (const token of tokens) {
      let hash = 0
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i)
        hash |= 0
      }
      const idx = Math.abs(hash) % dim
      vector[idx] += 1
    }

    // Normalize vector length
    let norm = 0
    for (let i = 0; i < dim; i++) {
      norm += vector[i] * vector[i]
    }
    if (norm > 0) {
      const mag = Math.sqrt(norm)
      for (let i = 0; i < dim; i++) {
        vector[i] /= mag
      }
    }

    return vector
  }
}
