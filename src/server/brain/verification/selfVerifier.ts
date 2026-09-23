/**
 * Advanced AI Brain - Self-Verification and Error Recovery
 *
 * Implements the mandatory error recovery pipeline:
 * 1. Inspect the error
 * 2. Determine whether retry is safe
 * 3. Retry with corrected parameters
 * 4. Try an alternative tool when available
 * 5. Stop after the configured retry limit (NEVER create infinite retry loops)
 * 6. Explain the failure accurately
 */

import type { BrainTask, VerificationEvaluation } from '../types'

export class BrainSelfVerifier {
  private readonly DEFAULT_MAX_ATTEMPTS = 3

  /**
   * Verifies the output of a task and determines if error recovery is necessary.
   */
  public verify(task: BrainTask, rawOutput: any, errorMsg?: string): VerificationEvaluation {
    // 1. Explicit Error or Null Output
    if (errorMsg || rawOutput === null || rawOutput === undefined) {
      return this.handleFailure(task, errorMsg || 'Task produced null or undefined output.', rawOutput)
    }

    // 2. Output contains error flags
    if (typeof rawOutput === 'object') {
      if (rawOutput.error || rawOutput.success === false) {
        const desc = rawOutput.error || rawOutput.message || 'Underlying tool reported failure.'
        return this.handleFailure(task, desc, rawOutput)
      }
    }

    // 3. Rule-based verification
    const rules = task.verificationRules
    if (rules) {
      if (rules.type === 'non_empty') {
        if (typeof rawOutput === 'string' && rawOutput.trim().length === 0) {
          return this.handleFailure(task, 'Expected non-empty string output.', rawOutput)
        }
        if (Array.isArray(rawOutput) && rawOutput.length === 0) {
          return this.handleFailure(task, 'Expected non-empty array of results.', rawOutput)
        }
        if (typeof rawOutput === 'object' && Object.keys(rawOutput).length === 0) {
          return this.handleFailure(task, 'Expected populated object output.', rawOutput)
        }
      }

      if (rules.type === 'schema' && rules.expectedFields && rules.expectedFields.length > 0) {
        if (typeof rawOutput !== 'object') {
          return this.handleFailure(task, `Output must be an object matching schema [${rules.expectedFields.join(', ')}]`, rawOutput)
        }
        const missing = rules.expectedFields.filter((f) => !(f in rawOutput) || rawOutput[f] === undefined)
        if (missing.length > 0) {
          return this.handleFailure(task, `Missing required fields: [${missing.join(', ')}]`, rawOutput)
        }
      }
    }

    // Verified successfully
    return {
      passed: true,
      verificationStatus: 'VERIFIED',
      safeToRetry: false,
      reason: 'Self-verification passed all structural and sanity checks.'
    }
  }

  /**
   * Evaluates the failure and formulates an intelligent recovery strategy
   */
  private handleFailure(task: BrainTask, error: string, output: any): VerificationEvaluation {
    const errLower = error.toLowerCase()
    const currentAttempts = task.attempts + 1
    const maxAttempts = task.maxAttempts || this.DEFAULT_MAX_ATTEMPTS

    // Rule 5: Stop strictly after configured retry limit (PREVENTS INFINITE LOOPS)
    if (currentAttempts >= maxAttempts) {
      return {
        passed: false,
        verificationStatus: 'FAILED',
        safeToRetry: false,
        reason: `Exceeded maximum retry limit (${maxAttempts} attempts). Final error: ${error}`,
        suggestedAction: 'FAIL'
      }
    }

    // Rule 1: Inspect the error
    const isNetworkError =
      errLower.includes('timeout') ||
      errLower.includes('econnrefused') ||
      errLower.includes('fetch failed') ||
      errLower.includes('503') ||
      errLower.includes('502') ||
      errLower.includes('429')

    const isFileNotFound =
      errLower.includes('file not found') ||
      errLower.includes('enoent') ||
      errLower.includes('no such file')

    const isAuthOrForbidden =
      errLower.includes('401') ||
      errLower.includes('invalid api key') ||
      errLower.includes('unauthorized') ||
      errLower.includes('forbidden')

    const isMissingParam =
      errLower.includes('missing') ||
      errLower.includes('requires') ||
      errLower.includes('undefined')

    // Rule 2: Determine whether retry is safe
    // Sensitive non-idempotent operations (like deleting or payments) should NOT be blindly retried
    const isSensitive =
      task.description.toLowerCase().includes('delete') ||
      task.description.toLowerCase().includes('remove') ||
      task.description.toLowerCase().includes('erase')

    const safeToRetry = !isSensitive && (task.retrySafe !== false)

    if (!safeToRetry) {
      return {
        passed: false,
        verificationStatus: 'FAILED',
        safeToRetry: false,
        reason: `Retry is unsafe for this operation (${task.description}). Error: ${error}`,
        suggestedAction: 'USER_CLARIFICATION'
      }
    }

    // Rule 4: Try an alternative tool when available
    if (task.alternativeTools && task.alternativeTools.length > 0) {
      const nextTool = task.alternativeTools[0]
      const remainingTools = task.alternativeTools.slice(1)
      return {
        passed: false,
        verificationStatus: 'PENDING',
        safeToRetry: true,
        alternativeTool: nextTool,
        reason: `Primary tool failed with "${error}". Switching to alternative tool: ${nextTool}.`,
        suggestedAction: 'ALTERNATIVE_TOOL',
        correctedParameters: { ...task.parameters, _remainingAlternatives: remainingTools }
      }
    }

    // If File Agent failed because file not found, try fallback search in codebase
    if (isFileNotFound && task.assignedAgent === 'File Agent') {
      const targetPath = task.parameters?.filePath || task.parameters?.path || ''
      const fileName = targetPath.split(/[\/\\]/).pop() || targetPath
      return {
        passed: false,
        verificationStatus: 'PENDING',
        safeToRetry: true,
        alternativeTool: 'codebase_search',
        reason: `File "${targetPath}" was not located directly. Searching codebase for references to "${fileName}".`,
        suggestedAction: 'ALTERNATIVE_TOOL',
        correctedParameters: { query: fileName }
      }
    }

    // If web search failed due to network/rate limit, switch search mode
    if (isNetworkError && task.assignedAgent === 'Research Agent') {
      return {
        passed: false,
        verificationStatus: 'PENDING',
        safeToRetry: true,
        alternativeTool: 'rag_retrieve_context',
        reason: `Remote web search encountered network resistance. Falling back to local RAG knowledge base.`,
        suggestedAction: 'ALTERNATIVE_TOOL',
        correctedParameters: { ...task.parameters, useRag: true }
      }
    }

    // Rule 3: Retry with corrected parameters
    let correctedParams = { ...(task.parameters || {}) }
    if (isMissingParam && errLower.includes('url') && task.assignedAgent === 'Browser Agent') {
      // Attempt URL extraction from description
      const foundUrl = task.description.match(/https?:\/\/[^\s]+/)?.[0]
      if (foundUrl) {
        correctedParams.url = foundUrl
      }
    }

    if (isNetworkError) {
      // Add delay instruction
      correctedParams._retryBackoffMs = 1000 * Math.pow(2, currentAttempts)
    }

    return {
      passed: false,
      verificationStatus: 'PENDING',
      safeToRetry: true,
      reason: `Attempt ${currentAttempts}/${maxAttempts} failed: ${error}. Retrying with parameter sanitization.`,
      correctedParameters: correctedParams,
      suggestedAction: 'RETRY'
    }
  }
}

export const brainSelfVerifier = new BrainSelfVerifier()
