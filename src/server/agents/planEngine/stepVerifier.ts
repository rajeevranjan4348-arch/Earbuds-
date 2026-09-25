/**
 * Step Verification and Error Recovery Engine
 * Verifies the integrity, completeness, and correctness of tool execution outputs.
 */

import type {
  PlanStep,
  StepVerificationResult,
  VerificationCriteria,
  FallbackStrategy
} from './types'

export class StepVerifier {
  /**
   * Evaluates the output of an executed step against its verification criteria.
   */
  public verify(step: PlanStep, rawOutput: any): StepVerificationResult {
    // 1. If output is null or undefined
    if (rawOutput === null || rawOutput === undefined) {
      return {
        valid: false,
        reason: `Step "${step.name}" produced an empty/null output.`,
        suggestedFallback: step.fallbackStrategy || {
          action: 'retry',
          maxRetries: 2
        }
      }
    }

    // 2. Check for explicit error flags in payload
    if (typeof rawOutput === 'object') {
      if (rawOutput.error || rawOutput.success === false) {
        const errorMsg = rawOutput.error || rawOutput.message || 'Tool indicated execution failure.'
        return {
          valid: false,
          reason: `Tool execution failed: ${errorMsg}`,
          suggestedFallback: step.fallbackStrategy || {
            action: 'alternative_tool',
            maxRetries: 1
          }
        }
      }
    }

    const criteria = step.verificationCriteria

    // 3. Status OK criteria
    if (criteria.type === 'status_ok') {
      if (
        typeof rawOutput === 'object' &&
        rawOutput.status &&
        (rawOutput.status === 'error' || rawOutput.status === 'failed')
      ) {
        return {
          valid: false,
          reason: `Status failed: ${rawOutput.message || rawOutput.status}`,
          suggestedFallback: step.fallbackStrategy
        }
      }
      return { valid: true, recoveredOutput: rawOutput }
    }

    // 4. Non-empty string or array check
    if (criteria.type === 'non_empty') {
      if (typeof rawOutput === 'string' && rawOutput.trim().length === 0) {
        return {
          valid: false,
          reason: 'Expected non-empty text output but received blank response.',
          suggestedFallback: step.fallbackStrategy
        }
      }
      if (Array.isArray(rawOutput) && rawOutput.length === 0) {
        return {
          valid: false,
          reason: 'Expected a non-empty array of results but received an empty list.',
          suggestedFallback: step.fallbackStrategy
        }
      }
      if (typeof rawOutput === 'object' && Object.keys(rawOutput).length === 0) {
        return {
          valid: false,
          reason: 'Expected a populated object structure but received an empty dictionary.',
          suggestedFallback: step.fallbackStrategy
        }
      }
    }

    // 5. Schema / Expected fields check
    if (
      criteria.type === 'schema' &&
      criteria.expectedFields &&
      criteria.expectedFields.length > 0
    ) {
      if (typeof rawOutput !== 'object') {
        return {
          valid: false,
          reason: `Expected an object containing fields [${criteria.expectedFields.join(', ')}] but received ${typeof rawOutput}.`,
          suggestedFallback: step.fallbackStrategy
        }
      }
      const missing = criteria.expectedFields.filter(
        (f) => !(f in rawOutput) || rawOutput[f] === undefined
      )
      if (missing.length > 0) {
        return {
          valid: false,
          reason: `Missing required output fields: [${missing.join(', ')}]`,
          suggestedFallback: step.fallbackStrategy
        }
      }
    }

    // 6. Domain-specific checks (e.g. YouTube jobs must have jobId or script)
    if (step.toolName === 'youtube_create_video_job') {
      if (!rawOutput.jobId && !rawOutput.script && !rawOutput.topic) {
        return {
          valid: false,
          reason: 'YouTube creation job did not return a valid jobId or script manifest.',
          suggestedFallback: { action: 'retry', maxRetries: 1 }
        }
      }
    }

    if (step.toolName === 'youtube_discover_trends') {
      if (!Array.isArray(rawOutput) && !Array.isArray(rawOutput?.trends)) {
        return {
          valid: false,
          reason: 'YouTube trend discovery did not return an array of trending opportunities.',
          suggestedFallback: { action: 'retry', maxRetries: 1 }
        }
      }
    }

    return {
      valid: true,
      recoveredOutput: rawOutput
    }
  }
}

export const stepVerifier = new StepVerifier()
