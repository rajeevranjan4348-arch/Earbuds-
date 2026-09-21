/**
 * Unified MCP Bridge
 * Standard Model Context Protocol interface exposing tools and execution
 */

import { toolRegistry } from './toolRegistry'

export class McpBridge {
  public listTools() {
    return {
      tools: toolRegistry.getToolDefinitions()
    }
  }

  public async invokeTool(name: string, parameters: Record<string, any>) {
    try {
      const result = await toolRegistry.callTool(name, parameters)
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ],
        isError: false
      }
    } catch (err: any) {
      return {
        content: [
          {
            type: 'text',
            text: err?.message || 'Tool execution error'
          }
        ],
        isError: true
      }
    }
  }
}

export const mcpBridge = new McpBridge()
