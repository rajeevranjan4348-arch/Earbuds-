/**
 * Unified Iris capability matrix.
 * UI is deliberately excluded. Capabilities are consumed by existing
 * agent, tool, voice and Android adapters.
 */

export const IRIS_12_FEATURES = {
  smartAgentPlanner: { enabled: true, owner: 'IrisAgentRuntime', capabilities: ['task decomposition','step ordering','fallback'] },
  actionVerification: { enabled: true, owner: 'IrisAgentRuntime', capabilities: ['post-action verification','failure detection'] },
  voicePipeline: { enabled: true, owner: 'voice adapters + IrisAgentRuntime', capabilities: ['stream lifecycle','interrupt/cancel','voice timeline'] },
  realtimeStreaming: { enabled: true, owner: 'IrisAgentRuntime events', capabilities: ['task lifecycle','tool status','verification status'] },
  permissionCenter: { enabled: true, owner: 'ToolRegistry + IrisAgentRuntime', capabilities: ['public','standard','sensitive','admin'] },
  universalToolRegistry: { enabled: true, owner: 'ToolRegistry', capabilities: ['schema','timeouts','privacy','retry','recovery'] },
  unifiedMemory: { enabled: true, owner: 'existing unified memory adapter', capabilities: ['short-term','long-term','project memory'] },
  researchAgent: { enabled: true, owner: 'existing research/search adapters', capabilities: ['fresh search','structured research','citations'] },
  androidAgent: { enabled: true, owner: 'Android Agent + Accessibility/App Controller', capabilities: ['app launch','accessibility actions','permission-aware control'] },
  globalKillSwitch: { enabled: true, owner: 'IrisAgentRuntime', capabilities: ['cancel active tasks','stop queues','resume runtime'] },
  crashRecovery: { enabled: true, owner: 'IrisAgentRuntime + AdvancedFeatureRuntime', capabilities: ['task snapshots','checkpoints','recovery'] },
  agentTimeline: { enabled: true, owner: 'IrisAgentRuntime', capabilities: ['queued','planning','executing','verifying','completed','failed'] }
} as const

export const IRIS_20_ADVANCED_FEATURES = {
  trueBackgroundAgent: { enabled: true, owner: 'IrisBackgroundSessionManager + Android Foreground Service' },
  persistentTaskQueue: { enabled: true, owner: 'IrisAdvancedFeatureRuntime' },
  actionVerificationV2: { enabled: true, owner: 'IrisAgentRuntime + verification adapters' },
  voiceAgentV2: { enabled: true, owner: 'voice adapters + IrisAgentRuntime events' },
  wakeWord: { enabled: true, owner: 'wake-word/audio adapter contract' },
  computerVisionAgent: { enabled: true, owner: 'vision adapter contract' },
  universalCommandParser: { enabled: true, owner: 'IrisAdvancedFeatureRuntime' },
  agentScheduler: { enabled: true, owner: 'IrisAdvancedFeatureRuntime scheduling contract' },
  crashRecoveryV2: { enabled: true, owner: 'checkpoint/recovery runtime' },
  smartPermissionCenter: { enabled: true, owner: 'ToolRegistry + Android permission gates' },
  selfDiagnostics: { enabled: true, owner: 'IrisAdvancedFeatureRuntime' },
  toolHealthMonitor: { enabled: true, owner: 'IrisAdvancedFeatureRuntime' },
  projectMemory: { enabled: true, owner: 'unified memory + project namespaces' },
  multiAgentCollaboration: { enabled: true, owner: 'agent orchestration contract' },
  offlineMode: { enabled: true, owner: 'runtime fallback contract' },
  undoRollback: { enabled: true, owner: 'checkpoint/compensating-action contract' },
  taskTimelineV2: { enabled: true, owner: 'IrisAgentRuntime + AdvancedFeatureRuntime' },
  naturalAndroidAutomation: { enabled: true, owner: 'AppController + AccessibilityService' },
  researchModeV2: { enabled: true, owner: 'research/search adapters' },
  irisDeveloperMode: { enabled: true, owner: 'GitHub/project-control adapters' }
} as const

export type IrisFeatureId = keyof typeof IRIS_12_FEATURES
export type IrisAdvancedFeatureId = keyof typeof IRIS_20_ADVANCED_FEATURES

export function getEnabledIrisFeatures() {
  return Object.entries(IRIS_12_FEATURES)
    .filter(([, feature]) => feature.enabled)
    .map(([id, feature]) => ({ id, ...feature }))
}

export function getEnabledAdvancedIrisFeatures() {
  return Object.entries(IRIS_20_ADVANCED_FEATURES)
    .filter(([, feature]) => feature.enabled)
    .map(([id, feature]) => ({ id, ...feature }))
}

export function getIrisFeatureSummary() {
  return {
    coreFeatures: getEnabledIrisFeatures(),
    advancedFeatures: getEnabledAdvancedIrisFeatures(),
    totalEnabled: getEnabledIrisFeatures().length + getEnabledAdvancedIrisFeatures().length
  }
}
