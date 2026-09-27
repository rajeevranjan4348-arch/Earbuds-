/**
 * Unified Iris 12-feature capability matrix.
 *
 * UI is deliberately excluded. These capabilities are consumed by the
 * existing agent/tool/voice/Android adapters.
 */

export const IRIS_12_FEATURES = {
  smartAgentPlanner: {
    enabled: true,
    owner: 'IrisAgentRuntime',
    capabilities: ['task decomposition', 'step ordering', 'fallback']
  },
  actionVerification: {
    enabled: true,
    owner: 'IrisAgentRuntime',
    capabilities: ['post-action verification', 'failure detection']
  },
  voicePipeline: {
    enabled: true,
    owner: 'existing voice adapters + IrisAgentRuntime events',
    capabilities: ['stream lifecycle', 'interrupt/cancel events', 'voice timeline']
  },
  realtimeStreaming: {
    enabled: true,
    owner: 'IrisAgentRuntime events',
    capabilities: ['task lifecycle', 'tool status', 'verification status']
  },
  permissionCenter: {
    enabled: true,
    owner: 'ToolRegistry + IrisAgentRuntime',
    capabilities: ['public', 'standard', 'sensitive', 'admin']
  },
  universalToolRegistry: {
    enabled: true,
    owner: 'ToolRegistry',
    capabilities: ['schema', 'timeouts', 'privacy guard', 'retry', 'recovery']
  },
  unifiedMemory: {
    enabled: true,
    owner: 'existing unified memory adapter',
    capabilities: ['short-term', 'long-term', 'project memory']
  },
  researchAgent: {
    enabled: true,
    owner: 'existing research/search adapters',
    capabilities: ['fresh search', 'structured research', 'citations']
  },
  androidAgent: {
    enabled: true,
    owner: 'existing Android Agent + Accessibility/App Controller',
    capabilities: ['app launch', 'accessibility actions', 'permission-aware control']
  },
  globalKillSwitch: {
    enabled: true,
    owner: 'IrisAgentRuntime',
    capabilities: ['cancel active tasks', 'stop queues', 'resume runtime']
  },
  crashRecovery: {
    enabled: true,
    owner: 'IrisAgentRuntime',
    capabilities: ['task snapshots', 'recovery state', 'resumable task metadata']
  },
  agentTimeline: {
    enabled: true,
    owner: 'IrisAgentRuntime',
    capabilities: ['queued', 'planning', 'executing', 'verifying', 'completed', 'failed']
  }
} as const

export type IrisFeatureId = keyof typeof IRIS_12_FEATURES

export function getEnabledIrisFeatures() {
  return Object.entries(IRIS_12_FEATURES)
    .filter(([, feature]) => feature.enabled)
    .map(([id, feature]) => ({ id, ...feature }))
}
