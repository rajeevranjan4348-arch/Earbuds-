/**
 * Dynamic Plan Generator
 * Decomposes complex and single-step user goals into executable, verifiable DAG-like step sequences.
 */

import { GoogleGenAI } from '@google/genai'
import type { ExecutionPlan, PlanStep, IntentAnalysisResult } from './types'
import { toolRegistry } from '../../tools/toolRegistry'

let geminiClient: GoogleGenAI | null = null
function getGemini(): GoogleGenAI | null {
  if (geminiClient) return geminiClient
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!key) return null
  try {
    geminiClient = new GoogleGenAI({ apiKey: key })
    return geminiClient
  } catch (_e) {
    return null
  }
}

export class PlanGenerator {
  /**
   * Generates a deterministic, robust execution plan for standard known patterns
   */
  private generateDeterministicPlan(
    taskId: string,
    intent: IntentAnalysisResult
  ): ExecutionPlan | null {
    const tools = intent.suggestedTools
    const goal = intent.primaryGoal
    const entities = intent.entities || {}

    // Pattern 1: YouTube Trends -> Video Production
    if (
      tools.includes('youtube_discover_trends') &&
      tools.includes('youtube_create_video_job')
    ) {
      const step1: PlanStep = {
        stepId: `${taskId}_step_1`,
        stepIndex: 1,
        name: 'Discover Trending Topics',
        goal: 'Query live YouTube search volume, competition, and trend opportunities',
        toolName: 'youtube_discover_trends',
        parameters: {
          niche: entities.niche || 'AI & Autonomous Agents',
          count: 3
        },
        requiresConfirmation: false,
        verificationCriteria: {
          type: 'non_empty',
          rules: 'Must return at least 1 validated topic opportunity'
        },
        fallbackStrategy: {
          action: 'retry',
          modifiedArgs: { niche: 'AI & Technology', count: 5 },
          maxRetries: 2
        },
        status: 'pending',
        retryCount: 0
      }

      const step2: PlanStep = {
        stepId: `${taskId}_step_2`,
        stepIndex: 2,
        name: 'Generate Full Video Production Job',
        goal: 'Run complete 7-part script, storyboard, and quality gate pipeline for top trend',
        toolName: 'youtube_create_video_job',
        parameters: {
          topicTitle: '{{step_1.output.0.title || step_1.output.trends.0.title || "Autonomous AI Agents Breakout"}}',
          format: entities.format || 'STANDARD'
        },
        parameterTemplates: {
          topicTitle: '{{step_1.output.0.title}}'
        },
        requiresConfirmation: false,
        verificationCriteria: {
          type: 'schema',
          expectedFields: ['jobId', 'pipelineState', 'script']
        },
        fallbackStrategy: {
          action: 'ai_fallback',
          maxRetries: 1
        },
        status: 'pending',
        retryCount: 0
      }

      return {
        planId: `plan_${Date.now()}`,
        taskId,
        goal,
        category: 'multi_step',
        summary: '2-step workflow: Discover live YouTube trends, then compile script, storyboard, and quality-verified production job for the top opportunity.',
        steps: [step1, step2],
        estimatedDurationMs: 8000,
        requiresUserApproval: false,
        createdAt: Date.now()
      }
    }

    // Pattern 2: PDF Document Knowledge Search / QA + Diagram
    if (
      tools.includes('document_knowledge_qa') &&
      tools.includes('generate_diagram')
    ) {
      const step1: PlanStep = {
        stepId: `${taskId}_step_1`,
        stepIndex: 1,
        name: 'Query Document Knowledge Base',
        goal: 'Retrieve relevant facts, architectures, and citations from indexed PDF documents',
        toolName: 'document_knowledge_qa',
        parameters: {
          question: entities.query || intent.cleanedInput
        },
        requiresConfirmation: false,
        verificationCriteria: {
          type: 'non_empty'
        },
        fallbackStrategy: {
          action: 'alternative_tool',
          alternativeTool: 'document_knowledge_search',
          maxRetries: 1
        },
        status: 'pending',
        retryCount: 0
      }

      const step2: PlanStep = {
        stepId: `${taskId}_step_2`,
        stepIndex: 2,
        name: 'Generate Architecture Diagram',
        goal: 'Synthesize document insights into an interactive Mermaid visual architecture diagram',
        toolName: 'generate_diagram',
        parameters: {
          title: entities.title || 'Document System Architecture',
          type: 'architecture'
        },
        requiresConfirmation: false,
        verificationCriteria: {
          type: 'non_empty'
        },
        status: 'pending',
        retryCount: 0
      }

      return {
        planId: `plan_${Date.now()}`,
        taskId,
        goal,
        category: 'multi_step',
        summary: '2-step workflow: Query PDF knowledge base with exact citations, then create a visual Mermaid architecture diagram.',
        steps: [step1, step2],
        estimatedDurationMs: 5000,
        requiresUserApproval: false,
        createdAt: Date.now()
      }
    }

    // Pattern 3: Single Step Plans for Individual Tools
    if (tools.length === 1) {
      const toolName = tools[0]
      const step: PlanStep = {
        stepId: `${taskId}_step_1`,
        stepIndex: 1,
        name: goal,
        goal,
        toolName,
        parameters: { ...entities },
        requiresConfirmation: toolName.includes('publish') || toolName.includes('delete') || toolName.includes('reboot'),
        confirmationReason: toolName.includes('publish')
          ? 'Requires confirmation before publishing content to live channels.'
          : undefined,
        verificationCriteria: {
          type: 'status_ok'
        },
        fallbackStrategy: {
          action: 'retry',
          maxRetries: 2
        },
        status: 'pending',
        retryCount: 0
      }

      return {
        planId: `plan_${Date.now()}`,
        taskId,
        goal,
        category: 'single_step',
        summary: `Execute single-step tool: ${toolName}`,
        steps: [step],
        estimatedDurationMs: 2500,
        requiresUserApproval: step.requiresConfirmation,
        createdAt: Date.now()
      }
    }

    return null
  }

  /**
   * Generates a structured multi-step plan, using Gemini AI for complex / novel requests
   */
  public async generatePlan(
    taskId: string,
    intent: IntentAnalysisResult
  ): Promise<ExecutionPlan> {
    // 1. Check deterministic fast path first
    const fastPlan = this.generateDeterministicPlan(taskId, intent)
    if (fastPlan) {
      return fastPlan
    }

    // 2. If Gemini is available, generate dynamic plan
    const gemini = getGemini()
    if (gemini && intent.category === 'multi_step') {
      try {
        const toolDefs = toolRegistry.getToolDefinitions().map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          permissionLevel: t.permissionLevel
        }))

        const prompt = `You are the Dynamic Plan Generator for the IRIS Autonomous Agent.
Create an executable, ordered sequence of steps to fulfill the user's request.

User Goal: "${intent.primaryGoal}"
Cleaned Input: "${intent.cleanedInput}"
Extracted Entities: ${JSON.stringify(intent.entities)}

Available Tools Catalog:
${JSON.stringify(toolDefs, null, 2)}

Requirements:
- Decompose into 1 to 4 logical, sequential steps.
- Set parameter values and refer to previous step outputs if needed using placeholder format (e.g. "{{step_1.output.topics.0.title}}").
- Mark requiresConfirmation as true ONLY for sensitive operations (e.g. deleting data, device commands, live publishing).
- For each step, supply realistic verificationCriteria ('non_empty', 'schema', or 'status_ok').

Return valid JSON conforming to this schema:
{
  "summary": "Brief explanation of the multi-step plan",
  "steps": [
    {
      "name": "Step title",
      "goal": "What this step accomplishes",
      "toolName": "tool_name_from_catalog",
      "parameters": { ...arguments },
      "requiresConfirmation": boolean,
      "confirmationReason": "optional reason",
      "verificationCriteria": {
        "type": "non_empty" | "schema" | "status_ok",
        "expectedFields": ["field1"]
      }
    }
  ]
}`

        const response = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ text: prompt }],
          config: { responseMimeType: 'application/json' }
        })

        if (response.text) {
          const parsed = JSON.parse(response.text)
          if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
            const steps: PlanStep[] = parsed.steps.map((s: any, idx: number) => ({
              stepId: `${taskId}_step_${idx + 1}`,
              stepIndex: idx + 1,
              name: s.name || `Step ${idx + 1}`,
              goal: s.goal || s.name,
              toolName: s.toolName,
              parameters: s.parameters || {},
              requiresConfirmation: Boolean(s.requiresConfirmation),
              confirmationReason: s.confirmationReason,
              verificationCriteria: s.verificationCriteria || { type: 'status_ok' },
              fallbackStrategy: { action: 'retry', maxRetries: 2 },
              status: 'pending',
              retryCount: 0
            }))

            return {
              planId: `plan_${Date.now()}`,
              taskId,
              goal: intent.primaryGoal,
              category: 'multi_step',
              summary: parsed.summary || `Multi-step plan with ${steps.length} actions`,
              steps,
              estimatedDurationMs: steps.length * 3000,
              requiresUserApproval: steps.some((s) => s.requiresConfirmation),
              createdAt: Date.now()
            }
          }
        }
      } catch (err) {
        console.warn('[PlanGenerator] Gemini plan generation warning, falling back to heuristic:', err)
      }
    }

    // 3. Heuristic fallback plan
    const fallbackTool = intent.suggestedTools[0] || 'web_search'
    const defaultStep: PlanStep = {
      stepId: `${taskId}_step_1`,
      stepIndex: 1,
      name: intent.primaryGoal || 'Process Request',
      goal: intent.primaryGoal,
      toolName: fallbackTool,
      parameters: intent.entities || { query: intent.cleanedInput },
      requiresConfirmation: false,
      verificationCriteria: { type: 'non_empty' },
      status: 'pending',
      retryCount: 0
    }

    return {
      planId: `plan_${Date.now()}`,
      taskId,
      goal: intent.primaryGoal,
      category: 'single_step',
      summary: `Execute action for: ${intent.primaryGoal}`,
      steps: [defaultStep],
      estimatedDurationMs: 3000,
      requiresUserApproval: false,
      createdAt: Date.now()
    }
  }
}

export const planGenerator = new PlanGenerator()
