/**
 * Unified Multi-Agent Orchestrator (Repository 08: ruvnet/ruflo)
 * Coordinates specialized agents, orchestrates intent routing,
 * manages shared blackboard state, and enforces execution harness.
 */

import { AGENCY_AGENT_REGISTRY } from './agencyAgents'
import { agentHarness } from './agentHarness'
import { privacyAlign } from '../security/privacyAlign'
import { cybersecurity } from '../security/cybersecurity'
import { unifiedMemory } from '../memory/unifiedMemory'
import type { SpecializedAgentRole, AgentDefinition } from './types'

export interface OrchestrationResult {
  role: SpecializedAgentRole
  agentName: string
  traceId: string
  systemInstruction: string
  sanitizedPrompt: string
  privacyMinimization: {
    applied: boolean
    redactedTypes: string[]
  }
}

export class MultiAgentOrchestrator {
  /**
   * Classifies user prompt into the most suitable specialized agent role
   */
  public routeIntent(prompt: string): SpecializedAgentRole {
    const p = prompt.toLowerCase()

    // 1. Android Device & App Launching
    if (
      p.includes('open app') ||
      p.includes('launch app') ||
      p.includes('tap') ||
      p.includes('swipe') ||
      p.includes('accessibility') ||
      p.includes('on my android') ||
      p.includes('on phone') ||
      p.startsWith('open ') ||
      p.startsWith('launch ')
    ) {
      return 'android_device'
    }

    // 2. Creative Image Generation (FLUX)
    if (
      p.includes('generate image') ||
      p.includes('draw') ||
      p.includes('paint') ||
      p.includes('create an image') ||
      p.includes('flux') ||
      p.includes('illustration')
    ) {
      return 'creative_image'
    }

    // 3. Architecture & Diagrams (Mermaid)
    if (
      p.includes('diagram') ||
      p.includes('flowchart') ||
      p.includes('sequence diagram') ||
      p.includes('architecture diagram') ||
      p.includes('system architecture')
    ) {
      return 'architecture'
    }

    // 4. Codebase & Software Engineering
    if (
      p.includes('function') ||
      p.includes('refactor') ||
      p.includes('bug') ||
      p.includes('codebase') ||
      p.includes('typescript') ||
      p.includes('syntax error') ||
      p.includes('unit test')
    ) {
      return 'coding'
    }

    // 5. Scientific & Academic Research
    if (
      p.includes('research paper') ||
      p.includes('scientific study') ||
      p.includes('hypothesis') ||
      p.includes('empirical') ||
      p.includes('academic') ||
      p.includes('doi:')
    ) {
      return 'research'
    }

    // 6. Security & Vulnerability Analysis
    if (
      p.includes('vulnerability') ||
      p.includes('security audit') ||
      p.includes('ssrf') ||
      p.includes('prompt injection') ||
      p.includes('sanitize') ||
      p.includes('pii')
    ) {
      return 'security'
    }

    // 7. Live Web Browsing & Scraping
    if (
      p.startsWith('browse ') ||
      p.startsWith('visit ') ||
      p.includes('read webpage') ||
      p.includes('extract page')
    ) {
      return 'browser'
    }

    return 'general'
  }

  /**
   * Prepares agent execution package with privacy sanitization and security audit
   */
  public prepareExecution(
    prompt: string,
    userId: string,
    explicitRole?: SpecializedAgentRole
  ): OrchestrationResult {
    const role = explicitRole || this.routeIntent(prompt)
    const agentDef: AgentDefinition = AGENCY_AGENT_REGISTRY[role] || AGENCY_AGENT_REGISTRY.general

    // 1. Cybersecurity check for prompt injection
    const injectionCheck = cybersecurity.evaluatePromptInjection(prompt)
    if (!injectionCheck.safe) {
      console.warn('[Orchestrator] Security warning:', injectionCheck.reason)
    }

    // 2. PrivacyAlign sanitization
    const piiCheck = privacyAlign.sanitize(prompt)

    // 3. Harness trace initialization
    const trace = agentHarness.startTrace(role)
    agentHarness.logStep(trace.traceId, `Routed to specialized agent: ${agentDef.name}`)

    // 4. Unified Memory context integration
    const memoryContext = unifiedMemory.buildContextBlock(userId, piiCheck.redactedText)

    const enhancedSystemInstruction = `${agentDef.systemInstruction}\n\n${memoryContext}`

    return {
      role,
      agentName: agentDef.name,
      traceId: trace.traceId,
      systemInstruction: enhancedSystemInstruction,
      sanitizedPrompt: piiCheck.redactedText,
      privacyMinimization: {
        applied: piiCheck.hasPII,
        redactedTypes: piiCheck.detectedTypes
      }
    }
  }
}

export const multiAgentOrchestrator = new MultiAgentOrchestrator()
