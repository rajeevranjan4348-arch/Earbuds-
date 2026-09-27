/**
 * IRIS — Skills & Model Context Protocol (MCP) Registry
 * 
 * Provides a modular plugin architecture for Iris AI tools.
 * Capabilities / Skills (System, Android, Google Workspace, MCP servers)
 * register their structured schemas and handlers here so the AI brain
 * can select and invoke them dynamically without modifying the UI.
 */

export interface McpToolSchema {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface IrisSkill {
  id: string
  name: string
  description: string
  category: 'system' | 'android' | 'workspace' | 'custom'
  enabled: boolean
  tools: McpToolSchema[]
  handler: (toolName: string, args: Record<string, any>) => Promise<{
    success: boolean
    output: string
    details?: Record<string, any>
  }>
}

export class IrisSkillsMcpRegistry {
  private static instance: IrisSkillsMcpRegistry
  private skills: Map<string, IrisSkill> = new Map()

  private constructor() {
    this.registerDefaultSkills()
  }

  public static getInstance(): IrisSkillsMcpRegistry {
    if (!IrisSkillsMcpRegistry.instance) {
      IrisSkillsMcpRegistry.instance = new IrisSkillsMcpRegistry()
    }
    return IrisSkillsMcpRegistry.instance
  }

  /**
   * Registers a new modular skill or MCP tool server
   */
  public registerSkill(skill: IrisSkill): void {
    this.skills.set(skill.id, skill)
    console.log(`[IrisSkillsMcpRegistry] Registered skill "${skill.name}" (${skill.id}) with ${skill.tools.length} tool(s).`)
  }

  /**
   * Unregisters a skill by ID
   */
  public unregisterSkill(skillId: string): boolean {
    return this.skills.delete(skillId)
  }

  public getSkill(skillId: string): IrisSkill | undefined {
    return this.skills.get(skillId)
  }

  public getAllSkills(): IrisSkill[] {
    return Array.from(this.skills.values())
  }

  /**
   * Returns all active MCP tool schemas for LLM tool selection / function calling
   */
  public getActiveToolSchemas(): McpToolSchema[] {
    const schemas: McpToolSchema[] = []
    for (const skill of this.skills.values()) {
      if (skill.enabled) {
        schemas.push(...skill.tools)
      }
    }
    return schemas
  }

  /**
   * Invokes a tool dynamically by matching tool name across registered skills
   */
  public async executeTool(toolName: string, args: Record<string, any>): Promise<{
    success: boolean
    output: string
    details?: Record<string, any>
  }> {
    for (const skill of this.skills.values()) {
      if (!skill.enabled) continue
      const hasTool = skill.tools.some((t) => t.name === toolName)
      if (hasTool) {
        try {
          return await skill.handler(toolName, args)
        } catch (e: any) {
          return {
            success: false,
            output: `Error executing skill tool "${toolName}": ${e.message || String(e)}`
          }
        }
      }
    }

    return {
      success: false,
      output: `No registered skill found handling tool "${toolName}".`
    }
  }

  private registerDefaultSkills(): void {
    // 1. Android Automation Skill
    this.registerSkill({
      id: 'android_automation',
      name: 'Android UI Automation',
      description: 'Controls Android phone UI via gestures, app launch, typing, and screen inspection.',
      category: 'android',
      enabled: true,
      tools: [
        {
          name: 'android_inspect_screen',
          description: 'Inspect current Android screen nodes, visible text, and interactive elements',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'android_launch_app',
          description: 'Launch an Android app by package name or app title',
          parameters: {
            type: 'object',
            properties: {
              appName: { type: 'string', description: 'Name or package ID of the application' }
            },
            required: ['appName']
          }
        },
        {
          name: 'android_tap_element',
          description: 'Tap on a visible element or text label on the screen',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Text, description, or view ID of element to tap' }
            },
            required: ['target']
          }
        },
        {
          name: 'android_type_text',
          description: 'Type text into the active screen input field',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to type into input' },
              target: { type: 'string', description: 'Optional target field selector' }
            },
            required: ['text']
          }
        },
        {
          name: 'android_press_system_key',
          description: 'Dispatch system keypress (back, home, recents, enter)',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'System key', enum: ['back', 'home', 'recents', 'enter'] }
            },
            required: ['key']
          }
        }
      ],
      handler: async (toolName, args) => {
        const { androidDeviceTools } = await import('./AndroidDeviceTools')
        if (toolName === 'android_inspect_screen') {
          const state = await androidDeviceTools.inspectScreen()
          return {
            success: state.accessibilityReady,
            output: `Screen Package: ${state.packageName} (${state.appName}). Visible text count: ${state.allVisibleText.length}. Interactive elements: ${state.interactiveElements.length}.`,
            details: state
          }
        }
        if (toolName === 'android_launch_app') {
          const res = await androidDeviceTools.launchApp(args.appName)
          return { success: res.success, output: res.message, details: res.details }
        }
        if (toolName === 'android_tap_element') {
          const res = await androidDeviceTools.tap(args.target)
          return { success: res.success, output: res.message, details: res.details }
        }
        if (toolName === 'android_type_text') {
          const res = await androidDeviceTools.typeText(args.text, args.target)
          return { success: res.success, output: res.message, details: res.details }
        }
        if (toolName === 'android_press_system_key') {
          const res = await androidDeviceTools.pressSystemKey(args.key)
          return { success: res.success, output: res.message, details: res.details }
        }
        return { success: false, output: `Unknown tool "${toolName}" in android_automation skill` }
      }
    })

    // 2. Shizuku Privileged Skill
    this.registerSkill({
      id: 'shizuku_privileged',
      name: 'Shizuku Privileged Control',
      description: 'Executes high-speed ADB input gestures and system shell commands when Shizuku is authorized.',
      category: 'system',
      enabled: true,
      tools: [
        {
          name: 'shizuku_exec_shell',
          description: 'Execute an ADB shell command with privileged Shizuku permissions',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Shell command string to execute' }
            },
            required: ['command']
          }
        }
      ],
      handler: async (toolName, args) => {
        const { irisShizukuManager } = await import('./IrisShizukuManager')
        if (toolName === 'shizuku_exec_shell') {
          const res = await irisShizukuManager.execAdbCommand(args.command)
          return {
            success: res.success,
            output: res.success ? `ADB Command Output: ${res.stdout.trim() || 'Success'}` : `ADB Error: ${res.stderr}`,
            details: res
          }
        }
        return { success: false, output: `Unknown tool "${toolName}" in shizuku_privileged skill` }
      }
    })

    // 3. Browser-Use Automation Skill
    this.registerSkill({
      id: 'browser_use_automation',
      name: 'Browser-Use Web Agent',
      description: 'Autonomous browser navigation, page extraction, typing, clicking, multi-step web tasks, and form interaction.',
      category: 'custom',
      enabled: true,
      tools: [
        {
          name: 'browser_open',
          description: 'Open a target web URL in the browser',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Web URL to open' }
            },
            required: ['url']
          }
        },
        {
          name: 'browser_navigate',
          description: 'Navigate browser to a target URL',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Target URL' }
            },
            required: ['url']
          }
        },
        {
          name: 'browser_back',
          description: 'Navigate back in browser history',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'browser_forward',
          description: 'Navigate forward in browser history',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'browser_click',
          description: 'Click on a web element, button, or link',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Element text, selector, or link description' }
            },
            required: ['target']
          }
        },
        {
          name: 'browser_type',
          description: 'Type text into a webpage input field',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Input selector or field label' },
              text: { type: 'string', description: 'Text to type' }
            },
            required: ['text']
          }
        },
        {
          name: 'browser_extract',
          description: 'Extract text, links, or structured data from active webpage',
          parameters: {
            type: 'object',
            properties: {
              instruction: { type: 'string', description: 'What information to extract from webpage' }
            }
          }
        },
        {
          name: 'browser_scroll',
          description: 'Scroll webpage up or down',
          parameters: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' }
            }
          }
        },
        {
          name: 'browser_wait',
          description: 'Wait for page condition or network idle',
          parameters: {
            type: 'object',
            properties: {
              condition: { type: 'string', description: 'Condition to wait for' }
            }
          }
        },
        {
          name: 'browser_screenshot',
          description: 'Capture screenshot of active webpage viewport',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'browser_execute_task',
          description: 'Execute multi-step autonomous web browser task using browser-use agent',
          parameters: {
            type: 'object',
            properties: {
              task: { type: 'string', description: 'Autonomous web task description' }
            },
            required: ['task']
          }
        }
      ],
      handler: async (toolName, args) => {
        const { browserTaskRouter } = await import('../browser/BrowserTaskRouter')
        const res = await browserTaskRouter.executeTool(toolName, args)
        return {
          success: res.success,
          output: res.output,
          details: res.extractedData || { url: res.url, title: res.title }
        }
      }
    })
  }
}

export const irisSkillsMcpRegistry = IrisSkillsMcpRegistry.getInstance()
