/**
 * IRIS Autonomous Browser Agent Adapter
 * Provides high-level agent routines for multi-step browser tasks.
 */

import { browserTaskRouter, BrowserToolResult } from './BrowserTaskRouter'

export class BrowserAgentAdapter {
  public async executeTask(goal: string): Promise<BrowserToolResult> {
    return browserTaskRouter.executeTool('browser_execute_task', { task: goal })
  }

  public async navigate(url: string): Promise<BrowserToolResult> {
    return browserTaskRouter.executeTool('browser_navigate', { url })
  }

  public async readCurrentPage(): Promise<BrowserToolResult> {
    return browserTaskRouter.executeTool('browser_extract')
  }

  public getState() {
    return browserTaskRouter.getCurrentState()
  }
}

export const browserAgentAdapter = new BrowserAgentAdapter()
