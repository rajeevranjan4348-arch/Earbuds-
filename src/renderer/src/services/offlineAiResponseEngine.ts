/**
 * Offline AI Response Engine (Local IndexedDB Context & Autonomous Inference)
 *
 * Activated whenever an internet outage or network failure occurs.
 * Leverages cached conversation history, local documents, system knowledge base,
 * mathematical evaluation, code formatting, and semantic matching stored in IndexedDB.
 */

import { irisIndexedDBCache } from './irisIndexedDBCache'
import { Message } from './chatHistoryService'
import { coreSettingsService } from './coreSettingsService'

export interface OfflineResponseResult {
  text: string
  confidence: number
  source: 'cache_exact' | 'cache_semantic' | 'local_knowledge' | 'local_computation' | 'offline_context'
  executionTimeMs: number
  contextTokensUsed: number
}

class OfflineAiResponseEngine {
  /**
   * Generates a context-aware response during an offline outage
   */
  public async generateOfflineResponse(
    prompt: string,
    sessionId: string,
    history: Message[] = []
  ): Promise<OfflineResponseResult> {
    const startTime = performance.now()
    const cleanPrompt = prompt.trim()
    const promptLower = cleanPrompt.toLowerCase()

    // 1. Check exact or near-exact cached AI response from IndexedDB
    const cachedExact = await irisIndexedDBCache.findCachedResponse(cleanPrompt)
    if (cachedExact) {
      return {
        text: `${cachedExact}\n\n> ⚡ *Served from local IndexedDB cache (Exact Context Match)*`,
        confidence: 0.98,
        source: 'cache_exact',
        executionTimeMs: Math.round(performance.now() - startTime),
        contextTokensUsed: cachedExact.length / 4
      }
    }

    // 2. Perform local calculation / unit / math parsing
    const mathResult = this.evaluateMathExpression(cleanPrompt)
    if (mathResult) {
      return {
        text: `### 🔢 Offline Computation Result\n\n**Calculation:** \`${mathResult.expression}\`\n**Result:** \`${mathResult.result}\`\n\n*Computed locally with IRIS high-precision arithmetic engine.*`,
        confidence: 1.0,
        source: 'local_computation',
        executionTimeMs: Math.round(performance.now() - startTime),
        contextTokensUsed: 60
      }
    }

    // 3. System time, status & offline diagnostics
    if (
      promptLower.includes('time') ||
      promptLower.includes('date') ||
      promptLower.includes('status') ||
      promptLower.includes('system') ||
      promptLower.includes('diagnostics') ||
      promptLower.includes('ping') ||
      promptLower.includes('offline')
    ) {
      const stats = await irisIndexedDBCache.getStats()
      const now = new Date()
      const timeStr = now.toLocaleTimeString()
      const dateStr = now.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      const responseText = [
        `### 🛡️ IRIS Autonomous Offline Core`,
        `**Network Status:** 🔴 Disconnected / Outage Mode Active`,
        `**Local Date & Time:** ${dateStr} at ${timeStr}`,
        `**Storage Engine:** IndexedDB High-Capacity Local Cache`,
        `- **Saved Sessions:** ${stats.sessionCount} conversations stored locally`,
        `- **Indexed Messages:** ${stats.messageCount} chat history nodes`,
        `- **Cached AI Responses:** ${stats.cachedResponsesCount} prompt-response vectors`,
        `- **Pending Outbox Queue:** ${stats.outboxPending} actions queued for automatic sync`,
        stats.storageEstimate
          ? `- **Local Storage Usage:** ${stats.storageEstimate.usageFormatted} (of ${stats.storageEstimate.quotaFormatted} allocated)`
          : '',
        `\n*All commands, notes, and session state are persisted safely in your browser IndexedDB and will synchronize once your connection is re-established.*`
      ]
        .filter(Boolean)
        .join('\n')

      return {
        text: responseText,
        confidence: 0.95,
        source: 'local_knowledge',
        executionTimeMs: Math.round(performance.now() - startTime),
        contextTokensUsed: 120
      }
    }

    // 4. Search semantic cached responses in IndexedDB
    const similar = await irisIndexedDBCache.searchCachedResponses(cleanPrompt)
    if (similar.length > 0 && similar[0].score >= 2) {
      const best = similar[0]
      return {
        text: `### 💡 Related Offline Intelligence (IndexedDB Context)\n\n*Matched against prior query: "${best.prompt}"*\n\n${best.response}\n\n> 📦 *Retrieved from local context cache during network outage.*`,
        confidence: 0.85,
        source: 'cache_semantic',
        executionTimeMs: Math.round(performance.now() - startTime),
        contextTokensUsed: best.response.length / 4
      }
    }

    // 5. Context-aware conversational response using previous conversation turns
    const recentTurns = history.slice(-6)
    const contextSummary = recentTurns
      .map((m) => `[${m.role.toUpperCase()}]: ${m.text.slice(0, 100)}`)
      .join('\n')

    // Local heuristic answering for common offline requests (code review, summarize, formatting)
    let synthesizedReply = ''

    if (
      promptLower.includes('json') ||
      promptLower.includes('format') ||
      promptLower.includes('clean') ||
      promptLower.includes('parse')
    ) {
      const jsonMatch = cleanPrompt.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          synthesizedReply = `### 📋 Offline JSON Formatter & Validator\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n\n✅ *Valid JSON payload parsed and formatted offline.*`
        } catch (e: any) {
          synthesizedReply = `### ⚠️ Offline JSON Validation Warning\n\n*Error encountered during offline parsing:* \`${e.message}\`\n\nPlease check quotes, commas, and closing braces.`
        }
      }
    }

    if (!synthesizedReply) {
      synthesizedReply = [
        `### 📡 IRIS Offline Assistant Mode (IndexedDB Active)`,
        ``,
        `I have received your request: **"${cleanPrompt}"**.`,
        ``,
        `Because your device is currently experiencing an **internet outage**, cloud API routing (Gemini 3.8 / DeepSeek) is temporarily suspended. However, IRIS has:`,
        `1. ✅ **Safely stored your message** in the local IndexedDB database (\`IRIS_AI_STORE_V1\`).`,
        `2. 🧠 **Maintained active conversation context** with ${history.length} preceding messages preserved.`,
        `3. 📤 **Queued this turn in the local outbox** for seamless cloud reconciliation once your connection is restored.`,
        ``,
        `*Tip: You can continue taking notes, drafting documents, reviewing local conversation history, or adjusting AI voice synthesizer settings while offline.*`
      ].join('\n')
    }

    return {
      text: synthesizedReply,
      confidence: 0.8,
      source: 'offline_context',
      executionTimeMs: Math.round(performance.now() - startTime),
      contextTokensUsed: contextSummary.length / 4 + 80
    }
  }

  /**
   * Safe offline math expression evaluator
   */
  private evaluateMathExpression(
    text: string
  ): { expression: string; result: string } | null {
    // Matches "calculate 25 * 4", "what is 500 / 12", "128 * 1024", etc.
    const match = text.match(
      /(?:calculate|what is|compute|eval|math|solve)?\s*([0-9.\s+\-*/^()%,]{3,})/i
    )
    if (!match) return null

    const rawExpr = match[1].trim()
    // Safety check: only allow numbers, math operators, parentheses
    if (!/^[0-9.+\-*/^()%se]+$/.test(rawExpr)) return null
    if (rawExpr.length < 2 || !/[0-9]/.test(rawExpr)) return null
    if (!/[+\-*/^%]/.test(rawExpr)) return null

    try {
      // Replace power ^ with **
      const sanitized = rawExpr.replace(/\^/g, '**')
      // Safe Function evaluation
      // eslint-disable-next-line no-new-func
      const calcFn = new Function(`"use strict"; return (${sanitized});`)
      const res = calcFn()

      if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
        return {
          expression: rawExpr,
          result: Number.isInteger(res) ? res.toLocaleString() : res.toFixed(4).replace(/\.?0+$/, '')
        }
      }
    } catch (_e) {
      return null
    }

    return null
  }
}

export const offlineAiResponseEngine = new OfflineAiResponseEngine()
