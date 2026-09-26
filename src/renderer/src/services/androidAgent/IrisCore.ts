/**
 * IRIS — Advanced Android Mobile Agent Core Engine
 * Master Coordinator orchestrating Multimodal Input -> Intent Parsing ->
 * Task Planning -> Permission Gating -> Tool Routing -> Action Execution ->
 * Verification -> Response Generation -> Memory Synchronization.
 */

import { ParsedCommandIntent, AgentExecutionPlan, DeviceTelemetryInfo } from './types'
import { irisCommandParser } from './IrisCommandParser'
import { irisPlanner } from './IrisPlanner'
import { permissionManager } from './PermissionManager'
import { deviceCapabilityDiscovery } from './DeviceCapabilityDiscovery'
import { confirmationEngine } from './ConfirmationEngine'
import { verificationEngine } from './VerificationEngine'
import { androidToolRouter } from './AndroidToolRouter'

export interface AgentExecutionResponse {
  success: boolean
  prompt: string
  intent: ParsedCommandIntent
  response: string
  plan?: AgentExecutionPlan
  telemetry: DeviceTelemetryInfo
  timestamp: number
}

class IrisCore {
  private isInitialized = false

  constructor() {
    this.initCore()
  }

  private initCore() {
    if (this.isInitialized) return
    this.isInitialized = true
    // Initialize live device capability discovery
    deviceCapabilityDiscovery.refreshTelemetry().catch(() => {})
  }

  /**
   * Main entrypoint for processing user input from voice, text, camera, screen, or file
   */
  public async processInput(
    prompt: string,
    options?: {
      source?: 'voice' | 'text' | 'camera' | 'screen' | 'file'
      imageAttachment?: string
      context?: Record<string, any>
    }
  ): Promise<AgentExecutionResponse> {
    const startTime = Date.now()

    // 1. Intent & Context Analysis
    const intent = irisCommandParser.parse(prompt)

    // 2. Task Planning
    const plan = irisPlanner.createPlan(intent)

    // 3. Execution via Planner & Tool Router
    const execResult = await irisPlanner.executePlan(plan)

    // 4. Capture current device telemetry
    const telemetry = deviceCapabilityDiscovery.getTelemetry()

    return {
      success: execResult.success,
      prompt,
      intent,
      response: execResult.response,
      plan,
      telemetry,
      timestamp: startTime
    }
  }

  public getCapabilityMap() {
    return deviceCapabilityDiscovery.getCapabilityMap()
  }

  public getTelemetry() {
    return deviceCapabilityDiscovery.getTelemetry()
  }

  public getPermissions() {
    return permissionManager
  }

  public getConfirmationEngine() {
    return confirmationEngine
  }

  public getToolRouter() {
    return androidToolRouter
  }

  public getPlanner() {
    return irisPlanner
  }

  public getCommandParser() {
    return irisCommandParser
  }
}

export const irisCore = new IrisCore()
