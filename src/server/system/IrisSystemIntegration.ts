/**
 * IRIS Unified System Integration Layer
 *
 * Adapter/guardrail layer for the requested repository capabilities.
 * Reuses Iris's existing browser, search, agent, memory, Android, privacy,
 * research, diagram and image systems instead of creating competing runtimes.
 */

import { privacyAlign } from '../security/privacyAlign'

export type IntegrationCapability =
  | 'browser'
  | 'research'
  | 'memory'
  | 'orchestration'
  | 'android'
  | 'search'
  | 'privacy'
  | 'security'
  | 'image'
  | 'diagram'
  | 'specialized_agents'

export interface IntegrationSource {
  id: string
  repositories: string[]
  capability: IntegrationCapability
  adapter: string
  enabled: boolean
  notes: string
}

export const IRIS_SYSTEM_INTEGRATIONS: IntegrationSource[] = [
  { id: 'browser', repositories: ['browser-use/browser-use'], capability: 'browser', adapter: 'src/server/browser', enabled: true, notes: 'Unified browser navigation/extraction; no repository UI.' },
  { id: 'search', repositories: ['cedarsaam/agent-search'], capability: 'search', adapter: 'src/server/search', enabled: true, notes: 'Single search layer with ranking and citations.' },
  { id: 'harness', repositories: ['ai-boost/awesome-harness-engineering', 'ruvnet/ruflo'], capability: 'orchestration', adapter: 'src/server/agents', enabled: true, notes: 'Existing orchestrator/harness remains authoritative.' },
  { id: 'memory', repositories: ['rohitg00/agentmemory', 'volcengine/OpenViking', 'letta-ai/letta'], capability: 'memory', adapter: 'src/server/memory/unifiedMemory.ts', enabled: true, notes: 'One unified memory implementation.' },
  { id: 'android', repositories: ['bedda-tech/deft', 'Aditsyal/autodroid', 'ChenKuanSun/MobileClaw', 'tokenarc/open-jarvis', 'ghost-in-the-droid/android-agent', 'Bilal140202/MobileAgent', 'xjunz/AutoTask', 'benasbarciauskas/androir-mcp'], capability: 'android', adapter: 'src/renderer/src/services/androidAgent + app/src/main/java/com/example/iris', enabled: true, notes: 'Permission-aware Accessibility/App Controller.' },
  { id: 'security', repositories: ['mukul975/Anthropic-Cybersecurity-Skills'], capability: 'security', adapter: 'src/server/security', enabled: true, notes: 'Defensive security concepts only.' },
  { id: 'privacy', repositories: ['ServiceNow/PrivacyAlign'], capability: 'privacy', adapter: 'src/server/security/privacyAlign.ts', enabled: true, notes: 'PII/secret minimization at external boundaries.' },
  { id: 'research', repositories: ['K-Dense-AI/scientific-agent-skills'], capability: 'research', adapter: 'src/server/research', enabled: true, notes: 'Structured scientific research and citations.' },
  { id: 'diagram', repositories: ['cathrynlavery/diagram-design'], capability: 'diagram', adapter: 'src/server/research/diagramGenerator.ts', enabled: true, notes: 'Functional diagram generation only; no UI import.' },
  { id: 'image', repositories: ['black-forest-labs/flux'], capability: 'image', adapter: 'src/server/image/fluxEngine.ts', enabled: true, notes: 'Server-side image generation; credentials stay server-side.' },
  { id: 'agents', repositories: ['msitarzewski/agency-agents'], capability: 'specialized_agents', adapter: 'src/server/agents/agencyAgents.ts', enabled: true, notes: 'Role definitions run inside the existing orchestrator.' }
]

const EXTERNAL_BOUNDARY_TOOLS = new Set([
  'browser_navigate_and_extract',
  'web_search',
  'search_web',
  'generate_flux_image'
])

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export class IrisSystemIntegration {
  public getSources(): IntegrationSource[] {
    return IRIS_SYSTEM_INTEGRATIONS.filter((source) => source.enabled).map(cloneJson)
  }

  public isExternalBoundaryTool(toolName: string): boolean {
    return EXTERNAL_BOUNDARY_TOOLS.has(toolName)
  }

  public prepareToolArguments(toolName: string, args: Record<string, any>): Record<string, any> {
    const safeArgs = cloneJson(args || {})
    if (!this.isExternalBoundaryTool(toolName)) return safeArgs

    const raw = JSON.stringify(safeArgs)
    const evaluation = privacyAlign.evaluatePrivacy(
      raw,
      toolName.includes('search') ? 'web_search' : 'external_tool'
    )

    if (!evaluation.allowed) {
      throw new Error('Privacy policy blocked ' + toolName + ': ' + evaluation.reason)
    }

    return safeArgs
  }

  public async executeWithRecovery<T>(
    actionName: string,
    fn: () => Promise<T>,
    timeoutMs = 15000,
    retries = 2
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= retries; attempt++) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(actionName + ' timed out after ' + timeoutMs + 'ms')),
              timeoutMs
            )
          })
        ])
      } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        lastError = error
        if (attempt >= retries) break
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
      }
    }

    throw lastError instanceof Error ? lastError : new Error(actionName + ' failed')
  }
}

export const irisSystemIntegration = new IrisSystemIntegration()
